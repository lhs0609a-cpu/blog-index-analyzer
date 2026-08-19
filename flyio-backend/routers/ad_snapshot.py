"""
광고 스냅샷 API — 수집 트리거 + 쌓인 과거 조회.

naver_ad.py 는 이미 1.5만 줄이라 새 라우터로 분리한다.

경로:
  POST /api/ad-snapshot/collect        cron 전용. 연결된 전 계정 수집.
  GET  /api/ad-snapshot/status         수집이 돌고 있는지 (사용자 인증)
  GET  /api/ad-snapshot/daily          일자별 성과 시계열
  GET  /api/ad-snapshot/changes        변경 이력
"""
import hmac
import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from database import ad_snapshot_db as S
from database.naver_ad_db import (
    get_ad_account_by_customer,
    list_connected_ad_accounts,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ad-snapshot", tags=["ad-snapshot"])


def _require_cron_token(authorization: Optional[str]) -> None:
    """rank-tracker/measure-all 과 같은 CRON_TOKEN 규약."""
    expected = (os.environ.get("CRON_TOKEN") or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="CRON_TOKEN 환경변수가 설정되지 않음")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer 토큰 필요")
    if not hmac.compare_digest(authorization.split(" ", 1)[1].strip(), expected):
        raise HTTPException(status_code=403, detail="잘못된 cron 토큰")


def _client_for(account: Dict[str, Any]):
    from services.naver_ad_service import NaverAdApiClient
    c = NaverAdApiClient()
    c.customer_id = account["customer_id"]
    c.api_key = account["api_key"]
    c.secret_key = account["secret_key"]
    return c


@router.post("/collect")
async def collect(
    authorization: Optional[str] = Header(None),
    customer_id: Optional[str] = Query(None, description="지정 시 이 계정만"),
    scan_ads: bool = Query(True, description="소재 검수상태까지 수집"),
    ad_group_scan_limit: int = Query(400, ge=0, le=5000),
    days: Optional[int] = Query(None, ge=1, le=90,
                                description="며칠 치를 다시 수집할지. 기본은 전환 지연 흡수 구간"),
):
    """연결된 광고 계정의 상태·성과를 수집해 저장한다.

    매일 1회 크론으로 부른다. 실패한 계정이 있어도 나머지는 계속 간다 —
    한 계정의 자격증명 만료로 전체 수집이 멈추면 안 된다.
    """
    _require_cron_token(authorization)
    from services.ad_snapshot_collector import collect_account_snapshot

    accounts = list_connected_ad_accounts()
    if customer_id:
        accounts = [a for a in accounts if str(a.get("customer_id")) == str(customer_id)]
    if not accounts:
        return {"ok": True, "accounts": 0, "results": [],
                "note": "연결된 광고 계정이 없습니다"}

    since = until = None
    if days:
        from datetime import datetime, timedelta
        end = datetime.now()
        since = (end - timedelta(days=days)).strftime("%Y-%m-%d")
        until = end.strftime("%Y-%m-%d")

    results: List[Dict[str, Any]] = []
    for a in accounts:
        full = get_ad_account_by_customer(a["user_id"], str(a["customer_id"]))
        if not full or not full.get("api_key"):
            results.append({"customer_id": a.get("customer_id"), "ok": False,
                            "errors": ["자격증명 없음"]})
            continue
        client = _client_for(full)
        try:
            r = await collect_account_snapshot(
                client, str(full["customer_id"]),
                since=since, until=until,
                scan_ads=scan_ads, ad_group_scan_limit=ad_group_scan_limit)
            r["name"] = a.get("name")
            results.append(r)
        except Exception as e:
            logger.exception(f"[ad-snapshot] {a.get('customer_id')} 수집 실패")
            results.append({"customer_id": a.get("customer_id"), "ok": False,
                            "errors": [f"{type(e).__name__}: {str(e)[:300]}"]})
        finally:
            try:
                await client.close()
            except Exception:
                pass

    ok = sum(1 for r in results if r.get("ok"))
    return {
        "ok": ok > 0,
        "accounts": len(accounts),
        "succeeded": ok,
        "failed": len(results) - ok,
        "results": results,
    }


@router.get("/status")
async def status(customer_id: str = Query(...)):
    """수집이 실제로 돌고 있는지. 공개 조회 — 자격증명을 노출하지 않는다."""
    last = S.last_run(customer_id, "daily-snapshot")
    totals = S.get_daily_totals(customer_id,
                                *S.backfill_window(), entity_type="CAMPAIGN")
    return {
        "customer_id": customer_id,
        "last_run": last,
        "days_with_data": len(totals),
        # 수집이 아예 안 돈 것과 돌았는데 0건인 것은 다른 사건이다.
        "collecting": bool(last and last.get("status") == "ok"),
    }


@router.get("/daily")
async def daily(
    customer_id: str = Query(...),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    entity_type: str = Query("CAMPAIGN"),
):
    a, b = S.backfill_window()
    return {
        "customer_id": customer_id,
        "entity_type": entity_type,
        "series": S.get_daily_totals(customer_id, since or a, until or b, entity_type),
    }


@router.post("/collect-reports")
async def collect_reports_endpoint(
    authorization: Optional[str] = Header(None),
    customer_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None, description="YYYY-MM-DD. 기본은 어제"),
    keyword_master: bool = Query(True),
    ad_detail: bool = Query(True),
    expkeyword: bool = Query(True),
    search_term_top_n: int = Query(3000, ge=100, le=50000),
):
    """대량 리포트 수집 — 키워드 10만 계정을 호출 몇 번으로.

    /collect 는 캠페인·그룹까지만 본다. 키워드는 단건 /stats 로 불가능해서
    (10만 콜 vs 시간당 1만 제한) 리포트 경로가 따로 있다.
    """
    _require_cron_token(authorization)
    from services.ad_report_collector import collect_reports

    accounts = list_connected_ad_accounts()
    if customer_id:
        accounts = [a for a in accounts if str(a.get("customer_id")) == str(customer_id)]
    if not accounts:
        return {"ok": True, "accounts": 0, "results": []}

    results: List[Dict[str, Any]] = []
    for a in accounts:
        full = get_ad_account_by_customer(a["user_id"], str(a["customer_id"]))
        if not full or not full.get("api_key"):
            results.append({"customer_id": a.get("customer_id"), "ok": False,
                            "errors": ["자격증명 없음"]})
            continue
        client = _client_for(full)
        try:
            r = await collect_reports(
                client, str(full["customer_id"]), day=date,
                include_keyword_master=keyword_master,
                include_ad_detail=ad_detail,
                include_expkeyword=expkeyword,
                search_term_top_n=search_term_top_n)
            r["name"] = a.get("name")
            results.append(r)
        except Exception as e:
            logger.exception(f"[collect-reports] {a.get('customer_id')} 실패")
            results.append({"customer_id": a.get("customer_id"), "ok": False,
                            "errors": [f"{type(e).__name__}: {str(e)[:300]}"]})
        finally:
            try:
                await client.close()
            except Exception:
                pass

    ok = sum(1 for r in results if r.get("ok"))
    return {"ok": ok > 0, "accounts": len(accounts), "succeeded": ok,
            "failed": len(results) - ok, "results": results}


@router.post("/report-probe")
async def report_probe(
    authorization: Optional[str] = Header(None),
    customer_id: str = Query(...),
    kind: str = Query("stat", pattern="^(stat|master)$"),
    name: str = Query(..., description="stat: AD_DETAIL 등 / master: Keyword 등"),
    stat_date: Optional[str] = Query(None, description="stat 전용. YYYY-MM-DD"),
    lines: int = Query(5, ge=1, le=50),
):
    """진단 전용 — 대량 리포트를 만들고 앞 몇 줄을 돌려준다.

    리포트 TSV 는 헤더 행이 없다. 컬럼 의미를 확인해야 파서를 붙일 수 있어
    실물을 보는 경로가 필요하다. 데이터가 아니라 **모양**을 보는 용도라
    줄 수를 좁게 제한한다.
    """
    _require_cron_token(authorization)
    from database.naver_ad_db import list_connected_ad_accounts as _l

    acct = next((a for a in _l() if str(a["customer_id"]) == str(customer_id)), None)
    if not acct:
        raise HTTPException(status_code=404, detail="연결된 계정이 아닙니다")
    full = get_ad_account_by_customer(acct["user_id"], str(customer_id))
    if not full or not full.get("api_key"):
        raise HTTPException(status_code=400, detail="자격증명 없음")

    client = _client_for(full)
    try:
        import asyncio
        from datetime import datetime, timedelta

        if kind == "stat":
            day = stat_date or (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
            job = await client.create_stat_report(name, day)
            jid = job.get("reportJobId")
            url, status = job.get("downloadUrl"), job.get("status")
            # REGIST → BUILT 까지 잠깐 기다린다. 실측상 수 초면 끝난다.
            for _ in range(15):
                if url:
                    break
                await asyncio.sleep(2)
                cur = await client.get_stat_report(jid)
                url, status = cur.get("downloadUrl"), cur.get("status")
            meta = {"reportJobId": jid, "status": status, "statDt": day}
        else:
            job = await client.create_master_report(name)
            rid = job.get("id")
            url, status = job.get("downloadUrl"), job.get("status")
            for _ in range(15):
                if url:
                    break
                await asyncio.sleep(2)
                cur = await client.get_master_report(rid)
                url, status = cur.get("downloadUrl"), cur.get("status")
            meta = {"id": rid, "status": status}

        if not url:
            return {"ok": False, "meta": meta,
                    "error": "리포트가 아직 BUILT 되지 않았습니다"}

        text = await client.download_report_text(url, max_bytes=200_000)
        rows = text.splitlines()
        preview = [r.split("\t") for r in rows[:lines]]
        return {
            "ok": True, "kind": kind, "name": name, "meta": meta,
            "total_lines_in_sample": len(rows),
            "column_count": len(preview[0]) if preview else 0,
            "preview": preview,
        }
    except Exception as e:
        logger.exception(f"[report-probe] {customer_id} {kind}/{name} 실패")
        return {"ok": False, "kind": kind, "name": name,
                "error": f"{type(e).__name__}: {str(e)[:400]}"}
    finally:
        try:
            await client.close()
        except Exception:
            pass


@router.get("/incidents")
async def incidents(
    customer_id: str = Query(...),
    date: Optional[str] = Query(None, description="기준일(YYYY-MM-DD). 기본은 오늘"),
):
    """이 계정에 지금 무슨 사고가 있는지.

    정상이면 incidents 가 빈 목록이다. 단, 기준선이 아직 없으면
    all_clear 는 False 다 — 못 보는 것을 정상이라 말하지 않는다.
    """
    from services.ad_incident_watch import scan_account, summarize_for_notification
    scan = scan_account(customer_id, date)
    scan["message"] = summarize_for_notification(scan)
    return scan


@router.post("/watch")
async def watch(
    authorization: Optional[str] = Header(None),
    customer_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
):
    """cron 전용 — 연결된 전 계정을 훑어 사고만 모아 돌려준다.

    수집(collect) 직후에 부른다. 알림 발송은 아직 붙이지 않았다 —
    먼저 며칠 돌려 보고 오탐이 없는지 확인한 뒤에 연결한다.
    """
    _require_cron_token(authorization)
    from services.ad_incident_watch import scan_account, summarize_for_notification

    accounts = list_connected_ad_accounts()
    if customer_id:
        accounts = [a for a in accounts if str(a.get("customer_id")) == str(customer_id)]

    scans: List[Dict[str, Any]] = []
    for a in accounts:
        try:
            s = scan_account(str(a["customer_id"]), date)
            s["name"] = a.get("name")
            s["message"] = summarize_for_notification(s)
            scans.append(s)
        except Exception as e:
            logger.exception(f"[ad-watch] {a.get('customer_id')} 실패")
            scans.append({"customer_id": a.get("customer_id"), "name": a.get("name"),
                          "error": f"{type(e).__name__}: {str(e)[:300]}",
                          "incidents": [], "critical": 0, "warning": 0,
                          "all_clear": False})

    return {
        "ok": True,
        "accounts": len(accounts),
        "accounts_with_incidents": sum(1 for s in scans if s.get("incidents")),
        "total_critical": sum(s.get("critical", 0) for s in scans),
        "total_warning": sum(s.get("warning", 0) for s in scans),
        "scans": scans,
    }


@router.get("/changes")
async def changes(
    customer_id: str = Query(...),
    hours: int = Query(24, ge=1, le=24 * 30),
    entity_type: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=2000),
):
    return {
        "customer_id": customer_id,
        "hours": hours,
        "by_field": S.count_recent_changes(customer_id, hours),
        "changes": S.get_recent_changes(customer_id, hours, limit, entity_type),
    }
