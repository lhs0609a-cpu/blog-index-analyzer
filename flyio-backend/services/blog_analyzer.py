"""
Blog Analyzer Service - 블로그 분석 유틸리티

routers/blogs.py의 분석 함수를 서비스로 래핑
"""
import logging
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)


def get_blog_level_from_score(score: float) -> Tuple[int, str]:
    """
    점수 기반 레벨 계산

    네이버 블로그 점수 → 레벨 변환:
    - 85+ 점: Lv.13-15 (파워블로거)
    - 75-85 점: Lv.10-12 (인플루언서급)
    - 65-75 점: Lv.7-9 (최적화 블로그)
    - 55-65 점: Lv.4-6 (준최적화 블로그)
    - 45-55 점: Lv.3-4 (일반 활성 블로그)
    - 35-45 점: Lv.2-3 (입문 블로그)
    - 25-35 점: Lv.1-2 (초보 블로그)
    - 25 점 미만: Lv.1 (신규/방치 블로그)
    """
    if score >= 95:
        return 15, "마스터"
    elif score >= 90:
        return 14, "그랜드마스터"
    elif score >= 85:
        return 13, "챌린저"
    elif score >= 80:
        return 12, "다이아몬드"
    elif score >= 75:
        return 11, "플래티넘"
    elif score >= 72:
        return 10, "골드"
    elif score >= 68:
        return 9, "실버"
    elif score >= 65:
        return 8, "브론즈"
    elif score >= 60:
        return 7, "아이언"
    elif score >= 55:
        return 6, "성장기"
    elif score >= 50:
        return 5, "입문"
    elif score >= 45:
        return 4, "초보"
    elif score >= 35:
        return 3, "뉴비"
    elif score >= 25:
        return 2, "스타터"
    else:
        return 1, "시작"


async def analyze_blog(blog_id: str, keyword: str = None) -> Optional[Dict]:
    """
    블로그 분석 수행

    routers/blogs.py의 analyze_blog 함수를 호출

    Args:
        blog_id: 네이버 블로그 ID
        keyword: 분석 키워드 (선택)

    Returns:
        분석 결과 딕셔너리:
        - blog_id: 블로그 ID
        - success: 분석 성공 여부
        - stats: 통계 정보 (total_posts, neighbor_count, total_visitors)
        - index: 지수 정보 (total_score, level, grade, percentile)
        - analysis: 추가 분석 정보
    """
    try:
        # routers/blogs.py에서 analyze_blog 함수 임포트
        # 순환 임포트 방지를 위해 지연 임포트 사용
        from routers.blogs import analyze_blog as _analyze_blog

        result = await _analyze_blog(blog_id, keyword)
        return result

    except ImportError as e:
        logger.error(f"Failed to import analyze_blog: {e}")
        return None
    except Exception as e:
        logger.error(f"Blog analysis failed for {blog_id}: {e}")
        return None


async def get_blog_info(blog_id: str) -> Optional[Dict]:
    """
    블로그 기본 정보 조회

    analyze_blog의 간소화 버전 - 기본 정보만 반환

    Returns:
        - blog_id: 블로그 ID
        - level: 블로그 레벨
        - score: 총점
        - grade: 등급명
    """
    result = await analyze_blog(blog_id)

    if not result or not result.get("success"):
        return None

    index = result.get("index", {})

    return {
        "blog_id": blog_id,
        "level": index.get("level", 0),
        "score": index.get("total_score", 0),
        "grade": index.get("grade", ""),
        "name": result.get("analysis", {}).get("blog_name"),
        "stats": result.get("stats", {})
    }


def calculate_level_gap(my_level: int, target_level: int) -> int:
    """
    레벨 갭 계산

    양수: 내가 더 높음
    음수: 상대가 더 높음
    """
    return my_level - target_level


def can_compete(my_level: int, target_level: int, tolerance: int = 2) -> bool:
    """
    경쟁 가능 여부 판단

    Args:
        my_level: 내 레벨
        target_level: 경쟁 대상 레벨
        tolerance: 허용 레벨 차이 (기본 2)

    Returns:
        경쟁 가능 여부
    """
    gap = calculate_level_gap(my_level, target_level)
    return gap >= -tolerance


# 싱글톤 인스턴스 (캐시용)
_blog_info_cache: Dict[str, Dict] = {}


async def get_blog_level(blog_id: str, use_cache: bool = True) -> int:
    """
    블로그 레벨만 빠르게 조회

    Args:
        blog_id: 블로그 ID
        use_cache: 캐시 사용 여부

    Returns:
        블로그 레벨 (실패 시 0)
    """
    global _blog_info_cache

    # 캐시 확인
    if use_cache and blog_id in _blog_info_cache:
        return _blog_info_cache[blog_id].get("level", 0)

    # 분석 수행
    info = await get_blog_info(blog_id)

    if info:
        _blog_info_cache[blog_id] = info
        return info.get("level", 0)

    return 0
