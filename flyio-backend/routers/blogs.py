"""
Blog analysis router with related keywords support
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Optional
import httpx
import hashlib
import hmac
import base64
import time
import json
import logging

from config import settings

router = APIRouter()
logger = logging.getLogger(__name__)


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


def generate_signature(timestamp: str, method: str, uri: str, secret_key: str) -> str:
    """Generate HMAC signature for Naver Search Ad API"""
    message = f"{timestamp}.{method}.{uri}"
    signature = hmac.new(
        secret_key.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).digest()
    return base64.b64encode(signature).decode('utf-8')


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

    Note: This is a placeholder endpoint. The actual implementation
    should be connected to your blog analysis service.
    """
    # This endpoint needs to be implemented with actual blog analysis logic
    # For now, return a placeholder response
    return {
        "keyword": keyword,
        "total_found": 0,
        "analyzed_count": 0,
        "successful_count": 0,
        "results": [],
        "insights": {
            "average_score": 0,
            "average_level": 0,
            "average_posts": 0,
            "average_neighbors": 0,
            "top_level": 0,
            "top_score": 0,
            "score_distribution": {},
            "common_patterns": []
        },
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
