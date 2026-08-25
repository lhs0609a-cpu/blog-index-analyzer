"""
키워드 진입 난이도 — 합성 점수.

왜 새로 만들었나 (2026-08-25):
이전 난이도는 `median(경쟁자 활동성) * 100` 단 하나였다. 그런데 활동성은
'마지막 글로부터 며칠'로만 계산되고, 7일 이내면 계수가 1.0 이다.
네이버 검색 1페이지에 올라와 있는 블로그가 최근 일주일 안에 글을 안 썼을 리가
없으므로 중앙값은 거의 항상 1.0 → 난이도 100.0 → 라벨 'very_hard' 가 된다.

실측: 발행된 340개 중 **319개(93.8%)가 점수 정확히 100.0**, 338개가 'very_hard'.
즉 눈금이 천장에 붙어 아무것도 구분하지 못했다. 페이지마다 다른 실측값이
들어가야 한다는 것이 이 프로그래매틱 SEO 의 전제인데, 그 중심 숫자가 전부
같은 값이면 340개는 서로 사본이나 다름없다.

무엇으로 바꿨나:
이미 재고 있으면서 쓰지 않던 값들을 쓴다. 추가 네트워크 호출은 0이다.

  entry_bar   top10_min_score   45%  1페이지 최하위 = 10번째 자리를 뺏으려면
                                     실제로 넘어야 하는 문턱. 상위권이 아무리
                                     세도 꼴찌가 약하면 자리는 열려 있다.
  field       top10_avg_score   30%  판 전체의 두께.
  vitality    median_vitality   15%  기존 축. 버리진 않고 비중만 낮춘다.
  demand      log10(검색량)      10%  수요가 크면 경쟁이 계속 유입된다.

실측 분포(같은 340개): 30.4 ~ 80.1, 중앙값 62.8, 라벨 5종 중 4종이 채워진다.

⚠️ 눈금을 바꾸면 예전 점수와 같은 선에 그릴 수 없다. 블로그 지수에서 표본을
15개로 늘렸을 때 SCORING_VERSION 을 올렸던 것과 같은 이유다. DIFFICULTY_VERSION
을 함께 저장하고, 프론트는 버전이 다른 값을 나란히 비교하지 않는다.
"""
import math
from typing import Any, Dict, Optional, Tuple

# 눈금 버전. 공식이나 가중치가 바뀌면 반드시 올린다.
#  1 = median_vitality * 100 (2026-08-17 ~ 08-25, 천장 포화)
#  2 = 합성 (2026-08-25 ~)
DIFFICULTY_VERSION = 2

_WEIGHTS = {
    "entry_bar": 45.0,
    "field": 30.0,
    "vitality": 15.0,
    "demand": 10.0,
}


def _demand_pressure(volume: Optional[int]) -> Optional[float]:
    """
    월 검색량 → 0~100 압력. 로그 눈금이다.
    월 10회=20, 1천=60, 10만=100. 선형으로 잡으면 상위 몇 개가 전부를 먹는다.
    """
    if not volume or volume <= 0:
        return None
    return min(100.0, 20.0 * math.log10(max(float(volume), 10.0)))


def label_for(score: Optional[float]) -> str:
    """
    점수 → 라벨. 경계는 위 실측 분포(30~80)에 맞춰 잡았다.
    측정이 안 된 것은 'unknown' 이다 — 안 잰 것을 쉬움으로도 어려움으로도
    말하지 않는다.
    """
    if score is None:
        return "unknown"
    if score >= 72:
        return "very_hard"
    if score >= 58:
        return "hard"
    if score >= 44:
        return "moderate"
    if score >= 30:
        return "easy"
    return "very_easy"


def compute_difficulty(
    *,
    top10_min_score: Optional[float],
    top10_avg_score: Optional[float],
    median_vitality: Optional[float],
    search_volume: Optional[int],
) -> Tuple[Optional[float], str, Dict[str, Any]]:
    """
    합성 난이도를 만든다. 돌려주는 값은 (점수, 라벨, 성분표).

    상위 10개 지수를 못 잰 키워드는 점수를 None 으로 돌려준다.
    이때 억지로 활동성만으로 100점을 매기던 것이 이 함수를 만든 이유다.
    """
    breakdown: Dict[str, Any] = {}

    avg = top10_avg_score if top10_avg_score is not None else 0.0
    if avg <= 0:
        # 경쟁도 측정이 실패한 키워드. 활동성만으로는 진입 난이도를 말할 수 없다.
        return None, "unknown", {"reason": "top10_score_missing"}

    mn = top10_min_score if top10_min_score is not None else avg

    parts = [
        ("entry_bar", max(0.0, min(100.0, float(mn)))),
        ("field", max(0.0, min(100.0, float(avg)))),
    ]
    if median_vitality is not None:
        parts.append(("vitality", max(0.0, min(100.0, float(median_vitality) * 100.0))))
    demand = _demand_pressure(search_volume)
    if demand is not None:
        parts.append(("demand", demand))

    total_w = sum(_WEIGHTS[k] for k, _ in parts)
    score = sum(v * _WEIGHTS[k] for k, v in parts) / total_w
    score = round(score, 1)

    for k, v in parts:
        breakdown[k] = {"value": round(v, 1), "weight": round(_WEIGHTS[k] / total_w, 3)}

    return score, label_for(score), breakdown
