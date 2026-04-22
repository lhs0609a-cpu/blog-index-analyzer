"""
인플루언서 발굴 통합 오케스트레이터
- 멀티플랫폼 병렬 검색
- 결과 집계 + 중복 제거 + 스코어링
- 캐싱 + 필터링 + 페이지네이션
- YouTube → Instagram cross-reference (바이오에서 IG 핸들 추출)
"""
import asyncio
import re
import logging
from typing import List, Dict, Any, Optional, Tuple

from database.influencer_db import get_influencer_db
from services.influencer_platforms.base import (
    InfluencerPlatformBase,
    InfluencerProfile,
    calculate_influencer_score,
)
from services.influencer_platforms.youtube_client import YouTubeInfluencerClient
from services.influencer_platforms.instagram_client import InstagramInfluencerClient
from services.influencer_platforms.tiktok_client import TikTokInfluencerClient
from services.influencer_platforms.threads_client import ThreadsInfluencerClient
from services.influencer_platforms.facebook_client import FacebookInfluencerClient
from services.influencer_platforms.x_client import XInfluencerClient

logger = logging.getLogger(__name__)

# 플랫폼 클라이언트 싱글톤
_platform_clients: Dict[str, InfluencerPlatformBase] = {}


def _get_client(platform_id: str) -> Optional[InfluencerPlatformBase]:
    """플랫폼 클라이언트 인스턴스 반환"""
    if platform_id not in _platform_clients:
        clients = {
            "youtube": YouTubeInfluencerClient,
            "instagram": InstagramInfluencerClient,
            "tiktok": TikTokInfluencerClient,
            "threads": ThreadsInfluencerClient,
            "facebook": FacebookInfluencerClient,
            "x": XInfluencerClient,
        }
        cls = clients.get(platform_id)
        if cls:
            _platform_clients[platform_id] = cls()
    return _platform_clients.get(platform_id)


ALL_PLATFORMS = ["youtube", "instagram", "tiktok", "threads", "facebook", "x"]


def _extract_ig_handles_from_bio(bio: str) -> List[str]:
    """
    YouTube 채널 설명(bio)에서 Instagram 핸들/URL 추출.
    패턴:
      - instagram.com/username
      - @username (Instagram 컨텍스트에서)
      - IG: username
      - 인스타: @username
    """
    if not bio:
        return []

    handles = set()

    # 패턴 1: instagram.com/username
    for match in re.finditer(r'instagram\.com/([a-zA-Z0-9_.]+)', bio, re.IGNORECASE):
        handle = match.group(1).lower().rstrip(".")
        if handle not in {"p", "reel", "tv", "explore", "accounts", "about"} and len(handle) >= 2:
            handles.add(handle)

    # 패턴 2: "IG:" / "Insta:" / "인스타:" 뒤의 @username 또는 username
    for match in re.finditer(r'(?:IG|[Ii]nsta(?:gram)?|인스타(?:그램)?)\s*[:：]\s*@?([a-zA-Z0-9_.]+)', bio, re.IGNORECASE):
        handle = match.group(1).lower().rstrip(".")
        if len(handle) >= 2:
            handles.add(handle)

    return list(handles)


class InfluencerDiscoveryService:
    """인플루언서 발굴 통합 서비스"""

    def __init__(self):
        self.db = get_influencer_db()

    async def search(
        self,
        query: str,
        user_id: str,
        platforms: List[str] = None,
        filters: dict = None,
        sort_by: str = "score",
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """
        멀티플랫폼 통합 검색

        Returns:
            {
                "profiles": [...],
                "total": int,
                "page": int,
                "page_size": int,
                "cached": bool,
                "platforms_searched": [...],
                "platforms_failed": [...],
            }
        """
        if not platforms:
            platforms = ["youtube"]
        if not filters:
            filters = {}

        # 1. 캐시 확인
        cache_key = self.db.make_cache_key(query, platforms, filters)
        cached = self.db.get_cached_search(cache_key)
        if cached and cached.get("profiles"):
            profiles = cached["profiles"]
            # 스코어 계산
            for p in profiles:
                p["relevance_score"] = calculate_influencer_score(p, query)

            # 필터링 + 정렬 + 페이지네이션
            profiles = self._apply_filters(profiles, filters)
            profiles = self._sort_profiles(profiles, sort_by)
            total = len(profiles)
            start = (page - 1) * page_size
            paginated = profiles[start:start + page_size]

            return {
                "profiles": paginated,
                "total": total,
                "page": page,
                "page_size": page_size,
                "cached": True,
                "platforms_searched": platforms,
                "platforms_failed": [],
            }

        # 2. 병렬 검색
        search_id = self.db.create_search(user_id, query, filters, platforms, cache_key)
        all_profiles: List[Dict] = []
        platforms_failed: List[str] = []

        async def _search_platform(platform_id: str) -> Tuple[str, List[InfluencerProfile]]:
            client = _get_client(platform_id)
            if not client:
                return platform_id, []
            try:
                results = await asyncio.wait_for(
                    client.search_creators(query, filters),
                    timeout=15.0
                )
                return platform_id, results
            except asyncio.TimeoutError:
                logger.warning(f"Platform {platform_id} timed out")
                return platform_id, []
            except Exception as e:
                logger.error(f"Platform {platform_id} search error: {e}")
                return platform_id, []

        # Threads/Instagram은 다른 플랫폼 결과에 의존하므로 먼저 제외
        deferred_platforms = {"threads", "instagram"}
        search_platforms = [p for p in platforms if p not in deferred_platforms]
        tasks = [_search_platform(p) for p in search_platforms]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # 결과 수집 + YouTube 바이오에서 Instagram 핸들 추출
        youtube_found_ig_handles: list = []
        for result in results:
            if isinstance(result, Exception):
                continue
            platform_id, profiles = result
            if not profiles:
                platforms_failed.append(platform_id)
                continue
            for profile in profiles:
                profile_dict = profile.to_dict()
                profile_dict["relevance_score"] = calculate_influencer_score(profile_dict, query)
                all_profiles.append(profile_dict)

                # YouTube 바이오에서 Instagram 핸들 추출
                if platform_id == "youtube" and "instagram" in platforms:
                    ig_handles = _extract_ig_handles_from_bio(profile.bio)
                    youtube_found_ig_handles.extend(ig_handles)

        # Instagram 검색 (Graph API 또는 네이버 검색 또는 YouTube cross-reference)
        instagram_usernames = []
        instagram_profiles_map = {}  # Threads cross-ref용
        if "instagram" in platforms:
            ig_client = _get_client("instagram")
            if ig_client:
                try:
                    ig_filters = dict(filters) if filters else {}
                    # YouTube에서 발견한 Instagram 핸들을 cross-reference로 전달
                    if youtube_found_ig_handles:
                        existing = ig_filters.get("instagram_usernames", [])
                        ig_filters["instagram_usernames"] = list(set(existing + youtube_found_ig_handles))

                    ig_results = await asyncio.wait_for(
                        ig_client.search_creators(query, ig_filters),
                        timeout=20.0
                    )
                    if ig_results:
                        for profile in ig_results:
                            profile_dict = profile.to_dict()
                            profile_dict["relevance_score"] = calculate_influencer_score(profile_dict, query)
                            all_profiles.append(profile_dict)
                            instagram_usernames.append(profile.username)
                            instagram_profiles_map[profile.username] = {
                                "display_name": profile.display_name,
                                "bio": profile.bio,
                                "profile_image_url": profile.profile_image_url,
                                "follower_count": profile.follower_count,
                                "following_count": profile.following_count,
                                "category": profile.category,
                                "verified": profile.verified,
                            }
                    else:
                        platforms_failed.append("instagram")
                except asyncio.TimeoutError:
                    logger.warning("Instagram search timed out")
                    platforms_failed.append("instagram")
                except Exception as e:
                    logger.error(f"Instagram search error: {e}")
                    platforms_failed.append("instagram")

        # Threads cross-reference (Instagram 데이터 재활용)
        if "threads" in platforms and instagram_usernames:
            threads_client = _get_client("threads")
            if threads_client:
                try:
                    threads_results = await asyncio.wait_for(
                        threads_client.search_creators(query, {
                            "instagram_usernames": instagram_usernames,
                            "instagram_profiles": instagram_profiles_map,
                        }),
                        timeout=15.0
                    )
                    for profile in threads_results:
                        profile_dict = profile.to_dict()
                        profile_dict["relevance_score"] = calculate_influencer_score(profile_dict, query)
                        all_profiles.append(profile_dict)
                except Exception as e:
                    logger.warning(f"Threads cross-reference failed: {e}")
                    platforms_failed.append("threads")
        elif "threads" in platforms and not instagram_usernames:
            platforms_failed.append("threads")

        # 3. 중복 제거 (같은 username + platform)
        seen = set()
        unique_profiles = []
        for p in all_profiles:
            key = f"{p['platform']}:{p['username']}"
            if key not in seen:
                seen.add(key)
                unique_profiles.append(p)

        # 4. DB 저장 + 검색 결과 연결
        for rank, p in enumerate(unique_profiles, 1):
            profile_id = self.db.upsert_profile(p)
            p["id"] = profile_id
            self.db.add_search_result(search_id, profile_id, p.get("relevance_score", 0), rank)

        self.db.update_search_count(search_id, len(unique_profiles))

        # 5. 필터링 + 정렬 + 페이지네이션
        filtered = self._apply_filters(unique_profiles, filters)
        sorted_profiles = self._sort_profiles(filtered, sort_by)
        total = len(sorted_profiles)
        start = (page - 1) * page_size
        paginated = sorted_profiles[start:start + page_size]

        return {
            "profiles": paginated,
            "total": total,
            "page": page,
            "page_size": page_size,
            "cached": False,
            "platforms_searched": platforms,
            "platforms_failed": platforms_failed,
        }

    def _apply_filters(self, profiles: List[Dict], filters: dict) -> List[Dict]:
        """필터 적용"""
        result = profiles

        # 팔로워 범위 필터
        min_followers = filters.get("min_followers", 0)
        max_followers = filters.get("max_followers", 0)
        if min_followers > 0:
            result = [p for p in result if p.get("follower_count", 0) >= min_followers]
        if max_followers > 0:
            result = [p for p in result if p.get("follower_count", 0) <= max_followers]

        # 최소 참여율 필터
        min_engagement = filters.get("min_engagement_rate", 0)
        if min_engagement > 0:
            result = [p for p in result if p.get("avg_engagement_rate", 0) >= min_engagement]

        # 카테고리 필터
        category = filters.get("category", "")
        if category:
            result = [p for p in result if category.lower() in (p.get("category") or "").lower()]

        # 인증 여부 필터
        if filters.get("verified_only"):
            result = [p for p in result if p.get("verified")]

        return result

    def _sort_profiles(self, profiles: List[Dict], sort_by: str) -> List[Dict]:
        """정렬"""
        sort_keys = {
            "score": lambda p: p.get("relevance_score", 0),
            "followers": lambda p: p.get("follower_count", 0),
            "engagement": lambda p: p.get("avg_engagement_rate", 0),
            "recent": lambda p: p.get("last_updated_at", ""),
        }
        key_func = sort_keys.get(sort_by, sort_keys["score"])
        return sorted(profiles, key=key_func, reverse=True)

    def browse(
        self,
        platforms: List[str] = None,
        min_followers: int = 0,
        max_followers: int = 0,
        min_engagement_rate: float = 0.0,
        category: str = "",
        region: str = "",
        verified_only: bool = False,
        sort_by: str = "followers",
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """DB 탐색 모드 — API 호출 없이 축적된 DB에서 필터링/브라우징"""
        # sort_by 매핑 (프론트 → DB 컬럼)
        sort_map = {
            "followers": "follower_count",
            "engagement": "avg_engagement_rate",
            "recent": "last_updated_at",
        }
        db_sort = sort_map.get(sort_by, "follower_count")

        return self.db.browse_profiles(
            platforms=platforms,
            min_followers=min_followers,
            max_followers=max_followers,
            min_engagement_rate=min_engagement_rate,
            category=category,
            region=region,
            verified_only=verified_only,
            sort_by=db_sort,
            sort_order="DESC",
            page=page,
            page_size=page_size,
        )

    async def get_profile_detail(self, profile_id: str) -> Optional[Dict]:
        """프로필 상세 조회 (캐시 + API 리프레시)"""
        profile = self.db.get_profile(profile_id)
        if not profile:
            return None

        # stale이면 리프레시 시도
        if self.db.is_profile_stale(profile_id, hours=168):
            client = _get_client(profile["platform"])
            if client:
                try:
                    fresh = await client.get_creator_profile(profile["username"])
                    if fresh:
                        fresh_dict = fresh.to_dict()
                        fresh_dict["id"] = profile_id
                        self.db.upsert_profile(fresh_dict)
                        profile = self.db.get_profile(profile_id)
                except Exception as e:
                    logger.warning(f"Profile refresh failed: {e}")

        # 즐겨찾기 여부는 호출자가 판단
        return profile

    async def get_profile_posts(self, profile_id: str, limit: int = 12) -> List[Dict]:
        """프로필의 최근 게시물"""
        profile = self.db.get_profile(profile_id)
        if not profile:
            return []

        # 캐시된 게시물 확인
        cached_posts = self.db.get_posts(profile_id, limit)
        if cached_posts:
            return cached_posts

        # API에서 조회
        client = _get_client(profile["platform"])
        if not client:
            return []

        try:
            posts = await client.get_creator_posts(profile["username"], limit)
            post_dicts = [p.to_dict() for p in posts]
            if post_dicts:
                self.db.save_posts(profile_id, post_dicts)
            return self.db.get_posts(profile_id, limit)
        except Exception as e:
            logger.error(f"Posts fetch error: {e}")
            return []

    async def get_platform_status(self) -> List[Dict]:
        """전체 플랫폼 상태 확인"""
        statuses = []
        for platform_id in ALL_PLATFORMS:
            client = _get_client(platform_id)
            if client:
                status = await client.check_status()
                statuses.append(status)
        return statuses


# 싱글톤
_service: Optional[InfluencerDiscoveryService] = None


def get_influencer_discovery_service() -> InfluencerDiscoveryService:
    global _service
    if _service is None:
        _service = InfluencerDiscoveryService()
    return _service
