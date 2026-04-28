"""키워드 풀 cron 백엔드 자체 스케줄러.

GitHub Actions schedule cron은 5분 주기 신뢰성이 낮음 (지연·skip 빈번).
fly machine always-on 활용해 자력으로 매 N초마다 워커 호출.

사용:
  from services.keyword_pool_scheduler import keyword_pool_scheduler
  keyword_pool_scheduler.start(interval_seconds=300)
"""
import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)


class KeywordPoolScheduler:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self._running = False
        self._lock = asyncio.Lock()

    def start(self, interval_seconds: int = 300):
        if self._running:
            logger.warning("Keyword pool scheduler 이미 실행 중")
            return
        self.scheduler.add_job(
            self._tick,
            IntervalTrigger(seconds=interval_seconds),
            id="keyword_pool_tick",
            name="키워드 풀 cron (collect+register)",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        self.scheduler.start()
        self._running = True
        logger.warning(f"[pool/scheduler] 시작 (interval={interval_seconds}s)")

    def stop(self):
        if self._running:
            self.scheduler.shutdown(wait=False)
            self._running = False

    async def _tick(self):
        if self._lock.locked():
            logger.warning("[pool/scheduler] 이전 tick 진행 중 — skip")
            return
        async with self._lock:
            try:
                from routers.naver_ad import _run_pool_workers_for_users
                from database.naver_ad_db import list_connected_ad_accounts
                accts = list_connected_ad_accounts() or []
                user_ids = [a["user_id"] for a in accts if a.get("user_id")]
                if not user_ids:
                    logger.info("[pool/scheduler] 활성 광고 계정 없음 — skip")
                    return
                logger.warning(f"[pool/scheduler] tick start — users={user_ids}")
                await _run_pool_workers_for_users(user_ids)
                logger.warning(f"[pool/scheduler] tick done — users={user_ids}")
            except Exception as e:
                logger.error(f"[pool/scheduler] tick 실패: {type(e).__name__}: {e}", exc_info=True)


keyword_pool_scheduler = KeywordPoolScheduler()
