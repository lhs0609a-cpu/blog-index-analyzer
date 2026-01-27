"""
토스페이먼츠 결제 API 라우터
https://docs.tosspayments.com/reference
"""
from fastapi import APIRouter, HTTPException, Query, Request, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, Dict
import httpx
import base64
import uuid
import hmac
import hashlib
import logging
import asyncio
from datetime import datetime

from config import settings
from routers.auth import get_current_user
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

# ============ 웹훅 실패 추적 및 재시도 시스템 ============
# 실패한 웹훅을 추적하고 재시도하기 위한 인메모리 큐
_failed_webhooks: Dict[str, Dict] = {}
_WEBHOOK_MAX_RETRIES = 3
_WEBHOOK_RETRY_DELAY = 30  # 초


async def notify_admin_webhook_failure(order_id: str, error_message: str, attempt: int):
    """관리자에게 웹훅 실패 알림 (로그 + 이메일 가능)"""
    alert_msg = f"[결제 웹훅 실패 알림] order_id={order_id}, attempt={attempt}/{_WEBHOOK_MAX_RETRIES}, error={error_message}"
    logger.critical(alert_msg)

    # 이메일 알림 (선택적 - 환경변수로 설정)
    admin_email = getattr(settings, 'ADMIN_EMAIL', None)
    if admin_email:
        try:
            # 이메일 전송 로직 (추후 구현)
            logger.info(f"Admin notification sent to {admin_email}")
        except Exception as e:
            logger.error(f"Failed to send admin notification: {e}")


async def retry_webhook_verification(order_id: str, payment_key: str, max_retries: int = _WEBHOOK_MAX_RETRIES):
    """
    웹훅 검증 재시도 로직
    결제 상태를 토스페이먼츠 API에서 직접 확인하여 구독 상태 동기화
    """
    for attempt in range(1, max_retries + 1):
        try:
            await asyncio.sleep(_WEBHOOK_RETRY_DELAY * attempt)  # 점진적 딜레이

            # 토스페이먼츠에서 결제 상태 직접 조회
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{TOSS_API_URL}/payments/{payment_key}",
                    headers=get_toss_headers()
                )

                if response.status_code == 200:
                    payment_data = response.json()
                    status = payment_data.get("status")

                    if status == "DONE":
                        # 결제 완료 확인 - 구독 상태 업데이트
                        logger.info(f"[Webhook Retry] Payment verified: {order_id}, status={status}")

                        # 결제 내역 업데이트
                        update_payment(
                            order_id=order_id,
                            payment_key=payment_key,
                            status="completed",
                            payment_method=payment_data.get("method"),
                            card_company=payment_data.get("card", {}).get("company"),
                            card_number=payment_data.get("card", {}).get("number"),
                            receipt_url=payment_data.get("receipt", {}).get("url")
                        )

                        # 성공 시 실패 목록에서 제거
                        if order_id in _failed_webhooks:
                            del _failed_webhooks[order_id]

                        logger.info(f"[Webhook Retry] Successfully synced payment: {order_id}")
                        return True

                    elif status == "CANCELED":
                        logger.info(f"[Webhook Retry] Payment was canceled: {order_id}")
                        update_payment(order_id=order_id, payment_key=payment_key, status="canceled")
                        if order_id in _failed_webhooks:
                            del _failed_webhooks[order_id]
                        return True
                else:
                    logger.warning(f"[Webhook Retry] Failed to fetch payment status: {response.status_code}")

        except Exception as e:
            logger.error(f"[Webhook Retry] Attempt {attempt} failed for {order_id}: {e}")
            await notify_admin_webhook_failure(order_id, str(e), attempt)

    # 모든 재시도 실패
    logger.critical(f"[Webhook Retry] All {max_retries} attempts failed for order_id={order_id}")
    await notify_admin_webhook_failure(order_id, "All retry attempts exhausted", max_retries)

    # 실패 목록에 기록
    _failed_webhooks[order_id] = {
        "payment_key": payment_key,
        "failed_at": datetime.now().isoformat(),
        "attempts": max_retries,
        "status": "failed"
    }

    return False


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
    current_user: dict = Depends(get_current_user)
):
    """결제 준비 - 주문 정보 생성 (인증 필요)"""
    user_id = current_user["id"]
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
    current_user: dict = Depends(get_current_user)
):
    """결제 승인 - 토스페이먼츠 결제 승인 요청 (인증 필요)"""
    user_id = current_user["id"]
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
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
    current_user: dict = Depends(get_current_user)
):
    """구독 결제 완료 처리 - 결제 승인 후 호출 (인증 필요)"""
    user_id = current_user["id"]
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
    current_user: dict = Depends(get_current_user)
):
    """빌링키 발급 - 자동 결제용 (인증 필요)"""
    user_id = current_user["id"]
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
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
    current_user: dict = Depends(get_current_user)
):
    """
    정기결제 등록 - authKey로 빌링키 발급 후 첫 결제 및 구독 활성화 (인증 필요)
    """
    user_id = current_user["id"]
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
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

            # 항상 새로운 order_id 생성 (토스에서 중복 방지)
            new_order_id = f"BLANK_BILLING_{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"

            logger.info(f"Processing first billing payment: {request.amount}원, order_id: {new_order_id}")
            payment_response = await client.post(
                f"{TOSS_API_URL}/billing/{billing_key}",
                headers=get_toss_headers(),
                json={
                    "customerKey": request.customer_key,
                    "amount": request.amount,
                    "orderId": new_order_id,
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

            # 3. 결제 내역 저장 (새로운 order_id로 생성)
            create_payment(user_id, new_order_id, request.amount, payment_key, "completed")

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
                    "order_id": new_order_id,
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
    billing_key: str = Query(..., description="빌링키"),
    current_user: dict = Depends(get_current_user)
):
    """정기 결제 실행 (인증 필요)"""
    user_id = current_user["id"]
    order_id = f"BLANK_BILLING_{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
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
    current_user: dict = Depends(get_current_user)
):
    """결제 취소 (인증 필요)"""
    user_id = current_user["id"]
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
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

# Webhook 서명 검증을 위한 Secret (환경변수에서 가져옴)
TOSS_WEBHOOK_SECRET = getattr(settings, 'TOSS_WEBHOOK_SECRET', '')

def verify_webhook_signature(payload: bytes, signature: str) -> bool:
    """토스페이먼츠 웹훅 서명 검증"""
    if not TOSS_WEBHOOK_SECRET:
        logger.warning("TOSS_WEBHOOK_SECRET not configured - webhook signature verification disabled")
        return True  # 개발 환경에서는 검증 건너뛰기

    try:
        expected_signature = hmac.new(
            TOSS_WEBHOOK_SECRET.encode(),
            payload,
            hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected_signature, signature)
    except Exception as e:
        logger.error(f"Webhook signature verification error: {e}")
        return False


@router.post("/webhook")
async def payment_webhook(request: Request, background_tasks: BackgroundTasks):
    """토스페이먼츠 웹훅 처리 (서명 검증 필수, 실패 시 자동 재시도)"""
    order_id = None
    payment_key = None

    try:
        # 서명 검증
        signature = request.headers.get("Toss-Signature", "")
        body = await request.body()

        if TOSS_WEBHOOK_SECRET and not verify_webhook_signature(body, signature):
            logger.warning(f"Webhook signature verification failed")
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

        data = await request.json()
        event_type = data.get("eventType")
        payment_key = data.get("data", {}).get("paymentKey")
        order_id = data.get("data", {}).get("orderId")

        logger.info(f"Webhook received: {event_type}, order_id={order_id}, payment_key={payment_key}")

        if event_type == "PAYMENT_STATUS_CHANGED":
            # 결제 상태 변경 처리
            status = data.get("data", {}).get("status")

            if status == "DONE":
                # 결제 완료 처리
                logger.info(f"Payment completed: {payment_key}")

                # 결제 내역 업데이트
                try:
                    update_payment(
                        order_id=order_id,
                        payment_key=payment_key,
                        status="completed"
                    )
                except Exception as update_error:
                    logger.error(f"Failed to update payment in webhook: {update_error}")
                    # 백그라운드에서 재시도
                    background_tasks.add_task(
                        retry_webhook_verification,
                        order_id,
                        payment_key
                    )
                    await notify_admin_webhook_failure(order_id, str(update_error), 0)

            elif status == "CANCELED":
                # 결제 취소 처리
                logger.info(f"Payment canceled: {payment_key}")
                try:
                    update_payment(order_id=order_id, payment_key=payment_key, status="canceled")
                except Exception as e:
                    logger.error(f"Failed to update canceled payment: {e}")

        elif event_type == "BILLING_STATUS_CHANGED":
            # 정기 결제 상태 변경
            billing_key = data.get("data", {}).get("billingKey")
            logger.info(f"Billing status changed: {billing_key}")

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Webhook error: {e}")

        # 웹훅 처리 실패 시 백그라운드에서 재시도
        if payment_key:
            background_tasks.add_task(
                retry_webhook_verification,
                order_id or "unknown",
                payment_key
            )
            await notify_admin_webhook_failure(order_id or "unknown", str(e), 0)

        # 에러 상세 정보 노출 방지 (하지만 200 반환하여 토스에서 재전송 방지)
        return {"success": False, "error": "Webhook processing failed", "will_retry": True}


@router.get("/webhook/failed")
async def get_failed_webhooks():
    """실패한 웹훅 목록 조회 (관리자용)"""
    return {
        "failed_count": len(_failed_webhooks),
        "failed_webhooks": _failed_webhooks
    }


@router.post("/webhook/retry/{order_id}")
async def manual_retry_webhook(
    order_id: str,
    background_tasks: BackgroundTasks
):
    """실패한 웹훅 수동 재시도 (관리자용)"""
    if order_id not in _failed_webhooks:
        raise HTTPException(status_code=404, detail="해당 주문의 실패 기록이 없습니다")

    failed_info = _failed_webhooks[order_id]
    payment_key = failed_info.get("payment_key")

    if not payment_key:
        raise HTTPException(status_code=400, detail="결제 키 정보가 없습니다")

    background_tasks.add_task(retry_webhook_verification, order_id, payment_key)

    return {
        "success": True,
        "message": f"재시도가 백그라운드에서 시작되었습니다: {order_id}"
    }


# ============ 추가 크레딧 결제 ============

@router.post("/credits/prepare")
async def prepare_credits_payment(
    credit_type: str = Query(..., description="크레딧 유형 (keyword, analysis)"),
    amount: int = Query(..., description="구매 수량 (100, 500, 1000)"),
    current_user: dict = Depends(get_current_user)
):
    """추가 크레딧 결제 준비 (인증 필요)"""
    user_id = current_user["id"]
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
    current_user: dict = Depends(get_current_user)
):
    """추가 크레딧 결제 완료 처리 (인증 필요)"""
    user_id = current_user["id"]
    # 크레딧 추가
    credit = add_extra_credits(user_id, credit_type, credit_amount)

    logger.info(f"Credits added: user={user_id}, type={credit_type}, amount={credit_amount}")

    return {
        "success": True,
        "message": f"{credit_amount}개의 크레딧이 추가되었습니다",
        "credit": credit
    }
