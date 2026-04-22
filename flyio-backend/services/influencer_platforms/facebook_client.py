"""
Facebook 인플루언서 검색 클라이언트

경로 A: Google Custom Search site:facebook.com (1순위)
경로 B: 네이버 웹 검색 site:facebook.com (2순위)
경로 C: Graph API (토큰 있을 때 프로필 직접 조회)
"""
import httpx
import logging
from typing import List, Optional, Dict

from .base import InfluencerPlatformBase, InfluencerProfile, InfluencerPost
from .web_search import search_profiles, lookup_profile

logger = logging.getLogger(__name__)

FB_API_BASE = "https://graph.facebook.com/v19.0"


class FacebookInfluencerClient(InfluencerPlatformBase):
    PLATFORM_ID = "facebook"
    PLATFORM_NAME = "Facebook"
    PLATFORM_NAME_KO = "페이스북"

    def __init__(self, access_token: str = None):
        from config import settings
        self.access_token = access_token or getattr(settings, "INSTAGRAM_BUSINESS_TOKEN", "")
        self.google_cse_api_key = getattr(settings, "GOOGLE_CSE_API_KEY", "")
        self.google_cse_id = getattr(settings, "GOOGLE_CSE_ID", "")
        self.naver_client_id = getattr(settings, "NAVER_CLIENT_ID", "")
        self.naver_client_secret = getattr(settings, "NAVER_CLIENT_SECRET", "")
        self._has_google = bool(self.google_cse_api_key and self.google_cse_id)
        self._has_naver = bool(self.naver_client_id and self.naver_client_secret)
        self._has_search = self._has_google or self._has_naver
        self.timeout = httpx.Timeout(15.0, connect=5.0)

    async def search_creators(self, query: str, filters: dict) -> List[InfluencerProfile]:
        """웹 검색으로 Facebook 인플루언서 발견 (Google → Naver)"""
        if not self._has_search:
            logger.info("Facebook: 검색 API 미설정")
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
        """Facebook 프로필 조회 — Graph API 또는 웹 검색"""
        # Graph API로 직접 조회 시도
        if self.access_token:
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.get(f"{FB_API_BASE}/{username}", params={
                        "fields": "id,name,category,fan_count,about,picture.type(large),link,verification_status",
                        "access_token": self.access_token,
                    })
                    if resp.status_code == 200:
                        page = resp.json()
                        picture_url = ""
                        pic_data = page.get("picture", {}).get("data", {})
                        if pic_data:
                            picture_url = pic_data.get("url", "")

                        return InfluencerProfile(
                            platform=self.PLATFORM_ID,
                            platform_user_id=page.get("id", ""),
                            username=page.get("id", username),
                            display_name=page.get("name", ""),
                            bio=(page.get("about") or "")[:500],
                            profile_image_url=picture_url,
                            follower_count=page.get("fan_count", 0),
                            following_count=0,
                            post_count=0,
                            avg_engagement_rate=0.0,
                            category=page.get("category", ""),
                            profile_url=page.get("link", f"https://www.facebook.com/{username}"),
                            verified=page.get("verification_status") == "blue_verified",
                        )
            except Exception as e:
                logger.debug(f"Facebook Graph API lookup failed: {e}")

        # 웹 검색 fallback
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
                    profile_url=r.profile_url,
                    verified=False,
                )

        return None

    async def get_creator_posts(self, username: str, limit: int = 12) -> List[InfluencerPost]:
        """Facebook 게시물 — Graph API 토큰 있을 때만"""
        if not self.access_token:
            return []

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(f"{FB_API_BASE}/{username}/posts", params={
                    "fields": "id,message,created_time,permalink_url,shares,full_picture",
                    "limit": limit,
                    "access_token": self.access_token,
                })
                if resp.status_code != 200:
                    return []

                posts_data = resp.json().get("data", [])
                return [
                    InfluencerPost(
                        platform_post_id=p.get("id", ""),
                        content_type="post",
                        content_text=(p.get("message") or "")[:300],
                        thumbnail_url=p.get("full_picture", ""),
                        post_url=p.get("permalink_url", ""),
                        like_count=0,
                        comment_count=0,
                        share_count=p.get("shares", {}).get("count", 0),
                        view_count=0,
                        published_at=p.get("created_time", ""),
                    )
                    for p in posts_data
                ]
        except Exception as e:
            logger.error(f"Facebook posts fetch error: {e}")
            return []

    async def check_status(self) -> Dict:
        parts = []
        if self._has_google:
            parts.append("Google 검색")
        if self._has_naver:
            parts.append("네이버 검색")
        if self.access_token:
            parts.append("Graph API")

        if parts:
            return {
                "platform": self.PLATFORM_ID,
                "name": self.PLATFORM_NAME_KO,
                "status": "limited",
                "message": " / ".join(parts),
            }
        return {
            "platform": self.PLATFORM_ID,
            "name": self.PLATFORM_NAME_KO,
            "status": "not_configured",
            "message": "검색 API / Graph API 모두 미설정",
        }
