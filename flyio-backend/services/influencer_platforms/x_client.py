"""
X (Twitter) 인플루언서 검색 클라이언트

경로 A: Google Custom Search site:x.com (1순위)
경로 B: 네이버 웹 검색 site:x.com (2순위)

※ X API v2 검색은 Basic ($100/월) 이상 필요 — 미구현
"""
import logging
from typing import List, Optional, Dict

from .base import InfluencerPlatformBase, InfluencerProfile, InfluencerPost
from .web_search import search_profiles, lookup_profile

logger = logging.getLogger(__name__)


class XInfluencerClient(InfluencerPlatformBase):
    PLATFORM_ID = "x"
    PLATFORM_NAME = "X"
    PLATFORM_NAME_KO = "X (트위터)"

    def __init__(self):
        from config import settings
        self.google_cse_api_key = getattr(settings, "GOOGLE_CSE_API_KEY", "")
        self.google_cse_id = getattr(settings, "GOOGLE_CSE_ID", "")
        self.naver_client_id = getattr(settings, "NAVER_CLIENT_ID", "")
        self.naver_client_secret = getattr(settings, "NAVER_CLIENT_SECRET", "")
        self._has_google = bool(self.google_cse_api_key and self.google_cse_id)
        self._has_naver = bool(self.naver_client_id and self.naver_client_secret)
        self._has_search = self._has_google or self._has_naver

    async def search_creators(self, query: str, filters: dict) -> List[InfluencerProfile]:
        """웹 검색으로 X 인플루언서 발견 (Google → Naver)"""
        if not self._has_search:
            logger.info("X: 검색 API 미설정")
            return []

        results = await search_profiles(
            platform_id=self.PLATFORM_ID,
            query=query,
            google_cse_api_key=self.google_cse_api_key,
            google_cse_id=self.google_cse_id,
            naver_client_id=self.naver_client_id,
            naver_client_secret=self.naver_client_secret,
        )

        return [
            InfluencerProfile(
                platform=self.PLATFORM_ID,
                platform_user_id="",
                username=r.username,
                display_name=r.display_name,
                bio=r.bio,
                profile_image_url="",
                follower_count=r.follower_count,
                following_count=r.following_count,
                post_count=r.post_count,
                avg_engagement_rate=0.0,
                avg_likes=0.0,
                avg_comments=0.0,
                avg_views=0.0,
                category="",
                language="",
                region="",
                profile_url=r.profile_url,
                verified=False,
            )
            for r in results
        ]

    async def get_creator_profile(self, username: str) -> Optional[InfluencerProfile]:
        """X 프로필 조회"""
        if not self._has_search:
            return None

        r = await lookup_profile(
            platform_id=self.PLATFORM_ID,
            username=username,
            google_cse_api_key=self.google_cse_api_key,
            google_cse_id=self.google_cse_id,
            naver_client_id=self.naver_client_id,
            naver_client_secret=self.naver_client_secret,
        )
        if not r:
            return None

        return InfluencerProfile(
            platform=self.PLATFORM_ID,
            platform_user_id="",
            username=r.username,
            display_name=r.display_name,
            bio=r.bio,
            profile_image_url="",
            follower_count=r.follower_count,
            following_count=r.following_count,
            post_count=r.post_count,
            avg_engagement_rate=0.0,
            avg_likes=0.0,
            avg_comments=0.0,
            avg_views=0.0,
            profile_url=r.profile_url,
            verified=False,
        )

    async def get_creator_posts(self, username: str, limit: int = 12) -> List[InfluencerPost]:
        return []

    async def check_status(self) -> Dict:
        parts = []
        if self._has_google:
            parts.append("Google 검색")
        if self._has_naver:
            parts.append("네이버 검색")

        if self._has_search:
            return {
                "platform": self.PLATFORM_ID,
                "name": self.PLATFORM_NAME_KO,
                "status": "limited",
                "message": f"{' + '.join(parts)} 기반 프로필 발견 가능",
            }
        return {
            "platform": self.PLATFORM_ID,
            "name": self.PLATFORM_NAME_KO,
            "status": "not_configured",
            "message": "검색 API 미설정 (GOOGLE_CSE_API_KEY 또는 NAVER_CLIENT_ID 필요)",
        }
