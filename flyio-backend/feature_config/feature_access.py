"""
Feature Access Configuration
Defines which features are available for each subscription plan
"""
from enum import Enum
from typing import Dict, List, Optional, Any
from dataclasses import dataclass


class Plan(str, Enum):
    GUEST = "guest"
    FREE = "free"
    BASIC = "basic"
    PRO = "pro"
    UNLIMITED = "unlimited"


class AccessLevel(str, Enum):
    NONE = "none"           # No access
    LIMITED = "limited"     # Limited access (with restrictions)
    FULL = "full"           # Full access


@dataclass
class FeatureConfig:
    """Configuration for a single feature"""
    name: str
    display_name: str
    description: str
    category: str
    access: Dict[str, AccessLevel]
    limits: Optional[Dict[str, Any]] = None  # Plan-specific limits


# Feature Categories
CATEGORIES = {
    "content": "콘텐츠 제작",
    "analysis": "분석 도구",
    "keyword": "키워드 분석",
    "platform": "플랫폼 분석",
    "premium": "프리미엄 전용"
}

# All 34 Features Configuration
FEATURES: Dict[str, FeatureConfig] = {
    # ============ 콘텐츠 제작 (Content Creation) ============
    "title": FeatureConfig(
        name="title",
        display_name="AI 제목 생성",
        description="AI가 클릭률 높은 제목을 생성합니다",
        category="content",
        access={
            Plan.GUEST: AccessLevel.LIMITED,
            Plan.FREE: AccessLevel.LIMITED,
            Plan.BASIC: AccessLevel.LIMITED,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        },
        limits={
            Plan.GUEST: {"max_titles": 3},
            Plan.FREE: {"max_titles": 3},
            Plan.BASIC: {"max_titles": 10},
            Plan.PRO: {"max_titles": -1},  # unlimited
            Plan.UNLIMITED: {"max_titles": -1}
        }
    ),
    "blueocean": FeatureConfig(
        name="blueocean",
        display_name="블루오션 키워드",
        description="경쟁이 낮은 블루오션 키워드를 발굴합니다",
        category="content",
        access={
            Plan.GUEST: AccessLevel.LIMITED,
            Plan.FREE: AccessLevel.LIMITED,
            Plan.BASIC: AccessLevel.LIMITED,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        },
        limits={
            Plan.GUEST: {"max_keywords": 5},
            Plan.FREE: {"max_keywords": 5},
            Plan.BASIC: {"max_keywords": 20},
            Plan.PRO: {"max_keywords": -1},
            Plan.UNLIMITED: {"max_keywords": -1}
        }
    ),
    "writing": FeatureConfig(
        name="writing",
        display_name="글쓰기 가이드",
        description="SEO 최적화 글쓰기 가이드를 제공합니다",
        category="content",
        access={
            Plan.GUEST: AccessLevel.LIMITED,
            Plan.FREE: AccessLevel.LIMITED,
            Plan.BASIC: AccessLevel.FULL,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        },
        limits={
            Plan.GUEST: {"detail_level": "basic"},
            Plan.FREE: {"detail_level": "basic"},
            Plan.BASIC: {"detail_level": "detailed"},
            Plan.PRO: {"detail_level": "ai_enhanced"},
            Plan.UNLIMITED: {"detail_level": "ai_enhanced"}
        }
    ),
    "hashtag": FeatureConfig(
        name="hashtag",
        display_name="해시태그 추천",
        description="최적의 해시태그를 추천합니다",
        category="content",
        access={
            Plan.GUEST: AccessLevel.FULL,
            Plan.FREE: AccessLevel.FULL,
            Plan.BASIC: AccessLevel.FULL,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "timing": FeatureConfig(
        name="timing",
        display_name="최적 발행 시간",
        description="가장 효과적인 발행 시간을 분석합니다",
        category="content",
        access={
            Plan.GUEST: AccessLevel.FULL,
            Plan.FREE: AccessLevel.FULL,
            Plan.BASIC: AccessLevel.FULL,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "youtube": FeatureConfig(
        name="youtube",
        display_name="유튜브 스크립트 변환",
        description="블로그 글을 유튜브 스크립트로 변환합니다",
        category="content",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.NONE,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "comment": FeatureConfig(
        name="comment",
        display_name="AI 댓글 답변",
        description="AI가 댓글 답변을 생성합니다",
        category="content",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.FULL,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),

    # ============ 분석 도구 (Analysis Tools) ============
    "insight": FeatureConfig(
        name="insight",
        display_name="성과 인사이트",
        description="블로그 성과를 분석하고 인사이트를 제공합니다",
        category="analysis",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.FULL,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "prediction": FeatureConfig(
        name="prediction",
        display_name="상위 노출 예측",
        description="키워드별 상위 노출 확률을 예측합니다",
        category="analysis",
        access={
            Plan.GUEST: AccessLevel.LIMITED,
            Plan.FREE: AccessLevel.LIMITED,
            Plan.BASIC: AccessLevel.FULL,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        },
        limits={
            Plan.GUEST: {"show_tips": False},
            Plan.FREE: {"show_tips": False},
            Plan.BASIC: {"show_tips": True},
            Plan.PRO: {"show_tips": True},
            Plan.UNLIMITED: {"show_tips": True}
        }
    ),
    "report": FeatureConfig(
        name="report",
        display_name="상세 리포트",
        description="종합 분석 리포트를 생성합니다",
        category="analysis",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.LIMITED,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        },
        limits={
            Plan.BASIC: {"monthly_limit": 2},
            Plan.PRO: {"monthly_limit": -1},
            Plan.UNLIMITED: {"monthly_limit": -1}
        }
    ),
    "lowquality": FeatureConfig(
        name="lowquality",
        display_name="저품질 위험 감지",
        description="저품질 판정 위험을 분석합니다",
        category="analysis",
        access={
            Plan.GUEST: AccessLevel.LIMITED,
            Plan.FREE: AccessLevel.LIMITED,
            Plan.BASIC: AccessLevel.FULL,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        },
        limits={
            Plan.GUEST: {"detail_level": "basic", "checks": 3},
            Plan.FREE: {"detail_level": "basic", "checks": 3},
            Plan.BASIC: {"detail_level": "detailed", "checks": -1},
            Plan.PRO: {"detail_level": "ai_analysis", "checks": -1},
            Plan.UNLIMITED: {"detail_level": "ai_analysis", "checks": -1}
        }
    ),
    "backup": FeatureConfig(
        name="backup",
        display_name="블로그 백업",
        description="블로그 글을 백업합니다",
        category="analysis",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.LIMITED,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        },
        limits={
            Plan.BASIC: {"monthly_limit": 1},
            Plan.PRO: {"monthly_limit": -1},
            Plan.UNLIMITED: {"monthly_limit": -1}
        }
    ),
    "campaign": FeatureConfig(
        name="campaign",
        display_name="체험단 매칭",
        description="체험단 캠페인을 매칭합니다",
        category="analysis",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.FULL,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "ranktrack": FeatureConfig(
        name="ranktrack",
        display_name="키워드 순위 추적",
        description="키워드별 순위 변화를 추적합니다",
        category="analysis",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.LIMITED,
            Plan.PRO: AccessLevel.LIMITED,
            Plan.UNLIMITED: AccessLevel.FULL
        },
        limits={
            Plan.BASIC: {"max_keywords": 5},
            Plan.PRO: {"max_keywords": 50},
            Plan.UNLIMITED: {"max_keywords": -1}
        }
    ),
    "clone": FeatureConfig(
        name="clone",
        display_name="경쟁 블로그 분석",
        description="경쟁 블로그의 전략을 분석합니다",
        category="analysis",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.NONE,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "algorithm": FeatureConfig(
        name="algorithm",
        display_name="알고리즘 변화 감지",
        description="네이버 알고리즘 변화를 감지합니다",
        category="analysis",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.NONE,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "lifespan": FeatureConfig(
        name="lifespan",
        display_name="콘텐츠 수명 분석",
        description="글별 유효 수명을 분석합니다",
        category="analysis",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.FULL,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "refresh": FeatureConfig(
        name="refresh",
        display_name="오래된 글 리프레시",
        description="업데이트가 필요한 글을 찾습니다",
        category="analysis",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.FULL,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "related": FeatureConfig(
        name="related",
        display_name="연관 글 분석",
        description="연관 글 링크를 분석합니다",
        category="analysis",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.FULL,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "roadmap": FeatureConfig(
        name="roadmap",
        display_name="성장 로드맵",
        description="블로그 성장 로드맵을 제공합니다",
        category="analysis",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.FULL,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),

    # ============ 키워드 분석 (Keyword Analysis) ============
    "mentor": FeatureConfig(
        name="mentor",
        display_name="멘토링 매칭",
        description="블로그 멘토를 매칭합니다",
        category="keyword",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.NONE,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "trend": FeatureConfig(
        name="trend",
        display_name="트렌드 예측",
        description="키워드 트렌드를 예측합니다",
        category="keyword",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.NONE,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "revenue": FeatureConfig(
        name="revenue",
        display_name="수익 최적화",
        description="블로그 수익을 최적화합니다",
        category="keyword",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.NONE,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "secretkw": FeatureConfig(
        name="secretkw",
        display_name="비밀 키워드",
        description="숨겨진 고수익 키워드를 발굴합니다",
        category="premium",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.NONE,
            Plan.PRO: AccessLevel.NONE,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "datalab": FeatureConfig(
        name="datalab",
        display_name="네이버 데이터랩",
        description="네이버 데이터랩 연동 분석",
        category="keyword",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.FULL,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "keywordSearch": FeatureConfig(
        name="keywordSearch",
        display_name="키워드 검색",
        description="키워드별 블로그 상위 노출 분석",
        category="keyword",
        access={
            Plan.GUEST: AccessLevel.LIMITED,
            Plan.FREE: AccessLevel.LIMITED,
            Plan.BASIC: AccessLevel.LIMITED,
            Plan.PRO: AccessLevel.LIMITED,
            Plan.UNLIMITED: AccessLevel.FULL
        },
        limits={
            Plan.GUEST: {"max_keywords": 5, "tree_expansion": False},
            Plan.FREE: {"max_keywords": 10, "tree_expansion": False},
            Plan.BASIC: {"max_keywords": 30, "tree_expansion": True},
            Plan.PRO: {"max_keywords": 50, "tree_expansion": True},
            Plan.UNLIMITED: {"max_keywords": 100, "tree_expansion": True}
        }
    ),

    # ============ 플랫폼 분석 (Platform Analysis) ============
    "shopping": FeatureConfig(
        name="shopping",
        display_name="쇼핑 키워드",
        description="네이버 쇼핑 키워드를 분석합니다",
        category="platform",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.NONE,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "place": FeatureConfig(
        name="place",
        display_name="플레이스 분석",
        description="네이버 플레이스를 분석합니다",
        category="platform",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.NONE,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "news": FeatureConfig(
        name="news",
        display_name="뉴스 분석",
        description="뉴스 키워드를 분석합니다",
        category="platform",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.NONE,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "cafe": FeatureConfig(
        name="cafe",
        display_name="카페 분석",
        description="네이버 카페를 분석합니다",
        category="platform",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.NONE,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "naverView": FeatureConfig(
        name="naverView",
        display_name="네이버뷰 분석",
        description="네이버뷰(영상)를 분석합니다",
        category="platform",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.NONE,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "searchAnalysis": FeatureConfig(
        name="searchAnalysis",
        display_name="검색 결과 분석",
        description="검색 결과 구성을 분석합니다",
        category="platform",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.NONE,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "kin": FeatureConfig(
        name="kin",
        display_name="지식인 분석",
        description="네이버 지식인을 분석합니다",
        category="platform",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.NONE,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),

    # ============ 프리미엄 전용 (Premium Only) ============
    "influencer": FeatureConfig(
        name="influencer",
        display_name="인플루언서 분석",
        description="인플루언서 벤치마킹 분석",
        category="premium",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.NONE,
            Plan.PRO: AccessLevel.NONE,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
    "smartstore": FeatureConfig(
        name="smartstore",
        display_name="스마트스토어 연동",
        description="스마트스토어와 연동 분석",
        category="premium",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.NONE,
            Plan.PRO: AccessLevel.NONE,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),

    # ============ 광고 최적화 (Ad Optimization) ============
    "adOptimizer": FeatureConfig(
        name="adOptimizer",
        display_name="네이버 광고 자동 최적화",
        description="네이버 검색광고 입찰가를 AI가 자동으로 최적화합니다",
        category="premium",
        access={
            Plan.GUEST: AccessLevel.NONE,
            Plan.FREE: AccessLevel.NONE,
            Plan.BASIC: AccessLevel.NONE,
            Plan.PRO: AccessLevel.FULL,
            Plan.UNLIMITED: AccessLevel.FULL
        }
    ),
}


def get_feature_access(feature_name: str, plan: str) -> Dict[str, Any]:
    """
    Get feature access information for a specific plan

    Returns:
        {
            "allowed": bool,
            "access_level": str,
            "limits": dict or None,
            "upgrade_hint": str or None
        }
    """
    feature = FEATURES.get(feature_name)
    if not feature:
        return {
            "allowed": False,
            "access_level": AccessLevel.NONE,
            "limits": None,
            "upgrade_hint": "존재하지 않는 기능입니다"
        }

    plan_enum = Plan(plan) if plan in [p.value for p in Plan] else Plan.GUEST
    access_level = feature.access.get(plan_enum, AccessLevel.NONE)

    result = {
        "allowed": access_level != AccessLevel.NONE,
        "access_level": access_level.value,
        "limits": feature.limits.get(plan_enum) if feature.limits else None,
        "upgrade_hint": None
    }

    # Add upgrade hints for limited or no access
    if access_level == AccessLevel.NONE:
        # Find minimum plan that has access
        for p in [Plan.FREE, Plan.BASIC, Plan.PRO, Plan.UNLIMITED]:
            if feature.access.get(p, AccessLevel.NONE) != AccessLevel.NONE:
                plan_names = {
                    Plan.FREE: "무료",
                    Plan.BASIC: "베이직",
                    Plan.PRO: "프로",
                    Plan.UNLIMITED: "무제한"
                }
                result["upgrade_hint"] = f"{plan_names[p]} 플랜 이상에서 사용 가능합니다"
                break
    elif access_level == AccessLevel.LIMITED:
        # Find plan with full access
        for p in [Plan.BASIC, Plan.PRO, Plan.UNLIMITED]:
            if feature.access.get(p, AccessLevel.NONE) == AccessLevel.FULL:
                plan_names = {
                    Plan.BASIC: "베이직",
                    Plan.PRO: "프로",
                    Plan.UNLIMITED: "무제한"
                }
                result["upgrade_hint"] = f"{plan_names[p]} 플랜으로 업그레이드하면 제한 없이 사용할 수 있습니다"
                break

    return result


def get_all_features_for_plan(plan: str) -> Dict[str, Dict[str, Any]]:
    """Get all features access info for a plan"""
    return {
        name: get_feature_access(name, plan)
        for name in FEATURES.keys()
    }


def get_features_by_category() -> Dict[str, List[Dict[str, Any]]]:
    """Get features grouped by category"""
    result = {cat: [] for cat in CATEGORIES.keys()}

    for name, feature in FEATURES.items():
        result[feature.category].append({
            "name": name,
            "display_name": feature.display_name,
            "description": feature.description
        })

    return result


# Plan pricing info
PLAN_PRICING = {
    Plan.FREE: {"price": 0, "name": "무료", "daily_limit": 10},
    Plan.BASIC: {"price": 9900, "name": "베이직", "daily_limit": 50},
    Plan.PRO: {"price": 19900, "name": "프로", "daily_limit": 200},
    Plan.UNLIMITED: {"price": 39900, "name": "무제한", "daily_limit": -1},
}
