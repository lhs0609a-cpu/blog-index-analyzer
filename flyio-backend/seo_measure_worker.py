"""SEO 키워드 측정 전용 워커 프로세스
=====================================

**왜 프로세스를 따로 두나 (2026-09-27 프로덕션 실측)**

큐에 266,297개를 쌓아놓고 발행이 514개에서 멈춰 있었다. 측정이 느린 게 아니라
**한 건도 완료되지 않고 있었다** — 크론으로 돌려도, 스케줄러 프로세스 안에서
자체 루프로 돌려도 마찬가지였다. 그런데 `flyctl ssh` 로 같은 코드를 **별도
프로세스**에서 돌리면 220초에 정상으로 끝났다.

차이는 이벤트루프 경합이다. 로그가 그대로 보여준다:

    apscheduler … "키워드 풀 collect (5분 주기)" skipped:
        maximum number of running instances reached (1)
    apscheduler … "키워드 풀 시드 amplify (10분 주기)" was missed by 0:05:22
    [NaverApiCircuitBreaker:default] OPEN — 10회 연속 실패

키워드 풀 크론이 끝나기 전에 다음 틱이 와서 계속 밀리고 있고, 그 프로세스의
이벤트루프에 얹힌 측정 코루틴은 깨어날 틈을 못 얻는다.
verdict_worker 가 분리된 이유와 **정확히 같은 문제**다(그때는 2초 틱이
100초 넘게 밀렸다).

그래서 측정만 떼어 별도 OS 프로세스로 돌린다. 별도 GIL + 자기 이벤트루프라
크론이 CPU 를 아무리 써도 측정은 자기 속도로 돈다. **머신은 그대로다** —
프로세스 하나가 늘 뿐이라 요금은 변하지 않는다(fly 는 머신 단위 과금).

nice 는 10 으로 둔다. API(0) 와 판정(5) 보다 뒤, 키워드 풀 크론(19) 보다 앞이다.
측정은 사용자가 기다리는 작업이 아니지만, 크론에 밀려 굶으면 안 된다.

실행: entrypoint.sh 에서 `nice -n 10 python seo_measure_worker.py`
끄기: `/data/_seo_loop_off` 파일을 만들면 재배포 없이 멈춘다.
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
logger = logging.getLogger("seo_measure_worker")


async def main() -> None:
    # 이 프로세스가 전담한다는 표시. uvicorn 쪽 lifespan 은 이걸 보고 루프를 안 켠다
    # (같은 큐를 둘이 claim 하면 안 된다 — KWV_DEDICATED 와 같은 규약).
    os.environ["SEO_LOOP_DEDICATED"] = "1"

    from services.seo_page_builder import (
        MEASURE_LOOP_BATCH,
        MEASURE_LOOP_REST_S,
        seo_measure_loop,
    )

    logger.info(
        f"SEO 측정 워커 시작 pid={os.getpid()} "
        f"(배치 {MEASURE_LOOP_BATCH}개 / 간격 {MEASURE_LOOP_REST_S}초)"
    )
    await seo_measure_loop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("SEO 측정 워커 종료")
