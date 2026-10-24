"""
검색 노출 진단 — 흔히 '저품질'이라 부르는 상태를 실제 색인 데이터로 확인한다.

원리:
정상 블로그는 **자기 글 제목을 그대로 검색하면 거의 100% 1위로 나온다**.
안 나온다는 건 그 글이 색인되지 않았다는 뜻이다. 지수를 추정해 저품질 여부를
'추측'하는 것과 달리, 이건 나오는지 안 나오는지를 직접 보는 **관측**이다.

⚠️ 표현 주의:
네이버는 2016년 공식 블로그에서 "최적화 블로그, 저품질 블로그, 블로그지수 등은
네이버에서 만든 개념이 아닙니다"라고 밝혔다. 따라서 이 기능은 네이버의 내부
상태를 읽는 것이 아니라 **외부에서 관측 가능한 색인 결과**를 보여주는 것이다.
결과 문구에서 "네이버가 저품질로 분류했다" 같은 단정을 하면 안 된다.

측정 자체는 blog_index_verifier 를 그대로 재사용한다(글 10개 기준 약 6초).
"""
import logging
import math
import re
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# 색인률 구간. 정상 블로그는 제목 정확검색이면 거의 전부 잡히므로 기준이 높다.
GRADES = (
    (0.90, "healthy", "정상", "글이 정상적으로 검색에 노출되고 있습니다."),
    (0.70, "watch", "관찰 필요", "일부 글이 검색에 잡히지 않습니다. 아직 심각한 수준은 아닙니다."),
    (0.40, "degraded", "노출 저하", "상당수 글이 검색에 나오지 않습니다. 원인 점검이 필요합니다."),
    (0.00, "critical", "심각", "대부분의 글이 검색에 잡히지 않습니다. 흔히 '저품질'이라 부르는 상태에 해당합니다."),
)

# 이 시간을 넘겨도 최신 글이 안 잡히면 경고. 네이버는 보통 수 시간 내 색인한다.
LATENCY_WARN_HOURS = 48

# 제목을 정확히 검색했는데 이 순위 밖이면 이상 신호.
# (자기 글 제목 검색은 보통 1위다)
RANK_WARN = 5

# 발행 후 이 시간 안에 안 잡힌 글은 '누락'이 아니라 '대기'다. 판정에서 뺀다 —
# 방금 올린 글 하나가 색인률을 깎아 '관찰 필요'로 떨어뜨리던 것.
PENDING_HOURS = 24
# 이 시간까지는 '지연'으로 본다. 넘기면 누락으로 판정한다(블로거 경험칙: 72시간).
DELAYED_HOURS = 72

# 제목 도배 신호 — 네이버가 금칙어를 공개하지 않으므로 '의심'으로만 쓴다.
_DECOR = re.compile(r"[★☆♥♡♪◆◇■□▶▷●○※→←↑↓✔✅🔥💯❤️]|!{2,}|\?{2,}")


def _norm_title(t: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", t or "").lower()


def _title_causes(title: str, others: List[str]) -> List[str]:
    """제목만 보고 짚을 수 있는 원인 후보(관측 가능한 것만)."""
    causes: List[str] = []
    me = _norm_title(title)
    for o in others:
        on = _norm_title(o)
        if me and on and me != on and SequenceMatcher(None, me, on).ratio() >= 0.85:
            causes.append(f"내 다른 글 「{o[:30]}」과 제목이 거의 같습니다 — 같은 블로그 글끼리 겹치면 하나만 노출되는 경우가 많습니다.")
            break
        if me and me == on:
            causes.append(f"내 다른 글과 제목이 똑같습니다 — 같은 제목은 하나만 노출되는 경우가 많습니다.")
            break
    words = re.findall(r"[가-힣A-Za-z0-9]{2,}", title or "")
    for w in set(words):
        if words.count(w) >= 3:
            causes.append(f"제목에 '{w}' 단어가 {words.count(w)}번 반복됩니다 — 키워드 반복은 도배로 보일 수 있습니다.")
            break
    if _DECOR.search(title or ""):
        causes.append("제목에 장식 기호나 느낌표·물음표 반복이 있습니다 — 광고성 글로 보일 수 있습니다.")
    return causes


def _post_verdict(p: Dict[str, Any], others: List[str]) -> Dict[str, Any]:
    """글 한 개의 상태와 처방. 상태: ok / buried / pending / delayed / missing"""
    indexed = bool(p.get("indexed_blog_tab") or p.get("indexed_view_tab"))
    rank = p.get("blog_tab_rank")
    age = p.get("age_hours")
    title = p.get("title") or ""
    out: Dict[str, Any] = {"recheck_after_hours": None, "causes": [], "advice": []}

    if indexed and (rank or 0) <= RANK_WARN:
        out.update(status="ok", status_label="노출")
        return out
    if indexed:
        out.update(status="buried", status_label="밀림")
        out["causes"] = _title_causes(title, others)
        out["advice"] = [
            f"제목을 그대로 검색했는데 {rank}위입니다. 자기 글 제목 검색은 보통 1위라 확인이 필요합니다.",
            "같은 주제의 내 다른 글과 제목·도입부가 겹치지 않게 구분해 보세요.",
        ]
        return out
    if age is not None and age < PENDING_HOURS:
        wait = max(1, math.ceil(PENDING_HOURS - age))
        out.update(status="pending", status_label="대기", recheck_after_hours=wait)
        out["advice"] = [
            f"발행 {age:.0f}시간 된 글입니다. 보통 수 시간~하루 안에 검색에 잡히므로 아직 누락으로 보지 않습니다.",
            f"약 {wait}시간 뒤 다시 확인해 보세요.",
        ]
        return out
    if age is not None and age < DELAYED_HOURS:
        wait = max(1, math.ceil(DELAYED_HOURS - age))
        out.update(status="delayed", status_label="지연", recheck_after_hours=wait)
        out["causes"] = _title_causes(title, others)
        out["advice"] = [
            f"발행 {age:.0f}시간이 지났지만 아직 안 잡힙니다. 72시간까지는 늦게 잡히는 경우가 있습니다.",
            f"약 {wait}시간 뒤에도 안 잡히면 누락으로 보고 수정을 검토하세요. 그 전에 지우거나 다시 올리지 마세요.",
        ]
        return out

    out.update(status="missing", status_label="누락")
    out["causes"] = _title_causes(title, others)
    out["advice"] = [
        "위 원인 후보가 있다면 먼저 고치세요.",
        "본문을 실제로 손본 뒤(문단 추가·이미지 교체·도입부 재작성) 수정 발행하는 방법이 블로거들 사이에서 쓰입니다. "
        "네이버 공식 방법은 아니며 효과를 보장하지 않습니다.",
        "같은 내용을 지우고 그대로 다시 올리면 유사문서로 또 누락될 수 있습니다.",
    ]
    return out


def _grade(rate: float):
    for cut, code, label, msg in GRADES:
        if rate >= cut:
            return code, label, msg
    return GRADES[-1][1], GRADES[-1][2], GRADES[-1][3]


def diagnose(verify_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    verify_blog_index_level 결과를 '검색 노출 진단' 관점으로 다시 읽는다.
    측정을 새로 하지 않으므로 추가 비용이 없다.
    """
    posts: List[Dict[str, Any]] = verify_result.get("post_results") or []
    checked = len(posts)

    if not verify_result.get("ok") or checked == 0:
        return {
            "ok": False,
            "blog_id": verify_result.get("blog_id"),
            "error": verify_result.get("error") or "no_posts",
            "message": (
                "글 목록을 가져오지 못했습니다. 블로그 아이디가 맞는지, "
                "RSS 가 열려 있는지 확인해 주세요."
            ),
        }

    titles = [p.get("title") or "" for p in posts]
    verdicts = [
        _post_verdict(p, [t for j, t in enumerate(titles) if j != i])
        for i, p in enumerate(posts)
    ]
    indexed = [p for p in posts if p.get("indexed_blog_tab") or p.get("indexed_view_tab")]
    # 방금 올린 글(대기)은 판정에서 뺀다. 지연·누락만 '안 잡힌 글'로 센다.
    pending = [p for p, v in zip(posts, verdicts) if v["status"] == "pending"]
    missing = [p for p, v in zip(posts, verdicts) if v["status"] in ("missing", "delayed")]
    judged = checked - len(pending)
    rate = len(indexed) / judged if judged > 0 else len(indexed) / checked

    # 제목 정확검색인데 순위가 낮은 글 — 색인은 됐지만 밀린 경우
    buried = [
        p for p in indexed
        if (p.get("blog_tab_rank") or 0) > RANK_WARN
    ]

    code, label, message = _grade(rate)

    # signal_scores 의 각 항목은 {"score":.., "weight":.., "details":{..}} 형태다.
    # 숫자로 단정하면 터진다(실제로 TypeError 를 냈다).
    lat_sig = (verify_result.get("signal_scores") or {}).get("indexing_latency") or {}
    latency = lat_sig.get("score") if isinstance(lat_sig, dict) else lat_sig
    lat_detail = lat_sig.get("details") if isinstance(lat_sig, dict) else {}
    newest_age = (lat_detail or {}).get("newest_post_age_hours")
    newest_indexed = (lat_detail or {}).get("newest_post_indexed")

    # 진단 근거를 사람이 읽을 수 있게 — "왜 그렇게 판정했는지"를 숨기지 않는다
    reasons: List[str] = [
        f"최근 글 {judged if judged > 0 else checked}개 중 {len(indexed)}개가 검색에 노출됩니다 "
        f"(색인률 {rate * 100:.0f}%)."
    ]
    if pending:
        reasons.append(
            f"발행 {PENDING_HOURS}시간이 안 된 글 {len(pending)}개는 아직 색인 전일 수 있어 판정에서 뺐습니다."
        )
    if missing:
        reasons.append(
            f"{len(missing)}개는 제목을 그대로 검색해도 나오지 않습니다. "
            f"정상 블로그라면 제목 정확검색은 거의 항상 노출됩니다."
        )
    if buried:
        reasons.append(
            f"{len(buried)}개는 노출은 되지만 제목 정확검색에서 {RANK_WARN}위 밖입니다. "
            f"경쟁이 아니라 자기 글 제목인데 밀렸다면 확인이 필요합니다."
        )
    if newest_age is not None:
        if newest_indexed:
            reasons.append(
                f"가장 최근 글은 발행 {newest_age:.0f}시간 만에 색인됐습니다 — 색인 속도는 정상입니다."
            )
        elif newest_age >= LATENCY_WARN_HOURS:
            reasons.append(
                f"가장 최근 글이 발행 {newest_age:.0f}시간이 지나도 검색에 잡히지 않습니다. "
                f"보통 수 시간 안에 색인되므로 이상 신호입니다."
            )

    # 무엇을 하면 되는지 — 진단만 하고 끝내지 않는다
    actions: List[str] = []
    if code == "healthy":
        actions.append("현재 노출은 정상입니다. 발행 주기와 주제 일관성을 유지하세요.")
    else:
        actions.append("최근 글에 같은 문장·이미지를 반복해 쓰지 않았는지 확인하세요.")
        actions.append("외부 링크나 홍보성 문구가 과도하지 않은지 점검하세요.")
        actions.append("주제를 자주 바꾸면 출처 신뢰(C-Rank)가 흩어집니다. 한 주제를 이어가세요.")
    if missing:
        actions.append("누락된 글은 수정 후 재발행하면 다시 색인되는 경우가 있습니다.")

    return {
        "ok": True,
        "blog_id": verify_result.get("blog_id"),
        "grade": code,
        "grade_label": label,
        "message": message,
        "index_rate": round(rate * 100, 1),
        "checked_posts": checked,
        "indexed_posts": len(indexed),
        "missing_posts": len(missing),
        "pending_posts": len(pending),
        "buried_posts": len(buried),
        "indexing_latency_score": latency,
        "latency_warning": bool(
            newest_age is not None and not newest_indexed and newest_age >= LATENCY_WARN_HOURS
        ),
        "newest_post_age_hours": newest_age,
        "newest_post_indexed": newest_indexed,
        "reasons": reasons,
        "actions": actions,
        # 개별 글 결과 — 어느 글이 안 잡히는지 그대로 보여준다
        "posts": [
            {
                "title": p.get("title"),
                "url": p.get("url"),
                "indexed": bool(p.get("indexed_blog_tab") or p.get("indexed_view_tab")),
                "blog_tab_rank": p.get("blog_tab_rank"),
                "view_tab_rank": p.get("view_tab_rank"),
                "age_hours": p.get("age_hours"),
                # 글별 상태와 처방 — 누락을 '표시'만 하고 끝내지 않는다
                **v,
            }
            for p, v in zip(posts, verdicts)
        ],
        "prescription_note": (
            "네이버는 누락 기준을 공개하지 않습니다. 원인 후보는 제목에서 관측되는 신호이고, "
            "처방은 블로거들이 쓰는 경험칙입니다."
        ),
        # 참고용 — 기존 레벨 판정도 같이 준다
        "level_label": verify_result.get("detailed_label"),
        "level_score": verify_result.get("weighted_score"),
        "confidence": verify_result.get("confidence"),
        "disclaimer": (
            "네이버는 2016년 공식 블로그에서 \"최적화 블로그, 저품질 블로그, 블로그지수 등은 "
            "네이버에서 만든 개념이 아닙니다\"라고 밝혔습니다. 이 진단은 네이버의 내부 판정을 "
            "읽은 것이 아니라, 글 제목을 실제로 검색해 노출 여부를 관측한 결과입니다."
        ),
    }
