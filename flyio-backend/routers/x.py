"""
X (Twitter) 자동화 API 라우터
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import secrets
import logging

from database import x_db
from services import x_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/x", tags=["X Automation"])


# ========== Pydantic 모델 ==========

class XCampaignCreate(BaseModel):
    name: str
    brand_name: str
    brand_description: Optional[str] = None
    target_audience: Optional[str] = None
    final_goal: Optional[str] = None
    persona_id: Optional[str] = None
    account_id: Optional[str] = None
    duration_days: int = 90
    content_style: str = "casual"


class XCampaignUpdate(BaseModel):
    name: Optional[str] = None
    brand_name: Optional[str] = None
    brand_description: Optional[str] = None
    target_audience: Optional[str] = None
    final_goal: Optional[str] = None
    account_id: Optional[str] = None
    status: Optional[str] = None
    content_style: Optional[str] = None


class XPostCreate(BaseModel):
    campaign_id: str
    content: str
    content_type: str = "regular"
    hashtags: Optional[List[str]] = None
    scheduled_at: Optional[datetime] = None


class GenerateContentRequest(BaseModel):
    campaign_id: str
    generate_count: Optional[int] = None  # None이면 duration_days 기준 자동 계산


class PostTweetRequest(BaseModel):
    account_id: str
    content: str
    reply_to: Optional[str] = None


class XPersonaCreate(BaseModel):
    name: str
    age: Optional[int] = None
    job: Optional[str] = None
    personality: Optional[str] = None
    tone: str = "friendly"
    interests: Optional[List[str]] = None
    background_story: Optional[str] = None
    speech_patterns: Optional[List[str]] = None
    emoji_usage: str = "moderate"
    avatar_url: Optional[str] = None


class XPersonaUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    job: Optional[str] = None
    personality: Optional[str] = None
    tone: Optional[str] = None
    interests: Optional[List[str]] = None
    background_story: Optional[str] = None
    speech_patterns: Optional[List[str]] = None
    emoji_usage: Optional[str] = None
    avatar_url: Optional[str] = None


# ========== OAuth 인증 ==========

@router.get("/auth/url")
async def get_x_auth_url(user_id: int = Query(...)):
    """X OAuth 인증 URL 생성"""
    state = f"{user_id}_{secrets.token_urlsafe(16)}"
    auth_url = x_service.get_auth_url(state)
    return {"auth_url": auth_url, "state": state}


@router.get("/auth/callback")
async def x_auth_callback(code: str, state: str):
    """X OAuth 콜백 처리"""
    try:
        # state에서 user_id 추출
        user_id = int(state.split("_")[0])

        # 토큰 교환
        token_data = await x_service.exchange_code_for_token(code, state)
        if not token_data:
            raise HTTPException(status_code=400, detail="토큰 교환 실패")

        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in", 7200)

        # 사용자 정보 조회
        user_info = await x_service.get_user_info(access_token)
        if not user_info:
            raise HTTPException(status_code=400, detail="사용자 정보 조회 실패")

        # 계정 저장
        token_expires_at = datetime.now().timestamp() + expires_in
        account_id = x_db.create_x_account(
            user_id=user_id,
            x_user_id=user_info.get("id"),
            username=user_info.get("username"),
            name=user_info.get("name"),
            access_token=access_token,
            refresh_token=refresh_token,
            token_expires_at=datetime.fromtimestamp(token_expires_at),
            profile_image_url=user_info.get("profile_image_url")
        )

        # 프론트엔드로 리다이렉트
        return {
            "success": True,
            "account_id": account_id,
            "username": user_info.get("username"),
            "message": "X 계정이 연결되었습니다."
        }

    except Exception as e:
        logger.error(f"X auth callback error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== 계정 관리 ==========

@router.get("/accounts")
async def get_x_accounts(user_id: Optional[int] = None):
    """X 계정 목록 조회"""
    accounts = x_db.get_x_accounts(user_id)
    return {"accounts": accounts}


@router.get("/accounts/{account_id}")
async def get_x_account(account_id: str):
    """X 계정 상세 조회"""
    account = x_db.get_x_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다.")

    # 토큰 정보는 제외하고 반환
    return {
        "id": account["id"],
        "x_user_id": account["x_user_id"],
        "username": account["username"],
        "name": account["name"],
        "profile_image_url": account["profile_image_url"],
        "created_at": account["created_at"]
    }


@router.delete("/accounts/{account_id}")
async def delete_x_account(account_id: str):
    """X 계정 연결 해제"""
    success = x_db.delete_x_account(account_id)
    if not success:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다.")
    return {"success": True, "message": "계정 연결이 해제되었습니다."}


# ========== 캠페인 관리 ==========

@router.post("/campaigns")
async def create_x_campaign(request: XCampaignCreate, user_id: int = Query(...)):
    """X 캠페인 생성"""
    campaign_id = x_db.create_x_campaign(
        user_id=user_id,
        name=request.name,
        brand_name=request.brand_name,
        brand_description=request.brand_description,
        target_audience=request.target_audience,
        final_goal=request.final_goal,
        persona_id=request.persona_id,
        account_id=request.account_id,
        duration_days=request.duration_days,
        content_style=request.content_style
    )
    return {"campaign_id": campaign_id, "message": "캠페인이 생성되었습니다."}


@router.get("/campaigns")
async def get_x_campaigns(user_id: Optional[int] = None):
    """X 캠페인 목록 조회"""
    campaigns = x_db.get_x_campaigns(user_id)
    return {"campaigns": campaigns}


@router.get("/campaigns/{campaign_id}")
async def get_x_campaign(campaign_id: str):
    """X 캠페인 상세 조회"""
    campaign = x_db.get_x_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="캠페인을 찾을 수 없습니다.")
    return {"campaign": campaign}


@router.put("/campaigns/{campaign_id}")
async def update_x_campaign(campaign_id: str, request: XCampaignUpdate):
    """X 캠페인 업데이트"""
    update_data = request.dict(exclude_unset=True)
    success = x_db.update_x_campaign(campaign_id, **update_data)
    if not success:
        raise HTTPException(status_code=404, detail="캠페인을 찾을 수 없습니다.")
    return {"success": True, "message": "캠페인이 업데이트되었습니다."}


@router.delete("/campaigns/{campaign_id}")
async def delete_x_campaign(campaign_id: str):
    """X 캠페인 삭제"""
    success = x_db.delete_x_campaign(campaign_id)
    if not success:
        raise HTTPException(status_code=404, detail="캠페인을 찾을 수 없습니다.")
    return {"success": True, "message": "캠페인이 삭제되었습니다."}


@router.post("/campaigns/{campaign_id}/activate")
async def activate_x_campaign(campaign_id: str):
    """X 캠페인 활성화"""
    campaign = x_db.get_x_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="캠페인을 찾을 수 없습니다.")

    if not campaign.get("account_id"):
        raise HTTPException(status_code=400, detail="X 계정을 먼저 연결해주세요.")

    success = x_db.update_x_campaign(campaign_id, status="active")
    return {"success": success, "message": "캠페인이 활성화되었습니다."}


@router.post("/campaigns/{campaign_id}/pause")
async def pause_x_campaign(campaign_id: str):
    """X 캠페인 일시중지"""
    success = x_db.update_x_campaign(campaign_id, status="paused")
    if not success:
        raise HTTPException(status_code=404, detail="캠페인을 찾을 수 없습니다.")
    return {"success": True, "message": "캠페인이 일시중지되었습니다."}


# ========== 콘텐츠 생성 ==========

@router.post("/campaigns/{campaign_id}/generate")
async def generate_x_content(campaign_id: str, request: GenerateContentRequest):
    """X 캠페인 콘텐츠 자동 생성"""
    campaign = x_db.get_x_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="캠페인을 찾을 수 없습니다.")

    # 콘텐츠 생성
    posts = x_service.XContentGenerator.generate_campaign_content(
        brand_name=campaign["brand_name"],
        brand_description=campaign.get("brand_description", ""),
        target_audience=campaign.get("target_audience", ""),
        final_goal=campaign.get("final_goal", ""),
        duration_days=campaign.get("duration_days", 90),
        content_style=campaign.get("content_style", "casual")
    )

    # 생성 개수 제한
    if request.generate_count and request.generate_count < len(posts):
        posts = posts[:request.generate_count]

    # DB에 저장
    created_count = x_db.bulk_create_x_posts(campaign_id, posts)

    return {
        "success": True,
        "created_count": created_count,
        "message": f"{created_count}개의 게시물이 생성되었습니다."
    }


# ========== 게시물 관리 ==========

@router.get("/campaigns/{campaign_id}/posts")
async def get_x_posts(campaign_id: str, status: Optional[str] = None):
    """X 게시물 목록 조회"""
    posts = x_db.get_x_posts(campaign_id, status)
    return {"posts": posts}


@router.post("/posts")
async def create_x_post(request: XPostCreate):
    """X 게시물 개별 생성"""
    post_id = x_db.create_x_post(
        campaign_id=request.campaign_id,
        content=request.content,
        content_type=request.content_type,
        hashtags=request.hashtags,
        scheduled_at=request.scheduled_at
    )
    return {"post_id": post_id, "message": "게시물이 생성되었습니다."}


@router.delete("/posts/{post_id}")
async def delete_x_post(post_id: str):
    """X 게시물 삭제"""
    from database.x_db import get_connection
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM x_posts WHERE id = ?", (post_id,))
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다.")
    finally:
        conn.close()
    return {"success": True, "message": "게시물이 삭제되었습니다."}


# ========== 수동 게시 ==========

@router.post("/tweet")
async def post_tweet_now(request: PostTweetRequest):
    """트윗 즉시 게시"""
    account = x_db.get_x_account(request.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다.")

    result = await x_service.post_tweet(
        access_token=account["access_token"],
        text=request.content,
        reply_to=request.reply_to
    )

    if not result:
        raise HTTPException(status_code=500, detail="트윗 게시에 실패했습니다.")

    return {
        "success": True,
        "tweet_id": result.get("id"),
        "message": "트윗이 게시되었습니다."
    }


# ========== 통계 ==========

@router.get("/campaigns/{campaign_id}/stats")
async def get_campaign_stats(campaign_id: str):
    """X 캠페인 통계 조회"""
    campaign = x_db.get_x_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="캠페인을 찾을 수 없습니다.")

    posts = x_db.get_x_posts(campaign_id)

    total_posts = len(posts)
    posted_count = len([p for p in posts if p["status"] == "posted"])
    pending_count = len([p for p in posts if p["status"] == "pending"])
    failed_count = len([p for p in posts if p["status"] == "failed"])

    # 참여도 합계
    total_likes = sum(p.get("engagement_likes", 0) for p in posts)
    total_retweets = sum(p.get("engagement_retweets", 0) for p in posts)
    total_replies = sum(p.get("engagement_replies", 0) for p in posts)
    total_views = sum(p.get("engagement_views", 0) for p in posts)

    return {
        "campaign_id": campaign_id,
        "total_posts": total_posts,
        "posted_count": posted_count,
        "pending_count": pending_count,
        "failed_count": failed_count,
        "progress_percent": round(posted_count / total_posts * 100, 1) if total_posts > 0 else 0,
        "engagement": {
            "likes": total_likes,
            "retweets": total_retweets,
            "replies": total_replies,
            "views": total_views,
            "total": total_likes + total_retweets + total_replies
        }
    }


# ========== 페르소나 관리 ==========

@router.post("/personas")
async def create_x_persona(request: XPersonaCreate, user_id: int = Query(...)):
    """X 페르소나 생성"""
    persona_id = x_db.create_x_persona(
        user_id=user_id,
        name=request.name,
        age=request.age,
        job=request.job,
        personality=request.personality,
        tone=request.tone,
        interests=request.interests,
        background_story=request.background_story,
        speech_patterns=request.speech_patterns,
        emoji_usage=request.emoji_usage,
        avatar_url=request.avatar_url
    )
    return {"persona_id": persona_id, "message": "페르소나가 생성되었습니다."}


@router.get("/personas")
async def get_x_personas(user_id: Optional[int] = None):
    """X 페르소나 목록 조회"""
    personas = x_db.get_x_personas(user_id)
    return {"personas": personas}


@router.get("/personas/{persona_id}")
async def get_x_persona(persona_id: str):
    """X 페르소나 상세 조회"""
    persona = x_db.get_x_persona(persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="페르소나를 찾을 수 없습니다.")
    return {"persona": persona}


@router.put("/personas/{persona_id}")
async def update_x_persona(persona_id: str, request: XPersonaUpdate):
    """X 페르소나 업데이트"""
    update_data = request.dict(exclude_unset=True)
    success = x_db.update_x_persona(persona_id, **update_data)
    if not success:
        raise HTTPException(status_code=404, detail="페르소나를 찾을 수 없습니다.")
    return {"success": True, "message": "페르소나가 업데이트되었습니다."}


@router.delete("/personas/{persona_id}")
async def delete_x_persona(persona_id: str):
    """X 페르소나 삭제"""
    success = x_db.delete_x_persona(persona_id)
    if not success:
        raise HTTPException(status_code=404, detail="페르소나를 찾을 수 없습니다.")
    return {"success": True, "message": "페르소나가 삭제되었습니다."}
