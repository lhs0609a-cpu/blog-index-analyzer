"""
웹 검색 기반 인플루언서 프로필 발견 통합 유틸리티

검색 엔진 우선순위:
  1순위: Google Custom Search API (GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID 있을 때)
         - 하루 100회 무료 (초과 시 $5/1000건)
         - pagemap.metatags에서 og:description 직접 파싱 → 더 풍부한 데이터
  2순위: Naver Web Search API (NAVER_CLIENT_ID + NAVER_CLIENT_SECRET 있을 때)
         - 하루 25,000회 무료
         - 한국어 검색에 강점

각 플랫폼 클라이언트는 이 모듈의 통합 함수를 호출:
  search_profiles()   → 키워드로 인플루언서 검색
  lookup_profile()    → 특정 username 프로필 조회
"""
import httpx
import re
import logging
from typing import List, Dict, Optional, Tuple
from html import unescape
from dataclasses import dataclass

logger = logging.getLogger(__name__)

NAVER_SEARCH_API = "https://openapi.naver.com/v1/search/webkr.json"
GOOGLE_CSE_API = "https://www.googleapis.com/customsearch/v1"


@dataclass
class ProfileResult:
    """웹 검색에서 추출한 프로필 기본 정보"""
    username: str
    display_name: str
    bio: str
    profile_url: str
    follower_count: int = 0
    following_count: int = 0
    post_count: int = 0
    verified: bool = False


# backward-compatible alias
NaverProfileResult = ProfileResult


# ================================================================
# 플랫폼별 설정
# ================================================================

PLATFORM_CONFIGS = {
    "instagram": {
        "domain": "instagram.com",
        "url_pattern": r'instagram\.com/([a-zA-Z0-9_.]+)',
        "profile_url": "https://www.instagram.com/{username}/",
        "excluded_paths": {"p", "reel", "tv", "explore", "accounts", "about", "developer", "legal", "api", "static", "press", "stories", "direct", "reels", "tags", "locations"},
        "search_suffixes": ["인플루언서", ""],
    },
    "tiktok": {
        "domain": "tiktok.com",
        "url_pattern": r'tiktok\.com/@([a-zA-Z0-9_.]+)',
        "profile_url": "https://www.tiktok.com/@{username}",
        "excluded_paths": {"search", "discover", "trending", "upload", "login", "signup", "foryou", "following", "live", "tag", "music", "effect"},
        "search_suffixes": ["인플루언서", "틱톡커"],
    },
    "threads": {
        "domain": "threads.net",
        "url_pattern": r'threads\.net/@([a-zA-Z0-9_.]+)',
        "profile_url": "https://www.threads.net/@{username}",
        "excluded_paths": {"search", "login", "about", "privacy", "terms"},
        "search_suffixes": ["", "쓰레드"],
    },
    "x": {
        "domain": "x.com",
        "url_pattern": r'(?:x\.com|twitter\.com)/([a-zA-Z0-9_]+)',
        "profile_url": "https://x.com/{username}",
        "excluded_paths": {"search", "explore", "login", "signup", "settings", "home", "messages", "notifications", "i", "compose", "hashtag", "intent"},
        "search_suffixes": ["인플루언서", ""],
    },
    "facebook": {
        "domain": "facebook.com",
        "url_pattern": r'facebook\.com/([a-zA-Z0-9_.]+)',
        "profile_url": "https://www.facebook.com/{username}",
        "excluded_paths": {"login", "signup", "help", "policies", "groups", "events", "marketplace", "watch", "gaming", "pages", "profile.php", "photo.php", "story.php", "share", "sharer"},
        "search_suffixes": ["인플루언서", "페이지"],
    },
}


# ================================================================
# 통합 검색 함수 (Google → Naver fallback)
# ================================================================

async def search_profiles(
    platform_id: str,
    query: str,
    google_cse_api_key: str = "",
    google_cse_id: str = "",
    naver_client_id: str = "",
    naver_client_secret: str = "",
    max_results: int = 30,
) -> List[ProfileResult]:
    """
    웹 검색으로 특정 플랫폼의 인플루언서 프로필 발견.
    Google CSE 우선, Naver fallback.
    """
    # 1순위: Google Custom Search
    if google_cse_api_key and google_cse_id:
        results = await _search_via_google(platform_id, query, google_cse_api_key, google_cse_id, max_results)
        if results:
            return results

    # 2순위: Naver Web Search
    if naver_client_id and naver_client_secret:
        results = await _search_via_naver(platform_id, query, naver_client_id, naver_client_secret, max_results)
        if results:
            return results

    return []


async def lookup_profile(
    platform_id: str,
    username: str,
    google_cse_api_key: str = "",
    google_cse_id: str = "",
    naver_client_id: str = "",
    naver_client_secret: str = "",
) -> Optional[ProfileResult]:
    """
    웹 검색으로 특정 프로필 정보 조회.
    Google CSE 우선, Naver fallback.
    """
    # 1순위: Google Custom Search
    if google_cse_api_key and google_cse_id:
        result = await _lookup_via_google(platform_id, username, google_cse_api_key, google_cse_id)
        if result:
            return result

    # 2순위: Naver Web Search
    if naver_client_id and naver_client_secret:
        result = await _lookup_via_naver(platform_id, username, naver_client_id, naver_client_secret)
        if result:
            return result

    return None


# ================================================================
# backward-compatible aliases (기존 클라이언트 호환)
# ================================================================

async def search_profiles_via_naver(
    platform_id: str,
    query: str,
    naver_client_id: str,
    naver_client_secret: str,
    max_results: int = 30,
) -> List[ProfileResult]:
    """backward-compatible: naver_search.py 호환 함수"""
    from config import settings
    return await search_profiles(
        platform_id=platform_id,
        query=query,
        google_cse_api_key=getattr(settings, "GOOGLE_CSE_API_KEY", ""),
        google_cse_id=getattr(settings, "GOOGLE_CSE_ID", ""),
        naver_client_id=naver_client_id,
        naver_client_secret=naver_client_secret,
        max_results=max_results,
    )


async def lookup_profile_via_naver(
    platform_id: str,
    username: str,
    naver_client_id: str,
    naver_client_secret: str,
) -> Optional[ProfileResult]:
    """backward-compatible: naver_search.py 호환 함수"""
    from config import settings
    return await lookup_profile(
        platform_id=platform_id,
        username=username,
        google_cse_api_key=getattr(settings, "GOOGLE_CSE_API_KEY", ""),
        google_cse_id=getattr(settings, "GOOGLE_CSE_ID", ""),
        naver_client_id=naver_client_id,
        naver_client_secret=naver_client_secret,
    )


# ================================================================
# Google Custom Search API
# ================================================================

async def _search_via_google(
    platform_id: str,
    query: str,
    api_key: str,
    cse_id: str,
    max_results: int = 30,
) -> List[ProfileResult]:
    """
    Google Custom Search API로 인플루언서 프로필 검색.

    장점:
      - pagemap.metatags에서 og:description 직접 획득
      - 글로벌 인덱스이므로 Naver보다 커버리지 넓음
      - 영문 프로필 데이터도 풍부

    제한:
      - 무료 100쿼리/일 (num 파라미터 최대 10)
      - 한 번에 최대 10개 결과 → 페이징 필요
    """
    config = PLATFORM_CONFIGS.get(platform_id)
    if not config:
        logger.warning(f"Unknown platform for Google search: {platform_id}")
        return []

    all_results: Dict[str, ProfileResult] = {}
    timeout = httpx.Timeout(15.0, connect=5.0)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            for suffix in config["search_suffixes"]:
                if len(all_results) >= max_results:
                    break

                search_query = f"site:{config['domain']} {query}"
                if suffix:
                    search_query += f" {suffix}"

                # Google CSE는 한 번에 최대 10개, 3페이지까지 요청 (최대 30개)
                for start_index in range(1, min(max_results + 1, 31), 10):
                    if len(all_results) >= max_results:
                        break

                    resp = await client.get(GOOGLE_CSE_API, params={
                        "key": api_key,
                        "cx": cse_id,
                        "q": search_query,
                        "num": 10,
                        "start": start_index,
                    })

                    if resp.status_code == 429:
                        logger.warning("Google CSE daily quota exceeded")
                        break
                    if resp.status_code != 200:
                        logger.warning(f"Google CSE error: HTTP {resp.status_code}")
                        break

                    data = resp.json()
                    items = data.get("items", [])
                    if not items:
                        break

                    for item in items:
                        link = item.get("link", "")
                        title = item.get("title", "")
                        snippet = item.get("snippet", "")

                        username = _extract_username(link, config)
                        if not username or username in all_results:
                            continue

                        # Google CSE는 pagemap.metatags에서 og:description 제공
                        og_description = ""
                        pagemap = item.get("pagemap", {})
                        metatags = pagemap.get("metatags", [])
                        if metatags:
                            og_description = metatags[0].get("og:description", "")

                        # og:description이 더 풍부한 데이터를 가짐
                        bio_text = og_description or snippet
                        stats_text = f"{title} {og_description} {snippet}"

                        follower_count, following_count, post_count = parse_snippet_counts(stats_text)
                        display_name = _parse_display_name(title, username, platform_id)

                        all_results[username] = ProfileResult(
                            username=username,
                            display_name=display_name,
                            bio=_clean_text(bio_text)[:300],
                            profile_url=config["profile_url"].format(username=username),
                            follower_count=follower_count,
                            following_count=following_count,
                            post_count=post_count,
                        )

                import asyncio
                await asyncio.sleep(0.1)

        logger.info(f"Google CSE: found {len(all_results)} {platform_id} profiles for '{query}'")
        return list(all_results.values())

    except Exception as e:
        logger.error(f"Google CSE search error for {platform_id}: {e}")
        return []


async def _lookup_via_google(
    platform_id: str,
    username: str,
    api_key: str,
    cse_id: str,
) -> Optional[ProfileResult]:
    """Google Custom Search API로 특정 프로필 조회"""
    config = PLATFORM_CONFIGS.get(platform_id)
    if not config:
        return None

    try:
        timeout = httpx.Timeout(15.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            # username을 직접 검색
            search_query = f"site:{config['domain']}/{username}"
            resp = await client.get(GOOGLE_CSE_API, params={
                "key": api_key,
                "cx": cse_id,
                "q": search_query,
                "num": 5,
            })

            if resp.status_code != 200:
                return None

            items = resp.json().get("items", [])
            for item in items:
                link = item.get("link", "")
                extracted = _extract_username(link, config)
                if extracted and extracted.lower() == username.lower():
                    title = item.get("title", "")
                    snippet = item.get("snippet", "")

                    og_description = ""
                    pagemap = item.get("pagemap", {})
                    metatags = pagemap.get("metatags", [])
                    if metatags:
                        og_description = metatags[0].get("og:description", "")

                    bio_text = og_description or snippet
                    stats_text = f"{title} {og_description} {snippet}"

                    follower_count, following_count, post_count = parse_snippet_counts(stats_text)
                    display_name = _parse_display_name(title, username, platform_id)

                    return ProfileResult(
                        username=username,
                        display_name=display_name,
                        bio=_clean_text(bio_text)[:300],
                        profile_url=config["profile_url"].format(username=username),
                        follower_count=follower_count,
                        following_count=following_count,
                        post_count=post_count,
                    )

            return None

    except Exception as e:
        logger.debug(f"Google CSE profile lookup failed for {platform_id}/@{username}: {e}")
        return None


# ================================================================
# Naver Web Search API
# ================================================================

async def _search_via_naver(
    platform_id: str,
    query: str,
    naver_client_id: str,
    naver_client_secret: str,
    max_results: int = 30,
) -> List[ProfileResult]:
    """네이버 웹 검색으로 인플루언서 프로필 발견"""
    config = PLATFORM_CONFIGS.get(platform_id)
    if not config:
        logger.warning(f"Unknown platform for Naver search: {platform_id}")
        return []

    headers = {
        "X-Naver-Client-Id": naver_client_id,
        "X-Naver-Client-Secret": naver_client_secret,
    }

    search_queries = []
    for suffix in config["search_suffixes"]:
        q = f"site:{config['domain']} {query}"
        if suffix:
            q += f" {suffix}"
        search_queries.append(q)

    all_results: Dict[str, ProfileResult] = {}
    timeout = httpx.Timeout(15.0, connect=5.0)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            for sq in search_queries:
                resp = await client.get(NAVER_SEARCH_API, params={
                    "query": sq,
                    "display": min(max_results, 100),
                    "start": 1,
                    "sort": "sim",
                }, headers=headers)

                if resp.status_code != 200:
                    logger.warning(f"Naver search failed for {platform_id}: HTTP {resp.status_code}")
                    continue

                items = resp.json().get("items", [])
                for item in items:
                    link = item.get("link", "")
                    title = _clean_html(unescape(item.get("title", "")))
                    description = _clean_html(unescape(item.get("description", "")))

                    username = _extract_username(link, config)
                    if not username or username in all_results:
                        continue

                    text = title + " " + description
                    follower_count, following_count, post_count = parse_snippet_counts(text)
                    display_name = _parse_display_name(title, username, platform_id)

                    all_results[username] = ProfileResult(
                        username=username,
                        display_name=display_name,
                        bio=description[:300],
                        profile_url=config["profile_url"].format(username=username),
                        follower_count=follower_count,
                        following_count=following_count,
                        post_count=post_count,
                    )

                import asyncio
                await asyncio.sleep(0.2)

        logger.info(f"Naver search: found {len(all_results)} {platform_id} profiles for '{query}'")
        return list(all_results.values())

    except Exception as e:
        logger.error(f"Naver search error for {platform_id}: {e}")
        return []


async def _lookup_via_naver(
    platform_id: str,
    username: str,
    naver_client_id: str,
    naver_client_secret: str,
) -> Optional[ProfileResult]:
    """네이버 검색으로 특정 프로필 정보 조회"""
    config = PLATFORM_CONFIGS.get(platform_id)
    if not config:
        return None

    headers = {
        "X-Naver-Client-Id": naver_client_id,
        "X-Naver-Client-Secret": naver_client_secret,
    }

    try:
        timeout = httpx.Timeout(15.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(NAVER_SEARCH_API, params={
                "query": f"site:{config['domain']}/{username}",
                "display": 5,
                "start": 1,
            }, headers=headers)

            if resp.status_code != 200:
                return None

            items = resp.json().get("items", [])
            for item in items:
                link = item.get("link", "")
                extracted = _extract_username(link, config)
                if extracted and extracted.lower() == username.lower():
                    title = _clean_html(unescape(item.get("title", "")))
                    description = _clean_html(unescape(item.get("description", "")))
                    text = title + " " + description

                    follower_count, following_count, post_count = parse_snippet_counts(text)
                    display_name = _parse_display_name(title, username, platform_id)

                    return ProfileResult(
                        username=username,
                        display_name=display_name,
                        bio=description[:300],
                        profile_url=config["profile_url"].format(username=username),
                        follower_count=follower_count,
                        following_count=following_count,
                        post_count=post_count,
                    )

            return None

    except Exception as e:
        logger.debug(f"Naver profile lookup failed for {platform_id}/@{username}: {e}")
        return None


# ================================================================
# 파싱 유틸리티
# ================================================================

def _clean_html(text: str) -> str:
    """HTML 태그 제거"""
    return re.sub(r'<[^>]+>', '', text)


def _clean_text(text: str) -> str:
    """HTML 태그 + 여분 공백 정리"""
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def _extract_username(url: str, config: dict) -> Optional[str]:
    """URL에서 username 추출"""
    match = re.search(config["url_pattern"], url, re.IGNORECASE)
    if not match:
        return None

    username = match.group(1).lower().rstrip(".")

    if username in config["excluded_paths"]:
        return None
    if len(username) < 2:
        return None

    return username


def parse_snippet_counts(text: str) -> Tuple[int, int, int]:
    """
    검색 스니펫에서 팔로워/팔로잉/게시물 수 파싱.
    지원 형식:
      영문: "700M Followers, 204 Following, 8,343 Posts"
      한국어: "팔로워 1.2만명", "구독자 123만"
      TikTok: "12.5K Likes, 500 Followers"
      X/Twitter: "1,234 Following · 5.6M Followers"
    """
    def parse_count(raw: str) -> int:
        raw = raw.strip().replace(",", "").replace(" ", "")
        multiplier = 1
        if raw.upper().endswith("K") or raw.endswith("천"):
            multiplier = 1000
            raw = raw[:-1]
        elif raw.upper().endswith("M") or raw.endswith("백만"):
            multiplier = 1000000
            raw = raw[:-2] if raw.endswith("백만") else raw[:-1]
        elif raw.upper().endswith("B"):
            multiplier = 1000000000
            raw = raw[:-1]
        elif raw.endswith("만"):
            multiplier = 10000
            raw = raw[:-1]
        elif raw.endswith("억"):
            multiplier = 100000000
            raw = raw[:-1]
        try:
            return int(float(raw) * multiplier)
        except (ValueError, OverflowError):
            return 0

    followers = 0
    following = 0
    posts = 0

    # 영문: "123K Followers"
    f_match = re.search(r'([\d,.]+[KMBkmb]?)\s*[Ff]ollowers', text)
    if f_match:
        followers = parse_count(f_match.group(1))

    fw_match = re.search(r'([\d,.]+[KMBkmb]?)\s*[Ff]ollowing', text)
    if fw_match:
        following = parse_count(fw_match.group(1))

    p_match = re.search(r'([\d,.]+[KMBkmb]?)\s*[Pp]osts', text)
    if p_match:
        posts = parse_count(p_match.group(1))

    # 한국어: "팔로워 1.2만" / "구독자 123만"
    if followers == 0:
        ko_match = re.search(r'(?:팔로워|구독자|Followers?)\s*([\d,.]+)\s*(만|천|억|명|K|M)?', text, re.IGNORECASE)
        if ko_match:
            num_str = ko_match.group(1)
            suffix = ko_match.group(2) or ""
            if suffix == "명":
                suffix = ""
            followers = parse_count(num_str + suffix)

    # TikTok: "좋아요 12.5K" / "12.5K Likes"
    if posts == 0:
        likes_match = re.search(r'([\d,.]+[KMBkmb]?)\s*(?:[Ll]ikes|좋아요)', text)
        if likes_match:
            posts = parse_count(likes_match.group(1))

    return followers, following, posts


def _parse_display_name(title: str, username: str, platform_id: str) -> str:
    """검색 결과 title에서 표시 이름 추출"""

    # 패턴: "Display Name (@username)"
    match = re.match(r'^(.+?)\s*[\(\(]@?' + re.escape(username), title, re.IGNORECASE)
    if match:
        return match.group(1).strip()

    # 패턴: "Display Name on Instagram/TikTok/X"
    platform_names = {
        "instagram": "Instagram",
        "tiktok": "TikTok",
        "threads": "Threads",
        "x": "X|Twitter",
        "facebook": "Facebook",
    }
    pname = platform_names.get(platform_id, "")
    if pname:
        match = re.match(rf'^(.+?)\s+(?:on|[-|·])\s+(?:{pname})', title, re.IGNORECASE)
        if match:
            name = match.group(1).strip()
            if name.lower() != username.lower():
                return name

    # fallback: title의 첫 부분
    clean_title = title.split("•")[0].split("|")[0].split(" - ")[0].split("·")[0].strip()
    clean_title = re.sub(r'[\(\(]@?\w+[\)\)]', '', clean_title).strip()
    if clean_title and clean_title.lower() != username.lower() and len(clean_title) < 50:
        return clean_title

    return username
