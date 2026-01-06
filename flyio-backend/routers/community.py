"""
커뮤니티 API 라우터
- 실시간 활동 피드
- 포인트 & 레벨 시스템
- 리더보드
- 인사이트 게시판
- 키워드 트렌드
- 상위노출 성공 알림
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import logging

from database.community_db import (
    # 포인트 시스템
    add_points,
    get_user_points,
    get_leaderboard,
    get_level_info,
    POINT_VALUES,
    LEVEL_THRESHOLDS,
    # 활동 피드
    log_activity,
    get_activity_feed,
    get_active_users_count,
    # 인사이트
    create_insight,
    get_insights,
    like_insight,
    add_insight_comment,
    get_insight_comments,
    # 키워드 트렌드
    update_keyword_trend,
    get_trending_keywords,
    recommend_keyword,
    # 상위노출 성공
    log_ranking_success,
    get_ranking_successes,
    get_today_success_count,
    # 통계
    get_platform_stats,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/community", tags=["Community"])


# ============ Request/Response Models ============

class PointActionRequest(BaseModel):
    user_id: int
    action_type: str
    description: Optional[str] = None
    metadata: Optional[dict] = None


class ActivityLogRequest(BaseModel):
    user_id: int
    activity_type: str
    title: str
    description: Optional[str] = None
    metadata: Optional[dict] = None
    points_earned: int = 0
    user_name: Optional[str] = None
    is_public: bool = True


class InsightCreateRequest(BaseModel):
    user_id: int
    content: str = Field(..., min_length=10, max_length=500)
    category: str = "general"
    is_anonymous: bool = True


class PostCreateRequest(BaseModel):
    user_id: int
    title: str = Field(..., min_length=2, max_length=100)
    content: str = Field(..., min_length=10, max_length=5000)
    category: str = "free"  # free, tip, question, success
    tags: Optional[List[str]] = None


class PostUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=100)
    content: Optional[str] = Field(None, min_length=10, max_length=5000)
    category: Optional[str] = None
    tags: Optional[List[str]] = None


class PostCommentRequest(BaseModel):
    user_id: int
    content: str = Field(..., min_length=1, max_length=1000)


class InsightCommentRequest(BaseModel):
    user_id: int
    content: str = Field(..., min_length=1, max_length=300)
    is_anonymous: bool = True


class KeywordRecommendRequest(BaseModel):
    user_id: int
    keyword: str
    reason: str


class RankingSuccessRequest(BaseModel):
    user_id: int
    keyword: str
    new_rank: int
    prev_rank: Optional[int] = None
    blog_id: Optional[str] = None
    post_url: Optional[str] = None
    user_name: Optional[str] = None


# ============ 포인트 & 레벨 API ============

@router.get("/points/{user_id}")
async def get_user_points_api(user_id: int):
    """사용자 포인트 정보 조회"""
    points = get_user_points(user_id)
    if not points:
        return {
            "user_id": user_id,
            "total_points": 0,
            "weekly_points": 0,
            "monthly_points": 0,
            "level": 1,
            "level_name": "Bronze",
            "level_info": get_level_info(0),
            "streak_days": 0
        }
    return points


@router.post("/points/add")
async def add_points_api(request: PointActionRequest):
    """포인트 추가"""
    result = add_points(
        user_id=request.user_id,
        action_type=request.action_type,
        description=request.description,
        metadata=request.metadata
    )
    return result


@router.get("/points/config")
async def get_points_config():
    """포인트 설정 조회"""
    return {
        "point_values": POINT_VALUES,
        "level_thresholds": [
            {"points": t[0], "name": t[1], "icon": t[2]}
            for t in LEVEL_THRESHOLDS
        ]
    }


# ============ 리더보드 API ============

@router.get("/leaderboard")
async def get_leaderboard_api(
    period: str = Query("weekly", enum=["weekly", "monthly", "all"]),
    limit: int = Query(20, ge=1, le=100)
):
    """리더보드 조회"""
    leaderboard = get_leaderboard(period=period, limit=limit)
    return {
        "period": period,
        "leaderboard": leaderboard,
        "updated_at": datetime.now().isoformat()
    }


@router.get("/leaderboard/my-rank/{user_id}")
async def get_my_rank_api(user_id: int, period: str = "weekly"):
    """내 순위 조회"""
    leaderboard = get_leaderboard(period=period, limit=1000)
    for i, entry in enumerate(leaderboard):
        if entry.get('user_id') == user_id:
            return {
                "rank": i + 1,
                "total_participants": len(leaderboard),
                "points": entry.get(f"{period}_points" if period != "all" else "total_points"),
                "level_info": entry.get('level_info')
            }
    return {
        "rank": None,
        "total_participants": len(leaderboard),
        "message": "순위권 밖입니다"
    }


# ============ 활동 피드 API ============

@router.get("/feed")
async def get_activity_feed_api(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    """실시간 활동 피드 조회"""
    feed = get_activity_feed(limit=limit, offset=offset)
    active_users = get_active_users_count()

    return {
        "feed": feed,
        "active_users": active_users,
        "timestamp": datetime.now().isoformat()
    }


@router.post("/feed/log")
async def log_activity_api(request: ActivityLogRequest):
    """활동 로그 기록"""
    activity_id = log_activity(
        user_id=request.user_id,
        activity_type=request.activity_type,
        title=request.title,
        description=request.description,
        metadata=request.metadata,
        points_earned=request.points_earned,
        user_name=request.user_name,
        is_public=request.is_public
    )
    return {"success": True, "activity_id": activity_id}


@router.get("/feed/active-users")
async def get_active_users_api():
    """현재 활성 사용자 수"""
    count = get_active_users_count()
    return {"active_users": count, "timestamp": datetime.now().isoformat()}


# ============ 인사이트 게시판 API ============

@router.get("/insights")
async def get_insights_api(
    category: Optional[str] = None,
    sort_by: str = Query("recent", enum=["recent", "popular"]),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0)
):
    """인사이트 목록 조회"""
    insights = get_insights(
        category=category,
        sort_by=sort_by,
        limit=limit,
        offset=offset
    )
    return {
        "insights": insights,
        "category": category,
        "sort_by": sort_by
    }


@router.post("/insights")
async def create_insight_api(request: InsightCreateRequest):
    """인사이트 작성"""
    insight_id = create_insight(
        user_id=request.user_id,
        content=request.content,
        category=request.category,
        is_anonymous=request.is_anonymous
    )
    return {"success": True, "insight_id": insight_id}


@router.post("/insights/{insight_id}/like")
async def like_insight_api(insight_id: int, user_id: int):
    """인사이트 좋아요"""
    result = like_insight(insight_id, user_id)
    return result


@router.get("/insights/{insight_id}/comments")
async def get_insight_comments_api(insight_id: int):
    """인사이트 댓글 조회"""
    comments = get_insight_comments(insight_id)
    return {"insight_id": insight_id, "comments": comments}


@router.post("/insights/{insight_id}/comments")
async def add_insight_comment_api(insight_id: int, request: InsightCommentRequest):
    """인사이트 댓글 작성"""
    comment_id = add_insight_comment(
        insight_id=insight_id,
        user_id=request.user_id,
        content=request.content,
        is_anonymous=request.is_anonymous
    )
    return {"success": True, "comment_id": comment_id}


# ============ 키워드 트렌드 API ============

@router.get("/trends/keywords")
async def get_trending_keywords_api(limit: int = Query(10, ge=1, le=30)):
    """실시간 트렌딩 키워드 조회"""
    keywords = get_trending_keywords(limit=limit)
    return {
        "keywords": keywords,
        "timestamp": datetime.now().isoformat()
    }


@router.post("/trends/keywords/update")
async def update_keyword_trend_api(keyword: str, user_id: Optional[int] = None):
    """키워드 트렌드 업데이트 (검색 시 자동 호출)"""
    result = update_keyword_trend(keyword, user_id)
    return result


@router.post("/trends/keywords/recommend")
async def recommend_keyword_api(request: KeywordRecommendRequest):
    """키워드 추천"""
    trend_id = recommend_keyword(
        user_id=request.user_id,
        keyword=request.keyword,
        reason=request.reason
    )
    return {"success": True, "trend_id": trend_id}


# ============ 상위노출 성공 API ============

@router.get("/ranking-success")
async def get_ranking_successes_api(
    limit: int = Query(20, ge=1, le=50),
    today_only: bool = False
):
    """상위노출 성공 목록 조회"""
    successes = get_ranking_successes(limit=limit, today_only=today_only)
    today_count = get_today_success_count()

    return {
        "successes": successes,
        "today_count": today_count,
        "timestamp": datetime.now().isoformat()
    }


@router.post("/ranking-success")
async def log_ranking_success_api(request: RankingSuccessRequest):
    """상위노출 성공 기록"""
    success_id = log_ranking_success(
        user_id=request.user_id,
        keyword=request.keyword,
        new_rank=request.new_rank,
        prev_rank=request.prev_rank,
        blog_id=request.blog_id,
        post_url=request.post_url,
        user_name=request.user_name
    )
    return {"success": True, "success_id": success_id}


# ============ 통계 API ============

@router.get("/stats")
async def get_platform_stats_api():
    """플랫폼 전체 통계"""
    stats = get_platform_stats()
    return {
        **stats,
        "timestamp": datetime.now().isoformat()
    }


@router.get("/stats/summary")
async def get_community_summary():
    """커뮤니티 요약 정보 (대시보드용)"""
    stats = get_platform_stats()
    feed = get_activity_feed(limit=5)
    trending = get_trending_keywords(limit=5)
    successes = get_ranking_successes(limit=5, today_only=True)
    leaderboard = get_leaderboard(period="weekly", limit=5)

    return {
        "stats": stats,
        "recent_activities": feed,
        "trending_keywords": trending,
        "recent_successes": successes,
        "top_users": leaderboard,
        "timestamp": datetime.now().isoformat()
    }


# ============ 게시판 API ============

from database.community_db import (
    create_post,
    get_posts,
    get_post,
    update_post,
    delete_post,
    like_post,
    create_post_comment,
    get_post_comments,
)

POST_CATEGORIES = {
    "free": "자유",
    "tip": "블로그 팁",
    "question": "질문",
    "success": "성공 후기"
}


@router.get("/posts")
async def get_posts_api(
    category: Optional[str] = None,
    sort_by: str = Query("recent", enum=["recent", "popular", "comments"]),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None
):
    """게시글 목록 조회"""
    posts = get_posts(
        category=category,
        sort_by=sort_by,
        limit=limit,
        offset=offset,
        search=search
    )
    return {
        "posts": posts,
        "categories": POST_CATEGORIES,
        "category": category,
        "sort_by": sort_by
    }


@router.get("/posts/{post_id}")
async def get_post_api(post_id: int, user_id: Optional[int] = None):
    """게시글 상세 조회"""
    post = get_post(post_id, user_id)
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다")
    return post


@router.post("/posts")
async def create_post_api(request: PostCreateRequest):
    """게시글 작성"""
    post_id = create_post(
        user_id=request.user_id,
        title=request.title,
        content=request.content,
        category=request.category,
        tags=request.tags
    )

    # 포인트 지급
    add_points(request.user_id, "post_create", "게시글 작성")

    # 활동 로그
    log_activity(
        user_id=request.user_id,
        activity_type="post_create",
        title=f"'{request.title}' 게시글 작성",
        points_earned=10
    )

    return {"success": True, "post_id": post_id, "message": "게시글이 작성되었습니다"}


@router.put("/posts/{post_id}")
async def update_post_api(post_id: int, request: PostUpdateRequest, user_id: int = Query(...)):
    """게시글 수정"""
    post = get_post(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다")
    if post.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="수정 권한이 없습니다")

    update_data = {k: v for k, v in request.dict().items() if v is not None}
    result = update_post(post_id, update_data)
    return {"success": True, "message": "게시글이 수정되었습니다"}


@router.delete("/posts/{post_id}")
async def delete_post_api(post_id: int, user_id: int = Query(...)):
    """게시글 삭제"""
    post = get_post(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다")
    if post.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다")

    delete_post(post_id)
    return {"success": True, "message": "게시글이 삭제되었습니다"}


@router.post("/posts/{post_id}/like")
async def like_post_api(post_id: int, user_id: int = Query(...)):
    """게시글 좋아요"""
    result = like_post(post_id, user_id)
    return result


@router.get("/posts/{post_id}/comments")
async def get_post_comments_api(post_id: int):
    """게시글 댓글 조회"""
    comments = get_post_comments(post_id)
    return {"post_id": post_id, "comments": comments, "count": len(comments)}


@router.post("/posts/{post_id}/comments")
async def create_post_comment_api(post_id: int, request: PostCommentRequest):
    """게시글 댓글 작성"""
    comment_id = create_post_comment(
        post_id=post_id,
        user_id=request.user_id,
        content=request.content
    )

    # 포인트 지급
    add_points(request.user_id, "comment_create", "댓글 작성")

    return {"success": True, "comment_id": comment_id, "message": "댓글이 작성되었습니다"}
