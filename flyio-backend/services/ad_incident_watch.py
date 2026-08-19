"""
광고 사고 감시 — 조용히 멈춘 것을 그날 잡는다.

왜 이게 절감 기능보다 먼저인가:
광고가 완전히 멈추면 누구나 안다. 문제는 절반만 멈추는 사고다. 소재가 반려되면
그 그룹은 0원 집행이 되는데 관리 화면은 정상으로 표시하고 알림도 없다. 실제로
소재 전량 반려(07-28 23:54)를 8일 뒤에야 사람이 발견했고, 그동안 일 클릭이
85 → 48 로 떨어져 있었다. 같은 유형이 다른 계정에서도 독립적으로 일어났다.

절감 기능은 새는 몇 %를 아끼고, 이 기능은 손실 전체를 막는다.

설계 원칙:
  · **정상이면 침묵한다.** 매일 "이상 없음" 을 보내면 사람은 곧 안 읽는다.
  · **못 보는 것을 정상이라 하지 않는다.** 수집이 안 돌았으면 그 사실 자체가
    최우선 사고다. 이게 없으면 감시가 눈을 감고 "정상" 이라 답한다.
  · **오늘은 판정하지 않는다.** 네이버 당일 통계는 미확정이라 언제나 급락처럼
    보인다. 어제(확정일)를 기준으로 본다.
  · **근거를 숫자로 같이 준다.** "노출이 줄었습니다" 가 아니라
    "어제 노출 1,200 → 340, 직전 7일 중앙값 대비 -72%".
"""
import collections
import logging
import statistics
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from database import ad_snapshot_db as S

logger = logging.getLogger(__name__)

# 심각도
CRITICAL = "critical"
WARNING = "warning"
INFO = "info"

_SEVERITY_ORDER = {CRITICAL: 0, WARNING: 1, INFO: 2}

# 기준선을 세우려면 최소 이만큼의 과거가 있어야 한다.
# 이보다 적으면 "판정 불가" 이지 "정상" 이 아니다.
MIN_BASELINE_DAYS = 4
BASELINE_WINDOW_DAYS = 7

# 노출 급락 판정. 작은 계정의 노이즈를 걸러내려 절대 하한을 같이 본다.
IMPRESSION_DROP_RATIO = 0.5      # 중앙값 대비 이만큼 이하로 떨어지면
IMPRESSION_FLOOR = 100           # 단, 원래 노출이 이 이상이던 경우만
COST_SPIKE_RATIO = 2.0           # 지출이 중앙값의 이 배를 넘으면

# 예산 소진 판정 — 일예산의 이 비율 이상을 쓰면 '막힌' 것으로 본다.
BUDGET_EXHAUSTED_RATIO = 0.95

# 대량 변경 감지 — 하루에 이보다 많은 입찰/예산이 바뀌면 사람이 한 일이 아니다.
BULK_CHANGE_THRESHOLD = 200

# 수집이 이보다 오래 멈춰 있으면 그 자체가 사고.
COLLECT_STALE_HOURS = 30

# 반려/거절을 뜻하는 상태 토큰.
_DISAPPROVED_TOKENS = ("DISAPPROV", "REJECT", "DENIED")
# 네이버가 "왜 안 나가는지" 를 담는 statusReason 중 손실로 직결되는 것들.
_NO_AD_TOKENS = ("NO_AD", "NOAD")
_BUDGET_TOKENS = ("BUDGET",)


def _incident(code: str, severity: str, title: str, detail: str,
              entity: Optional[Dict[str, Any]] = None,
              evidence: Optional[Dict[str, Any]] = None,
              impact_krw: Optional[float] = None,
              action: Optional[str] = None) -> Dict[str, Any]:
    return {
        "code": code,
        "severity": severity,
        "title": title,
        "detail": detail,
        "entity": entity or {},
        "evidence": evidence or {},
        "impact_krw": None if impact_krw is None else round(impact_krw),
        "action": action,
    }


def _has(s: Optional[str], tokens) -> bool:
    if not s:
        return False
    u = str(s).upper()
    return any(t in u for t in tokens)


def _eval_date(today: Optional[str] = None) -> str:
    """판정 기준일 = 어제. 당일 통계는 미확정이라 언제나 급락처럼 보인다."""
    base = datetime.strptime(today, "%Y-%m-%d") if today else datetime.now()
    return (base - timedelta(days=1)).strftime("%Y-%m-%d")


# ─────────────────────────────────────────────────────────────
# 개별 감지기
# ─────────────────────────────────────────────────────────────

def _watch_collection_health(customer_id: str) -> List[Dict[str, Any]]:
    """수집 자체가 살아 있는지. 이게 첫 번째인 이유는 명확하다 —
    수집이 죽으면 아래 모든 감지기가 '이상 없음' 을 반환하기 때문이다."""
    last = S.last_run(customer_id, "daily-snapshot")
    if not last:
        return [_incident(
            "collect_never_ran", CRITICAL,
            "광고 데이터 수집이 한 번도 실행되지 않았습니다",
            "수집 기록이 없어 사고를 감지할 수 없습니다. 감시가 눈을 감고 있는 상태입니다.",
            action="수집 크론(ad-snapshot-cron)이 켜져 있는지 확인하세요.")]

    incidents: List[Dict[str, Any]] = []
    if last.get("status") != "ok":
        incidents.append(_incident(
            "collect_failed", CRITICAL,
            "마지막 광고 데이터 수집이 실패했습니다",
            f"오류: {last.get('error') or '알 수 없음'}",
            evidence={"last_run": last.get("started_at"), "status": last.get("status")},
            action="자격증명 만료 여부를 먼저 확인하세요."))

    finished = last.get("finished_at") or last.get("started_at")
    if finished:
        try:
            ts = datetime.strptime(str(finished)[:19], "%Y-%m-%d %H:%M:%S")
            stale_h = (datetime.utcnow() - ts).total_seconds() / 3600
            if stale_h > COLLECT_STALE_HOURS:
                incidents.append(_incident(
                    "collect_stale", CRITICAL,
                    "광고 데이터가 갱신되지 않고 있습니다",
                    f"마지막 수집이 약 {int(stale_h)}시간 전입니다. "
                    f"그 이후의 사고는 감지되지 않습니다.",
                    evidence={"last_run": str(finished), "stale_hours": int(stale_h)},
                    action="수집 크론의 최근 실행 로그를 확인하세요."))
        except ValueError:
            pass
    return incidents


def _ad_is_serving(a: Dict[str, Any]) -> bool:
    """이 소재가 실제로 노출될 수 있는 상태인가.

    ⚠️ 필드 하나만 보면 틀린다. 실측(소잠 cid 1858907)에서 관측된 조합:
        status=PAUSED  status_reason=AD_DISAPPROVED  inspect_status=PENDING  816건
        status=ELIGIBLE status_reason=ELIGIBLE       inspect_status=APPROVED 250건
    inspect_status 만 보면 PENDING 은 '심사 중' 이라 문제없어 보이지만,
    실제로는 노출이 안 되고 있고 그 상태로 수년이 지난 소재도 있다.
    """
    if _has(a.get("status_reason"), _DISAPPROVED_TOKENS):
        return False
    if _has(a.get("status"), _DISAPPROVED_TOKENS) or \
       _has(a.get("inspect_status"), _DISAPPROVED_TOKENS):
        return False
    insp = (a.get("inspect_status") or "").upper()
    # APPROVED 가 아니면 노출되지 않는다. 빈 값은 판단 불가라 서빙으로 본다
    # (없는 사고를 만들지 않는다).
    return insp in ("", "APPROVED", "ELIGIBLE")


def _pending_label(a: Dict[str, Any]) -> str:
    """반려(거절)와 미승인(심사 대기)은 조치가 다르다. 구분해서 부른다."""
    if _has(a.get("inspect_status"), _DISAPPROVED_TOKENS) or \
       _has(a.get("status"), _DISAPPROVED_TOKENS):
        return "반려"
    if (a.get("inspect_status") or "").upper() == "PENDING":
        return "미승인"
    return "미노출"


def _watch_disapproved_ads(customer_id: str,
                           spend_by_group: Dict[str, float]) -> List[Dict[str, Any]]:
    """노출되지 않는 소재 — 그룹을 통째로 0원 집행으로 만든다."""
    out: List[Dict[str, Any]] = []
    ads = S.get_entity_states(customer_id, "AD")
    bad_by_group: Dict[str, List[Dict[str, Any]]] = {}
    kinds: collections.Counter = collections.Counter()
    for a in ads:
        if not _ad_is_serving(a):
            bad_by_group.setdefault(a.get("parent_id") or "", []).append(a)
            kinds[_pending_label(a)] += 1

    if not bad_by_group:
        return out

    groups = {g["entity_id"]: g for g in S.get_entity_states(customer_id, "ADGROUP")}
    ads_by_group: Dict[str, List[Dict[str, Any]]] = {}
    for a in ads:
        ads_by_group.setdefault(a.get("parent_id") or "", []).append(a)

    # ⚠️ 그룹마다 한 건씩 만들면 안 된다. 계정 하나에서 37줄이 쏟아지면
    # 그건 알림이 아니라 소음이고, 사람은 곧 안 읽는다. 같은 사고는 하나로 묶고
    # 개별 그룹은 근거(examples)에 넣는다.
    dead: List[tuple] = []      # 살아 있는 소재가 0인 그룹
    partial: List[tuple] = []   # 일부만 반려
    reasons: collections.Counter = collections.Counter()

    oldest = None
    for gid, bad_ads in bad_by_group.items():
        g = groups.get(gid) or {}
        alive = [a for a in ads_by_group.get(gid, []) if _ad_is_serving(a)]
        for a in bad_ads:
            if a.get("status_reason"):
                reasons[a["status_reason"]] += 1
            fs = a.get("first_seen")
            if fs and (oldest is None or str(fs) < str(oldest)):
                oldest = fs
        # 막히기 전 이 그룹이 쓰던 하루 광고비 = 손실 규모의 근사치.
        daily = spend_by_group.get(gid, 0.0)
        (partial if alive else dead).append(
            (g.get("name") or gid, len(bad_ads), len(alive), daily))

    def _ex(items):
        # 광고비가 큰 그룹부터 보여준다 — 손실이 큰 쪽이 먼저 눈에 들어와야 한다.
        top = sorted(items, key=lambda t: -t[3])[:5]
        return [{"group": n, "not_serving": d, "serving": a,
                 "daily_spend": round(s)} for n, d, a, s in top]

    # "반려" 와 "미승인" 은 조치가 다르다 — 전자는 수정 후 재심사, 후자는
    # 심의번호처럼 애초에 통과할 수 없는 구조적 문제인 경우가 많다.
    kind_txt = " · ".join(f"{k} {v}건" for k, v in kinds.most_common())
    pending_heavy = kinds.get("미승인", 0) >= kinds.get("반려", 0)
    action = ("소재를 수정해 재심사를 요청하세요. 의료 광고라면 심의번호가 필요합니다."
              if not pending_heavy else
              "심사 대기 상태로 오래 머문 소재는 대개 승인 요건 자체를 못 맞춘 것입니다. "
              "의료 광고라면 심의번호부터 확인하세요.")

    if dead:
        loss = sum(t[3] for t in dead)
        out.append(_incident(
            "ad_not_serving_all", CRITICAL,
            f"노출 가능한 소재가 하나도 없는 광고그룹 {len(dead)}개",
            f"이 그룹들은 수요가 있어도 0원 집행됩니다. ({kind_txt})",
            evidence={"groups": len(dead), "examples": _ex(dead),
                      "kinds": dict(kinds), "top_reasons": dict(reasons.most_common(4)),
                      "daily_spend_before": round(loss),
                      "oldest_seen": str(oldest) if oldest else None},
            impact_krw=loss * 30 if loss else None,
            action=action))

    if partial:
        out.append(_incident(
            "ad_not_serving_partial", WARNING,
            f"일부 소재가 노출되지 않는 광고그룹 {len(partial)}개",
            f"노출 가능한 소재가 남아 있어 광고는 이어지지만, "
            f"막힌 소재만큼 기회를 잃고 있습니다. ({kind_txt})",
            evidence={"groups": len(partial), "examples": _ex(partial),
                      "kinds": dict(kinds), "top_reasons": dict(reasons.most_common(4))},
            action=action))
    return out


def _watch_groups_without_ads(customer_id: str) -> List[Dict[str, Any]]:
    """소재가 아예 없는 광고그룹. 네이버가 statusReason 에 알려준다."""
    out: List[Dict[str, Any]] = []
    groups = S.get_entity_states(customer_id, "ADGROUP")
    no_ad = [g for g in groups
             if _has(g.get("status_reason"), _NO_AD_TOKENS) and g.get("enabled")]
    if no_ad:
        names = [g.get("name") or g.get("entity_id") for g in no_ad[:5]]
        out.append(_incident(
            "adgroup_no_ad", CRITICAL,
            f"소재가 없는 광고그룹 {len(no_ad)}개",
            "광고그룹은 켜져 있지만 소재가 없어 노출되지 않습니다. "
            "예산이 남아 있어도 한 푼도 쓰이지 않습니다.",
            evidence={"count": len(no_ad), "examples": names},
            action="소재를 만들어 붙이세요. 기존 그룹의 소재를 복사하는 방법이 가장 빠릅니다."))
    return out


def _watch_budget_capped(customer_id: str, day: str) -> List[Dict[str, Any]]:
    """예산에 막힌 캠페인. 예산이 남는 캠페인이 동시에 있으면 재배분 여지다."""
    out: List[Dict[str, Any]] = []
    camps = {c["entity_id"]: c for c in S.get_entity_states(customer_id, "CAMPAIGN")}
    if not camps:
        return out

    conn_rows = S.get_daily_totals(customer_id, day, day, "CAMPAIGN")
    if not conn_rows:
        return out

    capped, idle = [], []
    for cid, c in camps.items():
        budget = c.get("daily_budget") or 0
        if budget <= 0:
            continue
        series = S.get_entity_series(customer_id, "CAMPAIGN", cid, day, day)
        spent = series[0]["cost"] if series else 0
        if spent >= budget * BUDGET_EXHAUSTED_RATIO:
            capped.append((c.get("name") or cid, spent, budget))
        elif budget > 0 and spent < budget * 0.5:
            idle.append((c.get("name") or cid, spent, budget))

    if capped:
        leftover = sum(b - s for _, s, b in idle)
        out.append(_incident(
            "budget_capped", WARNING if not idle else CRITICAL,
            f"예산이 막힌 캠페인 {len(capped)}개",
            (f"어제 일예산을 모두 소진해 이후 노출이 끊겼습니다."
             + (f" 같은 날 다른 캠페인 {len(idle)}개에는 예산 "
                f"{round(leftover):,}원이 남아 있었습니다." if idle else "")),
            evidence={
                "capped": [{"name": n, "spent": round(s), "budget": b} for n, s, b in capped[:5]],
                "idle_leftover_krw": round(leftover) if idle else 0,
                "date": day,
            },
            impact_krw=leftover if idle else None,
            action=("총액을 늘리지 않고 남는 예산을 막힌 캠페인으로 옮기세요."
                    if idle else "일예산을 올리거나 입찰가를 낮춰 더 오래 버티게 하세요.")))
    return out


def _watch_traffic_anomaly(customer_id: str, day: str) -> List[Dict[str, Any]]:
    """노출 급락 / 지출 급증. 기준선은 직전 7일 중앙값(당일 제외)."""
    out: List[Dict[str, Any]] = []
    end = datetime.strptime(day, "%Y-%m-%d")
    start = end - timedelta(days=BASELINE_WINDOW_DAYS)
    rows = S.get_daily_totals(customer_id,
                              start.strftime("%Y-%m-%d"), day, "CAMPAIGN")
    if not rows:
        return out

    today_row = next((r for r in rows if r["stat_date"] == day), None)
    prior = [r for r in rows if r["stat_date"] < day]
    if not today_row or len(prior) < MIN_BASELINE_DAYS:
        # 판정 불가 — 정상이 아니다. 조용히 넘어가되 상태에 남긴다.
        return out

    imp_base = statistics.median([r["impressions"] for r in prior])
    cost_base = statistics.median([r["cost"] for r in prior])

    if imp_base >= IMPRESSION_FLOOR and \
            today_row["impressions"] < imp_base * IMPRESSION_DROP_RATIO:
        drop = 1 - (today_row["impressions"] / imp_base if imp_base else 0)
        out.append(_incident(
            "impressions_drop", CRITICAL,
            "노출이 급감했습니다",
            f"{day} 노출 {today_row['impressions']:,} — "
            f"직전 {len(prior)}일 중앙값 {int(imp_base):,} 대비 {drop*100:.0f}% 감소.",
            evidence={"date": day, "impressions": today_row["impressions"],
                      "baseline": int(imp_base), "drop_pct": round(drop * 100)},
            action="소재 반려·예산 소진·키워드 정지 순으로 확인하세요."))

    if cost_base > 0 and today_row["cost"] > cost_base * COST_SPIKE_RATIO:
        out.append(_incident(
            "cost_spike", CRITICAL,
            "광고비가 급증했습니다",
            f"{day} 지출 {round(today_row['cost']):,}원 — "
            f"직전 {len(prior)}일 중앙값 {round(cost_base):,}원의 "
            f"{today_row['cost']/cost_base:.1f}배.",
            evidence={"date": day, "cost": round(today_row["cost"]),
                      "baseline": round(cost_base)},
            impact_krw=today_row["cost"] - cost_base,
            action="입찰가 일괄 변경이 있었는지 변경 이력을 확인하세요."))
    return out


def _watch_bulk_changes(customer_id: str) -> List[Dict[str, Any]]:
    """대량 변경 — 대행사나 외부 도구가 일괄로 밀어 넣은 흔적."""
    out: List[Dict[str, Any]] = []
    counts = S.count_recent_changes(customer_id, hours=24)
    for field in ("bid_amt", "daily_budget", "enabled"):
        n = counts.get(field, 0)
        if n >= BULK_CHANGE_THRESHOLD:
            label = {"bid_amt": "입찰가", "daily_budget": "일예산",
                     "enabled": "on/off"}[field]
            out.append(_incident(
                "bulk_change", WARNING,
                f"{label}가 하루에 {n:,}건 바뀌었습니다",
                "사람이 하나씩 바꾼 규모가 아닙니다. 의도한 변경인지 확인하세요.",
                evidence={"field": field, "count": n, "hours": 24},
                action="변경 이력에서 무엇이 어떻게 바뀌었는지 확인하세요."))
    return out


# ─────────────────────────────────────────────────────────────
# 진입점
# ─────────────────────────────────────────────────────────────

def scan_account(customer_id: str, today: Optional[str] = None) -> Dict[str, Any]:
    """계정 하나를 훑어 사고 목록을 만든다. 정상이면 빈 목록."""
    day = _eval_date(today)

    # 수집 건강이 먼저다. 수집이 죽었으면 나머지 감지기는 의미가 없다.
    incidents = _watch_collection_health(customer_id)
    blind = any(i["code"] in ("collect_never_ran", "collect_stale") for i in incidents)

    if not blind:
        # 그룹별 최근 하루 광고비 — 반려의 손실 규모를 재는 데 쓴다.
        spend_by_group: Dict[str, float] = {}
        for g in S.get_entity_states(customer_id, "ADGROUP"):
            series = S.get_entity_series(customer_id, "ADGROUP", g["entity_id"],
                                         (datetime.strptime(day, "%Y-%m-%d")
                                          - timedelta(days=BASELINE_WINDOW_DAYS)
                                          ).strftime("%Y-%m-%d"), day)
            costs = [r["cost"] for r in series if r["cost"] > 0]
            if costs:
                spend_by_group[g["entity_id"]] = statistics.median(costs)

        for fn in (
            lambda: _watch_disapproved_ads(customer_id, spend_by_group),
            lambda: _watch_groups_without_ads(customer_id),
            lambda: _watch_budget_capped(customer_id, day),
            lambda: _watch_traffic_anomaly(customer_id, day),
            lambda: _watch_bulk_changes(customer_id),
        ):
            try:
                incidents.extend(fn())
            except Exception as e:
                logger.exception(f"[watch] {customer_id} 감지기 실패")
                incidents.append(_incident(
                    "watch_error", WARNING, "감시 항목 하나가 실패했습니다",
                    f"{type(e).__name__}: {str(e)[:200]}",
                    action="서버 로그를 확인하세요."))

    incidents.sort(key=lambda i: (_SEVERITY_ORDER.get(i["severity"], 9),
                                  -(i.get("impact_krw") or 0)))

    # 기준선이 아직 없는 경우를 '정상' 이라 말하지 않는다.
    hist = S.get_daily_totals(
        customer_id,
        (datetime.strptime(day, "%Y-%m-%d")
         - timedelta(days=BASELINE_WINDOW_DAYS)).strftime("%Y-%m-%d"),
        day, "CAMPAIGN")
    baseline_ready = len([r for r in hist if r["stat_date"] < day]) >= MIN_BASELINE_DAYS

    return {
        "customer_id": customer_id,
        "evaluated_date": day,
        "incidents": incidents,
        "critical": sum(1 for i in incidents if i["severity"] == CRITICAL),
        "warning": sum(1 for i in incidents if i["severity"] == WARNING),
        "baseline_ready": baseline_ready,
        "baseline_days": len([r for r in hist if r["stat_date"] < day]),
        # 정상 판정은 '볼 수 있었고 문제가 없었다' 일 때만 참이다.
        "all_clear": bool(not incidents and baseline_ready),
        "note": (None if baseline_ready else
                 f"과거 데이터가 {len([r for r in hist if r['stat_date'] < day])}일치뿐이라 "
                 f"급락·급증 판정은 아직 하지 않습니다(최소 {MIN_BASELINE_DAYS}일 필요). "
                 f"상태 기반 감지(소재 반려·소재 없음)는 지금도 동작합니다."),
    }


def summarize_for_notification(scan: Dict[str, Any]) -> Optional[str]:
    """알림 본문. 보낼 것이 없으면 None — 정상이면 침묵한다."""
    incidents = scan.get("incidents") or []
    if not incidents:
        return None
    lines = []
    for i in incidents:
        mark = {"critical": "[긴급]", "warning": "[주의]"}.get(i["severity"], "[참고]")
        line = f"{mark} {i['title']}"
        if i.get("impact_krw"):
            line += f" (약 {i['impact_krw']:,}원)"
        lines.append(line)
        if i.get("detail"):
            lines.append(f"    {i['detail']}")
        if i.get("action"):
            lines.append(f"    → {i['action']}")
    return "\n".join(lines)
