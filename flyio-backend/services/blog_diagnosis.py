# -*- coding: utf-8 -*-
"""내 블로그 문제진단 — 대시보드 첫 화면이 답해야 할 질문.

대시보드 맨 위에는 "오늘의 1위 가능 키워드" 가 있었다. 후보 풀이 100개뿐이라
피부과 블로그에 `대출계산기` 가 "90% 매우 높음" 으로 떴다. 남의 키워드를
자신 있게 추천하는 대신, 사용자가 실제로 궁금한 것부터 답한다 —
**내 블로그 지금 괜찮은가.**

설계 원칙은 광고 사고 감시와 같다.

  · 못 보는 것을 정상이라 하지 않는다. 아직 재지 않은 항목은 `unknown` 이고
    ✓ 로 표시하지 않는다. 안 잰 것을 "이상 없음" 이라 하면 감시가 아니라 장식이다.
  · 근거를 숫자로 같이 준다. "지수가 떨어졌습니다" 가 아니라
    "8/13 62 → 8/20 54 (-8)".
  · 정상이면 조용히 넘어가되, 무엇을 봤는지는 남긴다.
  · 네트워크를 타지 않는다. 대시보드 첫 화면이 6초를 기다리게 하면 안 된다.
    측정이 필요한 항목은 '지금 확인' 링크로 넘긴다.
"""
from __future__ import annotations

import logging
import statistics
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

CRITICAL = "critical"
WARNING = "warning"
OK = "ok"
UNKNOWN = "unknown"

# 지수 비교 창. 하루 이틀 흔들림을 사고로 부르지 않는다.
INDEX_WINDOW_DAYS = 7
# 이보다 큰 점수 하락만 말한다. 채점 노이즈를 사고로 만들지 않기 위한 바닥.
INDEX_DROP_MIN = 3.0
INDEX_DROP_CRITICAL = 8.0
# 발행 공백을 '평소의 몇 배' 로 볼지. 절대 일수로 자르면 주 1회 블로그가 늘 빨간불이다.
GAP_WARN_RATIO = 3.0
GAP_CRITICAL_RATIO = 6.0
# 색인 결과를 언제까지 믿을지.
HEALTH_FRESH_HOURS = 72


def _finding(code: str, severity: str, title: str, detail: str = "",
             action: Optional[str] = None, href: Optional[str] = None,
             evidence: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {
        "code": code,
        "severity": severity,
        "title": title,
        "detail": detail,
        "action": action,
        "href": href,
        "evidence": evidence or {},
    }


# ─────────────────────────────────────────────────────────────
# 개별 진단
# ─────────────────────────────────────────────────────────────

def _diagnose_index_trend(blog_id: str) -> Dict[str, Any]:
    """지수가 최근에 떨어졌는가.

    ⚠️ 채점 기준이 바뀐 구간을 가로질러 비교하면 안 된다. 같은 자로 잰 값이
    아니라서, 우리가 기준을 고친 것을 사용자 블로그가 나빠진 것으로 말하게 된다.
    """
    try:
        from database.blog_index_history_db import get_snapshots, _get_scoring_version
        rows = get_snapshots(blog_id, days=INDEX_WINDOW_DAYS * 3)
    except Exception as e:
        logger.debug(f"[diagnosis] index history failed for {blog_id}: {e}")
        return _finding("index_trend", UNKNOWN, "지수 변화를 아직 알 수 없습니다",
                        "지수 이력을 읽지 못했습니다.")

    if not rows:
        return _finding(
            "index_trend", UNKNOWN, "지수 변화를 아직 알 수 없습니다",
            "과거 지수는 복원할 수 없어 분석한 날부터 쌓입니다.",
            action="블로그 분석하기", href="/analyze")

    try:
        version = _get_scoring_version()
    except Exception:
        version = None

    usable = [r for r in rows
              if r.get("total_score") is not None
              and (version is None or r.get("scoring_version") == version)]
    if len(usable) < 2:
        return _finding(
            "index_trend", UNKNOWN, "비교할 지수 기록이 아직 부족합니다",
            f"같은 기준으로 잰 기록이 {len(usable)}일치뿐입니다. 2일 이상 쌓이면 변화를 말할 수 있습니다.",
            evidence={"points": len(usable)})

    latest = usable[-1]
    cutoff = datetime.now() - timedelta(days=INDEX_WINDOW_DAYS)
    prior = [r for r in usable[:-1]
             if _as_date(r.get("day_kst")) and _as_date(r["day_kst"]) >= cutoff.date()]
    base = prior[0] if prior else usable[0]

    delta = round(float(latest["total_score"]) - float(base["total_score"]), 1)
    ev = {
        "from_date": base.get("day_kst"), "from_score": round(float(base["total_score"]), 1),
        "to_date": latest.get("day_kst"), "to_score": round(float(latest["total_score"]), 1),
        "delta": delta,
        "from_level": base.get("level"), "to_level": latest.get("level"),
    }

    if delta <= -INDEX_DROP_CRITICAL:
        sev = CRITICAL
    elif delta <= -INDEX_DROP_MIN:
        sev = WARNING
    else:
        sev = OK

    if sev == OK:
        word = "올랐습니다" if delta > 0 else "유지되고 있습니다"
        return _finding(
            "index_trend", OK, f"지수 {ev['to_score']} — {word}",
            f"{ev['from_date']} {ev['from_score']} → {ev['to_date']} {ev['to_score']} "
            f"({delta:+})", evidence=ev)

    # 무엇이 끌어내렸는지 — 하위 지표 중 가장 많이 빠진 것.
    culprit = _biggest_drop(base, latest)
    detail = (f"{ev['from_date']} {ev['from_score']} → {ev['to_date']} {ev['to_score']} ({delta:+})")
    if culprit:
        detail += f" · 가장 크게 빠진 지표: {culprit['label']} {culprit['delta']:+}"
        ev["culprit"] = culprit
    return _finding(
        "index_trend", sev, f"지수가 {abs(delta)}점 떨어졌습니다", detail,
        action="지표별 변화 보기", href=f"/analyze?blog={blog_id}", evidence=ev)


_SUB_METRICS = [("c_rank", "C-Rank"), ("dia", "D.I.A."), ("content_factors", "콘텐츠 요소")]


def _biggest_drop(base: Dict[str, Any], latest: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    worst = None
    for key, label in _SUB_METRICS:
        a, b = base.get(key), latest.get(key)
        if a is None or b is None:
            continue
        d = round(float(b) - float(a), 1)
        if d < 0 and (worst is None or d < worst["delta"]):
            worst = {"key": key, "label": label, "delta": d}
    return worst


def _as_date(v: Any):
    try:
        return datetime.strptime(str(v)[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def _diagnose_posting_gap(blog_id: str) -> List[Dict[str, Any]]:
    """발행이 끊겼는가 + 이 블로그의 주제를 우리가 아는가."""
    try:
        from services.posting_history import read_cache
        ph = read_cache(blog_id)
    except Exception as e:
        logger.debug(f"[diagnosis] posting history failed for {blog_id}: {e}")
        ph = None

    if not ph:
        return [_finding(
            "posting_gap", UNKNOWN, "발행 주기를 아직 알 수 없습니다",
            "발행 이력을 아직 읽지 않았습니다.",
            action="블로그 분석하기", href="/analyze")]

    out: List[Dict[str, Any]] = []
    daily = ph.get("daily") or []
    last = _as_date(ph.get("last_post_date"))

    if not last or len(daily) < 3:
        out.append(_finding(
            "posting_gap", UNKNOWN, "발행 주기를 판단할 기록이 부족합니다",
            f"수집된 발행일이 {len(daily)}일치입니다.",
            evidence={"days": len(daily)}))
    else:
        gap = (datetime.now().date() - last).days
        dates = [d for d in (_as_date(x.get("date")) for x in daily[-30:]) if d]
        intervals = [(b - a).days for a, b in zip(dates, dates[1:]) if (b - a).days > 0]
        typical = statistics.median(intervals) if intervals else None
        ev = {"days_since_last": gap, "last_post_date": ph.get("last_post_date"),
              "typical_interval_days": typical}

        if typical and gap >= typical * GAP_CRITICAL_RATIO and gap >= 7:
            out.append(_finding(
                "posting_gap", CRITICAL, f"발행이 {gap}일째 없습니다",
                f"평소 {typical:g}일 간격으로 쓰던 블로그입니다. 마지막 글 {ph.get('last_post_date')}.",
                action="글쓰기", href="/blog-write", evidence=ev))
        elif typical and gap >= typical * GAP_WARN_RATIO and gap >= 4:
            out.append(_finding(
                "posting_gap", WARNING, f"발행 공백 {gap}일",
                f"평소 간격은 {typical:g}일입니다. 마지막 글 {ph.get('last_post_date')}.",
                action="글쓰기", href="/blog-write", evidence=ev))
        else:
            out.append(_finding(
                "posting_gap", OK, f"발행 주기 정상 (마지막 글 {gap}일 전)",
                f"평소 간격 {typical:g}일." if typical else "", evidence=ev))

    # 주제어 — 키워드 추천이 켜지는 조건이기도 하다.
    terms = ph.get("topic_terms") or []
    if terms:
        out.append(_finding(
            "topic_terms", OK, "블로그 주제를 파악했습니다",
            "주로 쓰는 말: " + ", ".join(terms[:5]),
            evidence={"topic_terms": terms[:10]}))
    else:
        out.append(_finding(
            "topic_terms", WARNING, "블로그 주제를 아직 파악하지 못했습니다",
            "제목에서 반복되는 말이 잡히지 않았습니다. 주제가 잡히기 전에는 "
            "주제에 맞는 키워드를 골라 드릴 수 없습니다.",
            evidence={"topic_terms": []}))
    return out


def _diagnose_search_health(blog_id: str) -> Dict[str, Any]:
    """검색에 실제로 나오는가. 재려면 네트워크가 필요하므로 캐시만 읽는다."""
    try:
        from database.blog_diagnosis_db import read_search_health
        row = read_search_health(blog_id, max_age_hours=HEALTH_FRESH_HOURS)
    except Exception as e:
        logger.debug(f"[diagnosis] search health cache failed for {blog_id}: {e}")
        row = None

    if not row:
        # 안 잰 것을 "정상" 이라 하지 않는다.
        return _finding(
            "search_health", UNKNOWN, "검색 노출을 아직 확인하지 않았습니다",
            "최근 글 제목을 실제로 검색해 노출 여부를 봅니다(약 6초).",
            action="지금 확인", href=f"/blog-check?blog={blog_id}")

    rate = float(row.get("index_rate") or 0)
    checked = int(row.get("checked_posts") or 0)
    indexed = int(row.get("indexed_posts") or 0)
    ev = {"index_rate": rate, "checked_posts": checked, "indexed_posts": indexed,
          "grade": row.get("grade"), "measured_at": row.get("measured_at")}

    if row.get("grade") == "healthy":
        return _finding("search_health", OK, "색인 정상",
                        f"최근 {checked}글 중 {indexed}글 색인됨 ({rate}%)", evidence=ev)
    sev = CRITICAL if rate < 50 else WARNING
    return _finding(
        "search_health", sev, f"검색에 안 나오는 글이 있습니다 (색인률 {rate}%)",
        f"최근 {checked}글 중 {indexed}글만 검색에 나옵니다.",
        action="원인 보기", href=f"/blog-check?blog={blog_id}", evidence=ev)


# ─────────────────────────────────────────────────────────────
# 조립
# ─────────────────────────────────────────────────────────────

_ORDER = {CRITICAL: 0, WARNING: 1, UNKNOWN: 2, OK: 3}


def diagnose_blog(blog_id: str) -> Dict[str, Any]:
    """대시보드 첫 화면용 진단. 네트워크를 타지 않는다."""
    blog_id = (blog_id or "").strip().replace("https://blog.naver.com/", "").strip("/")
    if not blog_id:
        raise ValueError("blog_id is required")

    findings: List[Dict[str, Any]] = [_diagnose_index_trend(blog_id)]
    findings.extend(_diagnose_posting_gap(blog_id))
    findings.append(_diagnose_search_health(blog_id))
    findings.sort(key=lambda f: _ORDER.get(f["severity"], 9))

    counts = {k: sum(1 for f in findings if f["severity"] == k)
              for k in (CRITICAL, WARNING, UNKNOWN, OK)}

    if counts[CRITICAL]:
        headline = f"지금 손봐야 할 것이 {counts[CRITICAL]}건 있습니다"
    elif counts[WARNING]:
        headline = f"살펴볼 것이 {counts[WARNING]}건 있습니다"
    elif counts[UNKNOWN]:
        headline = "아직 확인하지 않은 항목이 있습니다"
    else:
        headline = "지금은 별다른 문제가 없습니다"

    return {
        "ok": True,
        "blog_id": blog_id,
        "checked_at": datetime.now().isoformat(),
        "headline": headline,
        # 전부 정상일 때만 참. unknown 이 하나라도 있으면 거짓이다 —
        # 못 본 것을 이상 없음이라 말하지 않는다.
        "all_clear": counts[CRITICAL] == 0 and counts[WARNING] == 0 and counts[UNKNOWN] == 0,
        "counts": counts,
        "findings": findings,
    }
