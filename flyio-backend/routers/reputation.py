"""
평판 모니터링 라우터
리뷰 수집, AI 답변 생성, 삭제/신고 가이드
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Optional
import logging
import asyncio

from database.reputation_db import get_reputation_db
from services.review_crawler import ReviewCrawler
from services.review_ai_service import ReviewAIService

router = APIRouter(prefix="/api/reputation", tags=["평판모니터링"])
logger = logging.getLogger(__name__)

crawler = ReviewCrawler()
ai_service = ReviewAIService()


# ===== Request/Response Models =====

class StoreCreateRequest(BaseModel):
    store_name: str
    naver_place_id: Optional[str] = None
    google_place_id: Optional[str] = None
    kakao_place_id: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None


class GenerateResponseRequest(BaseModel):
    tone: str = "professional"
    custom_instruction: Optional[str] = None


class AlertSettingRequest(BaseModel):
    alert_type: str  # 'negative_review' | 'rating_drop' | 'keyword_mention'
    condition: dict  # {"min_rating": 3} or {"keywords": ["불만"]}
    notification_channel: str = "in_app"
    is_active: bool = True


class TemplateCreateRequest(BaseModel):
    template_name: str
    template_text: str
    tone: str = "professional"
    category: Optional[str] = None


class TemplateUpdateRequest(BaseModel):
    template_name: Optional[str] = None
    template_text: Optional[str] = None
    tone: Optional[str] = None
    category: Optional[str] = None


class CompetitorCreateRequest(BaseModel):
    competitor_name: str
    naver_place_id: Optional[str] = None
    google_place_id: Optional[str] = None
    kakao_place_id: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None


# ===== 가게 관리 =====

@router.post("/stores")
async def create_store(
    req: StoreCreateRequest,
    user_id: str = Query("demo_user", description="사용자 ID"),
):
    """모니터링 대상 가게 등록"""
    db = get_reputation_db()
    try:
        result = db.add_store(
            user_id=user_id,
            store_name=req.store_name,
            naver_place_id=req.naver_place_id,
            google_place_id=req.google_place_id,
            kakao_place_id=req.kakao_place_id,
            category=req.category,
            address=req.address,
        )

        # 등록 직후 리뷰 수집 시작 (백그라운드) — 모든 플랫폼
        if req.naver_place_id:
            asyncio.create_task(
                _collect_reviews_for_store(result["id"], "naver_place", req.naver_place_id)
            )
        if req.google_place_id:
            asyncio.create_task(
                _collect_reviews_for_store(result["id"], "google", req.google_place_id)
            )
        if req.kakao_place_id:
            asyncio.create_task(
                _collect_reviews_for_store(result["id"], "kakao", req.kakao_place_id)
            )

        # 기본 알림 설정 생성 (별점 2 이하 알림)
        db.upsert_alert_setting(
            store_id=result["id"],
            user_id=user_id,
            alert_type="negative_review",
            condition={"min_rating": 2},
            channel="in_app",
        )

        return {"success": True, "store": result}
    except Exception as e:
        logger.error(f"Failed to create store: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stores")
async def get_stores(user_id: str = Query("demo_user")):
    """내 가게 목록 조회"""
    db = get_reputation_db()
    stores = db.get_stores(user_id)
    # 각 가게의 간단 통계 추가
    for store in stores:
        stats = db.get_dashboard_stats(store["id"])
        store["stats"] = stats
    return {"success": True, "stores": stores}


@router.delete("/stores/{store_id}")
async def delete_store(store_id: str, user_id: str = Query("demo_user")):
    """가게 삭제 (비활성화)"""
    db = get_reputation_db()
    deleted = db.delete_store(store_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="가게를 찾을 수 없습니다")
    return {"success": True}


# ===== 리뷰 조회 =====

@router.get("/reviews")
async def get_reviews(
    store_id: str = Query(...),
    platform: Optional[str] = Query(None),
    sentiment: Optional[str] = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
):
    """리뷰 목록 조회 (필터링 지원)"""
    db = get_reputation_db()
    reviews = db.get_reviews(store_id, platform, sentiment, limit, offset)
    total = db.get_review_count(store_id, platform, sentiment)
    return {
        "success": True,
        "reviews": reviews,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/reviews/{review_id}")
async def get_review(review_id: str):
    """리뷰 상세 조회"""
    db = get_reputation_db()
    review = db.get_review(review_id)
    if not review:
        raise HTTPException(status_code=404, detail="리뷰를 찾을 수 없습니다")
    return {"success": True, "review": review}


# ===== 리뷰 수집 (수동) =====

@router.post("/stores/{store_id}/collect")
async def collect_reviews(store_id: str):
    """가게 리뷰 수동 수집 — 기존 블로그 리뷰도 자동 정리"""
    db = get_reputation_db()
    store = db.get_store(store_id)
    if not store:
        raise HTTPException(status_code=404, detail="가게를 찾을 수 없습니다")

    logger.info(f"[CollectAPI] Manual collect triggered: store_id={store_id}, name='{store.get('store_name')}', "
                f"naver={store.get('naver_place_id')}, google={store.get('google_place_id')}, kakao={store.get('kakao_place_id')}")

    # 수집 전 기존 블로그 리뷰 정리
    purged = db.purge_blog_reviews(store_id)
    if purged > 0:
        logger.info(f"[CollectAPI] Purged {purged} old blog reviews before collection")

    collected = 0
    platforms_collected = {}

    # 모든 등록된 플랫폼에서 수집
    platform_map = [
        ("naver_place_id", "naver_place"),
        ("google_place_id", "google"),
        ("kakao_place_id", "kakao"),
    ]

    for field, platform in platform_map:
        if store.get(field):
            try:
                count = await _collect_reviews_for_store(
                    store_id, platform, store[field]
                )
                collected += count
                platforms_collected[platform] = count
            except Exception as e:
                logger.error(f"[CollectAPI] {platform} review collection failed: {e}", exc_info=True)
                platforms_collected[platform] = 0
        else:
            logger.info(f"[CollectAPI] Skipping {platform}: no place_id registered")

    db.update_last_crawled(store_id)
    logger.info(f"[CollectAPI] Collection complete: total={collected}, purged_blog={purged}, by_platform={platforms_collected}")
    return {"success": True, "collected_count": collected, "purged_blog_reviews": purged, "by_platform": platforms_collected}


@router.post("/stores/{store_id}/purge-blog-reviews")
async def purge_blog_reviews(store_id: str):
    """기존 블로그 리뷰 일괄 삭제 (별점 0 + 블로그 제목 패턴)"""
    db = get_reputation_db()
    store = db.get_store(store_id)
    if not store:
        raise HTTPException(status_code=404, detail="가게를 찾을 수 없습니다")

    purged = db.purge_blog_reviews(store_id)
    return {"success": True, "purged_count": purged, "message": f"블로그 리뷰 {purged}건이 삭제되었습니다"}


# ===== AI 답변 =====

@router.post("/reviews/{review_id}/generate-response")
async def generate_ai_response(review_id: str, req: GenerateResponseRequest):
    """리뷰에 대한 AI 답변 생성"""
    db = get_reputation_db()
    review = db.get_review(review_id)
    if not review:
        raise HTTPException(status_code=404, detail="리뷰를 찾을 수 없습니다")

    store = db.get_store(review["store_id"])
    store_name = store["store_name"] if store else "가게"

    result = await ai_service.generate_response(
        review_content=review["content"],
        rating=review["rating"] or 0,
        store_name=store_name,
        tone=req.tone,
        category=review.get("sentiment_category"),
        custom_instruction=req.custom_instruction,
    )

    if result["success"]:
        db.update_review_response(review_id, result["response"], "generated")

    return result


class UpdateResponseRequest(BaseModel):
    response: str
    status: str = "applied"


@router.put("/reviews/{review_id}/response")
async def update_review_response(review_id: str, req: UpdateResponseRequest):
    """답변 수정/저장 (사장님이 수정한 후 저장)"""
    db = get_reputation_db()
    review = db.get_review(review_id)
    if not review:
        raise HTTPException(status_code=404, detail="리뷰를 찾을 수 없습니다")
    db.update_review_response(review_id, req.response, req.status)
    return {"success": True}


# ===== 삭제/신고 가이드 =====

@router.get("/deletion-guide")
async def get_deletion_guide(
    platform: str = Query("naver_place", description="플랫폼 (naver_place, google, kakao)"),
    review_type: str = Query("general", description="리뷰 유형 (general, defamation, insult)"),
):
    """플랫폼별 삭제/신고 가이드"""
    guide = ReviewAIService.get_deletion_guide(platform, review_type)
    return {"success": True, "guide": guide}


# ===== 대시보드 통계 =====

@router.get("/dashboard/{store_id}")
async def get_dashboard(store_id: str):
    """가게 평판 대시보드 데이터"""
    db = get_reputation_db()
    store = db.get_store(store_id)
    if not store:
        raise HTTPException(status_code=404, detail="가게를 찾을 수 없습니다")

    stats = db.get_dashboard_stats(store_id)
    trend = db.get_rating_trend(store_id, days=30)
    recent_negative = db.get_new_negative_reviews(store_id)
    sentiment_trend = db.get_sentiment_trend(store_id, days=30)
    category_breakdown = db.get_category_breakdown(store_id)
    platform_comparison = db.get_platform_comparison(store_id)
    response_stats = db.get_response_stats(store_id)
    keyword_freq = db.get_keyword_frequency(store_id, limit=15)

    return {
        "success": True,
        "store": store,
        "stats": stats,
        "rating_trend": trend,
        "unread_negative_reviews": recent_negative[:5],
        "sentiment_trend": sentiment_trend,
        "category_breakdown": category_breakdown,
        "platform_comparison": platform_comparison,
        "response_stats": response_stats,
        "keyword_frequency": keyword_freq,
    }


# ===== 알림 설정 =====

@router.get("/alerts/settings")
async def get_alert_settings(store_id: str = Query(...)):
    """알림 설정 조회"""
    db = get_reputation_db()
    settings_list = db.get_alert_settings(store_id)
    return {"success": True, "settings": settings_list}


@router.put("/alerts/settings")
async def update_alert_settings(
    store_id: str = Query(...),
    user_id: str = Query("demo_user"),
    req: AlertSettingRequest = ...,
):
    """알림 설정 변경 (is_active=false 시 비활성화)"""
    db = get_reputation_db()
    setting_id = db.upsert_alert_setting(
        store_id=store_id,
        user_id=user_id,
        alert_type=req.alert_type,
        condition=req.condition,
        channel=req.notification_channel,
        is_active=req.is_active,
    )
    return {"success": True, "setting_id": setting_id}


# ===== 가게 검색 =====

@router.get("/search-place")
async def search_place(
    query: str = Query(..., description="가게명 검색"),
    platform: str = Query("naver", description="검색 플랫폼: naver, google, kakao"),
):
    """플랫폼별 가게 검색 (등록 시 사용)"""
    logger.info(f"Place search request: query='{query}', platform='{platform}'")
    try:
        if platform == "google":
            results = await crawler.search_google_place(query)
        elif platform == "kakao":
            results = await crawler.search_kakao_place(query)
        else:
            results = await crawler.search_naver_place(query)

        if not results:
            logger.warning(f"No results found for query='{query}', platform='{platform}'")

        return {"success": True, "places": results, "platform": platform}
    except Exception as e:
        logger.error(f"Place search error: {e}", exc_info=True)
        return {"success": False, "places": [], "platform": platform, "error": str(e)}


@router.get("/search-all-platforms")
async def search_all_platforms(query: str = Query(..., description="가게명 검색")):
    """전 플랫폼 동시 검색 (한 번에 네이버+구글+카카오 검색)"""
    tasks = [
        crawler.search_naver_place(query),
        crawler.search_google_place(query),
        crawler.search_kakao_place(query),
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_places = {
        "naver": results[0] if not isinstance(results[0], Exception) else [],
        "google": results[1] if not isinstance(results[1], Exception) else [],
        "kakao": results[2] if not isinstance(results[2], Exception) else [],
    }

    return {"success": True, "places": all_places}


# ===== 통합 검색 (네이버 + 카카오 병렬) =====

@router.get("/search-unified")
async def search_unified(query: str = Query(..., description="가게명 검색")):
    """네이버 + 카카오 통합 검색 (네이버 우선, 중복 제거)"""
    logger.info(f"Unified search request: query='{query}'")
    try:
        naver_task = crawler.search_naver_place(query)
        kakao_task = crawler.search_kakao_place(query)
        results = await asyncio.gather(naver_task, kakao_task, return_exceptions=True)

        naver_results = results[0] if not isinstance(results[0], Exception) else []
        kakao_results = results[1] if not isinstance(results[1], Exception) else []

        # 병합: 네이버 먼저(메인), 카카오 추가 (중복 제거)
        merged = []
        seen_keys = set()
        for place in list(naver_results) + list(kakao_results):
            # 중복 키: (이름, 도로주소 앞 20자)
            dedup_key = (place.get("name", "").strip(), (place.get("road_address", "") or "")[:20])
            if dedup_key not in seen_keys:
                seen_keys.add(dedup_key)
                merged.append(place)

        source_counts = {
            "naver": len(naver_results) if isinstance(naver_results, list) else 0,
            "kakao": len(kakao_results) if isinstance(kakao_results, list) else 0,
        }

        return {"success": True, "places": merged, "source_counts": source_counts}
    except Exception as e:
        logger.error(f"Unified search error: {e}", exc_info=True)
        return {"success": False, "places": [], "source_counts": {}, "error": str(e)}


# ===== URL 파싱 =====

class UrlParseRequest(BaseModel):
    url: str


@router.post("/parse-place-url")
async def parse_place_url(req: UrlParseRequest):
    """플레이스 URL에서 플랫폼/place_id 추출"""
    logger.info(f"URL parse request: url='{req.url}'")
    try:
        result = await crawler.resolve_place_url(req.url)
        if result and result.get("place_id"):
            return {
                "success": True,
                "platform": result["platform"],
                "place_id": result["place_id"],
            }
        else:
            return {
                "success": False,
                "error": "URL에서 장소 정보를 추출할 수 없습니다. 네이버/카카오/구글 지도 URL을 입력해주세요.",
            }
    except Exception as e:
        logger.error(f"URL parse error: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


# ===== 답변 템플릿 =====

@router.post("/templates")
async def create_template(
    req: TemplateCreateRequest,
    store_id: str = Query(...),
    user_id: str = Query("demo_user"),
):
    """답변 템플릿 생성"""
    db = get_reputation_db()
    result = db.add_template(
        store_id=store_id,
        user_id=user_id,
        template_name=req.template_name,
        template_text=req.template_text,
        tone=req.tone,
        category=req.category,
    )
    return {"success": True, "template": result}


@router.get("/templates")
async def get_templates(store_id: str = Query(...)):
    """답변 템플릿 목록"""
    db = get_reputation_db()
    templates = db.get_templates(store_id)
    return {"success": True, "templates": templates}


@router.put("/templates/{template_id}")
async def update_template(template_id: str, req: TemplateUpdateRequest):
    """답변 템플릿 수정"""
    db = get_reputation_db()
    updated = db.update_template(
        template_id=template_id,
        template_name=req.template_name,
        template_text=req.template_text,
        tone=req.tone,
        category=req.category,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다")
    return {"success": True}


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str):
    """답변 템플릿 삭제"""
    db = get_reputation_db()
    deleted = db.delete_template(template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다")
    return {"success": True}


# ===== 경쟁업체 =====

@router.post("/competitors")
async def add_competitor(
    req: CompetitorCreateRequest,
    store_id: str = Query(...),
):
    """경쟁업체 등록"""
    db = get_reputation_db()
    result = db.add_competitor(
        store_id=store_id,
        competitor_name=req.competitor_name,
        naver_place_id=req.naver_place_id,
        google_place_id=req.google_place_id,
        kakao_place_id=req.kakao_place_id,
        category=req.category,
        address=req.address,
    )

    # 등록 후 바로 리뷰 수집하여 캐시 업데이트 (백그라운드)
    asyncio.create_task(_update_competitor_stats(result["id"], req))

    return {"success": True, "competitor": result}


@router.get("/competitors")
async def get_competitors(store_id: str = Query(...)):
    """경쟁업체 목록 (캐시된 통계 포함)"""
    db = get_reputation_db()
    competitors = db.get_competitors(store_id)
    return {"success": True, "competitors": competitors}


@router.delete("/competitors/{competitor_id}")
async def delete_competitor(competitor_id: str):
    """경쟁업체 삭제"""
    db = get_reputation_db()
    deleted = db.delete_competitor(competitor_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="경쟁업체를 찾을 수 없습니다")
    return {"success": True}


@router.post("/competitors/{competitor_id}/refresh")
async def refresh_competitor(competitor_id: str):
    """경쟁업체 통계 갱신"""
    db = get_reputation_db()
    # competitor_id로 직접 조회
    conn = db._get_connection()
    try:
        row = conn.execute("SELECT * FROM competitors WHERE id = ?", (competitor_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="경쟁업체를 찾을 수 없습니다")
        comp = dict(row)
    finally:
        conn.close()

    req = CompetitorCreateRequest(
        competitor_name=comp["competitor_name"],
        naver_place_id=comp.get("naver_place_id"),
        google_place_id=comp.get("google_place_id"),
        kakao_place_id=comp.get("kakao_place_id"),
    )
    await _update_competitor_stats(competitor_id, req)
    return {"success": True}


# ===== AI 인사이트 리포트 =====

@router.post("/report/generate")
async def generate_insight_report(store_id: str = Query(...)):
    """AI 인사이트 리포트 생성"""
    db = get_reputation_db()
    store = db.get_store(store_id)
    if not store:
        raise HTTPException(status_code=404, detail="가게를 찾을 수 없습니다")

    # 데이터 수집
    stats = db.get_dashboard_stats(store_id)
    reviews = db.get_reviews(store_id, limit=30)
    category_breakdown = db.get_category_breakdown(store_id)
    keyword_freq = db.get_keyword_frequency(store_id, limit=15)

    # AI 인사이트 생성
    result = await ai_service.generate_weekly_insight(
        store_name=store["store_name"],
        reviews=reviews,
        stats=stats,
        category_breakdown=category_breakdown,
        keyword_frequency=keyword_freq,
    )

    if result["success"] and result["report"]:
        db.save_insight_report(store_id, result["report"], "weekly")

    return result


@router.get("/report/{store_id}")
async def get_latest_report(store_id: str):
    """최신 AI 인사이트 리포트 조회"""
    db = get_reputation_db()
    report = db.get_latest_report(store_id)
    if not report:
        return {"success": True, "report": None, "message": "생성된 리포트가 없습니다. 리포트를 생성해주세요."}
    return {"success": True, "report": report["report"], "generated_at": report["generated_at"]}


@router.get("/report/{store_id}/history")
async def get_report_history(store_id: str, limit: int = Query(10)):
    """리포트 히스토리"""
    db = get_reputation_db()
    history = db.get_report_history(store_id, limit)
    return {"success": True, "history": history}


@router.post("/report/competitor-analysis")
async def generate_competitor_analysis(store_id: str = Query(...)):
    """경쟁업체 비교 AI 분석"""
    db = get_reputation_db()
    store = db.get_store(store_id)
    if not store:
        raise HTTPException(status_code=404, detail="가게를 찾을 수 없습니다")

    stats = db.get_dashboard_stats(store_id)
    competitors = db.get_competitors(store_id)

    # 경쟁업체 데이터 가공
    comp_data = []
    for c in competitors:
        comp_data.append({
            "name": c["competitor_name"],
            "avg_rating": c.get("cached_rating", 0),
            "total_reviews": c.get("cached_review_count", 0),
            "negative_count": c.get("cached_negative_count", 0),
        })

    result = await ai_service.generate_competitor_analysis(
        store_name=store["store_name"],
        store_stats=stats,
        competitors=comp_data,
    )
    return result


# ===== 내부 함수 =====

async def _collect_reviews_for_store(store_id: str, platform: str, place_id: str) -> int:
    """가게의 리뷰 수집 + 감성 분석 + DB 저장"""
    db = get_reputation_db()
    collected = 0
    logger.info(f"[Collect] Starting: store_id={store_id}, platform={platform}, place_id={place_id}")

    try:
        raw_reviews = []
        if platform == "naver_place":
            # 가짜 ID인 경우 store_name 전달하여 자동 해결
            store_name = ""
            store = db.get_store(store_id)
            if store:
                store_name = store.get("store_name", "")
            logger.info(f"[Collect] Naver crawl start: place_id={place_id}, is_fake={place_id.startswith('naver_')}, store_name='{store_name}'")
            raw_reviews = await crawler.crawl_naver_place(place_id, max_reviews=50, store_name=store_name)
            logger.info(f"[Collect] Naver crawl result: {len(raw_reviews)} raw reviews")
            # 가짜 ID가 해결되었으면 DB 업데이트
            if place_id.startswith("naver_") and raw_reviews:
                resolved_id = getattr(crawler, '_last_resolved_id', None)
                if resolved_id:
                    try:
                        conn = db._get_connection()
                        conn.execute(
                            "UPDATE monitored_stores SET naver_place_id = ? WHERE id = ?",
                            (resolved_id, store_id)
                        )
                        conn.commit()
                        conn.close()
                        logger.info(f"[Collect] Updated store naver_place_id: {place_id} -> {resolved_id}")
                    except Exception as e:
                        logger.warning(f"[Collect] Failed to update resolved place_id: {e}")
        elif platform == "google":
            raw_reviews = await crawler.crawl_google_reviews(place_id, max_reviews=50)
            logger.info(f"[Collect] Google crawl result: {len(raw_reviews)} raw reviews")
        elif platform == "kakao":
            raw_reviews = await crawler.crawl_kakao_reviews(place_id, max_reviews=50)
            logger.info(f"[Collect] Kakao crawl result: {len(raw_reviews)} raw reviews")
        else:
            logger.warning(f"[Collect] Unknown platform: {platform}")
            return 0

        skipped = 0
        for raw in raw_reviews:
            content = raw.get("content", "").strip()
            rating = raw.get("rating", 0)

            # 방문자/구매자 리뷰 유효성 검증 — 블로그 글/광고 필터링
            is_blog = (
                (rating == 0 and len(content) < 5) or  # 별점 없고 내용도 없음
                "⭐" in content or  # 블로그 제목 패턴
                content.startswith("[블로그 리뷰]") or  # 이전 블로그 리뷰 형식
                (rating == 0 and raw.get("author_name") == "블로거")  # 블로거 작성
            )
            if is_blog:
                skipped += 1
                continue

            # 감성 분석
            sentiment_result = crawler.analyze_sentiment(content, rating)

            # DB 저장 (중복 무시)
            review_id = db.add_review(
                store_id=store_id,
                platform=platform,
                platform_review_id=raw.get("platform_review_id", ""),
                author_name=raw.get("author_name", "익명"),
                rating=rating,
                content=content,
                review_date=raw.get("review_date", ""),
                sentiment=sentiment_result["sentiment"],
                sentiment_score=sentiment_result["score"],
                sentiment_category=sentiment_result.get("category"),
                keywords=sentiment_result.get("keywords", []),
            )

            if review_id:
                collected += 1

        if skipped > 0:
            logger.info(f"[Collect] Filtered out {skipped} blog/invalid reviews for store {store_id}")

        db.update_last_crawled(store_id)
        logger.info(f"Collected {collected} new reviews for store {store_id}")

    except Exception as e:
        logger.error(f"Review collection error for store {store_id}: {e}")

    return collected


async def _update_competitor_stats(competitor_id: str, req: CompetitorCreateRequest):
    """경쟁업체의 리뷰를 수집하여 캐시 업데이트"""
    db = get_reputation_db()
    total_reviews = 0
    total_rating = 0.0
    negative_count = 0

    try:
        all_reviews = []

        if req.naver_place_id:
            try:
                reviews = await crawler.crawl_naver_place(req.naver_place_id, max_reviews=30)
                all_reviews.extend(reviews)
            except Exception as e:
                logger.warning(f"Competitor naver crawl failed: {e}")

        if req.google_place_id:
            try:
                reviews = await crawler.crawl_google_reviews(req.google_place_id, max_reviews=30)
                all_reviews.extend(reviews)
            except Exception as e:
                logger.warning(f"Competitor google crawl failed: {e}")

        if req.kakao_place_id:
            try:
                reviews = await crawler.crawl_kakao_reviews(req.kakao_place_id, max_reviews=30)
                all_reviews.extend(reviews)
            except Exception as e:
                logger.warning(f"Competitor kakao crawl failed: {e}")

        for r in all_reviews:
            rating = r.get("rating", 0)
            if rating > 0:
                total_reviews += 1
                total_rating += rating
            # 감성 분석
            sentiment = crawler.analyze_sentiment(r.get("content", ""), rating)
            if sentiment["sentiment"] == "negative":
                negative_count += 1

        avg_rating = round(total_rating / total_reviews, 1) if total_reviews > 0 else 0
        db.update_competitor_cache(competitor_id, avg_rating, total_reviews, negative_count)
        logger.info(f"Updated competitor {competitor_id}: rating={avg_rating}, reviews={total_reviews}")

    except Exception as e:
        logger.error(f"Competitor stats update failed: {e}")


# ===== 백그라운드 스케줄러 =====

async def reputation_monitor_loop():
    """백그라운드 리뷰 수집 루프 (main.py에서 호출)"""
    while True:
        try:
            db = get_reputation_db()
            stores = db.get_all_active_stores()
            logger.info(f"[Reputation] Polling {len(stores)} active stores")

            for store in stores:
                try:
                    # 모든 등록된 플랫폼에서 수집
                    platform_fields = [
                        ("naver_place_id", "naver_place"),
                        ("google_place_id", "google"),
                        ("kakao_place_id", "kakao"),
                    ]
                    for field, platform in platform_fields:
                        if store.get(field):
                            try:
                                await _collect_reviews_for_store(
                                    store["id"], platform, store[field]
                                )
                            except Exception as e:
                                logger.warning(f"[Reputation] {platform} collection failed for store {store['id']}: {e}")
                            await asyncio.sleep(1)

                    # 새 부정 리뷰 알림 (인앱)
                    new_negatives = db.get_new_negative_reviews(store["id"])
                    if new_negatives:
                        try:
                            from database.notification_db import NotificationDB
                            noti_db = NotificationDB()
                            for review in new_negatives:
                                noti_db.create_notification(
                                    user_id=store["user_id"],
                                    notification_type="in_app",
                                    category="alert",
                                    title=f"새 부정 리뷰 알림",
                                    message=f"[{store['store_name']}] 별점 {review['rating']}점 리뷰: {review['content'][:50]}...",
                                    data={"store_id": store["id"], "review_id": review["id"]},
                                )
                                db.mark_alerted(review["id"])
                        except Exception as e:
                            logger.warning(f"Failed to send notification: {e}")

                except Exception as e:
                    logger.error(f"[Reputation] Error processing store {store.get('id')}: {e}")

                # 가게 간 딜레이
                await asyncio.sleep(2)

        except Exception as e:
            logger.error(f"[Reputation] Monitor loop error: {e}")

        # 5분 대기
        await asyncio.sleep(300)
