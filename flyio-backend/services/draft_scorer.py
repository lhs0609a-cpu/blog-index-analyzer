"""
발행 전 원고 진단.

왜 필요한가:
기존 도구는 전부 사후 진단이다 — /analyze 는 이미 쌓인 결과를, /analyze-post 는
**발행된 URL** 을, /blog-check 는 이미 벌어진 누락을 본다. 정작 블로거가 가장
절실한 순간은 '발행 버튼 누르기 직전'인데 그 자리가 비어 있었다.

무엇이 다른가:
다른 도구는 "2,000자 이상 쓰세요" 같은 일반론을 준다. 우리는 그 키워드 1페이지
글들의 **실측 평균**과 비교한다(학습 샘플에 쌓인 값). 같은 조언이라도 근거가 다르고,
키워드마다 기준이 달라진다 — 어떤 키워드는 1,200자로 1페이지에 있고 어떤 키워드는
4,000자가 평균이다.

⚠️ 점수를 '순위 예측'으로 포장하지 않는다. 우리 순위 모델은 아직 spearman 0.18 로
약하다(2026-08-18 실측). 여기서 하는 일은 **1페이지에 있는 글들과 내 원고의 차이를
숫자로 보여주는 것**이지, 몇 위가 될지 맞히는 게 아니다.
"""
import logging
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# 소제목으로 볼 줄. 네이버 에디터에서 복사하면 서식이 사라지므로 텍스트 규칙으로 추정한다.
_HEADING_PAT = re.compile(
    r"^\s*(?:#{1,6}\s+|\d+[.)]\s+|[▶▷■□◆◇●○★☆-]\s*|\[[^\]]{1,40}\]\s*$)"
)

# 문장 끝이 아닌 짧은 줄도 소제목일 확률이 높다(제목형 줄)
_MAX_HEADING_LEN = 40


def analyze_text(title: str, content: str, keyword: str) -> Dict[str, Any]:
    """원고 텍스트에서 관측 가능한 지표를 뽑는다. 네트워크 호출 없음."""
    title = (title or "").strip()
    content = (content or "").strip()
    kw = (keyword or "").strip()

    # 공백 제외 글자수 — 네이버 글자수 세기와 체감을 맞춘다
    text_len = len(re.sub(r"\s+", "", content))

    lines = [ln.strip() for ln in content.splitlines()]
    paragraphs = [ln for ln in lines if ln]
    headings = [
        ln for ln in paragraphs
        if _HEADING_PAT.match(ln) or (len(ln) <= _MAX_HEADING_LEN and not ln.endswith((".", "!", "?", "다", "요")))
    ]

    kw_nospace = kw.replace(" ", "")
    body_nospace = re.sub(r"\s+", "", content)
    kw_count = body_nospace.count(kw_nospace) if kw_nospace else 0
    density = (kw_count * len(kw_nospace) / text_len * 100) if (text_len and kw_nospace) else 0.0

    return {
        "title_length": len(title),
        "content_length": text_len,
        "paragraph_count": len(paragraphs),
        "heading_count": len(headings),
        "keyword_count": kw_count,
        "keyword_density": round(density, 2),
        "title_has_keyword": bool(kw_nospace and kw_nospace in title.replace(" ", "")),
        "title_keyword_position": (
            title.replace(" ", "").find(kw_nospace) if kw_nospace else -1
        ),
    }


def _gap(name: str, mine: float, target: float, unit: str, advice: str) -> Optional[Dict]:
    """목표에 못 미치는 항목만 반환. 넘어선 항목까지 잔소리하지 않는다."""
    if target <= 0 or mine >= target:
        return None
    return {
        "field": name,
        "mine": mine,
        "target": target,
        "shortfall": round(target - mine, 1),
        "unit": unit,
        "advice": advice,
    }


def diagnose_draft(
    title: str,
    content: str,
    keyword: str,
    image_count: int = 0,
    baseline: Optional[Dict] = None,
    baseline_is_global: bool = False,
) -> Dict[str, Any]:
    """원고를 1페이지 실측 평균과 비교한다."""
    m = analyze_text(title, content, keyword)
    m["image_count"] = max(0, int(image_count or 0))

    gaps: List[Dict] = []
    checks: List[Dict] = []

    if baseline:
        for field, mine, target, unit, advice in (
            ("content_length", m["content_length"], baseline.get("avg_content_length") or 0, "자",
             "본문을 더 채우세요. 같은 말을 늘리는 게 아니라 다루지 않은 하위 질문을 추가하는 방식이어야 합니다."),
            ("image_count", m["image_count"], baseline.get("avg_image_count") or 0, "장",
             "이미지를 추가하세요. 직접 찍은 사진이 스톡 이미지보다 낫습니다."),
            ("heading_count", m["heading_count"], baseline.get("avg_heading_count") or 0, "개",
             "소제목으로 나누세요. 검색 의도별로 문단을 끊으면 발췌 노출에도 유리합니다."),
        ):
            g = _gap(field, mine, round(target), unit, advice)
            if g:
                gaps.append(g)
            checks.append({
                "field": field, "mine": mine, "target": round(target),
                "unit": unit, "ok": g is None,
            })

    # 기준선과 무관하게 항상 보는 것들
    if not m["title_has_keyword"]:
        gaps.append({
            "field": "title_has_keyword", "mine": 0, "target": 1, "shortfall": 1, "unit": "",
            "advice": f"제목에 '{keyword}' 를 넣으세요. 제목 일치는 검색 매칭의 기본입니다.",
        })
    checks.append({"field": "title_has_keyword", "mine": int(m["title_has_keyword"]),
                   "target": 1, "unit": "", "ok": m["title_has_keyword"]})

    if m["keyword_density"] > 5:
        gaps.append({
            "field": "keyword_density", "mine": m["keyword_density"], "target": 5,
            "shortfall": 0, "unit": "%",
            "advice": "키워드가 과도하게 반복됩니다(5% 초과). 억지로 넣은 문장은 오히려 감점 요인입니다.",
        })
    elif m["keyword_density"] < 0.5 and m["content_length"] > 0:
        gaps.append({
            "field": "keyword_density", "mine": m["keyword_density"], "target": 0.5,
            "shortfall": round(0.5 - m["keyword_density"], 2), "unit": "%",
            "advice": "본문에 키워드가 거의 없습니다. 자연스러운 문장 안에서 몇 번 더 언급하세요.",
        })
    checks.append({"field": "keyword_density", "mine": m["keyword_density"],
                   "target": "0.5~5", "unit": "%",
                   "ok": 0.5 <= m["keyword_density"] <= 5})

    # 준비도 — '몇 위가 된다'가 아니라 '기준을 몇 개 충족했다'
    passed = sum(1 for c in checks if c["ok"])
    readiness = round(passed / len(checks) * 100) if checks else 0

    if readiness >= 90:
        verdict, verdict_label = "ready", "발행해도 좋습니다"
    elif readiness >= 60:
        verdict, verdict_label = "almost", "조금만 보완하면 됩니다"
    else:
        verdict, verdict_label = "not_ready", "이대로는 경쟁이 어렵습니다"

    return {
        "ok": True,
        "keyword": keyword,
        "metrics": m,
        "baseline": baseline,
        "baseline_is_global": baseline_is_global,
        "checks": checks,
        "gaps": gaps,
        "readiness": readiness,
        "verdict": verdict,
        "verdict_label": verdict_label,
        "note": (
            "이 진단은 '몇 위가 될지'를 맞히는 것이 아닙니다. "
            "그 키워드 1페이지에 실제로 올라와 있는 글들과 내 원고의 차이를 숫자로 보여줍니다."
            + ("" if not baseline_is_global else
               " ⚠️ 이 키워드는 아직 측정 전이라 전체 평균을 기준으로 비교했습니다.")
        ),
    }
