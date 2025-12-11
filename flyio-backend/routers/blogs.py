"""
Blog analysis router with related keywords support
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import httpx
import hashlib
import hmac
import base64
import time
import json
import logging
import re
import random
from bs4 import BeautifulSoup

from config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

# User agents for rotation
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
]


class RelatedKeyword(BaseModel):
    keyword: str
    monthly_pc_search: Optional[int] = None
    monthly_mobile_search: Optional[int] = None
    monthly_total_search: Optional[int] = None
    competition: Optional[str] = None


class RelatedKeywordsResponse(BaseModel):
    success: bool
    keyword: str
    source: str
    total_count: int
    keywords: List[RelatedKeyword]
    error: Optional[str] = None
    message: Optional[str] = None


class BlogStats(BaseModel):
    total_posts: Optional[int] = None
    neighbor_count: Optional[int] = None
    total_visitors: Optional[int] = None


class BlogIndex(BaseModel):
    score: float = 0
    level: int = 0
    score_breakdown: Optional[Dict[str, float]] = None


class BlogResult(BaseModel):
    rank: int
    blog_id: str
    blog_name: str
    blog_url: str
    post_title: str
    post_url: str
    post_date: Optional[str] = None
    thumbnail: Optional[str] = None
    tab_type: str = "VIEW"
    smart_block_keyword: Optional[str] = None
    stats: Optional[BlogStats] = None
    index: Optional[BlogIndex] = None


class SearchInsights(BaseModel):
    average_score: float = 0
    average_level: float = 0
    average_posts: float = 0
    average_neighbors: float = 0
    top_level: int = 0
    top_score: float = 0
    score_distribution: Dict[str, int] = {}
    common_patterns: List[str] = []


class KeywordSearchResponse(BaseModel):
    keyword: str
    total_found: int
    analyzed_count: int
    successful_count: int
    results: List[BlogResult]
    insights: SearchInsights
    timestamp: str


def generate_signature(timestamp: str, method: str, uri: str, secret_key: str) -> str:
    """Generate HMAC signature for Naver Search Ad API"""
    message = f"{timestamp}.{method}.{uri}"
    signature = hmac.new(
        secret_key.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).digest()
    return base64.b64encode(signature).decode('utf-8')


def extract_blog_id(url: str) -> str:
    """Extract blog ID from Naver blog URL"""
    patterns = [
        r'blog\.naver\.com/([^/?]+)',
        r'blog\.naver\.com/PostView\.naver\?blogId=([^&]+)',
        r'm\.blog\.naver\.com/([^/?]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return ""


async def fetch_naver_search_results(keyword: str, limit: int = 13) -> List[Dict]:
    """Fetch search results from Naver VIEW tab"""
    results = []

    try:
        headers = {
            "User-Agent": random.choice(USER_AGENTS),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Referer": "https://search.naver.com/",
        }

        # Search Naver VIEW tab
        search_url = f"https://search.naver.com/search.naver?where=view&query={keyword}&sm=tab_opt&nso=so:r,p:all"

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(search_url, headers=headers)

            if response.status_code != 200:
                logger.error(f"Naver search failed: {response.status_code}")
                return results

            soup = BeautifulSoup(response.text, 'html.parser')

            # Find blog posts in VIEW tab
            # Try multiple selectors for different Naver layouts
            post_items = soup.select('li.bx') or soup.select('div.view_wrap') or soup.select('ul.lst_view li')

            if not post_items:
                # Try alternative selector
                post_items = soup.select('div.api_subject_bx')

            logger.info(f"Found {len(post_items)} items for keyword: {keyword}")

            for idx, item in enumerate(post_items[:limit]):
                try:
                    # Extract title and link
                    title_elem = item.select_one('a.title_link') or item.select_one('a.api_txt_lines') or item.select_one('.title_area a')
                    if not title_elem:
                        continue

                    post_title = title_elem.get_text(strip=True)
                    post_url = title_elem.get('href', '')

                    # Extract blog name
                    name_elem = item.select_one('a.sub_txt') or item.select_one('.user_info a') or item.select_one('.source_box a')
                    blog_name = name_elem.get_text(strip=True) if name_elem else "Unknown"
                    blog_url = name_elem.get('href', '') if name_elem else ""

                    # Extract blog ID
                    blog_id = extract_blog_id(blog_url) or extract_blog_id(post_url)
                    if not blog_id:
                        continue

                    # Extract date
                    date_elem = item.select_one('.sub_time') or item.select_one('.date')
                    post_date = date_elem.get_text(strip=True) if date_elem else None

                    # Extract thumbnail
                    thumb_elem = item.select_one('img.thumb') or item.select_one('.thumb_area img')
                    thumbnail = thumb_elem.get('src') if thumb_elem else None

                    results.append({
                        "rank": idx + 1,
                        "blog_id": blog_id,
                        "blog_name": blog_name,
                        "blog_url": f"https://blog.naver.com/{blog_id}",
                        "post_title": post_title,
                        "post_url": post_url,
                        "post_date": post_date,
                        "thumbnail": thumbnail,
                        "tab_type": "VIEW",
                        "smart_block_keyword": keyword,
                    })

                except Exception as e:
                    logger.warning(f"Error parsing item {idx}: {e}")
                    continue

    except Exception as e:
        logger.error(f"Error fetching Naver search: {e}")

    return results


async def analyze_blog(blog_id: str) -> Dict:
    """Analyze a single blog and get stats"""
    stats = {
        "total_posts": None,
        "neighbor_count": None,
        "total_visitors": None,
    }

    index = {
        "score": 0,
        "level": 0,
        "score_breakdown": {"c_rank": 0, "dia": 0}
    }

    try:
        headers = {
            "User-Agent": random.choice(USER_AGENTS),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9",
        }

        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            # Fetch blog main page
            blog_url = f"https://blog.naver.com/{blog_id}"
            response = await client.get(blog_url, headers=headers)

            if response.status_code == 200:
                html = response.text

                # Extract post count
                post_match = re.search(r'전체글\s*\(?\s*(\d{1,3}(?:,\d{3})*)\s*\)?', html)
                if post_match:
                    stats["total_posts"] = int(post_match.group(1).replace(',', ''))

                # Try to get neighbor count from profile
                neighbor_match = re.search(r'이웃\s*(\d{1,3}(?:,\d{3})*)', html)
                if neighbor_match:
                    stats["neighbor_count"] = int(neighbor_match.group(1).replace(',', ''))

                # Calculate index score based on available stats
                base_score = 50  # Base score

                if stats["total_posts"]:
                    if stats["total_posts"] >= 1000:
                        base_score += 30
                    elif stats["total_posts"] >= 500:
                        base_score += 25
                    elif stats["total_posts"] >= 100:
                        base_score += 15
                    elif stats["total_posts"] >= 50:
                        base_score += 10

                if stats["neighbor_count"]:
                    if stats["neighbor_count"] >= 5000:
                        base_score += 20
                    elif stats["neighbor_count"] >= 1000:
                        base_score += 15
                    elif stats["neighbor_count"] >= 500:
                        base_score += 10
                    elif stats["neighbor_count"] >= 100:
                        base_score += 5

                index["score"] = min(base_score, 100)
                index["level"] = min(int(index["score"] / 10), 10)
                index["score_breakdown"] = {
                    "c_rank": index["score"] * 0.5,
                    "dia": index["score"] * 0.5
                }

    except Exception as e:
        logger.warning(f"Error analyzing blog {blog_id}: {e}")

    return {"stats": stats, "index": index}


async def get_related_keywords_from_searchad(keyword: str) -> RelatedKeywordsResponse:
    """Get related keywords and search volume from Naver Search Ad API"""

    # Check if API credentials are configured
    if not settings.NAVER_AD_API_KEY or not settings.NAVER_AD_SECRET_KEY or not settings.NAVER_AD_CUSTOMER_ID:
        logger.warning("Naver Search Ad API credentials not configured")
        return RelatedKeywordsResponse(
            success=False,
            keyword=keyword,
            source="searchad",
            total_count=0,
            keywords=[],
            message="네이버 검색광고 API가 설정되지 않았습니다"
        )

    try:
        timestamp = str(int(time.time() * 1000))
        method = "GET"
        uri = "/keywordstool"

        signature = generate_signature(
            timestamp, method, uri,
            settings.NAVER_AD_SECRET_KEY
        )

        headers = {
            "X-Timestamp": timestamp,
            "X-API-KEY": settings.NAVER_AD_API_KEY,
            "X-Customer": settings.NAVER_AD_CUSTOMER_ID,
            "X-Signature": signature,
            "Content-Type": "application/json"
        }

        params = {
            "hintKeywords": keyword,
            "showDetail": "1"
        }

        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.naver.com/keywordstool",
                headers=headers,
                params=params,
                timeout=30.0
            )

            if response.status_code == 200:
                data = response.json()
                keywords_data = data.get("keywordList", [])

                related_keywords = []
                for kw in keywords_data[:100]:  # Limit to 100 keywords
                    pc_search = kw.get("monthlyPcQcCnt", 0)
                    mobile_search = kw.get("monthlyMobileQcCnt", 0)

                    # Handle "< 10" values
                    if isinstance(pc_search, str) and "<" in pc_search:
                        pc_search = 5
                    if isinstance(mobile_search, str) and "<" in mobile_search:
                        mobile_search = 5

                    try:
                        pc_search = int(pc_search) if pc_search else 0
                        mobile_search = int(mobile_search) if mobile_search else 0
                    except (ValueError, TypeError):
                        pc_search = 0
                        mobile_search = 0

                    total_search = pc_search + mobile_search

                    # Determine competition level
                    comp_idx = kw.get("compIdx", "")
                    if comp_idx == "높음":
                        competition = "높음"
                    elif comp_idx == "중간":
                        competition = "중간"
                    else:
                        competition = "낮음"

                    related_keywords.append(RelatedKeyword(
                        keyword=kw.get("relKeyword", ""),
                        monthly_pc_search=pc_search,
                        monthly_mobile_search=mobile_search,
                        monthly_total_search=total_search,
                        competition=competition
                    ))

                # Sort by total search volume
                related_keywords.sort(key=lambda x: x.monthly_total_search or 0, reverse=True)

                return RelatedKeywordsResponse(
                    success=True,
                    keyword=keyword,
                    source="searchad",
                    total_count=len(related_keywords),
                    keywords=related_keywords
                )
            else:
                logger.error(f"Naver Search Ad API error: {response.status_code} - {response.text}")
                return RelatedKeywordsResponse(
                    success=False,
                    keyword=keyword,
                    source="searchad",
                    total_count=0,
                    keywords=[],
                    message=f"API 오류: {response.status_code}"
                )

    except Exception as e:
        logger.error(f"Error fetching related keywords: {e}")
        return RelatedKeywordsResponse(
            success=False,
            keyword=keyword,
            source="searchad",
            total_count=0,
            keywords=[],
            message=str(e)
        )


async def get_related_keywords_from_autocomplete(keyword: str) -> RelatedKeywordsResponse:
    """Get related keywords from Naver autocomplete (fallback)"""
    try:
        async with httpx.AsyncClient() as client:
            # Naver search autocomplete
            response = await client.get(
                f"https://ac.search.naver.com/nx/ac",
                params={
                    "q": keyword,
                    "con": "1",
                    "frm": "nv",
                    "ans": "2",
                    "r_format": "json",
                    "r_enc": "UTF-8",
                    "r_unicode": "0",
                    "t_koreng": "1",
                    "run": "2",
                    "rev": "4",
                    "q_enc": "UTF-8"
                },
                timeout=10.0
            )

            if response.status_code == 200:
                data = response.json()
                items = data.get("items", [[]])[0]

                related_keywords = []
                for item in items[:20]:
                    if isinstance(item, list) and len(item) > 0:
                        kw = item[0]
                        related_keywords.append(RelatedKeyword(
                            keyword=kw,
                            monthly_pc_search=None,
                            monthly_mobile_search=None,
                            monthly_total_search=None,
                            competition=None
                        ))

                return RelatedKeywordsResponse(
                    success=True,
                    keyword=keyword,
                    source="autocomplete",
                    total_count=len(related_keywords),
                    keywords=related_keywords
                )
            else:
                return RelatedKeywordsResponse(
                    success=False,
                    keyword=keyword,
                    source="autocomplete",
                    total_count=0,
                    keywords=[],
                    message="자동완성 API 오류"
                )

    except Exception as e:
        logger.error(f"Error fetching autocomplete: {e}")
        return RelatedKeywordsResponse(
            success=False,
            keyword=keyword,
            source="autocomplete",
            total_count=0,
            keywords=[],
            message=str(e)
        )


@router.get("/related-keywords/{keyword}", response_model=RelatedKeywordsResponse)
async def get_related_keywords(keyword: str):
    """
    Get related keywords with search volume data

    First tries Naver Search Ad API for accurate search volume data.
    Falls back to Naver autocomplete if Search Ad API is not available.
    """
    logger.info(f"Fetching related keywords for: {keyword}")

    # Try Search Ad API first
    result = await get_related_keywords_from_searchad(keyword)

    if result.success and result.total_count > 0:
        return result

    # Fallback to autocomplete
    logger.info(f"Falling back to autocomplete for: {keyword}")
    return await get_related_keywords_from_autocomplete(keyword)


@router.post("/search-keyword-with-tabs")
async def search_keyword_with_tabs(
    keyword: str = Query(..., description="검색할 키워드"),
    limit: int = Query(13, description="결과 개수"),
    analyze_content: bool = Query(True, description="콘텐츠 분석 여부")
):
    """
    키워드로 블로그 검색 및 분석

    네이버 VIEW 탭에서 블로그를 검색하고 각 블로그의 지수를 분석합니다.
    """
    logger.info(f"Searching keyword: {keyword}, limit: {limit}")

    # Fetch search results from Naver
    search_results = await fetch_naver_search_results(keyword, limit)

    if not search_results:
        logger.warning(f"No search results found for: {keyword}")
        return KeywordSearchResponse(
            keyword=keyword,
            total_found=0,
            analyzed_count=0,
            successful_count=0,
            results=[],
            insights=SearchInsights(),
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        )

    # Analyze each blog
    results = []
    total_score = 0
    total_level = 0
    total_posts = 0
    total_neighbors = 0
    analyzed_count = 0

    for item in search_results:
        blog_id = item["blog_id"]

        if analyze_content:
            analysis = await analyze_blog(blog_id)
            stats = analysis["stats"]
            index = analysis["index"]
        else:
            stats = {"total_posts": None, "neighbor_count": None, "total_visitors": None}
            index = {"score": 0, "level": 0, "score_breakdown": None}

        blog_result = BlogResult(
            rank=item["rank"],
            blog_id=blog_id,
            blog_name=item["blog_name"],
            blog_url=item["blog_url"],
            post_title=item["post_title"],
            post_url=item["post_url"],
            post_date=item.get("post_date"),
            thumbnail=item.get("thumbnail"),
            tab_type=item["tab_type"],
            smart_block_keyword=item.get("smart_block_keyword"),
            stats=BlogStats(**stats) if stats else None,
            index=BlogIndex(**index) if index else None
        )

        results.append(blog_result)

        # Aggregate stats
        if index:
            total_score += index.get("score", 0)
            total_level += index.get("level", 0)
            analyzed_count += 1

        if stats:
            if stats.get("total_posts"):
                total_posts += stats["total_posts"]
            if stats.get("neighbor_count"):
                total_neighbors += stats["neighbor_count"]

    # Calculate insights
    count = len(results)
    insights = SearchInsights(
        average_score=round(total_score / analyzed_count, 1) if analyzed_count > 0 else 0,
        average_level=round(total_level / analyzed_count, 1) if analyzed_count > 0 else 0,
        average_posts=round(total_posts / count, 0) if count > 0 else 0,
        average_neighbors=round(total_neighbors / count, 0) if count > 0 else 0,
        top_level=max([r.index.level for r in results if r.index], default=0),
        top_score=max([r.index.score for r in results if r.index], default=0),
        score_distribution={},
        common_patterns=[]
    )

    return KeywordSearchResponse(
        keyword=keyword,
        total_found=count,
        analyzed_count=analyzed_count,
        successful_count=count,
        results=results,
        insights=insights,
        timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    )
