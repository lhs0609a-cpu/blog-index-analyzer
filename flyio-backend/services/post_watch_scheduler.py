"""
새 글 누락 감시 워커 — RSS 순회(60분)와 확인 큐(10분).

- 기본 비활성. POST_WATCH=1 이어야 돈다. 배포만으로는 아무 일도 없다.
- worker 프로세스에서만 기동한다(main.py RUN_SCHEDULERS). API 프로세스에서
  돌리면 외부 호출이 이벤트루프를 점유한다.
- 1단계는 기록만 한다. 알림 발송은 판정 정확도를 운영에서 확인한 뒤에 붙인다.
"""
import asyncio
import logging
import os
from database import post_watch_db as db

logger = logging.getLogger(__name__)

RSS_INTERVAL_SECONDS = int(os.environ.get("POST_WATCH_RSS_INTERVAL", "3600"))
CHECK_INTERVAL_SECONDS = int(os.environ.get("POST_WATCH_CHECK_INTERVAL", "600"))


def is_enabled() -> bool:
    return os.environ.get("POST_WATCH", "") == "1"


class PostWatchScheduler:
    def __init__(self):
        self._tasks = []
        self._running = False

    def start(self):
        if os.getenv('POST_WATCH_DEDICATED') == '1' and os.getenv('ROLE') != 'postwatch':
            return
        if self._running:
            return
        if not is_enabled():
            logger.info("⏭️  Post watch scheduler disabled (POST_WATCH != 1)")
            return
        self._running = True
        self._tasks = [
            asyncio.create_task(self._loop("rss", RSS_INTERVAL_SECONDS, 15)),
            asyncio.create_task(self._loop("check", CHECK_INTERVAL_SECONDS, 30)),
        ]
        logger.warning(
            f"✅ Post watch scheduler started (rss {RSS_INTERVAL_SECONDS}s, check {CHECK_INTERVAL_SECONDS}s)"
        )

    def stop(self):
        self._running = False
        for t in self._tasks:
            t.cancel()
        self._tasks = []

    async def _loop(self, kind: str, interval: int, initial_delay: int):
        from services import post_watch

        # 부팅 직후는 다른 초기화와 겹치므로 물러선다. RSS 가 먼저 돌도록 check 를 더 늦춘다.
        await asyncio.to_thread(db.record_runtime, kind, {'state': 'starting', 'pid': os.getpid(), 'interval_seconds': interval})
        await asyncio.sleep(initial_delay)
        if kind == 'check':
            await asyncio.to_thread(db.repair_legacy_verdicts)
        while self._running:
            try:
                await asyncio.to_thread(db.record_runtime, kind, {'state': 'running', 'pid': os.getpid(), 'interval_seconds': interval})
                result = await (post_watch.poll_all() if kind == "rss" else post_watch.check_due())
                await asyncio.to_thread(db.record_runtime, kind, {'state': 'completed', 'pid': os.getpid(), 'interval_seconds': interval, 'result': result})
                logger.warning(f"[post-watch] {kind}: {result}")
            except asyncio.CancelledError:
                raise
            except Exception as e:
                await asyncio.to_thread(db.record_runtime, kind, {'state': 'failed', 'pid': os.getpid(), 'error': type(e).__name__, 'interval_seconds': interval})
                logger.warning(f"[post-watch] {kind} tick failed: {e}")
            await asyncio.sleep(interval)


post_watch_scheduler = PostWatchScheduler()
