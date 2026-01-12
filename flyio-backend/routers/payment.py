"""
토스페이먼츠 결제 API 라우터
https://docs.tosspayments.com/reference
"""
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
import httpx
import base64
import uuid
import logging
from datetime import datetime

from config import settings
from database.subscription_db import (
    create_payment,
    update_payment,
    upgrade_subscription,
    add_extra_credits,
    get_user_subscription,
    get_payment_by_order_id,
    PLAN_LIMITS,
    PlanType
)

logger = logging.getLogger(__name__)
router = APIRouter()

# 토스페이먼츠 API 설정
TOSS_API_URL = "https://api.tosspayments.com/v1"
TOSS_SECRET_KEY = getattr(settings, 'TOSS_SECRET_KEY', '')  # 환경변수에서 가져옴


def get_toss_headers():
    """토스페이먼츠 API 헤더 생성"""
    if not TOSS_SECRET_KEY:
        raise HTTPException(status_code=500, detail="결제 시스템이 설정되지 않았습니다")

    # Secret Key를 Base64로 인코딩
    encoded_key = base64.b64encode(f"{TOSS_SECRET_KEY}:".encode()).decode()
    return {
        "Authorization": f"Basic {encoded_key}",
        "Content-Type": "application/json"
    }


# ============ Pydantic 모델 ============

class PaymentPrepareRequest(BaseModel):
    plan_type: str
    billing_cycle: str = "monthly"


class PaymentConfirmRequest(BaseModel):
    payment_key: str
    order_id: str
    amount: int


class BillingKeyRequest(BaseModel):
    customer_key: str
    auth_key: str


class BillingPaymentRequest(BaseModel):
    customer_key: str
    amount: int
    order_name: str


# ============ 결제 준비 API ============

@router.post("/prepare")
async def prepare_payment(
    request: PaymentPrepareRequest,
    user_id: int = Query(..., description="사용자 ID")
):
    """결제 준비 - 주문 정보 생성"""
    try:
        plan = PlanType(request.plan_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="유효하지 않은 플랜입니다")

    limits = PLAN_LIMITS[plan]

    # 금액 결정
    if request.billing_cycle == "yearly":
        amount = limits["price_yearly"]
    else:
        amount = limits["price_monthly"]

    if amount == 0:
        raise HTTPException(status_code=400, detail="무료 플랜은 결제가 필요하지 않습니다")

    # 주문 ID 생성
    order_id = f"BLANK_{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"

    # 결제 내역 생성 (pending 상태)
    create_payment(user_id, order_id, amount)

    return {
        "order_id": order_id,
        "order_name": f"블랭크 {limits['name']} 플랜 ({request.billing_cycle})",
        "amount": amount,
        "plan_type": request.plan_type,
        "billing_cycle": request.billing_cycle,
        "customer_key": f"BLANK_USER_{user_id}"
    }


# ============ 결제 승인 API ============

@router.post("/confirm")
async def confirm_payment(
    request: PaymentConfirmRequest,
    user_id: int = Query(..., description="사용자 ID")
):
    """결제 승인 - 토스페이먼츠 결제 승인 요청"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{TOSS_API_URL}/payments/confirm",
                headers=get_toss_headers(),
                json={
                    "paymentKey": request.payment_key,
                    "orderId": request.order_id,
                    "amount": request.amount
                }
            )

            if response.status_code != 200:
                error_data = response.json()
                logger.error(f"Payment confirm failed: {error_data}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=error_data.get("message", "결제 승인에 실패했습니다")
                )

            payment_data = response.json()

            # 결제 내역 업데이트
            update_payment(
                order_id=request.order_id,
                payment_key=request.payment_key,
                status="completed",
                payment_method=payment_data.get("method"),
                card_company=payment_data.get("card", {}).get("company"),
                card_number=payment_data.get("card", {}).get("number"),
                receipt_url=payment_data.get("receipt", {}).get("url")
            )

            # 주문 ID에서 플랜 정보 추출 (또는 별도 저장)
            # 실제로는 결제 준비 시 저장해둔 정보를 조회해야 함
            # 여기서는 간단히 처리

            return {
                "success": True,
                "message": "결제가 완료되었습니다",
                "payment": {
                    "payment_key": request.payment_key,
                    "order_id": request.order_id,
                    "amount": request.amount,
                    "method": payment_data.get("method"),
                    "approved_at": payment_data.get("approvedAt"),
                    "receipt_url": payment_data.get("receipt", {}).get("url")
                }
            }

    except httpx.RequestError as e:
        logger.error(f"Payment request error: {e}")
        raise HTTPException(status_code=500, detail="결제 서버 연결에 실패했습니다")


# ============ 구독 결제 완료 처리 ============

@router.post("/subscription/complete")
async def complete_subscription_payment(
    payment_key: str = Query(...),
    order_id: str = Query(...),
    plan_type: str = Query(...),
    billing_cycle: str = Query("monthly"),
    user_id: int = Query(..., description="사용자 ID")
):
    """구독 결제 완료 처리 - 결제 승인 후 호출"""
    # 구독 업그레이드
    subscription = upgrade_subscription(
        user_id=user_id,
        plan_type=plan_type,
        billing_cycle=billing_cycle,
        payment_key=payment_key,
        customer_key=f"BLANK_USER_{user_id}"
    )

    logger.info(f"Subscription upgraded: user={user_id}, plan={plan_type}, cycle={billing_cycle}")

    return {
        "success": True,
        "message": f"{PLAN_LIMITS[PlanType(plan_type)]['name']} 플랜이 활성화되었습니다",
        "subscription": subscription
    }


# ============ 정기 결제 (빌링) API ============

@router.post("/billing/key")
async def issue_billing_key(
    request: BillingKeyRequest,
    user_id: int = Query(..., description="사용자 ID")
):
    """빌링키 발급 - 자동 결제용"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{TOSS_API_URL}/billing/authorizations/issue",
                headers=get_toss_headers(),
                json={
                    "customerKey": request.customer_key,
                    "authKey": request.auth_key
                }
            )

            if response.status_code != 200:
                error_data = response.json()
                raise HTTPException(
                    status_code=response.status_code,
                    detail=error_data.get("message", "빌링키 발급에 실패했습니다")
                )

            billing_data = response.json()

            return {
                "success": True,
                "billing_key": billing_data.get("billingKey"),
                "card_company": billing_data.get("card", {}).get("company"),
                "card_number": billing_data.get("card", {}).get("number")
            }

    except httpx.RequestError as e:
        logger.error(f"Billing key request error: {e}")
        raise HTTPException(status_code=500, detail="결제 서버 연결에 실패했습니다")


class BillingRegisterRequest(BaseModel):
    customer_key: str
    auth_key: str
    order_id: str
    amount: int
    plan_type: str
    billing_cycle: str = "monthly"


@router.post("/billing/register")
async def register_billing(
    request: BillingRegisterRequest,
    user_id: int = Query(..., description="사용자 ID")
):
    """
    정기결제 등록 - authKey로 빌링키 발급 후 첫 결제 및 구독 활성화
    """
    try:
        async with httpx.AsyncClient() as client:
            # 1. 빌링키 발급
            logger.info(f"Issuing billing key for user {user_id}, customerKey: {request.customer_key}")
            billing_response = await client.post(
                f"{TOSS_API_URL}/billing/authorizations/issue",
                headers=get_toss_headers(),
                json={
                    "customerKey": request.customer_key,
                    "authKey": request.auth_key
                }
            )

            if billing_response.status_code != 200:
                error_data = billing_response.json()
                logger.error(f"Billing key issue failed: {error_data}")
                raise HTTPException(
                    status_code=billing_response.status_code,
                    detail=error_data.get("message", "빌링키 발급에 실패했습니다")
                )

            billing_data = billing_response.json()
            billing_key = billing_data.get("billingKey")
            logger.info(f"Billing key issued successfully: {billing_key[:20]}...")

            # 2. 빌링키로 첫 결제 진행
            plan = PlanType(request.plan_type)
            order_name = f"블랭크 {PLAN_LIMITS[plan]['name']} 플랜 ({request.billing_cycle})"

            logger.info(f"Processing first billing payment: {request.amount}원")
            payment_response = await client.post(
                f"{TOSS_API_URL}/billing/{billing_key}",
                headers=get_toss_headers(),
                json={
                    "customerKey": request.customer_key,
                    "amount": request.amount,
                    "orderId": request.order_id,
                    "orderName": order_name
                }
            )

            if payment_response.status_code != 200:
                error_data = payment_response.json()
                logger.error(f"Billing payment failed: {error_data}")
                raise HTTPException(
                    status_code=payment_response.status_code,
                    detail=error_data.get("message", "결제에 실패했습니다")
                )

            payment_data = payment_response.json()
            payment_key = payment_data.get("paymentKey")
            logger.info(f"Billing payment successful: paymentKey={payment_key}")

            # 3. 결제 내역 저장 (기존 pending 결제가 있으면 업데이트, 없으면 새로 생성)
            existing_payment = get_payment_by_order_id(request.order_id)
            if existing_payment:
                update_payment(
                    order_id=request.order_id,
                    payment_key=payment_key,
                    status="completed"
                )
            else:
                create_payment(user_id, request.order_id, request.amount, payment_key, "completed")

            # 4. 구독 업그레이드
            subscription = upgrade_subscription(
                user_id=user_id,
                plan_type=request.plan_type,
                billing_cycle=request.billing_cycle,
                payment_key=payment_key,
                customer_key=request.customer_key
            )

            logger.info(f"Subscription upgraded: user={user_id}, plan={request.plan_type}")

            return {
                "success": True,
                "message": f"{PLAN_LIMITS[plan]['name']} 플랜이 활성화되었습니다",
                "subscription": subscription,
                "payment": {
                    "payment_key": payment_key,
                    "order_id": request.order_id,
                    "amount": request.amount,
                    "card_company": billing_data.get("card", {}).get("company"),
                    "card_number": billing_data.get("card", {}).get("number"),
                    "approved_at": payment_data.get("approvedAt")
                }
            }

    except HTTPException:
        raise
    except httpx.RequestError as e:
        logger.error(f"Billing register request error: {e}")
        raise HTTPException(status_code=500, detail="결제 서버 연결에 실패했습니다")
    except Exception as e:
        logger.error(f"Billing register error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/billing/pay")
async def billing_payment(
    request: BillingPaymentRequest,
    user_id: int = Query(..., description="사용자 ID"),
    billing_key: str = Query(..., description="빌링키")
):
    """정기 결제 실행"""
    order_id = f"BLANK_BILLING_{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{TOSS_API_URL}/billing/{billing_key}",
                headers=get_toss_headers(),
                json={
                    "customerKey": request.customer_key,
                    "amount": request.amount,
                    "orderId": order_id,
                    "orderName": request.order_name
                }
            )

            if response.status_code != 200:
                error_data = response.json()
                raise HTTPException(
                    status_code=response.status_code,
                    detail=error_data.get("message", "정기 결제에 실패했습니다")
                )

            payment_data = response.json()

            # 결제 내역 저장
            create_payment(user_id, order_id, request.amount, payment_data.get("paymentKey"), "completed")

            return {
                "success": True,
                "payment_key": payment_data.get("paymentKey"),
                "order_id": order_id,
                "amount": request.amount,
                "approved_at": payment_data.get("approvedAt")
            }

    except httpx.RequestError as e:
        logger.error(f"Billing payment error: {e}")
        raise HTTPException(status_code=500, detail="결제 서버 연결에 실패했습니다")


# ============ 결제 취소 API ============

@router.post("/cancel")
async def cancel_payment(
    payment_key: str = Query(..., description="결제 키"),
    cancel_reason: str = Query("고객 요청", description="취소 사유"),
    user_id: int = Query(..., description="사용자 ID")
):
    """결제 취소"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{TOSS_API_URL}/payments/{payment_key}/cancel",
                headers=get_toss_headers(),
                json={
                    "cancelReason": cancel_reason
                }
            )

            if response.status_code != 200:
                error_data = response.json()
                raise HTTPException(
                    status_code=response.status_code,
                    detail=error_data.get("message", "결제 취소에 실패했습니다")
                )

            cancel_data = response.json()

            return {
                "success": True,
                "message": "결제가 취소되었습니다",
                "cancelled_at": cancel_data.get("cancels", [{}])[0].get("canceledAt")
            }

    except httpx.RequestError as e:
        logger.error(f"Payment cancel error: {e}")
        raise HTTPException(status_code=500, detail="결제 서버 연결에 실패했습니다")


# ============ 웹훅 API ============

@router.post("/webhook")
async def payment_webhook(request: Request):
    """토스페이먼츠 웹훅 처리"""
    try:
        data = await request.json()
        event_type = data.get("eventType")

        logger.info(f"Webhook received: {event_type}")

        if event_type == "PAYMENT_STATUS_CHANGED":
            # 결제 상태 변경 처리
            payment_key = data.get("data", {}).get("paymentKey")
            status = data.get("data", {}).get("status")

            if status == "DONE":
                # 결제 완료 처리
                pass
            elif status == "CANCELED":
                # 결제 취소 처리
                pass

        elif event_type == "BILLING_STATUS_CHANGED":
            # 정기 결제 상태 변경
            pass

        return {"success": True}

    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"success": False, "error": str(e)}


# ============ 추가 크레딧 결제 ============

@router.post("/credits/prepare")
async def prepare_credits_payment(
    credit_type: str = Query(..., description="크레딧 유형 (keyword, analysis)"),
    amount: int = Query(..., description="구매 수량 (100, 500, 1000)"),
    user_id: int = Query(..., description="사용자 ID")
):
    """추가 크레딧 결제 준비"""
    if credit_type not in ["keyword", "analysis"]:
        raise HTTPException(status_code=400, detail="유효하지 않은 크레딧 유형입니다")

    # 가격 설정
    price_map = {
        100: 2900,
        500: 9900,
        1000: 17900
    }

    if amount not in price_map:
        raise HTTPException(status_code=400, detail="유효하지 않은 구매 수량입니다")

    price = price_map[amount]
    order_id = f"BLANK_CREDIT_{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"

    # 결제 내역 생성
    create_payment(user_id, order_id, price)

    credit_name = "키워드 검색" if credit_type == "keyword" else "블로그 분석"

    return {
        "order_id": order_id,
        "order_name": f"블랭크 {credit_name} 크레딧 {amount}회",
        "amount": price,
        "credit_type": credit_type,
        "credit_amount": amount,
        "customer_key": f"BLANK_USER_{user_id}"
    }


@router.post("/credits/complete")
async def complete_credits_payment(
    payment_key: str = Query(...),
    order_id: str = Query(...),
    credit_type: str = Query(...),
    credit_amount: int = Query(...),
    user_id: int = Query(..., description="사용자 ID")
):
    """추가 크레딧 결제 완료 처리"""
    # 크레딧 추가
    credit = add_extra_credits(user_id, credit_type, credit_amount)

    logger.info(f"Credits added: user={user_id}, type={credit_type}, amount={credit_amount}")

    return {
        "success": True,
        "message": f"{credit_amount}개의 크레딧이 추가되었습니다",
        "credit": credit
    }
