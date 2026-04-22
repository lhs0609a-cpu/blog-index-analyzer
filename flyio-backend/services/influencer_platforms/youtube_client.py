"""
YouTube Data API v3 인플루언서 검색 클라이언트
- search.list로 채널 검색
- channels.list로 배치 프로필 조회
- search.list로 최근 영상 조회
"""
import httpx
import logging
from typing import List, Optional, Dict
from datetime import datetime

from .base import InfluencerPlatformBase, InfluencerProfile, InfluencerPost

logger = logging.getLogger(__name__)

YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"


class YouTubeInfluencerClient(InfluencerPlatformBase):
    PLATFORM_ID = "youtube"
    PLATFORM_NAME = "YouTube"
    PLATFORM_NAME_KO = "유튜브"

    def __init__(self, api_key: str = None):
        from config import settings
        self.api_key = api_key or getattr(settings, "YOUTUBE_API_KEY", "")
        self.timeout = httpx.Timeout(15.0, connect=5.0)
        self._daily_units = 0

    async def search_creators(self, query: str, filters: dict) -> List[InfluencerProfile]:
        """YouTube 채널 검색"""
        if not self.api_key:
            logger.warning("YouTube API key not configured")
            return []

        try:
            region_code = filters.get("region", "KR")
            max_results = min(filters.get("max_results", 25), 50)

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # 1. 채널 검색 (100 units)
                search_resp = await client.get(f"{YOUTUBE_API_BASE}/search", params={
                    "part": "snippet",
                    "type": "channel",
                    "q": query,
                    "regionCode": region_code,
                    "maxResults": max_results,
                    "key": self.api_key,
                })
                self._daily_units += 100

                if search_resp.status_code != 200:
                    logger.error(f"YouTube search failed: {search_resp.status_code} {search_resp.text}")
                    return []

                search_data = search_resp.json()
                items = search_data.get("items", [])
                if not items:
                    return []

                # 2. 채널 ID 배치 프로필 조회 (50개씩, 각 1 unit)
                channel_ids = [item["snippet"]["channelId"] for item in items if "snippet" in item]
                if not channel_ids:
                    return []

                channels_resp = await client.get(f"{YOUTUBE_API_BASE}/channels", params={
                    "part": "snippet,statistics",
                    "id": ",".join(channel_ids[:50]),
                    "key": self.api_key,
                })
                self._daily_units += 1

                if channels_resp.status_code != 200:
                    logger.error(f"YouTube channels failed: {channels_resp.status_code}")
                    return []

                channels_data = channels_resp.json()
                profiles = []

                for ch in channels_data.get("items", []):
                    snippet = ch.get("snippet", {})
                    stats = ch.get("statistics", {})

                    subscriber_count = int(stats.get("subscriberCount", 0))
                    video_count = int(stats.get("videoCount", 0))
                    view_count = int(stats.get("viewCount", 0))

                    # 평균 조회수 추정 (총 조회수 / 영상 수)
                    avg_views = view_count / video_count if video_count > 0 else 0
                    # 참여율 추정 (정확한 값은 개별 영상에서)
                    avg_engagement = 0.0

                    thumbnail = snippet.get("thumbnails", {}).get("high", {}).get("url", "")
                    if not thumbnail:
                        thumbnail = snippet.get("thumbnails", {}).get("default", {}).get("url", "")

                    profiles.append(InfluencerProfile(
                        platform=self.PLATFORM_ID,
                        platform_user_id=ch["id"],
                        username=snippet.get("customUrl", "").lstrip("@") or ch["id"],
                        display_name=snippet.get("title", ""),
                        bio=snippet.get("description", "")[:500],
                        profile_image_url=thumbnail,
                        follower_count=subscriber_count,
                        following_count=0,
                        post_count=video_count,
                        avg_engagement_rate=avg_engagement,
                        avg_likes=0,
                        avg_comments=0,
                        avg_views=avg_views,
                        category=snippet.get("country", ""),
                        language=snippet.get("defaultLanguage", ""),
                        region=snippet.get("country", region_code),
                        profile_url=f"https://www.youtube.com/channel/{ch['id']}",
                        verified=False,
                    ))

                # 3. 전체 채널의 참여율 추정 (쿼터 절약: 개별 API 호출 없이 전체 조회수/영상 수 기반)
                for profile in profiles:
                    if profile.follower_count > 0 and profile.avg_views > 0:
                        # 추정 참여율: 평균조회수 / 구독자수 * 100 (YouTube 특성상 조회수 기반)
                        est_rate = (profile.avg_views / profile.follower_count) * 100
                        profile.avg_engagement_rate = round(min(est_rate, 100.0), 2)

                # 4. 상위 10개만 정밀 참여율 계산 (좋아요+댓글 기반)
                for profile in profiles[:10]:
                    try:
                        engagement = await self._calculate_engagement(client, profile.platform_user_id)
                        if engagement:
                            profile.avg_engagement_rate = engagement.get("rate", profile.avg_engagement_rate)
                            profile.avg_likes = engagement.get("avg_likes", 0.0)
                            profile.avg_comments = engagement.get("avg_comments", 0.0)
                            profile.avg_views = engagement.get("avg_views", profile.avg_views)
                    except Exception as e:
                        logger.debug(f"Engagement calc failed for {profile.username}: {e}")

                return profiles

        except httpx.TimeoutException:
            logger.warning("YouTube search timed out")
            return []
        except Exception as e:
            logger.error(f"YouTube search error: {e}")
            return []

    async def _calculate_engagement(self, client: httpx.AsyncClient, channel_id: str) -> Dict:
        """최근 영상 5개로 참여율 계산"""
        # 최근 영상 검색
        resp = await client.get(f"{YOUTUBE_API_BASE}/search", params={
            "part": "id",
            "type": "video",
            "channelId": channel_id,
            "order": "date",
            "maxResults": 5,
            "key": self.api_key,
        })
        self._daily_units += 100

        if resp.status_code != 200:
            return {}

        video_ids = [item["id"]["videoId"] for item in resp.json().get("items", []) if item.get("id", {}).get("videoId")]
        if not video_ids:
            return {}

        # 영상 통계 조회
        stats_resp = await client.get(f"{YOUTUBE_API_BASE}/videos", params={
            "part": "statistics",
            "id": ",".join(video_ids),
            "key": self.api_key,
        })
        self._daily_units += 1

        if stats_resp.status_code != 200:
            return {}

        total_likes = 0
        total_comments = 0
        total_views = 0
        count = 0

        for video in stats_resp.json().get("items", []):
            stats = video.get("statistics", {})
            views = int(stats.get("viewCount", 0))
            likes = int(stats.get("likeCount", 0))
            comments = int(stats.get("commentCount", 0))
            total_views += views
            total_likes += likes
            total_comments += comments
            count += 1

        if count == 0 or total_views == 0:
            return {}

        avg_views = total_views / count
        avg_likes = total_likes / count
        avg_comments = total_comments / count
        engagement_rate = ((total_likes + total_comments) / total_views) * 100

        return {
            "rate": round(engagement_rate, 2),
            "avg_likes": round(avg_likes, 1),
            "avg_comments": round(avg_comments, 1),
            "avg_views": round(avg_views, 1),
        }

    async def get_creator_profile(self, username: str) -> Optional[InfluencerProfile]:
        """유저네임으로 채널 프로필 조회"""
        if not self.api_key:
            return None

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # 1순위: channel ID로 직접 조회
                items = []
                resp = await client.get(f"{YOUTUBE_API_BASE}/channels", params={
                    "part": "snippet,statistics",
                    "id": username,
                    "key": self.api_key,
                })
                self._daily_units += 1
                if resp.status_code == 200:
                    items = resp.json().get("items", [])

                # 2순위: customUrl(핸들) 검색 — search.list로 채널 찾기
                if not items:
                    handle = username.lstrip("@")
                    search_resp = await client.get(f"{YOUTUBE_API_BASE}/search", params={
                        "part": "snippet",
                        "type": "channel",
                        "q": handle,
                        "maxResults": 1,
                        "key": self.api_key,
                    })
                    self._daily_units += 100
                    if search_resp.status_code == 200:
                        search_items = search_resp.json().get("items", [])
                        if search_items:
                            ch_id = search_items[0]["snippet"]["channelId"]
                            ch_resp = await client.get(f"{YOUTUBE_API_BASE}/channels", params={
                                "part": "snippet,statistics",
                                "id": ch_id,
                                "key": self.api_key,
                            })
                            self._daily_units += 1
                            if ch_resp.status_code == 200:
                                items = ch_resp.json().get("items", [])

                if not items:
                    return None

                ch = items[0]
                snippet = ch.get("snippet", {})
                stats = ch.get("statistics", {})
                subscriber_count = int(stats.get("subscriberCount", 0))
                video_count = int(stats.get("videoCount", 0))
                view_count = int(stats.get("viewCount", 0))
                avg_views = view_count / video_count if video_count > 0 else 0

                thumbnail = snippet.get("thumbnails", {}).get("high", {}).get("url", "")

                profile = InfluencerProfile(
                    platform=self.PLATFORM_ID,
                    platform_user_id=ch["id"],
                    username=snippet.get("customUrl", "").lstrip("@") or ch["id"],
                    display_name=snippet.get("title", ""),
                    bio=snippet.get("description", "")[:500],
                    profile_image_url=thumbnail,
                    follower_count=subscriber_count,
                    following_count=0,
                    post_count=video_count,
                    avg_views=avg_views,
                    category=snippet.get("country", ""),
                    language=snippet.get("defaultLanguage", ""),
                    region=snippet.get("country", ""),
                    profile_url=f"https://www.youtube.com/channel/{ch['id']}",
                    verified=False,
                )

                # 참여율 계산
                engagement = await self._calculate_engagement(client, ch["id"])
                profile.avg_engagement_rate = engagement.get("rate", 0.0)
                profile.avg_likes = engagement.get("avg_likes", 0.0)
                profile.avg_comments = engagement.get("avg_comments", 0.0)
                if engagement.get("avg_views"):
                    profile.avg_views = engagement["avg_views"]

                return profile

        except Exception as e:
            logger.error(f"YouTube profile fetch error: {e}")
            return None

    async def get_creator_posts(self, username: str, limit: int = 12) -> List[InfluencerPost]:
        """최근 영상 목록"""
        if not self.api_key:
            return []

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # 채널 ID 확인
                profile = await self.get_creator_profile(username)
                if not profile:
                    return []

                channel_id = profile.platform_user_id

                # 최근 영상 검색
                resp = await client.get(f"{YOUTUBE_API_BASE}/search", params={
                    "part": "snippet",
                    "type": "video",
                    "channelId": channel_id,
                    "order": "date",
                    "maxResults": min(limit, 50),
                    "key": self.api_key,
                })
                self._daily_units += 100

                if resp.status_code != 200:
                    return []

                items = resp.json().get("items", [])
                video_ids = [item["id"]["videoId"] for item in items if item.get("id", {}).get("videoId")]

                if not video_ids:
                    return []

                # 영상 통계 조회
                stats_resp = await client.get(f"{YOUTUBE_API_BASE}/videos", params={
                    "part": "snippet,statistics",
                    "id": ",".join(video_ids),
                    "key": self.api_key,
                })
                self._daily_units += 1

                if stats_resp.status_code != 200:
                    return []

                posts = []
                for video in stats_resp.json().get("items", []):
                    snippet = video.get("snippet", {})
                    stats = video.get("statistics", {})
                    thumbnail = snippet.get("thumbnails", {}).get("high", {}).get("url", "")
                    if not thumbnail:
                        thumbnail = snippet.get("thumbnails", {}).get("medium", {}).get("url", "")

                    posts.append(InfluencerPost(
                        platform_post_id=video["id"],
                        content_type="video",
                        content_text=snippet.get("title", ""),
                        thumbnail_url=thumbnail,
                        post_url=f"https://www.youtube.com/watch?v={video['id']}",
                        like_count=int(stats.get("likeCount", 0)),
                        comment_count=int(stats.get("commentCount", 0)),
                        share_count=0,
                        view_count=int(stats.get("viewCount", 0)),
                        published_at=snippet.get("publishedAt", ""),
                    ))

                return posts

        except Exception as e:
            logger.error(f"YouTube posts fetch error: {e}")
            return []

    async def check_status(self) -> Dict:
        if not self.api_key:
            return {
                "platform": self.PLATFORM_ID,
                "name": self.PLATFORM_NAME_KO,
                "status": "not_configured",
                "message": "API 키가 설정되지 않았습니다",
                "daily_units_used": self._daily_units,
            }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(f"{YOUTUBE_API_BASE}/search", params={
                    "part": "id",
                    "type": "channel",
                    "q": "test",
                    "maxResults": 1,
                    "key": self.api_key,
                })
                self._daily_units += 100
                if resp.status_code == 200:
                    return {
                        "platform": self.PLATFORM_ID,
                        "name": self.PLATFORM_NAME_KO,
                        "status": "connected",
                        "message": "정상",
                        "daily_units_used": self._daily_units,
                    }
                else:
                    return {
                        "platform": self.PLATFORM_ID,
                        "name": self.PLATFORM_NAME_KO,
                        "status": "error",
                        "message": f"HTTP {resp.status_code}",
                        "daily_units_used": self._daily_units,
                    }
        except Exception as e:
            return {
                "platform": self.PLATFORM_ID,
                "name": self.PLATFORM_NAME_KO,
                "status": "error",
                "message": str(e),
            }
