"""
광고 플랫폼 서비스 모듈
각 광고 플랫폼 API 연동 및 최적화 로직
"""
from .base import (
    AdPlatformBase, AdPlatformCredentials, CampaignData, AdGroupData,
    KeywordData, CreativeData, PerformanceData, OptimizationResult,
    OptimizationStrategy
)
from .google_ads import GoogleAdsService
from .meta_ads import MetaAdsService
from .kakao_moment import KakaoMomentService
from .tiktok_ads import TikTokAdsService
from .criteo import CriteoService
from .coupang_ads import CoupangAdsService
from .unified_optimizer import UnifiedAdOptimizer, unified_optimizer, AllocationStrategy

# 플랫폼 ID -> 서비스 클래스 매핑
PLATFORM_SERVICES = {
    "google_ads": GoogleAdsService,
    "meta_ads": MetaAdsService,
    "kakao_moment": KakaoMomentService,
    "tiktok_ads": TikTokAdsService,
    "criteo": CriteoService,
    "coupang_ads": CoupangAdsService,
}

# 플랫폼 정보
PLATFORM_INFO = {
    "google_ads": {
        "name": "Google Ads",
        "name_ko": "구글 애즈",
        "category": "search",
        "features": ["search", "display", "youtube", "shopping", "app"],
        "required_fields": ["customer_id", "developer_token", "refresh_token", "client_id", "client_secret"],
    },
    "meta_ads": {
        "name": "Meta Ads",
        "name_ko": "메타 광고",
        "category": "social",
        "features": ["feed", "stories", "reels", "messenger", "audience_network"],
        "required_fields": ["access_token", "ad_account_id"],
    },
    "kakao_moment": {
        "name": "Kakao Moment",
        "name_ko": "카카오모먼트",
        "category": "social",
        "features": ["kakao_talk", "daum", "kakao_story", "display"],
        "required_fields": ["access_token", "ad_account_id", "app_id"],
    },
    "tiktok_ads": {
        "name": "TikTok Ads",
        "name_ko": "틱톡 광고",
        "category": "video",
        "features": ["in_feed", "top_view", "brand_takeover", "spark_ads"],
        "required_fields": ["access_token", "advertiser_id", "app_id", "secret"],
    },
    "criteo": {
        "name": "Criteo",
        "name_ko": "크리테오",
        "category": "programmatic",
        "features": ["retargeting", "prospecting", "dynamic_ads"],
        "required_fields": ["client_id", "client_secret", "advertiser_id"],
    },
    "coupang_ads": {
        "name": "Coupang Ads",
        "name_ko": "쿠팡 광고",
        "category": "commerce",
        "features": ["search", "display", "product"],
        "required_fields": ["access_key", "secret_key", "vendor_id"],
    },
}


def get_platform_service(platform_id: str, credentials: dict):
    """플랫폼 ID로 서비스 인스턴스 생성"""
    service_class = PLATFORM_SERVICES.get(platform_id)
    if not service_class:
        raise ValueError(f"Unsupported platform: {platform_id}")
    return service_class(credentials)


def get_platform_info(platform_id: str) -> dict:
    """플랫폼 정보 조회"""
    return PLATFORM_INFO.get(platform_id, {})


def get_all_platforms() -> list:
    """모든 플랫폼 정보 조회"""
    return [
        {"id": pid, **info}
        for pid, info in PLATFORM_INFO.items()
    ]


__all__ = [
    # Base classes
    "AdPlatformBase",
    "AdPlatformCredentials",
    "CampaignData",
    "AdGroupData",
    "KeywordData",
    "CreativeData",
    "PerformanceData",
    "OptimizationResult",
    "OptimizationStrategy",
    # Services
    "GoogleAdsService",
    "MetaAdsService",
    "KakaoMomentService",
    "TikTokAdsService",
    "CriteoService",
    "CoupangAdsService",
    # Unified optimizer
    "UnifiedAdOptimizer",
    "unified_optimizer",
    "AllocationStrategy",
    # Mappings
    "PLATFORM_SERVICES",
    "PLATFORM_INFO",
    # Functions
    "get_platform_service",
    "get_platform_info",
    "get_all_platforms",
]
