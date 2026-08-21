"""
광고 계정 상태 스냅샷 수집기.

하는 일: 캠페인·광고그룹·소재의 **현재 상태**를 떠서 어제와 다른 것만
변경 이력에 남긴다.

⚠️ 성과는 여기서 안 모은다. /stats 가 timeIncrement=allDays 를 무시하고
   날짜 없는 합계 1행만 돌려주기 때문에 일별 분해가 불가능하다(라이브 확인).
   일별 성과는 전부 ad_report_collector 의 AD_DETAIL 리포트가 담당한다.

설계 제약(실측):
  · 소재(ads)는 그룹 단위로만 조회된다. /ncc/ads 를 필터 없이 부르거나
    nccCampaignId 로 부르면 400 이다. MasterReport Ad 에도 검수상태가 없어
    대량 경로로 대체할 수 없다 — 그룹당 1콜이 불가피하다.
    해울은 그룹이 3,783개라 한 번에 다 돌면 레이트리밋(시간당 1만)을 먹는다.
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

logger = logging.getLogger(__name__)

# 소재 스캔 기본 상한. 그룹이 이보다 많으면 이번 실행에서 못 본 그룹이 생긴다.
DEFAULT_AD_GROUP_SCAN_LIMIT = 400

# /stats 동시 호출. 클라이언트에 전역 세마포어가 따로 있으므로 여기선 완만하게.
STATS_CONCURRENCY = 6

# ★ /ncc/adgroups 를 파라미터 없이 부르면 네이버가 여기서 자른다(실측).
#   대형 계정 7곳이 전부 정확히 1,001개로 돌아왔다 — 해울은 실제 3,783개인데도.
#   더 나쁜 건 이 절단이 조용하다는 것이다. 응답에 "잘렸다" 는 표시가 없어서
#   그대로 믿으면 계정 대부분을 못 보면서 "다 봤다" 고 말하게 된다.
NAVER_ADGROUP_FLAT_CAP = 1000

# 캠페인별 재조회 동시성. 소잠 137·쿠팡피티 166 캠페인이라 콜 수가 늘어난다.
ADGROUP_FETCH_CONCURRENCY = 6


async def _fetch_all_ad_groups(client, campaign_ids: List[str]) -> Dict[str, Any]:
    """광고그룹 전수 조회.

    먼저 한 번에 부른다(콜 1회). 상한에 닿지 않았으면 그게 전부이므로 그대로 쓴다.
    상한에 닿았으면 **잘린 것으로 보고** 캠페인별로 다시 훑는다.
    작은 계정은 예전처럼 1콜로 끝나고, 큰 계정만 캠페인 수만큼 더 쓴다.
    """
    flat = await client.get_ad_groups() or []
    if len(flat) < NAVER_ADGROUP_FLAT_CAP:
        return {"groups": flat, "truncated": False, "calls": 1}

    seen: set = set()
    out: List[Dict[str, Any]] = []
    sem = asyncio.Semaphore(ADGROUP_FETCH_CONCURRENCY)

    async def one(cid: str) -> List[Dict[str, Any]]:
        async with sem:
            try:
                return await client.get_ad_groups(cid) or []
            except Exception as e:
                # 한 캠페인이 실패해도 나머지는 살린다. 다만 조용히 넘기지 않는다.
                logger.warning(f"[ad-snapshot] adgroups 조회 실패 campaign={cid}: {e}")
                return []

    for chunk in await asyncio.gather(*[one(c) for c in campaign_ids]):
        for g in chunk:
            gid = g.get("nccAdgroupId")
            if gid and gid not in seen:
                seen.add(gid)
                out.append(g)

    # 캠페인별 합계가 평면 조회보다 적으면 뭔가 빠진 것이다 — 그때는 많은 쪽을 쓴다.
    if len(out) < len(flat):
        logger.warning(
            f"[ad-snapshot] 캠페인별 합계({len(out)})가 평면 조회({len(flat)})보다 적다 — 평면 결과 사용"
        )
        return {"groups": flat, "truncated": True, "calls": 1 + len(campaign_ids)}

    return {"groups": out, "truncated": True, "calls": 1 + len(campaign_ids)}


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
        # ⚠️ 예전 주석은 "campaign_id 없이 부르면 계정 전체가 온다" 였는데 사실이 아니다.
        #    네이버가 1,000개에서 조용히 자른다(실측: 대형 7계정 전부 1,001).
        fetched = await _fetch_all_ad_groups(
            client, [c["nccCampaignId"] for c in campaigns if c.get("nccCampaignId")])
        groups = fetched["groups"]
        result["ad_groups"] = len(groups)
        result["ad_groups_flat_truncated"] = fetched["truncated"]
        result["ad_groups_fetch_calls"] = fetched["calls"]
        g_ents = [_adgroup_entity(g) for g in groups if g.get("nccAdgroupId")]
        g_sync = S.sync_entity_states(customer_id, g_ents, "ADGROUP", detect_removed=True)
        result["changes"] += g_sync["changed"] + g_sync["added"] + g_sync["removed"]

        # ── 3. 소재 ─────────────────────────────────────────
        # 소재 반려는 조용히 광고를 멈춘다. 그룹 단위 조회뿐이라 상한을 둔다.
        if scan_ads and g_ents:
            gids = [g["entity_id"] for g in g_ents]
            # ⚠️ 앞에서부터 자르면 뒤쪽 그룹은 영원히 안 보인다. 회전 순서로 고른다
            # (한 번도 못 본 그룹 → 오래 전에 본 그룹, 각각 광고비 큰 순).
            scan = S.prioritize_groups_for_ad_scan(
                customer_id, gids, max(0, int(ad_group_scan_limit)))
            result["ad_groups_scanned_for_ads"] = len(scan)
            result["ad_groups_not_scanned"] = len(gids) - len(scan)
            result["ad_scan_note"] = ("회전 스캔 — 한 번도 못 본 그룹과 오래된 그룹부터. "
                                      "며칠에 걸쳐 전 그룹이 커버된다")

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

        # ── 4. 성과는 여기서 수집하지 않는다 ─────────────────
        # ⚠️ /stats 는 timeIncrement=allDays 를 **무시하고** 날짜 없는 합계 1행만
        #    돌려준다(2026-08-19 라이브 확인). 즉 이 경로로는 일별 분해가 불가능하다.
        #    처음에는 응답에서 dateStart 를 찾는 코드를 뒀는데, 그런 필드가 없어
        #    조용히 0행을 쓰고 있었다. 잘못된 날짜를 쓰는 것보다는 낫지만
        #    어차피 쓸모가 없다.
        #
        #    일별 성과는 전부 ad_report_collector 의 AD_DETAIL 리포트에서 나온다
        #    (캠페인·그룹·키워드가 한 번에, 게다가 날짜가 행에 들어 있다).
        #    이 수집기는 **상태 스냅샷 전담**이다.
        result["stat_rows"] = 0
        result["stats_note"] = ("일별 성과는 AD_DETAIL 리포트에서 수집한다 — "
                                "/stats 는 날짜별 분해를 지원하지 않는다")

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
