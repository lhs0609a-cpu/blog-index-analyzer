"""
대량 리포트 기반 수집기 — 키워드 10만 계정을 하루 한 번에.

왜 별도 수집기인가:
ad_snapshot_collector 는 /ncc/* 와 /stats 단건 호출로 캠페인·그룹까지만 훑는다.
키워드는 그 경로로 불가능하다 — 10만 개면 10만 콜이고 레이트리밋은 시간당 1만이다.
대량 리포트는 같은 데이터를 **호출 몇 번**으로 준다.

한 번 수집으로 얻는 것:
  MasterReport Keyword  전 키워드의 입찰가·그룹입찰 상속 여부·on/off  (1콜)
  StatReport AD_DETAIL  키워드 단위 일별 성과 + 귀속 불가 트래픽        (1콜)
  StatReport EXPKEYWORD 실제 검색어 단위 성과                           (1콜)

⚠️ 리포트는 **하루치씩** 만들어진다(statDt 단위). 날짜 범위를 훑으려면
   날짜마다 작업을 만들어야 하므로, 기본은 어제 하루만 본다.

⚠️ AD_DETAIL 은 (날짜×캠페인×그룹×키워드×소재×매체×지역×디바이스) 해상도라
   소잠 하루가 34,467행이다. 그대로 저장하면 안 된다 — 키워드/그룹 단위로
   접어서 넣는다.
"""
import asyncio
import collections
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from database import ad_snapshot_db as S
from services import naver_report_schema as RS

logger = logging.getLogger(__name__)

# 리포트가 BUILT 될 때까지 기다리는 한도. 실측상 수 초면 끝난다.
BUILD_POLL_TRIES = 25
BUILD_POLL_SLEEP_S = 2

# 키워드 상태 동기화를 건너뛸 임계. 이보다 많으면 변경 diff 비용이 커지므로
# 로그로 알리고 그대로 진행한다(자르지는 않는다).
LARGE_ACCOUNT_KEYWORDS = 50_000

# 귀속 불가 트래픽을 담을 가상 엔티티. 그룹별로 한 행씩 만든다.
UNATTRIBUTED_PREFIX = "unattributed:"


async def _build_and_download(client, kind: str, name: str,
                              day: Optional[str] = None) -> Tuple[str, Dict[str, Any]]:
    """리포트 작업을 만들고 BUILT 될 때까지 기다린 뒤 본문을 받는다."""
    if kind == "stat":
        job = await client.create_stat_report(name, day)
        job_id = job.get("reportJobId")
        url = job.get("downloadUrl")
        getter = client.get_stat_report
    else:
        job = await client.create_master_report(name)
        job_id = job.get("id")
        url = job.get("downloadUrl")
        getter = client.get_master_report

    for _ in range(BUILD_POLL_TRIES):
        if url:
            break
        await asyncio.sleep(BUILD_POLL_SLEEP_S)
        cur = await getter(job_id)
        url = cur.get("downloadUrl")

    if not url:
        raise RuntimeError(f"{kind}/{name} 리포트가 BUILT 되지 않았습니다 (job={job_id})")

    text = await client.download_report_text(url)
    if kind == "stat":
        # 다 쓴 작업은 지운다 — 계정당 보관 개수에 제한이 있다.
        try:
            await client.delete_stat_report(job_id)
        except Exception:
            pass
    return text, {"job_id": job_id, "kind": kind, "name": name}


# ─────────────────────────────────────────────────────────────
# 키워드 마스터 → 엔티티 상태
# ─────────────────────────────────────────────────────────────

async def collect_keyword_master(client, customer_id: str) -> Dict[str, Any]:
    """전 키워드의 입찰가·상속·on/off 를 한 번에 떠서 상태로 저장한다.

    ⚠️ use_group_bid 를 안 보면 입찰 분석이 전부 어긋난다. 어떤 계정은
       키워드의 48.7% 가 그룹 입찰가를 상속하고 있었다 — 관리 화면에 보이는
       숫자가 실제 적용값이 아니라는 뜻이다.
    """
    text, meta = await _build_and_download(client, "master", "Keyword")
    rows = RS.parse_rows(text, RS.MASTER_KEYWORD_COLS)
    skipped = RS.take_skipped(rows)
    spec = RS.MASTER_KEYWORD

    ents: List[Dict[str, Any]] = []
    inherited = 0
    locked = 0
    for r in rows:
        use_group = r[spec["use_group_bid"]] == "1"
        lock = r[spec["user_lock"]] == "1"
        inherited += int(use_group)
        locked += int(lock)
        try:
            bid = int(float(r[spec["bid_amt"]] or 0))
        except ValueError:
            bid = 0
        ents.append({
            "entity_id": r[spec["keyword_id"]],
            "parent_id": r[spec["adgroup_id"]],
            "name": r[spec["keyword"]],
            "status": "PAUSED" if lock else "ELIGIBLE",
            "status_reason": r[spec["status_code"]] or None,
            "enabled": 0 if lock else 1,
            "bid_amt": bid,
            "use_group_bid": 1 if use_group else 0,
        })

    if len(ents) > LARGE_ACCOUNT_KEYWORDS:
        logger.info(f"[report/keyword] {customer_id} 키워드 {len(ents):,}개 — 대형 계정")

    sync = S.sync_entity_states(customer_id, ents, "KEYWORD", detect_removed=True)
    return {
        "keywords": len(ents),
        "rows_skipped": skipped,
        "inherited_group_bid": inherited,
        "inherited_pct": round(inherited / len(ents) * 100, 1) if ents else 0,
        "paused": locked,
        "paused_pct": round(locked / len(ents) * 100, 1) if ents else 0,
        "sync": sync,
        "meta": meta,
    }


# ─────────────────────────────────────────────────────────────
# AD_DETAIL → 키워드/그룹 일별 성과 + 귀속 불가 트래픽
# ─────────────────────────────────────────────────────────────

async def collect_ad_detail(client, customer_id: str, day: str) -> Dict[str, Any]:
    """하루치 키워드 단위 성과. 등록 키워드로 귀속되지 않는 트래픽을 분리한다."""
    text, meta = await _build_and_download(client, "stat", "AD_DETAIL", day)
    rows = RS.parse_rows(text, RS.AD_DETAIL_COLS)
    skipped = RS.take_skipped(rows)
    spec = RS.AD_DETAIL

    kw: Dict[str, Dict[str, float]] = collections.defaultdict(
        lambda: collections.defaultdict(float))
    grp: Dict[str, Dict[str, float]] = collections.defaultdict(
        lambda: collections.defaultdict(float))
    unattr: Dict[str, Dict[str, float]] = collections.defaultdict(
        lambda: collections.defaultdict(float))
    kw_parent: Dict[str, str] = {}
    total = collections.defaultdict(float)
    anon = collections.defaultdict(float)

    for r in rows:
        d = RS.row_date(r, spec)
        if d != day:
            # 리포트는 하루치지만 방어적으로 확인한다.
            continue
        m = RS.metrics(r, spec)
        gid = r[spec["adgroup_id"]]
        kid = r[spec["keyword_id"]]

        for k, v in m.items():
            grp[gid][k] += v
            total[k] += v

        if kid == RS.UNATTRIBUTED:
            for k, v in m.items():
                unattr[gid][k] += v
                anon[k] += v
        else:
            kw_parent[kid] = gid
            for k, v in m.items():
                kw[kid][k] += v

    def _rows(bucket, etype, parent_of=None, id_prefix=""):
        out = []
        for eid, m in bucket.items():
            imp = m["impressions"]
            out.append({
                "entity_type": etype,
                "entity_id": f"{id_prefix}{eid}",
                "stat_date": day,
                "impressions": int(imp),
                "clicks": int(m["clicks"]),
                "cost": m["cost"],
                "conversions": m["conversions"],
                "ctr": (m["clicks"] / imp * 100) if imp else 0,
                "cpc": (m["cost"] / m["clicks"]) if m["clicks"] else 0,
                "avg_rank": (m["rank_sum"] / imp) if imp else 0,
                "parent_id": parent_of(eid) if parent_of else eid,
            })
        return out

    written = 0
    written += S.save_daily_stats(customer_id, _rows(grp, "ADGROUP"))
    written += S.save_daily_stats(
        customer_id, _rows(kw, "KEYWORD", parent_of=lambda k: kw_parent.get(k)))
    # 귀속 불가 트래픽을 그룹별 가상 엔티티로 남긴다. 이걸 따로 두지 않으면
    # 키워드 합계와 그룹 합계가 안 맞는 이유를 아무도 설명하지 못한다.
    written += S.save_daily_stats(
        customer_id,
        [dict(r, label="키워드 귀속 불가(확장검색 등)")
         for r in _rows(unattr, "UNATTRIBUTED", parent_of=lambda g: g,
                        id_prefix=UNATTRIBUTED_PREFIX)])

    ti, tc, tm = total["impressions"], total["clicks"], total["cost"]
    return {
        "date": day,
        "source_rows": len(rows),
        "rows_skipped": skipped,
        "keywords_with_traffic": len(kw),
        "ad_groups_with_traffic": len(grp),
        "rows_written": written,
        "totals": {"impressions": int(ti), "clicks": int(tc), "cost": round(tm)},
        # 이 계정에서 등록 키워드로 설명되지 않는 몫.
        "unattributed": {
            "impressions": int(anon["impressions"]),
            "clicks": int(anon["clicks"]),
            "cost": round(anon["cost"]),
            "impressions_pct": round(anon["impressions"] / ti * 100, 1) if ti else 0,
            "clicks_pct": round(anon["clicks"] / tc * 100, 1) if tc else 0,
            "cost_pct": round(anon["cost"] / tm * 100, 1) if tm else 0,
        },
        "meta": meta,
    }


# ─────────────────────────────────────────────────────────────
# EXPKEYWORD → 실제 검색어
# ─────────────────────────────────────────────────────────────

async def collect_expkeyword(client, customer_id: str, day: str,
                             top_n: int = 3000) -> Dict[str, Any]:
    """실제 검색어 단위 성과.

    검색어는 하루 1.5만 종이 넘게 나온다. 전부 저장하면 금세 수천만 행이 되므로
    **비용 상위 top_n 만** 남기고, 자른 수를 결과에 실어 보고한다.
    조용히 자르면 "우리 계정 검색어는 3,000종" 이라는 오해를 만든다.
    """
    text, meta = await _build_and_download(client, "stat", "EXPKEYWORD", day)
    rows = RS.parse_rows(text, RS.EXPKEYWORD_COLS)
    skipped = RS.take_skipped(rows)
    spec = RS.EXPKEYWORD

    agg: Dict[str, Dict[str, float]] = collections.defaultdict(
        lambda: collections.defaultdict(float))
    parent: Dict[str, str] = {}
    for r in rows:
        if RS.row_date(r, spec) != day:
            continue
        term = (r[spec["search_term"]] or "").strip()
        if not term:
            continue
        gid = r[spec["adgroup_id"]]
        key = f"{gid}|{term}"
        parent[key] = gid
        agg[key]["impressions"] += RS._f(r[spec["impressions"]])
        agg[key]["clicks"] += RS._f(r[spec["clicks"]])
        agg[key]["cost"] += RS._f(r[spec["cost"]])
        agg[key]["conversions"] += RS._f(r[spec["conversions"]])

    ranked = sorted(agg.items(), key=lambda kv: (-kv[1]["cost"], -kv[1]["clicks"]))
    kept = ranked[:top_n]
    dropped = len(ranked) - len(kept)

    out = []
    for key, m in kept:
        imp = m["impressions"]
        out.append({
            "entity_type": "SEARCHTERM",
            "entity_id": key,
            "stat_date": day,
            "impressions": int(imp),
            "clicks": int(m["clicks"]),
            "cost": m["cost"],
            "conversions": m["conversions"],
            "ctr": (m["clicks"] / imp * 100) if imp else 0,
            "cpc": (m["cost"] / m["clicks"]) if m["clicks"] else 0,
            "parent_id": parent[key],
            "label": key.split("|", 1)[1],
        })
    written = S.save_daily_stats(customer_id, out)

    return {
        "date": day,
        "source_rows": len(rows),
        "rows_skipped": skipped,
        "distinct_search_terms": len(agg),
        "stored": written,
        "dropped_beyond_top_n": dropped,
        "top_n": top_n,
        "meta": meta,
    }


# ─────────────────────────────────────────────────────────────
# 진입점
# ─────────────────────────────────────────────────────────────

async def collect_reports(client, customer_id: str,
                          day: Optional[str] = None,
                          include_keyword_master: bool = True,
                          include_ad_detail: bool = True,
                          include_expkeyword: bool = True,
                          search_term_top_n: int = 3000) -> Dict[str, Any]:
    """대량 리포트 수집 한 판.

    기본 대상일은 어제다 — 당일 통계는 미확정이라 오늘을 넣으면 언제나 작게 나온다.
    """
    day = day or (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    run_id = S.start_run(customer_id, "report-collect")
    result: Dict[str, Any] = {"customer_id": customer_id, "date": day, "errors": []}
    written = 0

    steps = []
    if include_keyword_master:
        steps.append(("keyword_master", collect_keyword_master(client, customer_id)))
    if include_ad_detail:
        steps.append(("ad_detail", collect_ad_detail(client, customer_id, day)))
    if include_expkeyword:
        steps.append(("expkeyword",
                      collect_expkeyword(client, customer_id, day, search_term_top_n)))

    for name, coro in steps:
        try:
            r = await coro
            result[name] = r
            written += r.get("rows_written") or r.get("stored") or 0
        except Exception as e:
            logger.exception(f"[report-collect] {customer_id} {name} 실패")
            result["errors"].append(f"{name}: {type(e).__name__}: {str(e)[:300]}")

    result["ok"] = not result["errors"]
    result["rows_written"] = written
    S.finish_run(run_id, "ok" if result["ok"] else "partial",
                 rows_written=written, covered_from=day, covered_to=day,
                 error="; ".join(result["errors"])[:900] or None)
    return result
