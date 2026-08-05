#!/usr/bin/env python3
"""
1위 가능 키워드 SERP 측정 — 별도 프로세스 진입점.

왜 별도 프로세스인가:
fly.toml 에 [processes] 정의가 없어 이 앱은 단일 머신(shared 2 CPU)으로 뜬다.
즉 'worker 전용 스케줄러'라고 해도 실제로는 API 와 같은 프로세스에서 돈다.
SERP 파싱은 CPU 를 오래 잡아 이벤트루프를 굶기므로, 그대로 두면 3시간마다
2026-08-05 장애(요청 1건이 /health 를 30초로 밀던 그것)가 재현된다.

프로세스를 분리하면 OS 스케줄러가 CPU 를 나눠 주므로 API 이벤트루프는 계속 돈다.

사용:
    python -m scripts.precompute_winner_keywords            # 1회 실행
    python -m scripts.precompute_winner_keywords --categories 1
"""
import argparse
import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [precompute] %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--categories", type=int, default=None,
                    help="이번 실행에서 갱신할 카테고리 수")
    args = ap.parse_args()

    if args.categories:
        os.environ["WINNER_PRECOMPUTE_CATEGORIES"] = str(args.categories)

    from services.winner_keyword_precompute import run_once

    result = await run_once()
    logger.info(f"결과: {result}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except KeyboardInterrupt:
        sys.exit(130)
