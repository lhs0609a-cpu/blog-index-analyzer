"""
사용자 저장 블로그 API
- 블로그 저장, 조회, 삭제
- 블로그 분석 히스토리
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import logging

from database.user_blogs_db import (
    get_user_blogs,
    get_user_blog,
    save_user_blog,
    delete_user_blog,
    get_blog_history,
    get_user_blogs_count
)
from routers.blogs import analyze_blog
from routers.auth import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


# ============ Request/Response 모델 ============

class SaveBlogRequest(BaseModel):
    blog_id: str
    blog_name: Optional[str] = None
    avatar: Optional[str] = '📝'


class SavedBlogResponse(BaseModel):
    id: int
    blog_id: str
    blog_name: Optional[str]
    blog_url: Optional[str]
    avatar: str
    level: int
    grade: str
    score: float  # total_score를 score로 매핑
    change: float  # score_change를 change로 매핑
    stats: Dict[str, Any]
    last_analyzed: Optional[str]  # last_analyzed_at을 last_analyzed로 매핑


class BlogListResponse(BaseModel):
    blogs: List[SavedBlogResponse]
    count: int


class BlogHistoryItem(BaseModel):
    date: str
    score: float
    level: int


class BlogHistoryResponse(BaseModel):
    blog_id: str
    history: List[BlogHistoryItem]


# ============ API 엔드포인트 ============

@router.get("/saved", response_model=BlogListResponse)
async def get_saved_blogs(current_user: dict = Depends(get_current_user)):
    """
    사용자가 저장한 블로그 목록 조회 (인증 필요)
    """
    user_id = current_user["id"]
    logger.info(f"Getting saved blogs for user: {user_id}")

    try:
        blogs = get_user_blogs(user_id)

        result = []
        for blog in blogs:
            result.append(SavedBlogResponse(
                id=blog['id'],
                blog_id=blog['blog_id'],
                blog_name=blog.get('blog_name') or blog['blog_id'],
                blog_url=blog.get('blog_url') or f"https://blog.naver.com/{blog['blog_id']}",
                avatar=blog.get('avatar', '📝'),
                level=blog.get('level', 0),
                grade=blog.get('grade', ''),
                score=blog.get('total_score', 0),
                change=blog.get('score_change', 0),
                stats={
                    'posts': blog.get('total_posts', 0),
                    'visitors': blog.get('total_visitors', 0),
                    'engagement': blog.get('neighbor_count', 0)
                },
                last_analyzed=blog.get('last_analyzed_at')
            ))

        return BlogListResponse(blogs=result, count=len(result))

    except Exception as e:
        logger.error(f"Error getting saved blogs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save")
async def save_blog(
    request: SaveBlogRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    블로그 저장 및 분석 (인증 필요)
    - 블로그를 분석하고 결과와 함께 저장
    """
    user_id = current_user["id"]
    logger.info(f"Saving blog {request.blog_id} for user {user_id}")

    try:
        # 블로그 분석
        analysis = await analyze_blog(request.blog_id)

        stats = analysis.get("stats", {})
        index = analysis.get("index", {})
        score_breakdown = index.get("score_breakdown", {})

        # 저장
        saved = save_user_blog(
            user_id=user_id,
            blog_id=request.blog_id,
            blog_name=request.blog_name or f"{request.blog_id}의 블로그",
            blog_url=f"https://blog.naver.com/{request.blog_id}",
            avatar=request.avatar or '📝',
            level=index.get("level") or 0,
            grade=index.get("grade", ""),
            total_score=index.get("total_score") or 0,
            total_posts=stats.get("total_posts") or 0,
            total_visitors=stats.get("total_visitors") or 0,
            neighbor_count=stats.get("neighbor_count") or 0,
            score_breakdown=score_breakdown
        )

        return {
            "success": True,
            "message": "블로그가 저장되었습니다.",
            "blog": SavedBlogResponse(
                id=saved['id'],
                blog_id=saved['blog_id'],
                blog_name=saved.get('blog_name') or saved['blog_id'],
                blog_url=saved.get('blog_url'),
                avatar=saved.get('avatar', '📝'),
                level=saved.get('level', 0),
                grade=saved.get('grade', ''),
                score=saved.get('total_score', 0),
                change=saved.get('score_change', 0),
                stats={
                    'posts': saved.get('total_posts', 0),
                    'visitors': saved.get('total_visitors', 0),
                    'engagement': saved.get('neighbor_count', 0)
                },
                last_analyzed=saved.get('last_analyzed_at')
            )
        }

    except Exception as e:
        logger.error(f"Error saving blog: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{blog_id}")
async def remove_saved_blog(
    blog_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    저장된 블로그 삭제 (인증 필요)
    """
    user_id = current_user["id"]
    logger.info(f"Deleting blog {blog_id} for user {user_id}")

    try:
        success = delete_user_blog(user_id, blog_id)

        if not success:
            raise HTTPException(status_code=404, detail="블로그를 찾을 수 없습니다.")

        return {"success": True, "message": "블로그가 삭제되었습니다."}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting blog: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{blog_id}/refresh")
async def refresh_blog_analysis(
    blog_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    블로그 재분석 (인증 필요)
    """
    user_id = current_user["id"]
    logger.info(f"Refreshing analysis for blog {blog_id}, user {user_id}")

    try:
        # 기존 블로그 확인
        existing = get_user_blog(user_id, blog_id)
        if not existing:
            raise HTTPException(status_code=404, detail="저장된 블로그를 찾을 수 없습니다.")

        # 재분석
        analysis = await analyze_blog(blog_id)

        stats = analysis.get("stats", {})
        index = analysis.get("index", {})
        score_breakdown = index.get("score_breakdown", {})

        # 업데이트
        saved = save_user_blog(
            user_id=user_id,
            blog_id=blog_id,
            blog_name=existing.get('blog_name'),
            blog_url=existing.get('blog_url'),
            avatar=existing.get('avatar', '📝'),
            level=index.get("level") or 0,
            grade=index.get("grade", ""),
            total_score=index.get("total_score") or 0,
            total_posts=stats.get("total_posts") or 0,
            total_visitors=stats.get("total_visitors") or 0,
            neighbor_count=stats.get("neighbor_count") or 0,
            score_breakdown=score_breakdown
        )

        return {
            "success": True,
            "message": "재분석이 완료되었습니다.",
            "blog": SavedBlogResponse(
                id=saved['id'],
                blog_id=saved['blog_id'],
                blog_name=saved.get('blog_name') or saved['blog_id'],
                blog_url=saved.get('blog_url'),
                avatar=saved.get('avatar', '📝'),
                level=saved.get('level', 0),
                grade=saved.get('grade', ''),
                score=saved.get('total_score', 0),
                change=saved.get('score_change', 0),
                stats={
                    'posts': saved.get('total_posts', 0),
                    'visitors': saved.get('total_visitors', 0),
                    'engagement': saved.get('neighbor_count', 0)
                },
                last_analyzed=saved.get('last_analyzed_at')
            )
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error refreshing blog: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{blog_id}/history", response_model=BlogHistoryResponse)
async def get_blog_analysis_history(
    blog_id: str,
    current_user: dict = Depends(get_current_user),
    limit: int = Query(30, description="히스토리 개수")
):
    """
    블로그 분석 히스토리 조회 (인증 필요)
    """
    user_id = current_user["id"]
    logger.info(f"Getting history for blog {blog_id}, user {user_id}")

    try:
        history = get_blog_history(user_id, blog_id, limit)

        result = []
        for item in history:
            result.append(BlogHistoryItem(
                date=item.get('analyzed_at', '')[:10] if item.get('analyzed_at') else '',
                score=item.get('total_score', 0),
                level=item.get('level', 0)
            ))

        return BlogHistoryResponse(blog_id=blog_id, history=result)

    except Exception as e:
        logger.error(f"Error getting blog history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/count")
async def get_blogs_count(current_user: dict = Depends(get_current_user)):
    """
    사용자 저장 블로그 수 조회 (인증 필요)
    """
    try:
        user_id = current_user["id"]
        count = get_user_blogs_count(user_id)
        return {"count": count}
    except Exception as e:
        logger.error(f"Error getting blog count: {e}")
        raise HTTPException(status_code=500, detail=str(e))
