"""
Blog Analyzer Service - 블로그 분석 유틸리티

routers/blogs.py의 분석 함수를 서비스로 래핑
"""
import logging
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)


# ===== 절대 기준표 (백분위 모집단이 얇을 때의 판정 기준) =====
#
# 구간은 임의로 고른 숫자가 아니라 실측으로 뽑았다.
# 2026-07-29, 네이버 블로그 검색(24개 주제 × 상위글)에서 모은 실제 블로그 380개를
# 현재 스코어링(SCORING_VERSION=4)으로 채점해 그 분포의 분위수를 구간 경계로 삼았다.
#   측정 분포: min 31.8 / 중앙값 82.9 / max 99.1
# 각 레벨이 가져가는 비율은 blog_percentile_db.get_level_from_percentile과 동일하게 맞췄다
# (최적+ 상위 5%, 최적 상위 17%, 준최 그 아래, 일반 하위 3%).
#
# ⚠️ 모집단 성격: "검색에 노출되는 블로그"다. 전체 네이버 블로그 평균이 아니다.
#    방치 블로그는 이 표본에 거의 없으므로 중앙값이 82.9로 높게 잡힌다.
#    즉 이 등급은 "검색 경쟁권 블로그들 사이에서의 위치"로 읽어야 한다.
_LEVEL_CUTS = [
    (98.9, 15, "최적4+"),
    (98.0, 14, "최적3+"),
    (97.5, 13, "최적2+"),
    (96.9, 12, "최적1+"),
    (95.9, 11, "최적3"),
    (94.5, 10, "최적2"),
    (93.0, 9, "최적1"),
    (90.1, 8, "준최7"),
    (86.8, 7, "준최6"),
    (82.9, 6, "준최5"),
    (80.0, 5, "준최4"),
    (75.7, 4, "준최3"),
    (66.8, 3, "준최2"),
    (47.2, 2, "준최1"),
]


def get_blog_level_from_score(score: float) -> Tuple[int, str]:
    """점수 → 레벨/등급 (일반/준최/최적/최적+ 체계)

    구간 근거는 위 _LEVEL_CUTS 주석 참조 (실측 380개 분포 기반).
    """
    for cut, level, grade in _LEVEL_CUTS:
        if score >= cut:
            return level, grade
    return 1, "일반"


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
