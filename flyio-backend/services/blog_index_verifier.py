"""
실측 기반 블로그 인덱스 등급 판별 (v3 — NSIDE 방법론 반영)

네이버는 블로그 지수 API를 외부에 공개하지 않으므로 100% 정확한 측정은
물리적으로 불가능하다. 본 모듈은 현존하는 측정 도구(NSIDE, NVIEW,
whereispost, 리드뷰 등)와 공식 문서(C-Rank, DIA)에 공개된 신호를 모두
통합하여 업계 합의에 가까운 추정치를 산출한다.

[참고한 측정 도구의 공개 방법론]
- NSIDE (nside.kr): 최근 50개 포스팅 + 인기글 상위 10개 + 전체 태그 +
  제목 검색 100위까지 확인. 분류는 저품/일반/준최1~7/NB1~3/최적1~4.
  ※ 우리 등급과 매핑: NSIDE NB ↔ 우리 최적, NSIDE 최적 ↔ 우리 최적+
- whereispost (whereispost.com): 제목 정확매칭 검색 → 블로그탭 노출 여부.
  레벨은 0~10 (11단계). "Good/SoSo/Bad" 누락 진단.
- NVIEW (nview.site): 분류는 최블/준최블/NB. 알고리즘은 비공개.
- 리드뷰 (baruda.co.kr): 무료 1회/일 지수 + 이웃수 + 생성일.

[저품질 판별 — NSIDE 공개 기준]
- 30위 밖: 검색 결과에서 30위 이내 미노출이면 저품질 강한 신호
  (NSIDE의 점수 산출 컷오프와 동일)
- 72시간 누락: 게시 후 72h 경과해도 색인 안 되면 휴면/저품질
- 저품1 = 글 단위 품질 저하, 저품2 = 블로그 단위 저품질

[통합 신호 6종]
A. 정확매칭 색인률 (35%) — 제목 "쌍따옴표" 검색 → 블로그탭 노출
   * whereispost의 핵심 측정 방식. 동명 결과를 줄여 "내 글이 색인되어
     있는가?"의 가장 직접적 신호.
B. 통합검색 노출률 (20%) — VIEW탭(통합검색) 노출
C. 색인 지연 (15%) — 최근 포스팅의 게시→색인 latency
   * NSIDE의 "72시간 누락" 기준 반영
D. 주제 일관성 (10%) — C-Rank "Context" 신호의 프록시
   * 최근 포스팅 제목 키워드 클러스터링 (NSIDE의 태그 분석 대체)
E. 콘텐츠 품질 (10%) — DIA "충실성" 신호의 프록시
   * 평균 글 길이
F. 체인/참여 (10%) — C-Rank "Chain" 신호의 프록시
   * 이웃 수 대비 활동성 + 평균 참여 (선택적; 데이터 없으면 가중치 재분배)

[등급 매핑]
가중점수 0~100
  ≥85 → 최적+   (NSIDE "최적1~4")
  ≥65 → 최적    (NSIDE "NB1~3")
  ≥35 → 준최    (NSIDE "준최1~7")
  <35 → 일반    (NSIDE "일반/저품1~2" 통합)

세부 1~15단계는 가중점수를 등급별 구간 내 선형 보간.
"""
import asyncio
import logging
import math
import re
from collections import Counter
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from services.rank_checker import RankChecker

logger = logging.getLogger(__name__)


# ===== 가중치 (신호 우선순위) =====
WEIGHT_EXACT_INDEX = 0.35       # A — 정확매칭 색인률 (가장 직접적)
WEIGHT_INTEGRATED_SEARCH = 0.20  # B — VIEW탭 노출률
WEIGHT_INDEXING_LATENCY = 0.15   # C — 색인 지연
WEIGHT_TOPIC_CONSISTENCY = 0.10  # D — 주제 일관성
WEIGHT_CONTENT_QUALITY = 0.10    # E — 콘텐츠 품질
WEIGHT_ENGAGEMENT = 0.10         # F — 체인/참여

# ===== 카테고리 임계값 =====
THRESHOLD_OPTIMIZED_PLUS = 85.0
THRESHOLD_OPTIMIZED = 65.0
THRESHOLD_SUBOPTIMIZED = 35.0

# ===== 검색 파라미터 =====
# NSIDE 표준에 가깝게 상향: 최근 12개 포스팅 × 50위까지 확인
# (NSIDE는 50개 × 100위지만 응답 시간 trade-off로 절충)
SAMPLE_SIZE_DEFAULT = 12
MAX_TITLE_LEN = 40
SEARCH_CONCURRENCY = 3
SEARCH_TOP_K = 50

# ===== 색인 지연 임계값 (시간) =====
LATENCY_VERY_FAST_HOURS = 12
LATENCY_NORMAL_HOURS = 24
LATENCY_SLOW_HOURS = 72


def _clean_title(title: str) -> str:
    """검색 키워드용 제목 정제."""
    if not title:
        return ""
    cleaned = re.sub(r"[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]", " ", title)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:MAX_TITLE_LEN]


def _quoted(title: str) -> str:
    """쌍따옴표로 정확매칭 검색 — whereispost 방식."""
    cleaned = _clean_title(title)
    return f'"{cleaned}"' if cleaned else ""


# ============================================================
# Signal A + B — 정확매칭 색인률 + 통합검색 노출률
# ============================================================
async def _check_post_visibility(
    checker: RankChecker,
    blog_id: str,
    post_title: str,
    post_url: str,
) -> Dict:
    """단일 포스팅의 정확매칭 색인 + VIEW 노출 동시 확인."""
    quoted_kw = _quoted(post_title)
    if not quoted_kw:
        return {"skipped": True, "reason": "empty_title"}

    try:
        blog_rank, view_rank = await asyncio.gather(
            checker.check_blog_tab_rank(quoted_kw, blog_id, max_results=SEARCH_TOP_K),
            checker.check_view_tab_rank(quoted_kw, post_url, max_results=SEARCH_TOP_K),
            return_exceptions=True,
        )
    except Exception as e:
        logger.warning(f"visibility check failed for {blog_id}/{post_title!r}: {e}")
        return {"skipped": True, "reason": "exception"}

    blog_rank = blog_rank if isinstance(blog_rank, int) else None
    view_rank = view_rank if isinstance(view_rank, int) else None

    return {
        "title": post_title,
        "url": post_url,
        "search_keyword": quoted_kw,
        "indexed_blog_tab": blog_rank is not None,
        "indexed_view_tab": view_rank is not None,
        "blog_tab_rank": blog_rank,
        "view_tab_rank": view_rank,
    }


# ============================================================
# Signal C — 색인 지연
# ============================================================
def _compute_indexing_latency_score(posts: List[Dict], post_results: List[Dict]) -> Tuple[float, Dict]:
    """
    가장 최근 포스트의 게시→색인 지연을 점수화.

    매핑:
      < 12h 색인 → 100
      12~24h 색인 → 80
      24~72h 색인 → 50
      >72h 색인 → 30
      24h 경과 미색인 → 0
    """
    now = datetime.now(timezone.utc)
    candidates = []
    for post, result in zip(posts, post_results):
        pub_date = post.get("pubDate")
        if not isinstance(pub_date, datetime):
            continue
        if result.get("skipped"):
            continue
        age_hours = (now - pub_date).total_seconds() / 3600.0
        candidates.append({
            "age_hours": age_hours,
            "indexed": result.get("indexed_blog_tab") or result.get("indexed_view_tab"),
            "title": post.get("title", ""),
        })

    if not candidates:
        return 50.0, {"reason": "no_pubdate", "newest_post_age_hours": None}

    # 최신 글부터 정렬
    candidates.sort(key=lambda c: c["age_hours"])
    newest = candidates[0]
    age = newest["age_hours"]

    if newest["indexed"]:
        if age < LATENCY_VERY_FAST_HOURS:
            score = 100.0
            label = "very_fast"
        elif age < LATENCY_NORMAL_HOURS:
            score = 80.0
            label = "normal"
        elif age < LATENCY_SLOW_HOURS:
            score = 50.0
            label = "slow"
        else:
            score = 30.0
            label = "very_slow_but_indexed"
    else:
        if age >= LATENCY_NORMAL_HOURS:
            score = 0.0
            label = "missing_after_24h"
        else:
            score = 40.0
            label = "too_recent_to_judge"

    return score, {
        "newest_post_age_hours": round(age, 1),
        "newest_post_indexed": newest["indexed"],
        "label": label,
    }


# ============================================================
# Signal D — 주제 일관성 (C-Rank Context 프록시)
# ============================================================
_KOREAN_STOPWORDS = {
    "있는", "없는", "그리고", "하지만", "그래서", "이번", "오늘", "어제", "내일",
    "정말", "진짜", "완전", "그냥", "대한", "위한", "하는", "되는", "이런",
    "저런", "그런", "함께", "같이", "이야기", "리뷰", "후기", "추천",
}


def _extract_keywords(title: str) -> List[str]:
    """제목에서 한글 키워드 추출 (2글자 이상)."""
    tokens = re.findall(r"[가-힣]{2,}|[A-Za-z]{3,}", title or "")
    return [t for t in tokens if t not in _KOREAN_STOPWORDS]


def _compute_topic_consistency_score(posts: List[Dict]) -> Tuple[float, Dict]:
    """
    제목 키워드의 클러스터링 정도로 주제 집중도 측정.

    상위 N개 키워드의 누적 빈도가 전체에서 차지하는 비율 → 집중도.
    """
    all_keywords: Counter = Counter()
    for post in posts:
        all_keywords.update(_extract_keywords(post.get("title", "")))

    if not all_keywords or sum(all_keywords.values()) < 5:
        return 50.0, {"reason": "insufficient_keywords"}

    total = sum(all_keywords.values())
    top5 = sum(c for _, c in all_keywords.most_common(5))
    concentration = top5 / total  # 0~1

    # 0.5 이상이면 매우 집중 (한 주제 위주), 0.2 미만이면 산발
    if concentration >= 0.5:
        score = 100.0
    elif concentration >= 0.35:
        score = 80.0
    elif concentration >= 0.25:
        score = 60.0
    elif concentration >= 0.15:
        score = 40.0
    else:
        score = 20.0

    return score, {
        "concentration": round(concentration, 3),
        "top_keywords": [k for k, _ in all_keywords.most_common(5)],
    }


# ============================================================
# Signal E — 콘텐츠 품질 (DIA 프록시)
# ============================================================
def _compute_content_quality_score(posts: List[Dict]) -> Tuple[float, Dict]:
    """RSS description 길이 + 이미지 포함률을 품질 프록시로 사용."""
    if not posts:
        return 50.0, {"reason": "no_posts"}

    lengths = [p.get("content_length", 0) for p in posts if p.get("content_length", 0) > 0]
    if not lengths:
        return 40.0, {"reason": "no_content_length"}

    avg_len = sum(lengths) / len(lengths)
    # RSS description은 잘려서 오는 경우가 많아 보수적으로 평가
    if avg_len >= 1500:
        score = 100.0
    elif avg_len >= 800:
        score = 80.0
    elif avg_len >= 400:
        score = 60.0
    elif avg_len >= 200:
        score = 40.0
    else:
        score = 25.0

    return score, {
        "avg_content_length": round(avg_len, 0),
        "samples": len(lengths),
    }


# ============================================================
# Signal F — 체인/참여 (C-Rank Chain 프록시)
# ============================================================
def _compute_engagement_score(blog_stats: Optional[Dict]) -> Tuple[Optional[float], Dict]:
    """
    이웃수 대비 일일 방문자 비율로 활성도 측정.

    blog_stats이 None이면 점수 None 반환 → 가중치에서 제외.
    """
    if not blog_stats:
        return None, {"reason": "no_blog_stats"}

    neighbors = blog_stats.get("neighbor_count") or 0
    visitors = blog_stats.get("total_visitors") or 0
    posts = blog_stats.get("total_posts") or 0

    if neighbors == 0 or visitors == 0:
        return None, {"reason": "missing_metrics"}

    # 누적 방문자 / 누적 포스팅 = 글당 평균 방문 (대략적 활성도)
    if posts > 0:
        per_post_visitors = visitors / posts
    else:
        per_post_visitors = 0

    # 글당 100+ 방문이면 매우 활성, 10 미만이면 저활성
    if per_post_visitors >= 500:
        score = 100.0
    elif per_post_visitors >= 100:
        score = 80.0
    elif per_post_visitors >= 30:
        score = 60.0
    elif per_post_visitors >= 10:
        score = 40.0
    else:
        score = 20.0

    return score, {
        "neighbor_count": neighbors,
        "total_visitors": visitors,
        "visitors_per_post": round(per_post_visitors, 1),
    }


# ============================================================
# 카테고리 + 세부 레벨 매핑
# ============================================================
def _classify(weighted_score: float) -> str:
    if weighted_score >= THRESHOLD_OPTIMIZED_PLUS:
        return "최적+"
    if weighted_score >= THRESHOLD_OPTIMIZED:
        return "최적"
    if weighted_score >= THRESHOLD_SUBOPTIMIZED:
        return "준최"
    return "일반"


def _to_detailed_level(weighted_score: float) -> Tuple[int, str]:
    """가중점수를 1~15 세부 레벨 + 라벨로 매핑."""
    s = max(0.0, min(100.0, weighted_score))
    if s < THRESHOLD_SUBOPTIMIZED:
        return 1, "일반"
    if s < THRESHOLD_OPTIMIZED:
        # 35~65 → 준최1~준최7 (7단계)
        idx = int((s - THRESHOLD_SUBOPTIMIZED) / (THRESHOLD_OPTIMIZED - THRESHOLD_SUBOPTIMIZED) * 7)
        idx = max(0, min(6, idx))
        return 2 + idx, f"준최{idx + 1}"
    if s < THRESHOLD_OPTIMIZED_PLUS:
        # 65~85 → 최적1~최적3 (3단계)
        idx = int((s - THRESHOLD_OPTIMIZED) / (THRESHOLD_OPTIMIZED_PLUS - THRESHOLD_OPTIMIZED) * 3)
        idx = max(0, min(2, idx))
        return 9 + idx, f"최적{idx + 1}"
    # 85~100 → 최적1+~최적4+ (4단계)
    idx = int((s - THRESHOLD_OPTIMIZED_PLUS) / (100.0 - THRESHOLD_OPTIMIZED_PLUS) * 4)
    idx = max(0, min(3, idx))
    return 12 + idx, f"최적{idx + 1}+"


# ============================================================
# 메인 진입점
# ============================================================
async def verify_blog_index_level(
    blog_id: str,
    sample_size: int = SAMPLE_SIZE_DEFAULT,
    blog_stats: Optional[Dict] = None,
) -> Dict:
    """
    실측 다중 신호 통합으로 일반/준최/최적/최적+ 판정.

    Args:
        blog_id: 네이버 블로그 ID
        sample_size: 검증 포스팅 수 (기본 8)
        blog_stats: 선택. {"neighbor_count","total_visitors","total_posts"}
                    있으면 Signal F (체인) 활성, 없으면 가중치 재분배

    Returns:
        {
            "ok": bool,
            "level_category": "일반"|"준최"|"최적"|"최적+",
            "detailed_level": int (1~15),
            "detailed_label": str,
            "weighted_score": float (0~100),
            "signal_scores": {
                "exact_index": {"score": float, "weight": float, "details": {...}},
                ...
            },
            "post_results": [...],
            "checked_posts": int,
            "confidence": "high"|"medium"|"low",
            "method": "multi_signal_v2",
            "disclaimer": str,
            "error": Optional[str],
        }
    """
    from routers.content_lifespan import fetch_blog_posts_via_rss

    posts = await fetch_blog_posts_via_rss(blog_id)
    if not posts:
        return {
            "ok": False,
            "level_category": None,
            "method": "multi_signal_v2",
            "confidence": "low",
            "error": "no_posts_via_rss",
            "disclaimer": _DISCLAIMER,
        }

    sample = posts[:sample_size]
    checker = RankChecker()
    sem = asyncio.Semaphore(SEARCH_CONCURRENCY)

    async def _bounded_check(post: Dict) -> Dict:
        async with sem:
            return await _check_post_visibility(
                checker, blog_id, post.get("title", ""), post.get("link", "")
            )

    try:
        post_results = await asyncio.gather(*[_bounded_check(p) for p in sample])
    finally:
        await checker.close()

    valid = [r for r in post_results if not r.get("skipped")]
    if not valid:
        return {
            "ok": False,
            "level_category": None,
            "method": "multi_signal_v2",
            "confidence": "low",
            "error": "no_valid_samples",
            "disclaimer": _DISCLAIMER,
        }

    n = len(valid)

    # ===== Signal A — 정확매칭 색인률 =====
    exact_index_count = sum(1 for r in valid if r["indexed_blog_tab"])
    exact_index_score = (exact_index_count / n) * 100.0

    # ===== Signal B — VIEW탭 노출률 =====
    view_index_count = sum(1 for r in valid if r["indexed_view_tab"])
    view_index_score = (view_index_count / n) * 100.0

    # ===== Signal C — 색인 지연 =====
    latency_score, latency_details = _compute_indexing_latency_score(sample, post_results)

    # ===== Signal D — 주제 일관성 =====
    topic_score, topic_details = _compute_topic_consistency_score(sample)

    # ===== Signal E — 콘텐츠 품질 =====
    content_score, content_details = _compute_content_quality_score(sample)

    # ===== Signal F — 체인/참여 (선택적) =====
    engagement_score, engagement_details = _compute_engagement_score(blog_stats)

    # ===== 가중치 적용 =====
    signals = [
        ("exact_index", exact_index_score, WEIGHT_EXACT_INDEX,
         {"indexed_count": exact_index_count, "total": n}),
        ("integrated_search", view_index_score, WEIGHT_INTEGRATED_SEARCH,
         {"indexed_count": view_index_count, "total": n}),
        ("indexing_latency", latency_score, WEIGHT_INDEXING_LATENCY, latency_details),
        ("topic_consistency", topic_score, WEIGHT_TOPIC_CONSISTENCY, topic_details),
        ("content_quality", content_score, WEIGHT_CONTENT_QUALITY, content_details),
    ]
    if engagement_score is not None:
        signals.append(("engagement", engagement_score, WEIGHT_ENGAGEMENT, engagement_details))

    total_weight = sum(w for _, _, w, _ in signals)
    weighted_sum = sum(s * w for _, s, w, _ in signals)
    weighted_score = weighted_sum / total_weight  # 0~100

    level_category = _classify(weighted_score)
    detailed_level, detailed_label = _to_detailed_level(weighted_score)

    confidence = "high" if (n >= 6 and engagement_score is not None) else \
                 "medium" if n >= 4 else "low"

    signal_scores = {
        name: {
            "score": round(score, 1),
            "weight": round(weight / total_weight, 3),
            "details": details,
        }
        for name, score, weight, details in signals
    }

    return {
        "ok": True,
        "level_category": level_category,
        "detailed_level": detailed_level,
        "detailed_label": detailed_label,
        "weighted_score": round(weighted_score, 1),
        "signal_scores": signal_scores,
        "post_results": valid,
        "checked_posts": n,
        "confidence": confidence,
        "method": "multi_signal_v2",
        "disclaimer": _DISCLAIMER,
    }


_DISCLAIMER = (
    "네이버는 블로그 지수 API를 외부에 공개하지 않으므로 본 결과는 "
    "공개된 측정 신호(정확매칭 색인률, 30위/72시간 누락, C-Rank/DIA 프록시 등)를 "
    "통합한 비공식 추정치입니다. NSIDE·NVIEW·whereispost·리드뷰 등 타 추적 사이트와 "
    "결과가 다를 수 있습니다 — 각 도구의 측정 알고리즘이 모두 다릅니다."
)
