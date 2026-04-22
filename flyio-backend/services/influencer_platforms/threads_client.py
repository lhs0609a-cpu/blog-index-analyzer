"""
Threads 인플루언서 검색 클라이언트

경로 A: Google Custom Search site:threads.net (1순위)
경로 B: 네이버 웹 검색 site:threads.net (2순위)
경로 C: Instagram 결과에서 cross-reference (보조)
"""
import logging
from typing import List, Optional, Dict

from .base import InfluencerPlatformBase, InfluencerProfile, InfluencerPost
from .web_search import search_profiles, lookup_profile

logger = logging.getLogger(__name__)


class ThreadsInfluencerClient(InfluencerPlatformBase):
    PLATFORM_ID = "threads"
    PLATFORM_NAME = "Threads"
    PLATFORM_NAME_KO = "쓰레드"

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
        """
        Threads 인플루언서 검색.
        경로 A/B: Google/Naver 웹 검색
        경로 C: Instagram cross-reference (filters에서 전달)
        """
        profiles = []

        # 경로 A/B: 웹 검색
        if self._has_search:
            results = await search_profiles(
                platform_id=self.PLATFORM_ID,
                query=query,
                google_cse_api_key=self.google_cse_api_key,
                google_cse_id=self.google_cse_id,
                naver_client_id=self.naver_client_id,
                naver_client_secret=self.naver_client_secret,
            )
            for r in results:
                profiles.append(InfluencerProfile(
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
                ))

        # 경로 C: Instagram cross-reference (웹 검색에서 못 찾은 것만)
        instagram_usernames = filters.get("instagram_usernames", [])
        instagram_profiles = filters.get("instagram_profiles", {})
        seen_usernames = {p.username for p in profiles}

        for username in instagram_usernames[:25]:
            if username in seen_usernames:
                continue
            ig_data = instagram_profiles.get(username, {})
            profiles.append(InfluencerProfile(
                platform=self.PLATFORM_ID,
                platform_user_id="",
                username=username,
                display_name=ig_data.get("display_name", username),
                bio=ig_data.get("bio", ""),
                profile_image_url=ig_data.get("profile_image_url", ""),
                follower_count=ig_data.get("follower_count", 0),
                following_count=ig_data.get("following_count", 0),
                post_count=0,
                avg_engagement_rate=0.0,
                avg_likes=0.0,
                avg_comments=0.0,
                avg_views=0.0,
                category=ig_data.get("category", ""),
                language="",
                region="",
                profile_url=f"https://www.threads.net/@{username}",
                verified=ig_data.get("verified", False),
            ))

        return profiles

    async def get_creator_profile(self, username: str) -> Optional[InfluencerProfile]:
        """Threads 프로필 조회"""
        if self._has_search:
            r = await lookup_profile(
                platform_id=self.PLATFORM_ID,
                username=username,
                google_cse_api_key=self.google_cse_api_key,
                google_cse_id=self.google_cse_id,
                naver_client_id=self.naver_client_id,
                naver_client_secret=self.naver_client_secret,
            )
            if r:
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

        # fallback: URL만 제공
        return InfluencerProfile(
            platform=self.PLATFORM_ID,
            platform_user_id="",
            username=username,
            display_name=username,
            bio="",
            profile_image_url="",
            follower_count=0,
            following_count=0,
            post_count=0,
            avg_engagement_rate=0.0,
            avg_likes=0.0,
            avg_comments=0.0,
            avg_views=0.0,
            profile_url=f"https://www.threads.net/@{username}",
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
        parts.append("Instagram cross-reference")

        return {
            "platform": self.PLATFORM_ID,
            "name": self.PLATFORM_NAME_KO,
            "status": "limited" if self._has_search else "limited",
            "message": f"{' + '.join(parts)} 기반 프로필 발견",
        }
