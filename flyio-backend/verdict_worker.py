"""키워드 판정 전용 워커 프로세스
=====================================

**왜 프로세스를 따로 두나 (2026-08-13 프로덕션 실측)**

판정 한 건이 225초 걸렸는데 그 중

  · 115초 = 큐에 적재만 되고 **아직 시작도 못 한 시간**
  ·  76초 = SERP (그 중 32초가 브라우저 콜드 기동)
  ·  38초 = 실제 채점

즉 절반 이상이 대기였다. 원인은 판정 워치독이 키워드 풀 크론 9계정과 **같은 프로세스**
(nice 19)에 얹혀 있어서다. 크론 tick 하나가 CPU 를 잡으면 2초 틱 워치독이 100초 넘게
밀리고, 우선순위 게이트는 tick **경계**에서만 양보시키므로 이미 돌던 tick 은 못 끊는다.

그래서 판정만 떼어 별도 OS 프로세스로 돌린다. 별도 GIL + nice 5(API 0 과 크론 19 사이)
라 크론이 아무리 CPU 를 써도 판정은 즉시 깨어난다. **머신은 그대로다** — 프로세스 하나가
늘 뿐이라 요금은 변하지 않는다(fly 는 머신 단위 과금).

부팅 즉시 브라우저를 띄워 둔다(prewarm). 콜드 기동 32초는 사용자가 낼 비용이 아니라
프로세스가 미리 낼 비용이다.

실행: entrypoint.sh 에서 `nice -n 5 python verdict_worker.py`
"""

import asyncio
import logging
import os
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("verdict_worker")


async def _prewarm() -> None:
    """첫 사용자가 브라우저 기동을 기다리지 않게 미리 띄운다."""
    try:
        from services.keyword_verdict import _get_browser
        await _get_browser()
        logger.warning("[kwv-w] 브라우저 prewarm 완료")
    except Exception as e:
        logger.warning(f"[kwv-w] 브라우저 prewarm 실패(요청 시 다시 시도): {e}")


async def main() -> None:
    from services.keyword_verdict_queue import watchdog_loop

    logger.warning(f"[kwv-w] 판정 전용 워커 시작 pid={os.getpid()} "
                   f"nice={os.nice(0)}")
    # prewarm 은 워치독을 막지 않게 백그라운드로 — 부팅 직후 들어온 job 이 기다릴 이유가 없다.
    asyncio.create_task(_prewarm())
    await watchdog_loop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
