"""
검색 결과 → 학습 샘플 피처 변환 (단일 소스).

왜 따로 두나:
같은 매핑이 두 곳에서 필요하다 —
  1) 프론트 /keyword-search 가 검색할 때 (사용자 트래픽 의존)
  2) SEO 키워드 페이지 크론이 측정할 때 (2시간마다 자동)
(2)는 이미 같은 데이터를 뽑고 있으면서 학습 샘플로는 안 넣고 있었다.
연결하면 추가 네트워크 비용 0 으로 샘플이 쌓인다.

⚠️ 값은 전부 score_breakdown 안에 있다. post_analysis 는 항상 None 이니
거기서 찾지 말 것. content_detail 의 각 항목은 {"score": .., "raw": ..} 형태라
학습에는 raw 를 써야 한다(score 는 이미 가중치가 반영된 값이라 순환 참조가 된다).
"""
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def _raw(v: Any) -> float:
    """content_detail 항목은 {"score":.., "raw":..} 또는 스칼라로 온다."""
    if isinstance(v, dict):
        v = v.get("raw", 0)
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _get(obj: Any, name: str, default=None):
    """pydantic 모델과 dict 를 모두 받는다."""
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def features_from_result(blog: Any) -> Dict[str, Any]:
    """검색 결과 1건 → add_learning_sample 이 받는 blog_features."""
    index = _get(blog, "index")
    sb = _get(index, "score_breakdown") or {}
    if not isinstance(sb, dict):
        sb = {}
    cd = sb.get("content_detail") or {}
    rs = sb.get("raw_signals") or {}
    cr = sb.get("c_rank_detail") or {}
    di = sb.get("dia_detail") or {}
    stats = _get(blog, "stats")

    content_length = _raw(cd.get("content_length")) or float(
        rs.get("fullparse_avg_content_length") or 0
    )
    fullparse_n = rs.get("fullparse_n") or 0

    return {
        # 블로그 전체 지수
        "c_rank_score": sb.get("c_rank") or 0,
        "dia_score": sb.get("dia") or 0,
        "post_count": _get(stats, "total_posts") or rs.get("total_posts") or 0,
        "neighbor_count": _get(stats, "neighbor_count") or rs.get("neighbor_count") or 0,
        "visitor_count": _get(stats, "total_visitors") or rs.get("total_visitors") or 0,
        "recent_posts_30d": int(rs.get("recent_activity_days") or 0),
        "blog_age_days": 0,  # 응답에 없음
        # C-Rank / D.I.A. 하위
        "context_score": cr.get("context"),
        "content_score": cr.get("content"),
        "chain_score": cr.get("chain"),
        "depth_score": di.get("depth"),
        "information_score": di.get("information"),
        "accuracy_score": di.get("accuracy"),
        # 글 콘텐츠
        "content_length": content_length,
        "heading_count": _raw(cd.get("heading_count")),
        "paragraph_count": _raw(cd.get("paragraph_count")),
        "image_count": _raw(cd.get("image_count")) or float(rs.get("fullparse_avg_images") or 0),
        "post_age_days": _raw(cd.get("freshness")),
        # 보너스
        "video_count": float(rs.get("fullparse_avg_videos") or 0),
        "like_count": float(rs.get("fullparse_avg_likes") or 0),
        "comment_count": float(rs.get("fullparse_avg_comments") or 0),
        # 본문을 실제로 읽었는지 — 못 읽은 샘플은 학습에서 제외된다
        "content_parsed": bool(fullparse_n > 0 or content_length > 0),
    }


def collect_from_search(keyword: str, results, limit: int = 10) -> int:
    """
    검색 결과를 학습 샘플로 저장한다. 실패해도 호출부를 죽이지 않는다.
    반환: 저장한 샘플 수.
    """
    if not results:
        return 0
    try:
        from database.learning_db import add_learning_sample, get_current_weights
        from services.learning_engine import calculate_blog_score
    except Exception as e:  # pragma: no cover
        logger.warning(f"[learning_sample] import 실패: {e}")
        return 0

    try:
        weights = get_current_weights()
    except Exception:
        weights = None

    saved = 0
    for i, blog in enumerate(results[:limit]):
        blog_id = _get(blog, "blog_id")
        if not blog_id:
            continue
        try:
            feats = features_from_result(blog)
            try:
                predicted = calculate_blog_score(feats, weights) if weights else 0.0
            except Exception:
                predicted = 0.0
            add_learning_sample(
                keyword=keyword,
                blog_id=blog_id,
                actual_rank=i + 1,
                predicted_score=predicted,
                blog_features=feats,
            )
            saved += 1
        except Exception as e:
            logger.warning(f"[learning_sample] {keyword}/{blog_id} 저장 실패: {e}")
    if saved:
        logger.info(f"[learning_sample] '{keyword}' 샘플 {saved}건 저장")
    return saved
