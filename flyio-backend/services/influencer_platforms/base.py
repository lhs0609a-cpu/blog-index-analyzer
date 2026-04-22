"""
인플루언서 플랫폼 추상 기본 클래스 + 데이터 모델
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from enum import Enum
import math


class InfluencerTier(str, Enum):
    NANO = "nano"          # 1K~10K
    MICRO = "micro"        # 10K~100K
    MID = "mid"            # 100K~500K
    MACRO = "macro"        # 500K~1M
    MEGA = "mega"          # 1M+


# 팔로워 티어별 기대 참여율
EXPECTED_ENGAGEMENT_RATES = {
    InfluencerTier.NANO: 5.0,
    InfluencerTier.MICRO: 3.0,
    InfluencerTier.MID: 1.5,
    InfluencerTier.MACRO: 1.0,
    InfluencerTier.MEGA: 0.5,
}


@dataclass
class InfluencerProfile:
    platform: str
    platform_user_id: str
    username: str
    display_name: str = ""
    bio: str = ""
    profile_image_url: str = ""
    follower_count: int = 0
    following_count: int = 0
    post_count: int = 0
    avg_engagement_rate: float = 0.0
    avg_likes: float = 0.0
    avg_comments: float = 0.0
    avg_views: float = 0.0
    category: str = ""
    language: str = ""
    region: str = ""
    profile_url: str = ""
    verified: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "platform": self.platform,
            "platform_user_id": self.platform_user_id,
            "username": self.username,
            "display_name": self.display_name,
            "bio": self.bio,
            "profile_image_url": self.profile_image_url,
            "follower_count": self.follower_count,
            "following_count": self.following_count,
            "post_count": self.post_count,
            "avg_engagement_rate": self.avg_engagement_rate,
            "avg_likes": self.avg_likes,
            "avg_comments": self.avg_comments,
            "avg_views": self.avg_views,
            "category": self.category,
            "language": self.language,
            "region": self.region,
            "profile_url": self.profile_url,
            "verified": int(self.verified),
        }


@dataclass
class InfluencerPost:
    platform_post_id: str = ""
    content_type: str = "text"
    content_text: str = ""
    thumbnail_url: str = ""
    post_url: str = ""
    like_count: int = 0
    comment_count: int = 0
    share_count: int = 0
    view_count: int = 0
    published_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "platform_post_id": self.platform_post_id,
            "content_type": self.content_type,
            "content_text": self.content_text,
            "thumbnail_url": self.thumbnail_url,
            "post_url": self.post_url,
            "like_count": self.like_count,
            "comment_count": self.comment_count,
            "share_count": self.share_count,
            "view_count": self.view_count,
            "published_at": self.published_at,
        }


class InfluencerPlatformBase(ABC):
    """인플루언서 플랫폼 추상 기본 클래스"""

    PLATFORM_ID: str = ""
    PLATFORM_NAME: str = ""
    PLATFORM_NAME_KO: str = ""

    @abstractmethod
    async def search_creators(self, query: str, filters: dict) -> List[InfluencerProfile]:
        """키워드로 크리에이터 검색"""
        pass

    @abstractmethod
    async def get_creator_profile(self, username: str) -> Optional[InfluencerProfile]:
        """크리에이터 프로필 상세 조회"""
        pass

    @abstractmethod
    async def get_creator_posts(self, username: str, limit: int = 12) -> List[InfluencerPost]:
        """크리에이터 최근 게시물 조회"""
        pass

    async def check_status(self) -> Dict[str, Any]:
        """플랫폼 연결 상태 확인"""
        try:
            result = await self.search_creators("test", {})
            return {
                "platform": self.PLATFORM_ID,
                "name": self.PLATFORM_NAME_KO,
                "status": "connected",
                "message": "정상"
            }
        except Exception as e:
            return {
                "platform": self.PLATFORM_ID,
                "name": self.PLATFORM_NAME_KO,
                "status": "error",
                "message": str(e)
            }


def get_follower_tier(follower_count: int) -> InfluencerTier:
    """팔로워 수로 티어 판별"""
    if follower_count >= 1_000_000:
        return InfluencerTier.MEGA
    elif follower_count >= 500_000:
        return InfluencerTier.MACRO
    elif follower_count >= 100_000:
        return InfluencerTier.MID
    elif follower_count >= 10_000:
        return InfluencerTier.MICRO
    else:
        return InfluencerTier.NANO


def calculate_influencer_score(profile: dict, query: str) -> float:
    """
    인플루언서 스코어 계산 (0~100)
    - 관련성 30% / 참여율 품질 25% / 팔로워 티어 15%
    - 콘텐츠 일관성 15% / 프로필 품질 15%
    """
    score = 0.0

    # 1. 관련성 (30%)
    relevance = 0.0
    query_lower = query.lower()
    username = (profile.get("username") or "").lower()
    display_name = (profile.get("display_name") or "").lower()
    bio = (profile.get("bio") or "").lower()

    if query_lower in username:
        relevance += 40
    if query_lower in display_name:
        relevance += 35
    if query_lower in bio:
        relevance += 25
    relevance = min(relevance, 100)
    score += relevance * 0.30

    # 2. 참여율 품질 (25%)
    follower_count = profile.get("follower_count", 0)
    engagement_rate = profile.get("avg_engagement_rate", 0.0)
    tier = get_follower_tier(follower_count)
    expected = EXPECTED_ENGAGEMENT_RATES.get(tier, 3.0)
    engagement_score = min((engagement_rate / expected) * 100, 100) if expected > 0 else 0
    score += engagement_score * 0.25

    # 3. 팔로워 티어 (15%) - log10 스케일
    if follower_count > 0:
        follower_score = min(math.log10(follower_count) / 7 * 100, 100)  # 10M = 100점
    else:
        follower_score = 0
    score += follower_score * 0.15

    # 4. 콘텐츠 일관성 (15%) - 게시물 수 기반
    post_count = profile.get("post_count", 0)
    consistency_score = min(post_count / 100 * 100, 100)
    score += consistency_score * 0.15

    # 5. 프로필 품질 (15%)
    quality_score = 0
    if profile.get("bio"):
        quality_score += 40
    if profile.get("profile_image_url"):
        quality_score += 30
    if profile.get("verified"):
        quality_score += 30
    score += quality_score * 0.15

    return round(min(score, 100), 1)
