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


# ============ 커뮤니티 자동화 API (상단 배치) ============

@router.get("/automation/test")
async def automation_test():
    """자동화 API 테스트 (상단 배치)"""
    return {"status": "ok", "message": "automation_routes_loaded_at_top"}


@router.post("/automation/init")
async def init_community_api(admin_key: str = Query(...)):
    """커뮤니티 초기화 - 관리자 전용"""
    if admin_key != "blank-admin-2024":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")

    from services.community_automation import initialize_community
    result = initialize_community()
    return result


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


# ============ 커뮤니티 자동화 API ============

@router.post("/automation/initialize")
async def initialize_community_api(admin_key: str = Query(...)):
    """커뮤니티 초기화 (시드 데이터 생성) - 관리자 전용"""
    # 간단한 관리자 키 검증
    if admin_key != "blank-admin-2024":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")

    from services.community_automation import initialize_community
    result = initialize_community()
    return result


@router.post("/automation/generate-daily")
async def generate_daily_content_api(admin_key: str = Query(...)):
    """일일 자동 콘텐츠 생성 - 관리자 전용"""
    if admin_key != "blank-admin-2024":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")

    from services.community_automation import generate_daily_content
    result = generate_daily_content()
    return result


@router.post("/automation/generate-posts")
async def generate_posts_api(
    count: int = Query(5, ge=1, le=20),
    admin_key: str = Query(...)
):
    """게시글 생성 - 관리자 전용"""
    if admin_key != "blank-admin-2024":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")

    from services.community_automation import generate_seed_posts
    post_ids = generate_seed_posts(count)
    return {"success": True, "posts_created": len(post_ids), "post_ids": post_ids}


@router.post("/automation/generate-comments")
async def generate_comments_api(
    admin_key: str = Query(...)
):
    """댓글 생성 - 관리자 전용"""
    if admin_key != "blank-admin-2024":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")

    from services.community_automation import generate_seed_comments
    count = generate_seed_comments()
    return {"success": True, "comments_created": count}


# ============ 대량 데이터 생성 API ============

@router.post("/automation/bulk-generate")
async def bulk_generate_api(
    post_count: int = Query(10000, ge=100, le=50000),
    avg_comments_min: int = Query(3, ge=1, le=10),
    avg_comments_max: int = Query(15, ge=5, le=30),
    admin_key: str = Query(...)
):
    """대량 커뮤니티 데이터 생성 - 관리자 전용

    - post_count: 생성할 게시글 수 (기본 10000)
    - avg_comments_min/max: 게시글당 평균 댓글 수 범위
    """
    if admin_key != "blank-admin-2024":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")

    from services.bulk_data_generator import generate_bulk_data

    result = generate_bulk_data(
        post_count=post_count,
        avg_comments_per_post=(avg_comments_min, avg_comments_max),
        use_ai=False
    )

    return {
        "success": True,
        **result
    }


@router.post("/automation/bulk-generate-async")
async def bulk_generate_async_api(
    post_count: int = Query(10000, ge=100, le=50000),
    batch_size: int = Query(500, ge=100, le=1000),
    admin_key: str = Query(...)
):
    """비동기 대량 데이터 생성 (서버 부하 분산) - 관리자 전용"""
    if admin_key != "blank-admin-2024":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")

    from services.bulk_data_generator import generate_bulk_data_async
    import asyncio

    # 백그라운드 태스크로 실행
    result = await generate_bulk_data_async(
        post_count=post_count,
        batch_size=batch_size,
        delay_between_batches=0.5
    )

    return {
        "success": True,
        **result
    }


@router.get("/automation/bulk-status")
async def bulk_status_api(admin_key: str = Query(...)):
    """현재 데이터 현황 조회 - 관리자 전용"""
    if admin_key != "blank-admin-2024":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")

    from database.community_db import get_db_connection

    conn = get_db_connection()
    cursor = conn.cursor()

    # 게시글 통계
    cursor.execute("SELECT COUNT(*) as count FROM posts WHERE is_deleted = FALSE")
    post_count = cursor.fetchone()["count"]

    # 카테고리별 분포
    cursor.execute("""
        SELECT category, COUNT(*) as count
        FROM posts WHERE is_deleted = FALSE
        GROUP BY category
    """)
    category_dist = {row["category"]: row["count"] for row in cursor.fetchall()}

    # 댓글 통계
    cursor.execute("SELECT COUNT(*) as count FROM post_comments WHERE is_deleted = FALSE")
    comment_count = cursor.fetchone()["count"]

    # 기간 분포
    cursor.execute("""
        SELECT
            CASE
                WHEN created_at >= datetime('now', '-7 days') THEN 'last_7_days'
                WHEN created_at >= datetime('now', '-30 days') THEN 'last_30_days'
                WHEN created_at >= datetime('now', '-90 days') THEN 'last_90_days'
                ELSE 'older'
            END as period,
            COUNT(*) as count
        FROM posts WHERE is_deleted = FALSE
        GROUP BY period
    """)
    period_dist = {row["period"]: row["count"] for row in cursor.fetchall()}

    conn.close()

    return {
        "total_posts": post_count,
        "total_comments": comment_count,
        "avg_comments_per_post": round(comment_count / max(post_count, 1), 2),
        "category_distribution": category_dist,
        "period_distribution": period_dist,
        "timestamp": datetime.now().isoformat()
    }


# ============ 자연스러운 콘텐츠 자동 생성 API ============

@router.get("/scheduler/status")
async def scheduler_status_api(admin_key: str = Query(...)):
    """콘텐츠 스케줄러 상태 조회 - 관리자 전용"""
    if admin_key != "blank-admin-2024":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")

    from services.content_scheduler import get_scheduler
    scheduler = get_scheduler()
    return scheduler.get_status()


@router.post("/scheduler/start")
async def scheduler_start_api(admin_key: str = Query(...)):
    """콘텐츠 스케줄러 시작 - 관리자 전용"""
    if admin_key != "blank-admin-2024":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")

    from services.content_scheduler import get_scheduler
    scheduler = get_scheduler()

    if scheduler.is_running:
        return {"success": False, "message": "스케줄러가 이미 실행 중입니다"}

    scheduler.start()
    return {"success": True, "message": "스케줄러가 시작되었습니다"}


@router.post("/scheduler/stop")
async def scheduler_stop_api(admin_key: str = Query(...)):
    """콘텐츠 스케줄러 중지 - 관리자 전용"""
    if admin_key != "blank-admin-2024":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")

    from services.content_scheduler import get_scheduler
    scheduler = get_scheduler()

    if not scheduler.is_running:
        return {"success": False, "message": "스케줄러가 실행 중이 아닙니다"}

    scheduler.stop()
    return {"success": True, "message": "스케줄러가 중지되었습니다"}


@router.post("/automation/generate-natural")
async def generate_natural_content_api(
    posts_count: int = Query(10, ge=1, le=50),
    add_comments_to_existing: bool = Query(True),
    admin_key: str = Query(...)
):
    """자연스러운 콘텐츠 수동 생성 - 관리자 전용

    실제 사람처럼 비속어, 줄임말, 의심, 다양한 감정 표현 포함
    """
    if admin_key != "blank-admin-2024":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")

    from services.content_scheduler import run_manual_generation

    result = await run_manual_generation(
        posts_count=posts_count,
        add_comments=add_comments_to_existing,
    )

    return {
        "success": True,
        **result,
        "message": "자연스러운 콘텐츠가 생성되었습니다"
    }


@router.post("/automation/generate-initial-data")
async def generate_initial_data_api(
    target_posts: int = Query(10000, ge=100, le=50000),
    batch_size: int = Query(100, ge=50, le=500),
    admin_key: str = Query(...)
):
    """초기 대량 데이터 점진 생성 - 관리자 전용

    서버 부하 최소화하며 1만개 이상 데이터 생성
    배치 단위로 생성하여 서버 안정성 유지
    """
    if admin_key != "blank-admin-2024":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")

    from services.content_scheduler import generate_initial_data_gradually

    result = await generate_initial_data_gradually(
        target_posts=target_posts,
        batch_size=batch_size,
        delay_between_batches=1.0,
    )

    return {
        "success": True,
        **result
    }


@router.post("/automation/add-daily-content")
async def add_daily_content_api(
    posts_min: int = Query(15, ge=5, le=50),
    posts_max: int = Query(30, ge=10, le=100),
    comments_min: int = Query(3, ge=1, le=10),
    comments_max: int = Query(12, ge=5, le=30),
    admin_key: str = Query(...)
):
    """하루치 자연스러운 콘텐츠 생성 - 관리자 전용"""
    if admin_key != "blank-admin-2024":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")

    from services.natural_content_generator import generate_daily_natural_content

    result = generate_daily_natural_content(
        posts_count=(posts_min, posts_max),
        comments_per_post=(comments_min, comments_max),
    )

    return {
        "success": True,
        **result
    }


# ============ 디버그 API ============

@router.get("/debug/routes-check")
async def debug_routes_check():
    """라우트 로드 확인용 (배포 테스트)"""
    return {
        "status": "automation_routes_loaded",
        "timestamp": datetime.now().isoformat(),
        "message": "커뮤니티 자동화 라우트가 정상적으로 로드되었습니다."
    }
