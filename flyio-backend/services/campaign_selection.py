"""
측정 등급을 **체험단 시장의 값**으로 번역한다.

왜 만드는가 — 블로거는 "내 지수가 몇 점"을 알고 싶은 게 아니다. 알고 싶은 건
"그래서 체험단에 뽑히냐"다. 그리고 그 질문에는 이미 시장가가 붙어 있다:

  블덱스 체험단(blogdexreview.space/pricing, 2026-10 확인) 광고주 요금표
    · 준최적화 블로거 선정 — 무료
    · **최적화 블로거 선정 — 1인당 2크레딧 = 20,000원**
    · 프리미엄 캠페인(20크레딧 = 200,000원)은 최적화 선정 무제한

  즉 광고주는 '최적' 구간 블로거 한 명을 고르는 데 2만원을 더 낸다. 블로거가
  받는 원고료는 건당 1~10만원이다. 그래서 '준최 → 최적' 한 칸은 취미가 아니라
  돈의 문제다.

**주의 — 우리 등급과 남의 등급은 다른 자다.**
블덱스의 "지수 8+"는 블덱스 척도이고, 우리 `detailed_level`(1~15)은 우리 척도다.
두 숫자를 같다고 주장하지 않는다. 우리가 말할 수 있는 건 **구간 이름**
(일반/준최/최적/최적+)까지이고, 그것도 공개 신호로 낸 비공식 추정이다
(blog_index_verifier._DISCLAIMER). 그래서 이 모듈은 "당신은 2만원을 받는다"가
아니라 "광고주가 이 구간에 2만원을 더 지불한다"고만 말한다.
"""
from typing import Dict, List, Optional

from services.blog_index_verifier import (
    THRESHOLD_OPTIMIZED,
    THRESHOLD_OPTIMIZED_PLUS,
    THRESHOLD_SUBOPTIMIZED,
)

# 출처를 코드에 박아 둔다. 숫자가 바뀌면 이 링크를 다시 보고 바꾼다.
SOURCE = {
    "name": "블덱스 체험단 광고주 요금표",
    "url": "https://blogdexreview.space/pricing",
    "checked_at": "2026-10-23",
}

# 광고주가 '최적' 구간 블로거 한 명을 선정할 때 더 내는 금액(원).
OPTIMIZED_SELECTION_PREMIUM_KRW = 20_000

# 사람이 읽는 신호 이름. 키는 blog_index_verifier 의 signals 와 같아야 한다.
_SIGNAL_LABEL = {
    "exact_index": "정확매칭 색인률",
    "integrated_search": "통합검색 노출",
    "indexing_latency": "색인 속도",
    "topic_consistency": "주제 일관성",
    "content_quality": "본문 품질",
    "engagement": "반응(공감·댓글)",
}

# 그 신호를 올리려면 실제로 무엇을 해야 하는가. 점수만 주고 할 일을 안 주면
# 사용자는 화면을 닫는다.
_SIGNAL_MOVE = {
    "exact_index": "제목을 그대로 검색해 안 나오는 글부터 제목·첫 문단을 고친다",
    "integrated_search": "통합검색에 안 걸리는 주제는 검색량 있는 키워드로 제목을 다시 잡는다",
    "indexing_latency": "발행 시간을 일정하게 하고, 올린 뒤 24시간 안에 수정하지 않는다",
    "topic_consistency": "최근 글의 주제를 한 축으로 모은다 — 잡다한 주제는 색인을 깎는다",
    "content_quality": "글당 소제목 3개 이상, 본문 1,500자 이상, 직접 찍은 사진",
    "engagement": "이웃 교류와 댓글 응답 — 반응 신호는 글 품질보다 느리게 움직인다",
}

_TIERS = [
    ("일반", 0.0),
    ("준최", THRESHOLD_SUBOPTIMIZED),
    ("최적", THRESHOLD_OPTIMIZED),
    ("최적+", THRESHOLD_OPTIMIZED_PLUS),
]


def _next_tier(score: float):
    """다음 구간 이름과 필요한 점수. 최상위면 (None, None)."""
    for name, floor in _TIERS:
        if score < floor:
            return name, round(floor - score, 1)
    return None, None


def best_moves(signal_scores: Dict[str, Dict], limit: int = 2) -> List[Dict]:
    """
    총점을 가장 많이 올려주는 신호 순서.

    기준은 점수가 낮은 순이 아니라 **가중치 × 부족분**이다. 가중치 0.05 짜리
    신호가 0점이어도 총점은 5점밖에 안 올라간다 — 낮은 점수부터 고치라고
    말하면 가장 안 중요한 걸 먼저 하게 된다.
    """
    rows = []
    for key, sig in (signal_scores or {}).items():
        if not isinstance(sig, dict):
            continue
        score = sig.get("score")
        weight = sig.get("weight")
        if score is None or weight is None:
            continue
        headroom = max(0.0, 100.0 - float(score))
        gain = headroom * float(weight)
        if gain <= 0:
            continue
        rows.append({
            "signal": key,
            "label": _SIGNAL_LABEL.get(key, key),
            "score": round(float(score), 1),
            "weight": round(float(weight), 3),
            # 이 신호를 100점까지 끌어올렸을 때 총점이 오르는 폭
            "max_total_gain": round(gain, 1),
            "move": _SIGNAL_MOVE.get(key, ""),
        })
    rows.sort(key=lambda r: -r["max_total_gain"])
    return rows[:limit]


def selection_outlook(
    level_category: Optional[str],
    weighted_score: Optional[float],
    signal_scores: Optional[Dict[str, Dict]] = None,
    confidence: str = "low",
) -> Optional[Dict]:
    """
    체험단 선정 관점의 해석. 측정이 없으면 None — 추정으로 메우지 않는다.

    `confidence` 를 그대로 실어 보낸다. 글 표본이 적어 신뢰도가 낮은 측정으로
    "최적입니다" 를 말하면 그 사람이 체험단에 신청해 떨어지고 우리를 탓한다.
    """
    if weighted_score is None or not level_category:
        return None

    score = float(weighted_score)
    is_optimized = score >= THRESHOLD_OPTIMIZED
    is_candidate = score >= THRESHOLD_SUBOPTIMIZED
    nxt, gap = _next_tier(score)

    return {
        "tier": level_category,
        # 준최 이상이면 선정 대상 구간에 들어간다(출처의 "준최적화 선정 무료")
        "is_selection_candidate": is_candidate,
        "is_optimized": is_optimized,
        # 광고주가 이 구간 한 명을 고르는 데 더 내는 금액. 블로거의 수입이 아니다.
        "advertiser_premium_krw": OPTIMIZED_SELECTION_PREMIUM_KRW if is_optimized else 0,
        "next_tier": nxt,
        "points_to_next": gap,
        "best_moves": best_moves(signal_scores or {}),
        "confidence": confidence,
        "source": SOURCE,
        # 화면이 과장하지 않도록 서버가 먼저 못을 박는다
        "caveat": (
            "구간 이름은 공개 신호로 낸 비공식 추정이고, 체험단 플랫폼이 쓰는 지수와 "
            "같은 자가 아닙니다. 선정 여부를 보장하지 않습니다."
        ),
    }
