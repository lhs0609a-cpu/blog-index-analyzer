"""
블로그 순위 추적 API 라우터
- 블로그 등록/관리
- 순위 확인 실행
- 결과 조회 및 통계
"""
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid
import logging
import asyncio
import io

from database.rank_tracker_db import get_rank_tracker_db
from database.subscription_db import get_user_subscription, PLAN_LIMITS, PlanType
from routers.auth import get_current_user_optional

logger = logging.getLogger(__name__)
router = APIRouter()


# ============ Pydantic 모델 ============

class BlogRegisterRequest(BaseModel):
    blog_id: str


class RankCheckRequest(BaseModel):
    max_posts: int = 50
    force_refresh: bool = False


class KeywordAddRequest(BaseModel):
    post_id: int
    keyword: str
    priority: int = 1


class TrackedBlogResponse(BaseModel):
    id: int
    blog_id: str
    blog_name: Optional[str]
    is_active: bool
    last_checked_at: Optional[str]
    created_at: str
    posts_count: Optional[int] = 0


class RankResultItem(BaseModel):
    keyword_id: int
    keyword: str
    post_title: str
    post_url: str
    rank_blog_tab: Optional[int]
    rank_view_tab: Optional[int]
    blog_classification: str
    view_classification: str
    checked_at: Optional[str]


class StatisticsResponse(BaseModel):
    total_keywords: int
    blog_tab: dict
    view_tab: dict


# ============ 헬퍼 함수 ============

def classify_rank(rank: Optional[int]) -> str:
    """순위 분류"""
    if rank is None:
        return "노출안됨"
    elif 1 <= rank <= 3:
        return "상위권"
    elif 4 <= rank <= 7:
        return "중위권"
    elif 8 <= rank <= 10:
        return "하위권"
    return "노출안됨"


def check_plan_limit(user_id: int, limit_type: str) -> dict:
    """플랜 제한 확인 (관리자는 business 플랜)"""
    # 관리자 체크
    try:
        from database.user_db import get_user_db
        user_db = get_user_db()
        user = user_db.get_user_by_id(user_id)
        if user and user.get('is_admin'):
            limits = PLAN_LIMITS[PlanType.BUSINESS]
            limit_value = limits.get(limit_type, -1)
            return {
                "limit": limit_value,
                "plan_type": "business",
                "is_unlimited": limit_value == -1
            }
    except Exception:
        pass

    subscription = get_user_subscription(user_id)
    if not subscription:
        # 기본 무료 플랜
        limits = PLAN_LIMITS[PlanType.FREE]
    else:
        plan_type = PlanType(subscription.get('plan_type', 'free'))
        limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS[PlanType.FREE])

    limit_value = limits.get(limit_type, 0)
    return {
        "limit": limit_value,
        "plan_type": subscription.get('plan_type', 'free') if subscription else 'free',
        "is_unlimited": limit_value == -1
    }


# ============ 블로그 관리 API ============

@router.get("/blogs")
async def get_tracked_blogs(
    user_id: int = Query(..., description="사용자 ID")
):
    """사용자의 추적 블로그 목록 조회"""
    db = get_rank_tracker_db()
    blogs = db.get_tracked_blogs(user_id)

    # 각 블로그의 포스팅 수 추가
    result = []
    for blog in blogs:
        posts = db.get_tracked_posts(blog['id'])
        blog_data = {
            **blog,
            "posts_count": len(posts),
            "created_at": str(blog.get('created_at', '')),
            "last_checked_at": str(blog.get('last_checked_at', '')) if blog.get('last_checked_at') else None
        }
        result.append(blog_data)

    return {"blogs": result, "count": len(result)}


@router.post("/blogs")
async def register_blog(
    request: BlogRegisterRequest,
    user_id: int = Query(..., description="사용자 ID")
):
    """추적 블로그 등록"""
    db = get_rank_tracker_db()

    # 플랜 제한 확인
    plan_info = check_plan_limit(user_id, 'rank_tracking_blogs')
    if not plan_info['is_unlimited']:
        current_count = db.count_tracked_blogs(user_id)
        if current_count >= plan_info['limit']:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "plan_limit_exceeded",
                    "message": f"추적 가능한 블로그 수({plan_info['limit']}개)를 초과했습니다.",
                    "current": current_count,
                    "limit": plan_info['limit'],
                    "plan": plan_info['plan_type']
                }
            )

    # 블로그 정보 가져오기 (RSS에서)
    blog_name = None
    try:
        from services.blog_scraper import BlogScraper
        scraper = BlogScraper()
        blog_info = await scraper.get_blog_info(request.blog_id)
        if blog_info:
            blog_name = blog_info.get('blog_name')
    except Exception as e:
        logger.warning(f"Failed to get blog info: {e}")

    # 블로그 등록
    blog = db.add_tracked_blog(user_id, request.blog_id, blog_name)

    return {
        "success": True,
        "message": "블로그가 등록되었습니다.",
        "blog": blog
    }


@router.get("/blogs/{blog_id}")
async def get_tracked_blog_detail(
    blog_id: str,
    user_id: int = Query(..., description="사용자 ID")
):
    """추적 블로그 상세 정보"""
    db = get_rank_tracker_db()
    blog = db.get_tracked_blog(user_id, blog_id)

    if not blog:
        raise HTTPException(status_code=404, detail="등록된 블로그를 찾을 수 없습니다.")

    posts = db.get_tracked_posts(blog['id'])
    stats = db.get_statistics(blog['id'])

    return {
        "blog": blog,
        "posts_count": len(posts),
        "statistics": stats
    }


@router.delete("/blogs/{blog_id}")
async def delete_tracked_blog(
    blog_id: str,
    user_id: int = Query(..., description="사용자 ID")
):
    """추적 블로그 삭제"""
    db = get_rank_tracker_db()
    success = db.delete_tracked_blog(user_id, blog_id)

    if not success:
        raise HTTPException(status_code=404, detail="블로그를 찾을 수 없습니다.")

    return {"success": True, "message": "블로그가 삭제되었습니다."}


# ============ 순위 확인 API ============

@router.post("/check/{blog_id}")
async def start_rank_check(
    blog_id: str,
    request: RankCheckRequest,
    background_tasks: BackgroundTasks,
    user_id: int = Query(..., description="사용자 ID")
):
    """순위 확인 시작"""
    db = get_rank_tracker_db()

    # 블로그 확인
    blog = db.get_tracked_blog(user_id, blog_id)
    if not blog:
        raise HTTPException(status_code=404, detail="등록된 블로그를 찾을 수 없습니다.")

    # 이미 실행 중인 작업 확인
    running_task = db.get_user_running_task(user_id)
    if running_task:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "task_already_running",
                "message": "이미 실행 중인 순위 확인 작업이 있습니다.",
                "task_id": running_task['task_id']
            }
        )

    # 일일 제한 확인 (TODO: 오늘 확인 횟수 체크)

    # 작업 생성
    task_id = str(uuid.uuid4())
    db.create_check_task(task_id, user_id, blog['id'])

    # 백그라운드에서 순위 확인 실행
    background_tasks.add_task(
        run_rank_check,
        task_id=task_id,
        tracked_blog_id=blog['id'],
        blog_id=blog_id,
        max_posts=request.max_posts,
        force_refresh=request.force_refresh
    )

    return {
        "success": True,
        "message": "순위 확인이 시작되었습니다.",
        "task_id": task_id
    }


@router.get("/status/{task_id}")
async def get_task_status(task_id: str):
    """작업 진행 상태 조회"""
    db = get_rank_tracker_db()
    task = db.get_task_status(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")

    return {
        "task_id": task['task_id'],
        "status": task['status'],
        "progress": task['progress'],
        "total_keywords": task['total_keywords'],
        "completed_keywords": task['completed_keywords'],
        "current_keyword": task['current_keyword'],
        "error_message": task.get('error_message'),
        "started_at": str(task.get('started_at', '')),
        "completed_at": str(task.get('completed_at', '')) if task.get('completed_at') else None
    }


@router.post("/stop/{task_id}")
async def stop_rank_check(task_id: str):
    """순위 확인 중지 (현재는 상태만 변경)"""
    db = get_rank_tracker_db()
    task = db.get_task_status(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")

    if task['status'] != 'running':
        return {"success": False, "message": "실행 중인 작업이 아닙니다."}

    db.complete_task(task_id, "사용자에 의해 중지됨")

    return {"success": True, "message": "작업이 중지되었습니다."}


# ============ 결과 조회 API ============

@router.get("/results/{blog_id}")
async def get_rank_results(
    blog_id: str,
    user_id: int = Query(..., description="사용자 ID")
):
    """순위 결과 조회"""
    db = get_rank_tracker_db()

    blog = db.get_tracked_blog(user_id, blog_id)
    if not blog:
        raise HTTPException(status_code=404, detail="블로그를 찾을 수 없습니다.")

    # 최신 순위 조회
    ranks = db.get_latest_ranks(blog['id'])

    # 결과 포맷팅
    results = []
    for r in ranks:
        results.append({
            "keyword_id": r['keyword_id'],
            "keyword": r['keyword'],
            "post_title": r['post_title'],
            "post_url": r['post_url'],
            "rank_blog_tab": r['rank_blog_tab'],
            "rank_view_tab": r['rank_view_tab'],
            "blog_classification": classify_rank(r['rank_blog_tab']),
            "view_classification": classify_rank(r['rank_view_tab']),
            "checked_at": str(r['checked_at']) if r.get('checked_at') else None
        })

    # 통계
    statistics = db.get_statistics(blog['id'])

    return {
        "blog": {
            "blog_id": blog['blog_id'],
            "blog_name": blog.get('blog_name')
        },
        "results": results,
        "statistics": statistics,
        "last_checked_at": str(blog.get('last_checked_at')) if blog.get('last_checked_at') else None
    }


@router.get("/history/{blog_id}")
async def get_rank_history(
    blog_id: str,
    user_id: int = Query(..., description="사용자 ID"),
    days: int = Query(30, description="조회 기간 (일)")
):
    """순위 히스토리 조회"""
    db = get_rank_tracker_db()

    blog = db.get_tracked_blog(user_id, blog_id)
    if not blog:
        raise HTTPException(status_code=404, detail="블로그를 찾을 수 없습니다.")

    # 플랜별 히스토리 기간 제한
    plan_info = check_plan_limit(user_id, 'rank_history_days')
    if not plan_info['is_unlimited']:
        days = min(days, plan_info['limit'])

    history = db.get_rank_history(blog['id'], days)

    return {
        "blog_id": blog_id,
        "days": days,
        "history": history
    }


@router.get("/statistics/{blog_id}")
async def get_statistics(
    blog_id: str,
    user_id: int = Query(..., description="사용자 ID")
):
    """블로그 순위 통계"""
    db = get_rank_tracker_db()

    blog = db.get_tracked_blog(user_id, blog_id)
    if not blog:
        raise HTTPException(status_code=404, detail="블로그를 찾을 수 없습니다.")

    statistics = db.get_statistics(blog['id'])

    return statistics


# ============ 키워드 관리 API ============

@router.post("/keywords")
async def add_keyword(
    request: KeywordAddRequest,
    user_id: int = Query(..., description="사용자 ID")
):
    """키워드 수동 추가"""
    db = get_rank_tracker_db()

    # 포스팅 확인
    post = db.get_tracked_post_by_id(request.post_id)
    if not post:
        raise HTTPException(status_code=404, detail="포스팅을 찾을 수 없습니다.")

    keyword = db.add_post_keyword(
        request.post_id,
        request.keyword,
        request.priority,
        is_manual=True
    )

    return {
        "success": True,
        "message": "키워드가 추가되었습니다.",
        "keyword": keyword
    }


@router.get("/keywords/{blog_id}")
async def get_keywords(
    blog_id: str,
    user_id: int = Query(..., description="사용자 ID")
):
    """블로그의 모든 키워드 조회"""
    db = get_rank_tracker_db()

    blog = db.get_tracked_blog(user_id, blog_id)
    if not blog:
        raise HTTPException(status_code=404, detail="블로그를 찾을 수 없습니다.")

    keywords = db.get_all_keywords_for_blog(blog['id'])

    return {
        "blog_id": blog_id,
        "keywords": keywords,
        "count": len(keywords)
    }


# ============ Excel 내보내기 ============

@router.get("/export/{blog_id}")
async def export_to_excel(
    blog_id: str,
    user_id: int = Query(..., description="사용자 ID")
):
    """Excel 파일 내보내기"""
    db = get_rank_tracker_db()

    blog = db.get_tracked_blog(user_id, blog_id)
    if not blog:
        raise HTTPException(status_code=404, detail="블로그를 찾을 수 없습니다.")

    # 플랜 확인 (Excel 내보내기는 Pro 이상, 관리자는 허용)
    try:
        from database.user_db import get_user_db
        udb = get_user_db()
        plan_type = udb.get_user_effective_plan(user_id)
    except Exception:
        subscription = get_user_subscription(user_id)
        plan_type = subscription.get('plan_type', 'free') if subscription else 'free'
    if plan_type in ['free', 'basic']:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "feature_not_available",
                "message": "Excel 내보내기는 프로 플랜 이상에서 사용 가능합니다.",
                "plan": plan_type
            }
        )

    try:
        import pandas as pd
        from openpyxl import Workbook
        from openpyxl.styles import Font, Alignment, PatternFill

        # 데이터 조회
        ranks = db.get_latest_ranks(blog['id'])
        statistics = db.get_statistics(blog['id'])

        # DataFrame 생성
        results_data = []
        for i, r in enumerate(ranks, 1):
            results_data.append({
                "No": i,
                "포스팅 제목": r['post_title'],
                "URL": r['post_url'],
                "키워드": r['keyword'],
                "블로그탭 순위": r['rank_blog_tab'] if r['rank_blog_tab'] else "-",
                "통합검색 순위": r['rank_view_tab'] if r['rank_view_tab'] else "-",
                "블로그탭 분류": classify_rank(r['rank_blog_tab']),
                "통합검색 분류": classify_rank(r['rank_view_tab']),
                "확인일시": str(r['checked_at']) if r.get('checked_at') else "-"
            })

        df_results = pd.DataFrame(results_data)

        # 통계 데이터
        stats_data = [
            {"항목": "총 키워드", "블로그탭": statistics['total_keywords'], "통합검색": statistics['total_keywords']},
            {"항목": "노출 키워드", "블로그탭": statistics['blog_tab']['exposed_count'], "통합검색": statistics['view_tab']['exposed_count']},
            {"항목": "노출률 (%)", "블로그탭": statistics['blog_tab']['exposure_rate'], "통합검색": statistics['view_tab']['exposure_rate']},
            {"항목": "평균 순위", "블로그탭": statistics['blog_tab']['avg_rank'], "통합검색": statistics['view_tab']['avg_rank']},
            {"항목": "최고 순위", "블로그탭": statistics['blog_tab']['best_rank'] or "-", "통합검색": statistics['view_tab']['best_rank'] or "-"},
            {"항목": "최저 순위", "블로그탭": statistics['blog_tab']['worst_rank'] or "-", "통합검색": statistics['view_tab']['worst_rank'] or "-"},
            {"항목": "상위권 (1~3위)", "블로그탭": statistics['blog_tab']['top3_count'], "통합검색": statistics['view_tab']['top3_count']},
            {"항목": "중위권 (4~7위)", "블로그탭": statistics['blog_tab']['mid_count'], "통합검색": statistics['view_tab']['mid_count']},
            {"항목": "하위권 (8~10위)", "블로그탭": statistics['blog_tab']['low_count'], "통합검색": statistics['view_tab']['low_count']},
        ]
        df_stats = pd.DataFrame(stats_data)

        # Excel 파일 생성
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_results.to_excel(writer, sheet_name='상세 결과', index=False)
            df_stats.to_excel(writer, sheet_name='요약 통계', index=False)

        output.seek(0)

        filename = f"blog_rank_report_{blog_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="Excel 내보내기 기능을 사용할 수 없습니다. (pandas/openpyxl 미설치)"
        )


# ============ 백그라운드 작업 ============

async def run_rank_check(task_id: str, tracked_blog_id: int, blog_id: str,
                        max_posts: int = 50, force_refresh: bool = False):
    """백그라운드에서 순위 확인 실행"""
    db = get_rank_tracker_db()

    try:
        logger.info(f"Starting rank check for blog {blog_id}, task {task_id}")

        # 1. 포스팅 수집
        from services.blog_scraper import BlogScraper
        scraper = BlogScraper()

        posts = await scraper.get_blog_posts(blog_id, max_posts)
        if not posts:
            db.complete_task(task_id, "포스팅을 찾을 수 없습니다.")
            return

        logger.info(f"Found {len(posts)} posts for blog {blog_id}")

        # 2. 포스팅 저장 및 키워드 추출
        from services.keyword_extractor import KeywordExtractor
        extractor = KeywordExtractor()

        all_keywords = []
        for post in posts:
            # 포스팅 저장
            saved_post = db.add_tracked_post(
                tracked_blog_id,
                post.get('post_id', ''),
                post.get('title', ''),
                post.get('url', ''),
                post.get('published_date')
            )

            # 키워드 추출 (force_refresh면 기존 키워드 삭제)
            if force_refresh:
                db.delete_post_keywords(saved_post['id'])

            existing_keywords = db.get_post_keywords(saved_post['id'])
            if not existing_keywords or force_refresh:
                keywords = extractor.extract(post.get('title', ''))
                for i, kw in enumerate(keywords[:2]):  # 최대 2개
                    keyword_data = db.add_post_keyword(saved_post['id'], kw, priority=i+1)
                    all_keywords.append({
                        **keyword_data,
                        'post_url': saved_post['url']
                    })
            else:
                for kw in existing_keywords:
                    all_keywords.append({
                        **kw,
                        'post_url': saved_post['url']
                    })

        # 총 키워드 수 업데이트
        total_keywords = len(all_keywords)
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE rank_check_tasks SET total_keywords = ? WHERE task_id = ?",
                (total_keywords, task_id)
            )

        logger.info(f"Total {total_keywords} keywords to check")

        # 3. 순위 조회
        from services.rank_checker import RankChecker
        checker = RankChecker()

        for i, kw_data in enumerate(all_keywords):
            db.update_task_progress(task_id, i, kw_data['keyword'])

            try:
                # 블로그탭 순위
                blog_rank = await checker.check_blog_tab_rank(kw_data['keyword'], blog_id)

                # VIEW탭 순위
                view_rank = await checker.check_view_tab_rank(kw_data['keyword'], kw_data['post_url'])

                # 히스토리 저장
                db.add_rank_history(kw_data['id'], blog_rank, view_rank)

                logger.debug(f"Keyword '{kw_data['keyword']}': blog={blog_rank}, view={view_rank}")

            except Exception as e:
                logger.warning(f"Error checking rank for keyword '{kw_data['keyword']}': {e}")

            # Rate limiting
            await asyncio.sleep(0.5)

        # 4. 완료 처리
        db.update_tracked_blog(tracked_blog_id, last_checked_at=datetime.now().isoformat())
        db.complete_task(task_id)

        logger.info(f"Rank check completed for blog {blog_id}")

    except Exception as e:
        logger.error(f"Rank check failed for blog {blog_id}: {e}")
        db.complete_task(task_id, str(e))
