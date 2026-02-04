"""
Marketplace Router - 블로그 상위노출 마켓플레이스 API

업체-블로거 매칭 플랫폼
"""
from fastapi import APIRouter, HTTPException, Query, Body, Depends
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
import json

from services.marketplace_service import get_marketplace_service

router = APIRouter(prefix="/marketplace", tags=["Marketplace"])


# ========== Request/Response Models ==========

class CreateRequestBody(BaseModel):
    """의뢰 생성 요청"""
    keyword: str = Field(..., description="상위노출 키워드")
    budget_min: int = Field(..., ge=10000, description="최소 예산")
    budget_max: int = Field(..., ge=10000, description="최대 예산")
    target_rank_min: int = Field(1, ge=1, le=10, description="목표 최소 순위")
    target_rank_max: int = Field(5, ge=1, le=10, description="목표 최대 순위")
    maintain_days: int = Field(14, ge=7, le=30, description="유지 기간 (일)")
    content_requirements: Optional[str] = Field(None, description="글 요구사항")
    photo_count: int = Field(5, ge=0, le=30, description="필요 사진 수")
    min_word_count: int = Field(1500, ge=500, le=5000, description="최소 글자수")
    business_name: Optional[str] = Field(None, description="업체명")
    category: Optional[str] = Field(None, description="카테고리")
    expires_hours: int = Field(72, ge=24, le=168, description="입찰 마감 시간")

    # 상세 가이드라인
    photo_source: str = Field('blogger_takes', description="사진 제공 방식: business_provided, blogger_takes, mixed")
    visit_required: bool = Field(False, description="방문 필수 여부")
    product_provided: bool = Field(False, description="제품/서비스 제공 여부")

    # 키워드 가이드
    required_keywords: Optional[List[str]] = Field(None, description="필수 포함 키워드")
    prohibited_keywords: Optional[List[str]] = Field(None, description="금지 키워드")

    # 톤앤매너
    tone_manner: str = Field('friendly', description="톤앤매너: friendly, professional, informative, casual")
    writing_style: Optional[str] = Field(None, description="글쓰기 스타일 상세 설명")

    # 사진 가이드
    required_shots: Optional[List[str]] = Field(None, description="필수 촬영 컷: exterior, interior, food, product, before_after, menu, receipt 등")
    photo_instructions: Optional[str] = Field(None, description="사진 촬영 상세 지침")

    # 참고자료
    reference_urls: Optional[List[str]] = Field(None, description="참고 포스트 URL")
    reference_images: Optional[List[str]] = Field(None, description="참고 이미지 URL")
    brand_guidelines: Optional[str] = Field(None, description="브랜드 가이드라인")

    # 글 구성
    structure_type: str = Field('free', description="글 구성: free, visit_review, product_review, information")
    required_sections: Optional[List[str]] = Field(None, description="필수 섹션: intro, menu_info, price_info, location, pros_cons, cta 등")

    # 추가 지침
    dos_and_donts: Optional[dict] = Field(None, description="해야 할 것/하지 말아야 할 것: {dos: [], donts: []}")
    additional_instructions: Optional[str] = Field(None, description="추가 지침")


class CreateBidBody(BaseModel):
    """입찰 생성 요청"""
    request_id: int = Field(..., description="의뢰 ID")
    blog_id: str = Field(..., description="블로그 ID")
    bid_amount: int = Field(..., ge=10000, description="입찰 금액")
    estimated_days: int = Field(7, ge=1, le=30, description="예상 소요 기간")
    message: Optional[str] = Field(None, description="의뢰자에게 메시지")


class SubmitPostBody(BaseModel):
    """글 발행 제출"""
    post_url: str = Field(..., description="발행된 글 URL")
    post_title: Optional[str] = Field(None, description="글 제목")


class CreateReviewBody(BaseModel):
    """리뷰 작성"""
    rating: int = Field(..., ge=1, le=5, description="평점 (1~5)")
    review: str = Field(..., min_length=10, description="리뷰 내용")


class UpdateProfileBody(BaseModel):
    """프로필 업데이트"""
    display_name: Optional[str] = None
    bio: Optional[str] = None
    categories: Optional[str] = None
    is_available: Optional[bool] = None
    min_price: Optional[int] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_holder: Optional[str] = None


# ========== 의뢰 API ==========

@router.post("/requests")
async def create_request(
    client_id: int = Query(..., description="업체 사용자 ID"),
    body: CreateRequestBody = Body(...)
):
    """
    상위노출 의뢰 등록

    업체가 원하는 키워드의 상위노출을 의뢰합니다.
    """
    service = get_marketplace_service()

    request_id = await service.create_request(
        client_id=client_id,
        keyword=body.keyword,
        budget_min=body.budget_min,
        budget_max=body.budget_max,
        target_rank_min=body.target_rank_min,
        target_rank_max=body.target_rank_max,
        maintain_days=body.maintain_days,
        content_requirements=body.content_requirements,
        photo_count=body.photo_count,
        min_word_count=body.min_word_count,
        business_name=body.business_name,
        category=body.category,
        expires_hours=body.expires_hours,
        # 상세 가이드라인
        photo_source=body.photo_source,
        visit_required=body.visit_required,
        product_provided=body.product_provided,
        required_keywords=json.dumps(body.required_keywords, ensure_ascii=False) if body.required_keywords else None,
        prohibited_keywords=json.dumps(body.prohibited_keywords, ensure_ascii=False) if body.prohibited_keywords else None,
        tone_manner=body.tone_manner,
        writing_style=body.writing_style,
        required_shots=json.dumps(body.required_shots, ensure_ascii=False) if body.required_shots else None,
        photo_instructions=body.photo_instructions,
        reference_urls=json.dumps(body.reference_urls, ensure_ascii=False) if body.reference_urls else None,
        reference_images=json.dumps(body.reference_images, ensure_ascii=False) if body.reference_images else None,
        brand_guidelines=body.brand_guidelines,
        structure_type=body.structure_type,
        required_sections=json.dumps(body.required_sections, ensure_ascii=False) if body.required_sections else None,
        dos_and_donts=json.dumps(body.dos_and_donts, ensure_ascii=False) if body.dos_and_donts else None,
        additional_instructions=body.additional_instructions
    )

    if not request_id:
        raise HTTPException(status_code=500, detail="의뢰 생성 실패")

    return {
        "success": True,
        "request_id": request_id,
        "message": "의뢰가 등록되었습니다. 블로거들의 입찰을 기다려주세요."
    }


@router.get("/requests/{request_id}")
async def get_request(request_id: int):
    """의뢰 상세 조회"""
    service = get_marketplace_service()
    request = await service.get_request(request_id)

    if not request:
        raise HTTPException(status_code=404, detail="의뢰를 찾을 수 없습니다")

    return {"success": True, "request": request}


@router.get("/requests")
async def get_open_requests(
    blogger_id: Optional[int] = Query(None, description="블로거 ID (레벨 기반 필터링)"),
    blog_id: Optional[str] = Query(None, description="블로그 ID"),
    category: Optional[str] = Query(None, description="카테고리 필터"),
    min_budget: Optional[int] = Query(None, description="최소 예산 필터"),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0)
):
    """
    열린 의뢰 목록 조회 (블로거용)

    내 레벨로 도전 가능한 의뢰들을 조회합니다.
    """
    service = get_marketplace_service()

    # 블로거 레벨 조회
    blogger_level = 5  # 기본값
    if blog_id:
        try:
            from services.blog_analyzer import analyze_blog
            blog_data = await analyze_blog(blog_id)
            if blog_data:
                blogger_level = blog_data.get('level', 5)
        except:
            pass

    requests = await service.get_open_requests_for_blogger(
        blogger_level=blogger_level,
        category=category,
        min_budget=min_budget,
        limit=limit,
        offset=offset
    )

    return {
        "success": True,
        "blogger_level": blogger_level,
        "requests": requests,
        "count": len(requests)
    }


@router.get("/my-requests")
async def get_my_requests(
    client_id: int = Query(..., description="업체 사용자 ID"),
    status: Optional[str] = Query(None, description="상태 필터")
):
    """내 의뢰 목록 (업체용)"""
    service = get_marketplace_service()
    requests = await service.get_my_requests(client_id, status)

    return {
        "success": True,
        "requests": requests,
        "count": len(requests)
    }


# ========== 입찰 API ==========

@router.post("/bids")
async def create_bid(
    blogger_id: int = Query(..., description="블로거 사용자 ID"),
    body: CreateBidBody = Body(...)
):
    """
    입찰하기

    의뢰에 대해 입찰합니다. 내 블로그 레벨과 성공률이 자동으로 포함됩니다.
    """
    service = get_marketplace_service()

    bid_id = await service.create_bid(
        request_id=body.request_id,
        blogger_id=blogger_id,
        blog_id=body.blog_id,
        bid_amount=body.bid_amount,
        estimated_days=body.estimated_days,
        message=body.message
    )

    if not bid_id:
        raise HTTPException(status_code=400, detail="입찰 생성 실패. 이미 입찰했거나 조건이 맞지 않습니다.")

    return {
        "success": True,
        "bid_id": bid_id,
        "message": "입찰이 완료되었습니다."
    }


@router.get("/requests/{request_id}/bids")
async def get_bids_for_request(
    request_id: int,
    client_id: int = Query(..., description="의뢰자 ID (권한 확인)")
):
    """
    의뢰에 대한 입찰 목록 (업체용)

    내 의뢰에 들어온 입찰들을 조회합니다.
    """
    service = get_marketplace_service()

    # 권한 확인
    request = await service.get_request(request_id)
    if not request:
        raise HTTPException(status_code=404, detail="의뢰를 찾을 수 없습니다")
    if request['client_id'] != client_id:
        raise HTTPException(status_code=403, detail="권한이 없습니다")

    bids = await service.get_bids_for_request(request_id)

    return {
        "success": True,
        "request": request,
        "bids": bids,
        "count": len(bids)
    }


@router.get("/my-bids")
async def get_my_bids(
    blogger_id: int = Query(..., description="블로거 사용자 ID"),
    status: Optional[str] = Query(None, description="상태 필터")
):
    """내 입찰 목록 (블로거용)"""
    service = get_marketplace_service()
    bids = await service.get_my_bids(blogger_id, status)

    return {
        "success": True,
        "bids": bids,
        "count": len(bids)
    }


@router.post("/bids/{bid_id}/select")
async def select_bid(
    bid_id: int,
    client_id: int = Query(..., description="업체 사용자 ID")
):
    """
    블로거 선택 (계약 생성)

    입찰자 중 한 명을 선택하여 계약을 생성합니다.
    에스크로 결제 후 작업이 시작됩니다.
    """
    service = get_marketplace_service()

    contract_id = await service.select_bid(bid_id, client_id)

    if not contract_id:
        raise HTTPException(status_code=400, detail="블로거 선택 실패")

    return {
        "success": True,
        "contract_id": contract_id,
        "message": "블로거가 선택되었습니다. 에스크로 결제를 진행해주세요."
    }


# ========== 계약 API ==========

@router.get("/contracts/{contract_id}")
async def get_contract(
    contract_id: int,
    user_id: int = Query(..., description="사용자 ID (권한 확인)")
):
    """계약 상세 조회"""
    service = get_marketplace_service()
    contract = await service.get_contract(contract_id)

    if not contract:
        raise HTTPException(status_code=404, detail="계약을 찾을 수 없습니다")

    # 권한 확인
    if contract['client_id'] != user_id and contract['blogger_id'] != user_id:
        raise HTTPException(status_code=403, detail="권한이 없습니다")

    # 검증 기록 조회
    from database.marketplace_db import get_verification_history
    verifications = get_verification_history(contract_id)

    return {
        "success": True,
        "contract": contract,
        "verifications": verifications
    }


@router.get("/my-contracts")
async def get_my_contracts(
    user_id: int = Query(..., description="사용자 ID"),
    role: str = Query("blogger", description="역할: blogger 또는 client"),
    status: Optional[str] = Query(None, description="상태 필터")
):
    """내 계약 목록"""
    service = get_marketplace_service()
    contracts = await service.get_my_contracts(user_id, role, status)

    return {
        "success": True,
        "contracts": contracts,
        "count": len(contracts)
    }


@router.post("/contracts/{contract_id}/payment")
async def process_payment(
    contract_id: int,
    payment_id: str = Query(..., description="결제 ID (토스페이먼츠)"),
    client_id: int = Query(..., description="업체 사용자 ID")
):
    """
    결제 처리 (에스크로)

    토스페이먼츠 에스크로 결제 완료 후 호출됩니다.
    """
    service = get_marketplace_service()

    # 권한 확인
    contract = await service.get_contract(contract_id)
    if not contract or contract['client_id'] != client_id:
        raise HTTPException(status_code=403, detail="권한이 없습니다")

    success = await service.process_payment(contract_id, payment_id)

    if not success:
        raise HTTPException(status_code=500, detail="결제 처리 실패")

    return {
        "success": True,
        "message": "결제가 완료되었습니다. 블로거가 작업을 시작합니다."
    }


@router.post("/contracts/{contract_id}/submit-post")
async def submit_post(
    contract_id: int,
    blogger_id: int = Query(..., description="블로거 사용자 ID"),
    body: SubmitPostBody = Body(...)
):
    """
    글 발행 제출 (블로거용)

    글 작성 완료 후 URL을 제출합니다.
    """
    service = get_marketplace_service()

    success = await service.submit_post(
        contract_id=contract_id,
        blogger_id=blogger_id,
        post_url=body.post_url,
        post_title=body.post_title
    )

    if not success:
        raise HTTPException(status_code=400, detail="글 제출 실패")

    return {
        "success": True,
        "message": "글이 제출되었습니다. 업체의 확인을 기다려주세요."
    }


@router.post("/contracts/{contract_id}/start-verification")
async def start_verification(
    contract_id: int,
    client_id: int = Query(..., description="업체 사용자 ID")
):
    """
    순위 검증 시작 (업체용)

    발행된 글을 확인하고 순위 검증을 시작합니다.
    """
    service = get_marketplace_service()

    success = await service.start_verification(contract_id, client_id)

    if not success:
        raise HTTPException(status_code=400, detail="검증 시작 실패")

    return {
        "success": True,
        "message": "순위 검증이 시작되었습니다. 목표 순위 달성 시 자동으로 정산됩니다."
    }


# ========== 정산 API ==========

@router.get("/settlements")
async def get_settlements(
    blogger_id: int = Query(..., description="블로거 사용자 ID")
):
    """내 정산 내역"""
    service = get_marketplace_service()
    settlements = await service.get_pending_settlements(blogger_id)

    return {
        "success": True,
        "settlements": settlements,
        "count": len(settlements)
    }


# ========== 리뷰 API ==========

@router.post("/contracts/{contract_id}/review")
async def create_review(
    contract_id: int,
    user_id: int = Query(..., description="리뷰 작성자 ID"),
    role: str = Query(..., description="역할: client 또는 blogger"),
    body: CreateReviewBody = Body(...)
):
    """
    리뷰 작성

    계약 완료 후 상대방에 대한 리뷰를 작성합니다.
    """
    service = get_marketplace_service()

    success = await service.create_review(
        contract_id=contract_id,
        reviewer_id=user_id,
        reviewer_role=role,
        rating=body.rating,
        review=body.review
    )

    if not success:
        raise HTTPException(status_code=400, detail="리뷰 작성 실패")

    return {
        "success": True,
        "message": "리뷰가 등록되었습니다."
    }


# ========== 프로필 API ==========

@router.get("/profile/blogger/{user_id}")
async def get_blogger_profile(user_id: int):
    """블로거 프로필 조회"""
    service = get_marketplace_service()
    profile = await service.get_blogger_profile(user_id)

    if not profile:
        return {
            "success": True,
            "profile": None,
            "message": "프로필이 없습니다. 프로필을 생성해주세요."
        }

    return {
        "success": True,
        "profile": profile
    }


@router.put("/profile/blogger")
async def update_blogger_profile(
    user_id: int = Query(..., description="사용자 ID"),
    blog_id: str = Query(..., description="블로그 ID"),
    body: UpdateProfileBody = Body(...)
):
    """블로거 프로필 생성/수정"""
    service = get_marketplace_service()

    profile_id = await service.update_blogger_profile(
        user_id=user_id,
        blog_id=blog_id,
        **body.dict(exclude_none=True)
    )

    return {
        "success": True,
        "profile_id": profile_id,
        "message": "프로필이 업데이트되었습니다."
    }


# ========== 알림 API ==========

@router.get("/notifications")
async def get_notifications(
    user_id: int = Query(..., description="사용자 ID"),
    unread_only: bool = Query(False, description="읽지 않은 것만"),
    limit: int = Query(20, ge=1, le=50)
):
    """알림 목록"""
    service = get_marketplace_service()
    notifications = await service.get_notifications(user_id, unread_only, limit)

    return {
        "success": True,
        "notifications": notifications,
        "count": len(notifications)
    }


@router.post("/notifications/read")
async def mark_notifications_read(
    user_id: int = Query(..., description="사용자 ID"),
    notification_ids: Optional[List[int]] = Body(None, description="알림 ID 목록 (없으면 전체)")
):
    """알림 읽음 처리"""
    service = get_marketplace_service()
    await service.mark_notifications_read(user_id, notification_ids)

    return {
        "success": True,
        "message": "알림이 읽음 처리되었습니다."
    }


# ========== 통계 API ==========

@router.get("/stats")
async def get_marketplace_stats():
    """마켓플레이스 통계"""
    service = get_marketplace_service()
    stats = await service.get_marketplace_stats()

    return {
        "success": True,
        "stats": stats
    }
