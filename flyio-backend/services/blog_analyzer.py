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
# 2026-08-03, 네이버 블로그 검색(32개 주제 × 상위글)에서 모은 실제 블로그 420개를
# 현재 스코어링(SCORING_VERSION=5)으로 채점해 그 분포의 분위수를 구간 경계로 삼았다.
#   측정 분포: min 6.4 / 중앙값 76.2 / max 90.2
# 각 레벨이 가져가는 비율은 blog_percentile_db.get_level_from_percentile과 동일하게 맞췄다
# (최적+ 상위 5%, 최적 상위 17%, 준최 그 아래, 일반 하위 3%).
#
# ⚠️ 모집단 성격: "검색에 노출되는 블로그"다. 전체 네이버 블로그 평균이 아니다.
#    즉 이 등급은 "검색 경쟁권 블로그들 사이에서의 위치"로 읽어야 한다.
#    2026-08-03 표본에는 방치 블로그도 22%(94/420) 섞여 있다
#    (abandoned 32 / stopped 27 / dormant 23 / dormant_entering 12).
#    활동성 계수가 곱셈이라 이들이 하위 꼬리(min 6.4)를 만든다.
#
# ⚠️ 상단 구간이 좁다: 최적1(83.6) ~ 최적4+(89.9) 사이 6.3점에 7개 레벨이 몰려 있다.
#    상위권 블로그끼리 실제로 점수 차가 작기 때문이며(표본의 사실), 그래서
#    상단에서는 1점 차이가 2~3레벨을 가른다. 상위 등급은 '정확한 순위'가 아니라
#    '상위권 안에 있다' 정도로 읽어야 한다.
_LEVEL_CUTS = [
    (89.9, 15, "최적4+"),
    (89.3, 14, "최적3+"),
    (87.9, 13, "최적2+"),
    (86.3, 12, "최적1+"),
    (85.3, 11, "최적3"),
    (84.4, 10, "최적2"),
    (83.6, 9, "최적1"),
    (82.2, 8, "준최7"),
    (80.4, 7, "준최6"),
    (76.2, 6, "준최5"),
    (72.7, 5, "준최4"),
    (46.3, 4, "준최3"),
    (13.9, 3, "준최2"),
    (7.6, 2, "준최1"),
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
