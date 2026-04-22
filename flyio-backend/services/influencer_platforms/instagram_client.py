"""
Instagram 인플루언서 검색 클라이언트

경로 A: Graph API (INSTAGRAM_BUSINESS_TOKEN 있을 때) ★ 최고 품질
  - ig_hashtag_search → top_media → business_discovery
  - 비즈니스/크리에이터 계정만 조회 가능

경로 B: Google Custom Search site:instagram.com (1순위 웹 검색)
경로 C: 네이버 웹 검색 site:instagram.com (2순위 웹 검색)
경로 D: Cross-reference (YouTube에서 발견한 Instagram 핸들)
"""
import httpx
import re
import asyncio
import logging
from typing import List, Optional, Dict, Tuple

from .base import InfluencerPlatformBase, InfluencerProfile, InfluencerPost
from .web_search import search_profiles, lookup_profile

logger = logging.getLogger(__name__)

IG_GRAPH_API = "https://graph.facebook.com/v19.0"


class InstagramInfluencerClient(InfluencerPlatformBase):
    PLATFORM_ID = "instagram"
    PLATFORM_NAME = "Instagram"
    PLATFORM_NAME_KO = "인스타그램"

    def __init__(self, access_token: str = None, ig_user_id: str = None):
        from config import settings
        self.access_token = access_token or getattr(settings, "INSTAGRAM_BUSINESS_TOKEN", "")
        self.ig_user_id = ig_user_id or getattr(settings, "INSTAGRAM_BUSINESS_USER_ID", "")
        self.google_cse_api_key = getattr(settings, "GOOGLE_CSE_API_KEY", "")
        self.google_cse_id = getattr(settings, "GOOGLE_CSE_ID", "")
        self.naver_client_id = getattr(settings, "NAVER_CLIENT_ID", "")
        self.naver_client_secret = getattr(settings, "NAVER_CLIENT_SECRET", "")
        self.timeout = httpx.Timeout(15.0, connect=5.0)
        self._has_graph_api = bool(self.access_token and self.ig_user_id)
        self._has_google = bool(self.google_cse_api_key and self.google_cse_id)
        self._has_naver = bool(self.naver_client_id and self.naver_client_secret)
        self._has_search = self._has_google or self._has_naver

    # ================================================================
    # 검색
    # ================================================================

    async def search_creators(self, query: str, filters: dict) -> List[InfluencerProfile]:
        """키워드로 인플루언서 검색 (A → B/C → D 순차)"""
        # 경로 A: Graph API
        if self._has_graph_api:
            profiles = await self._search_via_graph_api(query, filters)
            if profiles:
                return profiles

        # 경로 B/C: Google → Naver 웹 검색
        if self._has_search:
            results = await search_profiles(
                platform_id=self.PLATFORM_ID,
                query=query,
                google_cse_api_key=self.google_cse_api_key,
                google_cse_id=self.google_cse_id,
                naver_client_id=self.naver_client_id,
                naver_client_secret=self.naver_client_secret,
            )
            if results:
                return [self._web_to_profile(r) for r in results]

        # 경로 D: Cross-reference
        cross_ref = filters.get("instagram_usernames", [])
        if cross_ref:
            return await self._lookup_multiple_profiles(cross_ref[:25])

        return []

    async def _search_via_graph_api(self, query: str, filters: dict) -> List[InfluencerProfile]:
        """Graph API 해시태그 → 상위 게시물 → 크리에이터 추출"""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                clean_query = re.sub(r'[^a-zA-Z0-9가-힣]', '', query)
                hashtag_resp = await client.get(f"{IG_GRAPH_API}/ig_hashtag_search", params={
                    "q": clean_query,
                    "user_id": self.ig_user_id,
                    "access_token": self.access_token,
                })
                if hashtag_resp.status_code != 200:
                    return []

                hashtags = hashtag_resp.json().get("data", [])
                if not hashtags:
                    return []

                hashtag_id = hashtags[0]["id"]
                media_resp = await client.get(f"{IG_GRAPH_API}/{hashtag_id}/top_media", params={
                    "user_id": self.ig_user_id,
                    "fields": "id,caption,like_count,comments_count,media_type,permalink,timestamp",
                    "access_token": self.access_token,
                })
                if media_resp.status_code != 200:
                    return []

                media_items = media_resp.json().get("data", [])
                usernames = self._extract_usernames_from_media(media_items)

                profiles = []
                for username in usernames[:25]:
                    profile = await self._get_via_business_discovery(client, username)
                    if profile:
                        profiles.append(profile)
                    await asyncio.sleep(0.3)
                return profiles
        except Exception as e:
            logger.error(f"Instagram Graph API search error: {e}")
            return []

    # ================================================================
    # 프로필 조회
    # ================================================================

    async def get_creator_profile(self, username: str) -> Optional[InfluencerProfile]:
        """크리에이터 프로필 조회 (Graph API → Google → Naver)"""
        if self._has_graph_api:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                profile = await self._get_via_business_discovery(client, username)
                if profile:
                    return profile

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
                return self._web_to_profile(r)

        return None

    async def _get_via_business_discovery(self, client: httpx.AsyncClient, username: str) -> Optional[InfluencerProfile]:
        """Graph API business_discovery"""
        if not self._has_graph_api:
            return None
        try:
            resp = await client.get(f"{IG_GRAPH_API}/{self.ig_user_id}", params={
                "fields": (
                    f"business_discovery.fields("
                    f"username,name,biography,profile_picture_url,"
                    f"followers_count,follows_count,media_count,"
                    f"media.limit(12){{like_count,comments_count,media_type,permalink,timestamp,thumbnail_url,caption}}"
                    f").username({username})"
                ),
                "access_token": self.access_token,
            })
            if resp.status_code != 200:
                return None
            data = resp.json().get("business_discovery")
            if not data:
                return None

            followers = data.get("followers_count", 0)
            media_data = data.get("media", {}).get("data", [])
            avg_likes, avg_comments, engagement_rate = self._calc_engagement(media_data, followers)

            return InfluencerProfile(
                platform=self.PLATFORM_ID,
                platform_user_id=str(data.get("id", "")),
                username=data.get("username", username),
                display_name=data.get("name", ""),
                bio=(data.get("biography") or "")[:500],
                profile_image_url=data.get("profile_picture_url", ""),
                follower_count=followers,
                following_count=data.get("follows_count", 0),
                post_count=data.get("media_count", 0),
                avg_engagement_rate=engagement_rate,
                avg_likes=avg_likes,
                avg_comments=avg_comments,
                avg_views=0,
                category="",
                language="",
                region="",
                profile_url=f"https://www.instagram.com/{username}/",
                verified=False,
            )
        except Exception as e:
            logger.debug(f"business_discovery failed for @{username}: {e}")
            return None

    # ================================================================
    # 복수 프로필 조회
    # ================================================================

    async def _lookup_multiple_profiles(self, usernames: List[str]) -> List[InfluencerProfile]:
        """여러 username을 순차 조회"""
        profiles = []
        if self._has_graph_api:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                for username in usernames:
                    profile = await self._get_via_business_discovery(client, username)
                    if profile:
                        profiles.append(profile)
                    await asyncio.sleep(0.3)
        elif self._has_search:
            for username in usernames:
                r = await lookup_profile(
                    self.PLATFORM_ID, username,
                    self.google_cse_api_key, self.google_cse_id,
                    self.naver_client_id, self.naver_client_secret,
                )
                if r:
                    profiles.append(self._web_to_profile(r))
                await asyncio.sleep(0.5)
        return profiles

    # ================================================================
    # 게시물 조회
    # ================================================================

    async def get_creator_posts(self, username: str, limit: int = 12) -> List[InfluencerPost]:
        """크리에이터 최근 게시물 (Graph API만 가능)"""
        if not self._has_graph_api:
            return []
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(f"{IG_GRAPH_API}/{self.ig_user_id}", params={
                    "fields": (
                        f"business_discovery.fields("
                        f"media.limit({limit}){{id,like_count,comments_count,media_type,permalink,timestamp,thumbnail_url,caption}}"
                        f").username({username})"
                    ),
                    "access_token": self.access_token,
                })
                if resp.status_code != 200:
                    return []

                media_data = resp.json().get("business_discovery", {}).get("media", {}).get("data", [])
                return [
                    InfluencerPost(
                        platform_post_id=m.get("id", ""),
                        content_type="video" if m.get("media_type") == "VIDEO" else "image",
                        content_text=(m.get("caption") or "")[:300],
                        thumbnail_url=m.get("thumbnail_url", ""),
                        post_url=m.get("permalink", ""),
                        like_count=m.get("like_count", 0),
                        comment_count=m.get("comments_count", 0),
                        share_count=0,
                        view_count=0,
                        published_at=m.get("timestamp", ""),
                    )
                    for m in media_data
                ]
        except Exception as e:
            logger.error(f"Instagram posts fetch error: {e}")
            return []

    # ================================================================
    # 유틸리티
    # ================================================================

    def _web_to_profile(self, r) -> InfluencerProfile:
        """ProfileResult → InfluencerProfile 변환"""
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
            category="",
            language="",
            region="",
            profile_url=r.profile_url,
            verified=False,
        )

    def _extract_usernames_from_media(self, media_items: list) -> List[str]:
        """게시물 permalink에서 고유 username 추출"""
        seen = set()
        usernames = []
        for item in media_items:
            permalink = item.get("permalink", "")
            username = self._parse_username_from_permalink(permalink)
            if username and username not in seen:
                seen.add(username)
                usernames.append(username)
        return usernames

    @staticmethod
    def _parse_username_from_permalink(permalink: str) -> Optional[str]:
        if not permalink:
            return None
        for pattern in ["/p/", "/reel/", "/tv/"]:
            if pattern in permalink:
                parts = permalink.rstrip("/").split("/")
                try:
                    idx = parts.index(pattern.strip("/"))
                    if idx > 0:
                        candidate = parts[idx - 1]
                        if candidate and "." not in candidate and len(candidate) > 1:
                            return candidate
                except ValueError:
                    continue
        return None

    @staticmethod
    def _calc_engagement(media_data: list, followers: int) -> Tuple[float, float, float]:
        if not media_data or followers <= 0:
            return 0.0, 0.0, 0.0
        total_likes = sum(m.get("like_count", 0) for m in media_data)
        total_comments = sum(m.get("comments_count", 0) for m in media_data)
        count = len(media_data)
        avg_likes = round(total_likes / count, 1)
        avg_comments = round(total_comments / count, 1)
        engagement_rate = round(((avg_likes + avg_comments) / followers) * 100, 2)
        return avg_likes, avg_comments, engagement_rate

    async def check_status(self) -> Dict:
        parts = []
        if self._has_graph_api:
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.get(f"{IG_GRAPH_API}/{self.ig_user_id}", params={
                        "fields": "id,username", "access_token": self.access_token,
                    })
                    parts.append("Graph API 정상" if resp.status_code == 200 else f"Graph API 오류({resp.status_code})")
            except Exception:
                parts.append("Graph API 연결 실패")
        else:
            parts.append("Graph API 미설정")

        if self._has_google:
            parts.append("Google 검색 사용 가능")
        if self._has_naver:
            parts.append("네이버 검색 사용 가능")

        status = "connected" if self._has_graph_api else ("limited" if self._has_search else "not_configured")
        return {
            "platform": self.PLATFORM_ID,
            "name": self.PLATFORM_NAME_KO,
            "status": status,
            "message": " / ".join(parts),
        }
