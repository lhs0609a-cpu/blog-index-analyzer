"""
정기결제 갱신.

왜 이 파일이 없었던 게 문제인가:
/billing/register 는 빌링키를 발급받아 **첫 달만** 결제하고 그 키를 버렸다.
화면은 "다음 달 같은 날짜에 자동 결제됩니다" 라고 말하지만 서버에는 그 날짜에
청구할 수단도, 청구할 주체도 없었다. 30일 뒤 expires_at 이 지나면 플랜이
조용히 만료될 뿐이고, 사용자는 결제한 서비스를 잃고 우리는 매출을 잃는다.
결제가 0건이라 아직 아무도 그 자리에 도달하지 않았을 뿐, 첫 결제가 들어오는
순간 터지도록 예약돼 있던 문제다.

설계 원칙:
- **만료된 뒤에** 청구한다. 미리 당겨 받으면 남은 기간만큼 이중 청구가 된다.
- 실패는 세 번까지만 재시도한다. 카드 만료·한도 초과는 재시도로 낫지 않고,
  실패 승인이 쌓이면 결제사 쪽 가맹점 평판이 깎인다.
- 실패 사유를 퍼널 이벤트로 남긴다. "왜 갱신이 안 됐냐"에 답할 수 있어야 한다.
- 기본 비활성. SUBSCRIPTION_RENEWAL=1 이어야 돈다 — 배포만으로 남의 카드를
  긁기 시작하면 안 된다.
"""
import asyncio
import logging
import os
import uuid
from datetime import datetime

import httpx

from database.subscription_db import (
    PLAN_LIMITS,
    PlanType,
    create_payment,
    get_subscriptions_due_for_renewal,
    record_renewal_attempt,
    upgrade_subscription,
    MAX_RENEWAL_FAILURES,
)

logger = logging.getLogger(__name__)

TOSS_API_URL = "https://api.tosspayments.com/v1"

# 기본 1시간. 만료는 초 단위로 급한 일이 아니다.
RENEWAL_INTERVAL_SECONDS = int(os.environ.get("SUBSCRIPTION_RENEWAL_INTERVAL", "3600"))
# 한 번에 긁는 최대 건수. 장애가 나도 피해가 이 숫자를 넘지 않게 묶는다.
RENEWAL_BATCH = int(os.environ.get("SUBSCRIPTION_RENEWAL_BATCH", "50"))


def is_enabled() -> bool:
    return os.environ.get("SUBSCRIPTION_RENEWAL", "") == "1"


def _toss_headers() -> dict:
    import base64

    from config import settings

    secret = getattr(settings, "TOSS_SECRET_KEY", "")
    if not secret:
        raise RuntimeError("TOSS_SECRET_KEY 미설정")
    encoded = base64.b64encode(f"{secret}:".encode()).decode()
    return {"Authorization": f"Basic {encoded}", "Content-Type": "application/json"}


def _track(name: str, user_id, reason: str = None, props: dict = None) -> None:
    """갱신 결과도 퍼널에 남긴다. 성장 진단이 이 구간을 볼 수 있어야 한다."""
    try:
        from database import site_analytics_db as adb

        adb.record_event(
            name=name,
            ip="server",
            user_agent="subscription-renewal",
            path="/internal/subscription/renew",
            user_id=str(user_id) if user_id is not None else None,
            reason=reason,
            props=props,
        )
    except Exception as e:
        logger.warning(f"[renewal] 이벤트 기록 실패: {e}")


async def renew_one(sub: dict) -> dict:
    """구독 한 건을 갱신한다. 예외를 밖으로 던지지 않는다 — 한 건이 배치를 멈추면 안 된다."""
    user_id = sub["user_id"]
    try:
        plan = PlanType(sub["plan_type"])
    except ValueError:
        logger.warning(f"[renewal] 알 수 없는 플랜: user={user_id} plan={sub['plan_type']}")
        return {"user_id": user_id, "ok": False, "reason": "unknown_plan"}

    limits = PLAN_LIMITS[plan]
    cycle = sub.get("billing_cycle") or "monthly"
    amount = int(limits["price_yearly"] if cycle == "yearly" else limits["price_monthly"])
    if not amount:
        return {"user_id": user_id, "ok": False, "reason": "free_plan"}

    order_id = (
        f"BLANK_RENEW_{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"
    )
    order_name = f"블스피 {limits['name']} 플랜 ({cycle} 갱신)"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                f"{TOSS_API_URL}/billing/{sub['billing_key']}",
                headers=_toss_headers(),
                json={
                    "customerKey": sub["customer_key"],
                    "amount": amount,
                    "orderId": order_id,
                    "orderName": order_name,
                },
            )
    except Exception as e:
        failures = record_renewal_attempt(user_id, False)
        _track("payment_register_fail", user_id, reason="renew:toss_unreachable",
               props={"attempt": failures, "plan": sub["plan_type"]})
        logger.error(f"[renewal] 토스 통신 실패: user={user_id} {e}")
        return {"user_id": user_id, "ok": False, "reason": "toss_unreachable"}

    if res.status_code != 200:
        try:
            code = (res.json() or {}).get("code") or str(res.status_code)
        except Exception:
            code = str(res.status_code)
        failures = record_renewal_attempt(user_id, False)
        _track("payment_register_fail", user_id, reason=f"renew:{code}",
               props={"attempt": failures, "plan": sub["plan_type"], "amount": amount})
        logger.warning(
            f"[renewal] 결제 실패: user={user_id} code={code} "
            f"({failures}/{MAX_RENEWAL_FAILURES}회째)"
        )
        return {"user_id": user_id, "ok": False, "reason": code, "failures": failures}

    data = res.json()
    payment_key = data.get("paymentKey")
    create_payment(user_id, order_id, amount, payment_key, "completed")
    # billing_key 는 넘기지 않는다 — 갱신은 새 키를 발급하지 않으므로 기존 값이 남아야 한다.
    upgrade_subscription(
        user_id=user_id,
        plan_type=sub["plan_type"],
        billing_cycle=cycle,
        payment_key=payment_key,
    )
    record_renewal_attempt(user_id, True)
    _track("payment_success", user_id, props={"plan": sub["plan_type"], "cycle": cycle,
                                              "amount": amount, "source": "renewal"})
    logger.warning(f"[renewal] 갱신 완료: user={user_id} {amount}원")
    return {"user_id": user_id, "ok": True, "amount": amount}


async def run_due(limit: int = None) -> dict:
    """만료된 구독을 훑어 갱신한다. 스케줄러와 관리자 수동 실행이 함께 쓴다."""
    due = await asyncio.to_thread(get_subscriptions_due_for_renewal, limit or RENEWAL_BATCH)
    if not due:
        return {"due": 0, "renewed": 0, "failed": 0, "results": []}

    results = []
    for sub in due:
        results.append(await renew_one(sub))

    renewed = sum(1 for r in results if r.get("ok"))
    return {
        "due": len(due),
        "renewed": renewed,
        "failed": len(due) - renewed,
        "results": results,
    }


class RenewalScheduler:
    def __init__(self):
        self._task = None
        self._running = False

    def start(self, interval_seconds: int = None):
        if self._running:
            return
        if not is_enabled():
            logger.info("⏭️  Subscription renewal disabled (SUBSCRIPTION_RENEWAL != 1)")
            return
        self._running = True
        interval = interval_seconds or RENEWAL_INTERVAL_SECONDS
        self._task = asyncio.create_task(self._loop(interval))
        logger.warning(f"✅ Subscription renewal scheduler started ({interval}s)")

    def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None

    async def _loop(self, interval: int):
        # 부팅 직후는 다른 초기화와 겹친다. 결제는 서두를 이유가 가장 적은 작업이다.
        await asyncio.sleep(90)
        while self._running:
            try:
                result = await run_due()
                if result["due"]:
                    logger.warning(f"[renewal] tick: {result['renewed']}/{result['due']} 갱신")
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"[renewal] tick 실패: {e}")
            await asyncio.sleep(interval)


renewal_scheduler = RenewalScheduler()
