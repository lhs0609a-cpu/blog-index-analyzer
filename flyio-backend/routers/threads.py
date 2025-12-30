"""
Threads 자동화 시스템 - API 라우터
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Optional
import logging
from datetime import datetime, timedelta

from database.threads_db import (
    create_persona, get_persona, get_user_personas, update_persona, delete_persona,
    create_campaign, get_campaign, get_user_campaigns, update_campaign, delete_campaign,
    create_content_posts_bulk, get_campaign_posts, get_post, update_post,
    delete_campaign_posts, get_campaign_stats, log_ai_generation,
    save_threads_account, get_threads_account, get_user_threads_accounts, delete_threads_account,
    save_api_credentials, get_api_credentials, delete_api_credentials
)
from services.threads_content_service import threads_content_service
from services.threads_api_service import ThreadsAPIService

router = APIRouter(prefix="/api/threads", tags=["threads"])
logger = logging.getLogger(__name__)


# ===== Request/Response Models =====

class PersonaCreate(BaseModel):
    name: str
    age: Optional[int] = 28
    job: Optional[str] = None
    personality: Optional[str] = None
    tone: Optional[str] = "friendly"
    interests: Optional[List[str]] = []
    background_story: Optional[str] = None
    emoji_usage: Optional[str] = "moderate"


class PersonaUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    job: Optional[str] = None
    personality: Optional[str] = None
    tone: Optional[str] = None
    interests: Optional[List[str]] = None
    background_story: Optional[str] = None
    emoji_usage: Optional[str] = None


class CampaignCreate(BaseModel):
    name: str
    brand_name: str
    persona_id: Optional[str] = None
    brand_description: Optional[str] = None
    target_audience: Optional[str] = None
    final_goal: Optional[str] = None
    duration_days: Optional[int] = 90
    start_date: Optional[str] = None
    posts_per_day: Optional[int] = 1


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    brand_name: Optional[str] = None
    persona_id: Optional[str] = None
    brand_description: Optional[str] = None
    target_audience: Optional[str] = None
    final_goal: Optional[str] = None
    status: Optional[str] = None


class PostUpdate(BaseModel):
    content: Optional[str] = None
    scheduled_at: Optional[str] = None
    hashtags: Optional[List[str]] = None
    status: Optional[str] = None


class GeneratePlanRequest(BaseModel):
    use_ai: Optional[bool] = True
    regenerate: Optional[bool] = False


class RegeneratePostRequest(BaseModel):
    layer: Optional[str] = None
    content_type: Optional[str] = None
    emotion: Optional[str] = None


class APICredentialsRequest(BaseModel):
    app_id: str
    app_secret: str
    redirect_uri: Optional[str] = None


# ===== API 자격증명 관리 =====

@router.post("/api-credentials")
async def save_user_api_credentials(
    data: APICredentialsRequest,
    user_id: str = "default"
):
    """사용자의 Threads API 자격증명 저장"""
    try:
        cred_id = save_api_credentials(
            user_id=user_id,
            app_id=data.app_id,
            app_secret=data.app_secret,
            redirect_uri=data.redirect_uri
        )
        return {"success": True, "credential_id": cred_id}
    except Exception as e:
        logger.error(f"Error saving API credentials: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api-credentials")
async def get_user_api_credentials(user_id: str = "default"):
    """사용자의 API 자격증명 조회 (비밀키는 마스킹)"""
    credentials = get_api_credentials(user_id)
    if not credentials:
        return {"success": True, "has_credentials": False, "credentials": None}

    # 비밀키 마스킹
    masked = {
        "app_id": credentials["app_id"],
        "app_secret": credentials["app_secret"][:4] + "****" + credentials["app_secret"][-4:] if len(credentials["app_secret"]) > 8 else "****",
        "redirect_uri": credentials.get("redirect_uri"),
        "created_at": credentials.get("created_at"),
        "updated_at": credentials.get("updated_at")
    }
    return {"success": True, "has_credentials": True, "credentials": masked}


@router.delete("/api-credentials")
async def delete_user_api_credentials(user_id: str = "default"):
    """사용자의 API 자격증명 삭제"""
    success = delete_api_credentials(user_id)
    if not success:
        raise HTTPException(status_code=404, detail="No credentials found")
    return {"success": True, "message": "API credentials deleted"}


# ===== 페르소나 API =====

@router.post("/personas")
async def api_create_persona(
    data: PersonaCreate,
    user_id: str = "default"  # TODO: 실제 인증에서 가져오기
):
    """페르소나 생성"""
    try:
        persona_id = create_persona(
            user_id=user_id,
            name=data.name,
            age=data.age,
            job=data.job,
            personality=data.personality,
            tone=data.tone,
            interests=data.interests,
            background_story=data.background_story,
            emoji_usage=data.emoji_usage
        )
        return {"success": True, "persona_id": persona_id}
    except Exception as e:
        logger.error(f"Error creating persona: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/personas")
async def api_get_personas(user_id: str = "default"):
    """사용자의 모든 페르소나 조회"""
    try:
        personas = get_user_personas(user_id)
        return {"success": True, "personas": personas}
    except Exception as e:
        logger.error(f"Error getting personas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/personas/{persona_id}")
async def api_get_persona(persona_id: str):
    """페르소나 상세 조회"""
    persona = get_persona(persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    return {"success": True, "persona": persona}


@router.patch("/personas/{persona_id}")
async def api_update_persona(persona_id: str, data: PersonaUpdate):
    """페르소나 수정"""
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    success = update_persona(persona_id, **update_data)
    if not success:
        raise HTTPException(status_code=404, detail="Persona not found")

    return {"success": True}


@router.delete("/personas/{persona_id}")
async def api_delete_persona(persona_id: str):
    """페르소나 삭제"""
    success = delete_persona(persona_id)
    if not success:
        raise HTTPException(status_code=404, detail="Persona not found")
    return {"success": True}


# ===== 캠페인 API =====

@router.post("/campaigns")
async def api_create_campaign(
    data: CampaignCreate,
    user_id: str = "default"
):
    """캠페인 생성"""
    try:
        campaign_id = create_campaign(
            user_id=user_id,
            name=data.name,
            brand_name=data.brand_name,
            persona_id=data.persona_id,
            brand_description=data.brand_description,
            target_audience=data.target_audience,
            final_goal=data.final_goal,
            duration_days=data.duration_days,
            start_date=data.start_date,
            posts_per_day=data.posts_per_day
        )
        return {"success": True, "campaign_id": campaign_id}
    except Exception as e:
        logger.error(f"Error creating campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/campaigns")
async def api_get_campaigns(user_id: str = "default"):
    """사용자의 모든 캠페인 조회"""
    try:
        campaigns = get_user_campaigns(user_id)
        return {"success": True, "campaigns": campaigns}
    except Exception as e:
        logger.error(f"Error getting campaigns: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/campaigns/{campaign_id}")
async def api_get_campaign(campaign_id: str):
    """캠페인 상세 조회"""
    campaign = get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # 통계 추가
    stats = get_campaign_stats(campaign_id)
    campaign["stats"] = stats

    return {"success": True, "campaign": campaign}


@router.patch("/campaigns/{campaign_id}")
async def api_update_campaign(campaign_id: str, data: CampaignUpdate):
    """캠페인 수정"""
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    success = update_campaign(campaign_id, **update_data)
    if not success:
        raise HTTPException(status_code=404, detail="Campaign not found")

    return {"success": True}


@router.delete("/campaigns/{campaign_id}")
async def api_delete_campaign(campaign_id: str):
    """캠페인 삭제"""
    success = delete_campaign(campaign_id)
    if not success:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return {"success": True}


# ===== 콘텐츠 플랜 생성 API =====

@router.post("/campaigns/{campaign_id}/generate-plan")
async def api_generate_plan(campaign_id: str, data: GeneratePlanRequest):
    """AI 콘텐츠 플랜 생성"""
    campaign = get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # 페르소나 조회
    persona = None
    if campaign.get("persona_id"):
        persona = get_persona(campaign["persona_id"])

    if not persona:
        # 기본 페르소나 사용
        persona = {
            "name": "민지",
            "age": 28,
            "job": "마케터",
            "personality": "밝고 긍정적",
            "tone": "friendly",
            "interests": ["카페", "맛집", "여행"]
        }

    # 기존 게시물 삭제 (재생성인 경우)
    if data.regenerate:
        delete_campaign_posts(campaign_id)

    # 기존 게시물 있는지 확인
    existing_posts = get_campaign_posts(campaign_id)
    if existing_posts and not data.regenerate:
        return {
            "success": True,
            "message": "Plan already exists",
            "total_posts": len(existing_posts)
        }

    try:
        # 1. 플랜 구조 생성
        plan_structure = await threads_content_service.generate_plan_structure(
            persona=persona,
            campaign=campaign
        )

        # 2. AI로 콘텐츠 생성 (또는 템플릿)
        if data.use_ai:
            posts = await threads_content_service.generate_content_with_ai(
                persona=persona,
                campaign=campaign,
                plan_structure=plan_structure
            )
        else:
            posts = threads_content_service._generate_template_content(
                persona=persona,
                campaign=campaign,
                posts=plan_structure
            )

        # 3. 플랜 검증
        validation = threads_content_service.validate_plan(posts)

        # 4. DB에 저장
        posts_to_save = []
        for post in posts:
            posts_to_save.append({
                "campaign_id": campaign_id,
                "day_number": post["day_number"],
                "layer": post.get("layer", "daily"),
                "content_type": post.get("content_type", "mood"),
                "arc_phase": post.get("phase", "warmup"),
                "emotion": post.get("emotion", "neutral"),
                "content": post["content"],
                "hashtags": post.get("hashtags", [])
            })

        created_count = create_content_posts_bulk(posts_to_save)

        # 5. AI 생성 로그
        log_ai_generation(
            campaign_id=campaign_id,
            prompt=f"Generated {created_count} posts for campaign",
            response=f"Validation score: {validation['score']}",
            model="gpt-4o-mini" if data.use_ai else "template",
            tokens_used=0
        )

        return {
            "success": True,
            "total_posts": created_count,
            "validation": validation
        }

    except Exception as e:
        logger.error(f"Error generating plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/campaigns/{campaign_id}/posts")
async def api_get_campaign_posts(
    campaign_id: str,
    status: Optional[str] = None
):
    """캠페인의 게시물 목록 조회"""
    campaign = get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    posts = get_campaign_posts(campaign_id, status)

    return {
        "success": True,
        "campaign_id": campaign_id,
        "total_posts": len(posts),
        "posts": posts
    }


@router.get("/campaigns/{campaign_id}/calendar")
async def api_get_campaign_calendar(
    campaign_id: str,
    month: Optional[str] = None
):
    """캘린더 형태로 게시물 조회"""
    campaign = get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    posts = get_campaign_posts(campaign_id)

    # 날짜별로 그룹핑
    calendar = {}
    start_date = datetime.strptime(campaign["start_date"], "%Y-%m-%d")

    for post in posts:
        post_date = start_date + timedelta(days=post["day_number"] - 1)
        date_str = post_date.strftime("%Y-%m-%d")

        if date_str not in calendar:
            calendar[date_str] = []

        calendar[date_str].append({
            "id": post["id"],
            "day_number": post["day_number"],
            "content": post["content"],
            "layer": post["layer"],
            "content_type": post["content_type"],
            "emotion": post["emotion"],
            "status": post["status"]
        })

    return {
        "success": True,
        "campaign_id": campaign_id,
        "start_date": campaign["start_date"],
        "end_date": campaign["end_date"],
        "calendar": calendar
    }


@router.patch("/campaigns/{campaign_id}/posts/{post_id}")
async def api_update_post(
    campaign_id: str,
    post_id: str,
    data: PostUpdate
):
    """게시물 수정"""
    post = get_post(post_id)
    if not post or post["campaign_id"] != campaign_id:
        raise HTTPException(status_code=404, detail="Post not found")

    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    success = update_post(post_id, **update_data)
    return {"success": success}


@router.post("/campaigns/{campaign_id}/posts/{post_id}/regenerate")
async def api_regenerate_post(
    campaign_id: str,
    post_id: str,
    data: RegeneratePostRequest
):
    """게시물 AI 재생성"""
    post = get_post(post_id)
    if not post or post["campaign_id"] != campaign_id:
        raise HTTPException(status_code=404, detail="Post not found")

    campaign = get_campaign(campaign_id)
    persona = None
    if campaign.get("persona_id"):
        persona = get_persona(campaign["persona_id"])

    if not persona:
        persona = {
            "name": "민지", "age": 28, "job": "마케터",
            "tone": "friendly", "interests": ["카페", "맛집"]
        }

    # 이전 게시물 컨텍스트
    all_posts = get_campaign_posts(campaign_id)
    recent_posts = [p for p in all_posts if p["day_number"] < post["day_number"]][-5:]

    try:
        new_content = await threads_content_service.generate_single_post(
            persona=persona,
            campaign=campaign,
            day_number=post["day_number"],
            layer=data.layer or post["layer"],
            content_type=data.content_type or post["content_type"],
            emotion=data.emotion or post["emotion"],
            recent_posts=recent_posts
        )

        update_post(post_id, content=new_content)

        return {
            "success": True,
            "new_content": new_content
        }

    except Exception as e:
        logger.error(f"Error regenerating post: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== 통계 API =====

@router.get("/campaigns/{campaign_id}/stats")
async def api_get_campaign_stats(campaign_id: str):
    """캠페인 통계 조회"""
    campaign = get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    stats = get_campaign_stats(campaign_id)
    posts = get_campaign_posts(campaign_id)

    # 레이어별 분포
    layer_dist = {}
    for post in posts:
        layer = post.get("layer", "daily")
        layer_dist[layer] = layer_dist.get(layer, 0) + 1

    # Phase별 분포
    phase_dist = {}
    for post in posts:
        phase = post.get("arc_phase", "warmup")
        phase_dist[phase] = phase_dist.get(phase, 0) + 1

    return {
        "success": True,
        "campaign_id": campaign_id,
        "stats": stats,
        "layer_distribution": layer_dist,
        "phase_distribution": phase_dist
    }


# ===== 캠페인 상태 관리 =====

@router.post("/campaigns/{campaign_id}/start")
async def api_start_campaign(campaign_id: str):
    """캠페인 시작 (자동 게시 활성화)"""
    campaign = get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # 게시물 있는지 확인
    posts = get_campaign_posts(campaign_id)
    if not posts:
        raise HTTPException(status_code=400, detail="No posts in campaign. Generate plan first.")

    update_campaign(campaign_id, status="active")
    return {"success": True, "message": "Campaign started"}


@router.post("/campaigns/{campaign_id}/pause")
async def api_pause_campaign(campaign_id: str):
    """캠페인 일시정지"""
    campaign = get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    update_campaign(campaign_id, status="paused")
    return {"success": True, "message": "Campaign paused"}


@router.post("/campaigns/{campaign_id}/resume")
async def api_resume_campaign(campaign_id: str):
    """캠페인 재개"""
    campaign = get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    update_campaign(campaign_id, status="active")
    return {"success": True, "message": "Campaign resumed"}


# ===== Threads 계정 연결 (OAuth) =====

# 서비스 레벨 API 인스턴스 (서버 환경변수 사용)
from config import settings

def _get_api_service() -> ThreadsAPIService:
    """서비스 레벨 ThreadsAPIService 인스턴스"""
    if not settings.THREADS_APP_ID or not settings.THREADS_APP_SECRET:
        raise HTTPException(status_code=500, detail="Threads API가 설정되지 않았습니다.")
    return ThreadsAPIService()


@router.get("/auth/url")
async def get_threads_auth_url(user_id: str = "default"):
    """Threads OAuth 인증 URL 반환"""
    api_service = _get_api_service()
    auth_url = api_service.get_authorization_url(state=user_id)
    return {"success": True, "auth_url": auth_url}


@router.get("/auth/callback")
async def threads_auth_callback(code: str, state: str = "default"):
    """OAuth 콜백 - 인증 코드를 토큰으로 교환"""
    try:
        api_service = _get_api_service()

        # 1. 단기 토큰 발급
        token_data = await api_service.exchange_code_for_token(code)
        short_lived_token = token_data.get("access_token")
        threads_user_id = token_data.get("user_id")

        if not short_lived_token:
            raise HTTPException(status_code=400, detail="Failed to get access token")

        # 2. 장기 토큰으로 교환 (60일)
        long_lived_data = await api_service.get_long_lived_token(short_lived_token)
        access_token = long_lived_data.get("access_token")
        expires_in = long_lived_data.get("expires_in", 5184000)  # 60일

        # 3. 프로필 정보 가져오기
        profile = await api_service.get_user_profile(access_token, threads_user_id)

        # 4. DB에 저장
        save_threads_account(
            user_id=state,
            threads_user_id=threads_user_id,
            username=profile.get("username"),
            access_token=access_token,
            token_expires_at=datetime.now() + timedelta(seconds=expires_in)
        )

        return {
            "success": True,
            "message": "Threads account connected",
            "username": profile.get("username"),
            "threads_user_id": threads_user_id
        }

    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/accounts")
async def get_connected_accounts(user_id: str = "default"):
    """연결된 Threads 계정 목록"""
    accounts = get_user_threads_accounts(user_id)
    # 토큰은 숨김
    for account in accounts:
        account.pop("access_token", None)
    return {"success": True, "accounts": accounts}


@router.delete("/accounts/{account_id}")
async def disconnect_threads_account(account_id: str):
    """Threads 계정 연결 해제"""
    success = delete_threads_account(account_id)
    if not success:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"success": True, "message": "Account disconnected"}


@router.post("/accounts/{account_id}/refresh")
async def refresh_account_token(account_id: str):
    """토큰 갱신"""
    account = get_threads_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        api_service = _get_api_service()
        new_token_data = await api_service.refresh_long_lived_token(account["access_token"])
        new_token = new_token_data.get("access_token")
        expires_in = new_token_data.get("expires_in", 5184000)

        # DB 업데이트
        save_threads_account(
            user_id=account["user_id"],
            threads_user_id=account["threads_user_id"],
            username=account["username"],
            access_token=new_token,
            token_expires_at=datetime.now() + timedelta(seconds=expires_in)
        )

        return {"success": True, "message": "Token refreshed"}
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== Threads 게시물 발행 =====

@router.post("/campaigns/{campaign_id}/posts/{post_id}/publish")
async def publish_post_to_threads(campaign_id: str, post_id: str, account_id: str = None):
    """게시물을 Threads에 발행"""
    post = get_post(post_id)
    if not post or post["campaign_id"] != campaign_id:
        raise HTTPException(status_code=404, detail="Post not found")

    campaign = get_campaign(campaign_id)
    user_id = campaign.get("user_id", "default")

    # 연결된 계정 찾기
    accounts = get_user_threads_accounts(user_id)
    if not accounts:
        raise HTTPException(status_code=400, detail="No connected Threads account")

    account = accounts[0] if not account_id else next((a for a in accounts if a["id"] == account_id), None)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        api_service = _get_api_service()

        # Threads에 게시
        result = await api_service.create_text_post(
            access_token=account["access_token"],
            user_id=account["threads_user_id"],
            text=post["content"]
        )

        # 게시물 상태 업데이트
        update_post(post_id, status="posted", threads_post_id=result.get("id"))

        return {
            "success": True,
            "threads_post_id": result.get("id"),
            "message": "Post published to Threads"
        }
    except Exception as e:
        logger.error(f"Publish error: {e}")
        update_post(post_id, status="failed")
        raise HTTPException(status_code=500, detail=str(e))


# ===== Threads 답글/멘션 =====

@router.get("/accounts/{account_id}/mentions")
async def get_account_mentions(account_id: str):
    """Threads 멘션 조회"""
    account = get_threads_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        api_service = _get_api_service()
        mentions = await api_service.get_mentions(
            access_token=account["access_token"],
            user_id=account["threads_user_id"]
        )
        return {"success": True, "mentions": mentions.get("data", [])}
    except Exception as e:
        logger.error(f"Get mentions error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/accounts/{account_id}/reply")
async def reply_to_thread(account_id: str, reply_to_id: str, text: str):
    """Threads 답글 작성"""
    account = get_threads_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        api_service = _get_api_service()
        result = await api_service.reply_to_thread(
            access_token=account["access_token"],
            user_id=account["threads_user_id"],
            reply_to_id=reply_to_id,
            text=text
        )
        return {"success": True, "reply_id": result.get("id")}
    except Exception as e:
        logger.error(f"Reply error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== Threads 인사이트 =====

@router.get("/accounts/{account_id}/insights")
async def get_account_insights(account_id: str):
    """Threads 계정 인사이트"""
    account = get_threads_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        api_service = _get_api_service()
        insights = await api_service.get_user_insights(
            access_token=account["access_token"],
            user_id=account["threads_user_id"]
        )
        return {"success": True, "insights": insights}
    except Exception as e:
        logger.error(f"Get insights error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== Meta 앱 콜백 (필수) =====

@router.post("/deauthorize")
@router.get("/deauthorize")
async def deauthorize_callback():
    """
    사용자가 앱 권한을 제거할 때 호출되는 콜백
    Meta 앱 설정에서 필수로 요구됨
    """
    logger.info("Deauthorize callback received")
    # Meta는 signed_request 파라미터를 보냄 (선택적 처리)
    # 실제로는 해당 사용자의 토큰을 무효화해야 함
    return {"success": True}


@router.post("/data-deletion")
@router.get("/data-deletion")
async def data_deletion_callback():
    """
    사용자가 데이터 삭제를 요청할 때 호출되는 콜백
    GDPR 규정 준수를 위해 Meta 앱 설정에서 필수로 요구됨
    """
    logger.info("Data deletion callback received")
    # 실제로는 사용자 데이터 삭제 처리 필요
    # Meta는 confirmation_code를 반환하길 기대함
    return {
        "url": "https://blog-index-analyzer.vercel.app/data-deletion-status",
        "confirmation_code": "deletion_pending"
    }
