"""
지수 시계열 자동 스냅샷 스케줄러.

사용자가 분석 버튼을 누른 날에만 점이 찍히면 그래프가 "언제 올랐는지"를 말해주지
못한다(분석을 안 한 두 달은 직선으로 보인다). 그래서 최근에 분석된 적 있는 블로그를
하루 1회 자동 재측정해 점을 채운다.

부하 원칙:
- worker 프로세스에서만 기동한다. API 프로세스에서 돌리면 스크래핑이 이벤트루프를
  점유해 로그인 hang 이 재발한다 (project_login_hang_worker_offload).
- 블로그 사이에 간격을 두고, 하루 처리량에 상한을 둔다.
"""
import asyncio
import logging
import os

logger = logging.getLogger(__name__)

# 대상 상한 — 티어별 요금제가 아니라 순수 부하 상한이다.
DAILY_CAP = int(os.environ.get("INDEX_SNAPSHOT_DAILY_CAP", "60"))
# 블로그 간 간격(초)
SPACING_SECONDS = int(os.environ.get("INDEX_SNAPSHOT_SPACING", "20"))
# 최근 N일 안에 측정 이력이 있는 블로그만 따라간다(영원히 늘어나지 않게)
ACTIVE_WINDOW_DAYS = int(os.environ.get("INDEX_SNAPSHOT_ACTIVE_DAYS", "45"))


class IndexSnapshotScheduler:
    def __init__(self):
        self._task = None
        self._running = False

    def start(self, interval_seconds: int = 6 * 3600):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop(interval_seconds))

    def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None

    async def _loop(self, interval_seconds: int):
        # 부팅 직후는 다른 초기화와 겹치므로 잠깐 물러선다
        await asyncio.sleep(180)
        while self._running:
            try:
                await self.run_once()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"[index-snapshot] tick failed: {e}")
            await asyncio.sleep(interval_seconds)

    async def run_once(self) -> dict:
        from database.blog_index_history_db import (
            get_tracked_blog_ids,
            has_snapshot_today,
            record_snapshot,
        )
        from routers.blogs import analyze_blog

        blog_ids = await asyncio.to_thread(
            get_tracked_blog_ids, ACTIVE_WINDOW_DAYS, DAILY_CAP * 3
        )
        todo = []
        for bid in blog_ids:
            if len(todo) >= DAILY_CAP:
                break
            if not await asyncio.to_thread(has_snapshot_today, bid):
                todo.append(bid)

        if not todo:
            return {"checked": len(blog_ids), "captured": 0}

        logger.info(f"[index-snapshot] capturing {len(todo)} blogs")
        captured = 0
        for bid in todo:
            if not self._running:
                break
            try:
                result = await analyze_blog(bid)
                if result.get("error_code"):
                    logger.info(f"[index-snapshot] skip {bid}: {result['error_code']}")
                else:
                    ok = await asyncio.to_thread(
                        record_snapshot,
                        bid,
                        result.get("index", {}),
                        result.get("stats", {}),
                        "auto",
                    )
                    captured += 1 if ok else 0
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"[index-snapshot] {bid} failed: {e}")
            await asyncio.sleep(SPACING_SECONDS)

        logger.info(f"[index-snapshot] done: {captured}/{len(todo)} captured")
        return {"checked": len(blog_ids), "captured": captured}


index_snapshot_scheduler = IndexSnapshotScheduler()
