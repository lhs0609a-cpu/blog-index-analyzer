"""
광고 계정 일일 수집기.

하는 일 두 가지:
  1) 엔티티 상태 스냅샷 — 캠페인·광고그룹·(선택)소재의 현재 상태를 떠서
     어제와 다른 것만 변경 이력에 남긴다.
  2) 성과 시계열 — 캠페인·광고그룹 일자별 성과를 전환까지 포함해 저장한다.

설계 제약(실측):
  · /stats 는 단건 ID 만 안정적이다. 다중 ID 는 11001 이 난다.
    → 캠페인 137개·그룹 수백 개는 감당되지만, 키워드 10만 개는 불가능하다.
      키워드·확장검색어는 대량 리포트(/stat-reports)로 가야 하고, 그 경로는
      아직 라이브 확인 전이라 이 수집기에 넣지 않았다.
  · 소재(ads)는 그룹 단위로만 조회된다. 해울은 그룹이 3,783개라
    한 번에 다 돌면 레이트리밋(시간당 1만)을 먹는다.
    → ad_group_scan_limit 로 상한을 두고, 커버 못 한 만큼을 결과에 실어
      보고한다. **조용히 자르지 않는다.**

⚠️ 부분 수집에서는 detect_removed 를 켜지 않는다. 안 넘어온 엔티티가
   전부 '삭제됨' 으로 기록되어 변경 이력이 오염된다.
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from database import ad_snapshot_db as S
from services.ad_stat_mapper import normalize_stat

logger = logging.getLogger(__name__)

# 소재 스캔 기본 상한. 그룹이 이보다 많으면 이번 실행에서 못 본 그룹이 생긴다.
DEFAULT_AD_GROUP_SCAN_LIMIT = 400

# /stats 동시 호출. 클라이언트에 전역 세마포어가 따로 있으므로 여기선 완만하게.
STATS_CONCURRENCY = 6


def _truthy(v: Any) -> Optional[int]:
    if v is None:
        return None
    return 1 if v else 0


def _campaign_entity(c: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "entity_id": c.get("nccCampaignId"),
        "parent_id": None,
        "name": c.get("name"),
        "status": c.get("status"),
        "status_reason": c.get("statusReason"),
        # userLock=True 는 사용자가 끈 것. status 와 별개로 움직인다.
        "enabled": _truthy(not c.get("userLock")),
        "daily_budget": c.get("dailyBudget"),
        "extra": {"campaignTp": c.get("campaignTp")},
    }


def _adgroup_entity(g: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "entity_id": g.get("nccAdgroupId"),
        "parent_id": g.get("nccCampaignId"),
        "name": g.get("name"),
        "status": g.get("status"),
        "status_reason": g.get("statusReason"),
        "enabled": _truthy(not g.get("userLock")),
        "daily_budget": g.get("dailyBudget"),
        "bid_amt": g.get("bidAmt"),
        "extra": {
            "adgroupType": g.get("adgroupType"),
            # 키워드확장 여부. 지출의 26%가 여기서 나간 계정이 있었는데
            # 정작 이 플래그를 아무도 안 보고 있었다.
            "useKeywordPlus": g.get("keywordPlusWeight") is not None or g.get("useKeywordPlus"),
        },
    }


def _ad_entity(a: Dict[str, Any], group_id: str) -> Dict[str, Any]:
    ad = a.get("ad") or {}
    return {
        "entity_id": a.get("nccAdId"),
        "parent_id": group_id,
        "name": (ad.get("headline") or a.get("type") or "")[:200],
        "status": a.get("status"),
        "status_reason": a.get("statusReason"),
        "enabled": _truthy(not a.get("userLock")),
        # 소재 검수 상태 — AD_DISAPPROVED 가 여기 뜬다.
        "inspect_status": a.get("inspectStatus") or a.get("status"),
        "landing_url": ad.get("final") or ad.get("finalUrl") or a.get("finalUrl"),
        "extra": {"type": a.get("type")},
    }


async def _fetch_stats_daily(client, entity_type: str, ids: List[str],
                             since: str, until: str) -> List[Dict[str, Any]]:
    """엔티티별 일자별 성과. timeIncrement=allDays 로 하루씩 받는다."""
    import json as _json

    out: List[Dict[str, Any]] = []
    sem = asyncio.Semaphore(STATS_CONCURRENCY)
    from services.ad_stat_mapper import STAT_FIELDS_WITH_CONVERSION, STAT_FIELDS_BASE

    async def one(eid: str, fields: List[str], retried: bool = False):
        params = {
            "ids": [eid],
            "fields": _json.dumps(fields),
            "timeRange": _json.dumps({"since": since, "until": until}),
            "timeIncrement": "allDays",
        }
        async with sem:
            try:
                resp = await client._request("GET", "/stats", params)
            except Exception as e:
                if not retried and ("11001" in str(e)):
                    # 전환 필드 미지원 — BASE 로 한 번만 재시도.
                    return await one(eid, STAT_FIELDS_BASE, retried=True)
                logger.warning(f"[snapshot/stats] {eid} 실패: {str(e)[:150]}")
                return
        data = resp.get("data") if isinstance(resp, dict) else resp
        if isinstance(data, dict):
            data = [data]
        for row in (data or []):
            # timeIncrement=allDays 면 각 행에 dateStart(또는 statDt)가 붙는다.
            d = row.get("dateStart") or row.get("statDt") or row.get("date")
            if not d:
                continue
            m = normalize_stat(row)
            m.update({"entity_type": entity_type, "entity_id": eid,
                      "stat_date": str(d)[:10]})
            out.append(m)

    await asyncio.gather(*[one(i, list(STAT_FIELDS_WITH_CONVERSION)) for i in ids])
    return out


async def collect_account_snapshot(
    client,
    customer_id: str,
    since: Optional[str] = None,
    until: Optional[str] = None,
    scan_ads: bool = True,
    ad_group_scan_limit: int = DEFAULT_AD_GROUP_SCAN_LIMIT,
) -> Dict[str, Any]:
    """계정 하나를 훑어 상태 + 성과를 저장한다.

    client 는 자격증명이 세팅된 NaverAdApiClient.
    """
    if not since or not until:
        since, until = S.backfill_window(until)

    run_id = S.start_run(customer_id, "daily-snapshot")
    result: Dict[str, Any] = {
        "customer_id": customer_id,
        "since": since, "until": until,
        "campaigns": 0, "ad_groups": 0, "ads": 0,
        "stat_rows": 0, "changes": 0,
        "ad_groups_scanned_for_ads": 0,
        "ad_groups_not_scanned": 0,
        "errors": [],
    }

    try:
        # ── 1. 캠페인 ────────────────────────────────────────
        campaigns = await client.get_campaigns() or []
        result["campaigns"] = len(campaigns)
        c_ents = [_campaign_entity(c) for c in campaigns if c.get("nccCampaignId")]
        c_sync = S.sync_entity_states(customer_id, c_ents, "CAMPAIGN", detect_removed=True)
        result["changes"] += c_sync["changed"] + c_sync["added"] + c_sync["removed"]

        # ── 2. 광고그룹 ──────────────────────────────────────
        # campaign_id 없이 부르면 계정 전체가 온다.
        groups = await client.get_ad_groups() or []
        result["ad_groups"] = len(groups)
        g_ents = [_adgroup_entity(g) for g in groups if g.get("nccAdgroupId")]
        g_sync = S.sync_entity_states(customer_id, g_ents, "ADGROUP", detect_removed=True)
        result["changes"] += g_sync["changed"] + g_sync["added"] + g_sync["removed"]

        # ── 3. 소재 ─────────────────────────────────────────
        # 소재 반려는 조용히 광고를 멈춘다. 그룹 단위 조회뿐이라 상한을 둔다.
        if scan_ads and g_ents:
            gids = [g["entity_id"] for g in g_ents]
            scan = gids[:max(0, int(ad_group_scan_limit))]
            result["ad_groups_scanned_for_ads"] = len(scan)
            result["ad_groups_not_scanned"] = len(gids) - len(scan)

            ad_ents: List[Dict[str, Any]] = []
            sem = asyncio.Semaphore(STATS_CONCURRENCY)

            async def fetch_ads(gid: str):
                async with sem:
                    try:
                        ads = await client.get_ads(gid) or []
                    except Exception as e:
                        logger.warning(f"[snapshot/ads] {gid} 실패: {str(e)[:120]}")
                        return
                for a in ads:
                    if a.get("nccAdId"):
                        ad_ents.append(_ad_entity(a, gid))

            await asyncio.gather(*[fetch_ads(g) for g in scan])
            result["ads"] = len(ad_ents)
            if ad_ents:
                # ⚠️ 부분 스캔이므로 detect_removed 금지.
                a_sync = S.sync_entity_states(
                    customer_id, ad_ents, "AD",
                    detect_removed=(result["ad_groups_not_scanned"] == 0))
                result["changes"] += a_sync["changed"] + a_sync["added"] + a_sync["removed"]

        # ── 4. 성과 ─────────────────────────────────────────
        rows: List[Dict[str, Any]] = []
        if c_ents:
            rows += await _fetch_stats_daily(
                client, "CAMPAIGN", [c["entity_id"] for c in c_ents], since, until)
        if g_ents:
            rows += await _fetch_stats_daily(
                client, "ADGROUP", [g["entity_id"] for g in g_ents], since, until)

        # parent 를 붙여 두면 나중에 '어느 캠페인의 그룹인지' 를 조인 없이 안다.
        gparent = {g["entity_id"]: g.get("parent_id") for g in g_ents}
        gname = {g["entity_id"]: g.get("name") for g in g_ents}
        cname = {c["entity_id"]: c.get("name") for c in c_ents}
        for r in rows:
            if r["entity_type"] == "ADGROUP":
                r["parent_id"] = gparent.get(r["entity_id"])
                r["label"] = gname.get(r["entity_id"])
            else:
                r["label"] = cname.get(r["entity_id"])

        result["stat_rows"] = S.save_daily_stats(customer_id, rows)

        S.finish_run(run_id, "ok", rows_written=result["stat_rows"],
                     changes=result["changes"], covered_from=since, covered_to=until)
        result["ok"] = True
        return result

    except Exception as e:
        logger.exception(f"[snapshot] {customer_id} 수집 실패")
        result["ok"] = False
        result["errors"].append(f"{type(e).__name__}: {str(e)[:300]}")
        S.finish_run(run_id, "failed", rows_written=result["stat_rows"],
                     changes=result["changes"], covered_from=since, covered_to=until,
                     error=result["errors"][-1])
        return result
