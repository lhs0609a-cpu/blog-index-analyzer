"""
경쟁력 분석 API 라우터
POST /api/competitive-analysis/analyze
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/competitive-analysis")


class CompetitiveAnalysisRequest(BaseModel):
    blog_id: str
    keyword: str
    search_results: Optional[List[Dict[str, Any]]] = None


class CompetitiveAnalysisResponse(BaseModel):
    success: bool
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    my_blog: Optional[Dict[str, Any]] = None
    keyword_competitiveness: Optional[Dict[str, Any]] = None
    competitive_position: Optional[Dict[str, Any]] = None
    dimension_comparisons: Optional[List[Dict[str, Any]]] = None
    recommendations: Optional[List[Dict[str, Any]]] = None
    data_quality: Optional[Dict[str, Any]] = None


@router.post("/analyze", response_model=CompetitiveAnalysisResponse)
async def analyze_competitive_position(request: CompetitiveAnalysisRequest):
    """
    키워드별 경쟁력 분석 (네이버 공식 레벨 기반 6차원 비교)

    - 네이버 레벨 (35%): 네이버 공식 레벨 (Lv.1~4) - 핵심 요소
    - 관련 글 수 (25%): 내 블로그 RSS에서 키워드 관련 글 수 (C-Rank)
    - 최신성 (15%): 상위 글 작성일 → 새 글 진입 가능성
    - 콘텐츠 품질 (10%): 글 길이/깊이
    - 키워드 최적화 (10%): 제목 키워드 비율
    - 포스팅 빈도 (5%): 마지막 포스팅 일수
    """
    blog_id = request.blog_id.strip()
    keyword = request.keyword.strip()

    if not blog_id or not keyword:
        raise HTTPException(status_code=400, detail="blog_id와 keyword를 입력하세요")

    try:
        from services.competitive_analysis_v2 import run_competitive_analysis

        result = await run_competitive_analysis(
            blog_id=blog_id,
            keyword=keyword,
            search_results=request.search_results,
        )

        return result

    except Exception as e:
        logger.error(f"Competitive analysis failed for {blog_id}/{keyword}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"경쟁력 분석 중 오류가 발생했습니다: {str(e)}"
        )
