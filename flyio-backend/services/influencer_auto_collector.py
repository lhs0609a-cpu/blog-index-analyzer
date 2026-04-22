"""
인플루언서 자동 수집 스케줄러
- 새벽 3:10 (Asia/Seoul) 카테고리별 자동 검색으로 DB 축적
- Google CSE 쿼터: 일일 최대 30회 사용 (사용자 검색 여유분 70회)
- 순차 실행 + sleep 간격으로 서버 부하 방지
"""
import asyncio
import random
import logging
from datetime import datetime
from typing import Optional, Dict, List

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

# 카테고리별 검색 쿼리
SEARCH_TASKS: Dict[str, List[str]] = {
    "뷰티": ["뷰티 유튜버", "화장품 리뷰어", "메이크업 크리에이터"],
    "패션": ["패션 유튜버", "스타일링 인플루언서", "패션 하울"],
    "음식": ["먹방 유튜버", "요리 크리에이터", "맛집 리뷰어"],
    "여행": ["여행 유튜버", "여행 브이로그", "해외여행 크리에이터"],
    "테크": ["테크 유튜버", "IT 리뷰어", "가젯 리뷰"],
    "게임": ["게임 유튜버", "게임 스트리머", "모바일게임 크리에이터"],
    "운동": ["운동 유튜버", "피트니스 인플루언서", "헬스 크리에이터"],
    "교육": ["교육 유튜버", "공부법 크리에이터", "강의 유튜버"],
    "육아": ["육아 유튜버", "육아 브이로그", "키즈 크리에이터"],
    "반려동물": ["반려동물 유튜버", "강아지 유튜버", "고양이 유튜버"],
}


class InfluencerAutoCollector:
    """인플루언서 자동 수집 스케줄러"""

    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self._stats = {
            "last_run": None,
            "last_completed": None,
            "total_collected": 0,
            "today_searches": 0,
            "today_date": None,
            "errors": [],
            "is_running": False,
        }

    def start(self):
        """스케줄러 시작 — 매일 새벽 3:10 (Asia/Seoul)"""
        self.scheduler.add_job(
            self._daily_collection,
            CronTrigger(hour=3, minute=10, timezone="Asia/Seoul"),
            id="influencer_daily_collection",
            replace_existing=True,
        )
        self.scheduler.start()
        logger.info("Influencer auto collector scheduled (daily 03:10 KST)")

    def stop(self):
        """스케줄러 중지"""
        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)
            logger.info("Influencer auto collector stopped")

    def get_stats(self) -> dict:
        """수집 통계 반환"""
        return {**self._stats, "errors": self._stats["errors"][-10:]}

    def _generate_search_tasks(self) -> List[Dict]:
        """카테고리별 검색 태스크 생성 (셔플)"""
        tasks = []
        for category, queries in SEARCH_TASKS.items():
            for q in queries:
                tasks.append({"category": category, "query": q})
        random.shuffle(tasks)
        return tasks

    async def _daily_collection(self):
        """일일 자동 수집 실행"""
        if self._stats["is_running"]:
            logger.warning("Auto collection already running, skipping")
            return

        self._stats["is_running"] = True
        self._stats["last_run"] = datetime.utcnow().isoformat()
        today = datetime.utcnow().strftime("%Y-%m-%d")

        # 일일 카운터 리셋
        if self._stats["today_date"] != today:
            self._stats["today_searches"] = 0
            self._stats["today_date"] = today

        tasks = self._generate_search_tasks()
        collected = 0
        errors = []

        logger.info(f"Starting daily influencer collection: {len(tasks)} tasks")

        try:
            from services.influencer_discovery_service import get_influencer_discovery_service
            service = get_influencer_discovery_service()

            for i, task in enumerate(tasks):
                # 일일 최대 30회 제한 (사용자 여유분 70회)
                if self._stats["today_searches"] >= 30:
                    logger.info("Daily search limit (30) reached, stopping collection")
                    break

                try:
                    result = await service.search(
                        query=task["query"],
                        user_id="__auto_collector__",
                        platforms=["youtube"],
                        filters={"category": task["category"]},
                        sort_by="followers",
                        page=1,
                        page_size=10,
                    )

                    count = len(result.get("profiles", []))
                    collected += count
                    self._stats["today_searches"] += 1

                    logger.info(
                        f"[{i+1}/{len(tasks)}] '{task['query']}' → {count} profiles"
                    )

                except Exception as e:
                    err_msg = f"Task '{task['query']}': {str(e)}"
                    errors.append(err_msg)
                    logger.warning(f"Collection error: {err_msg}")

                # 서버 부하 방지: 5초 간격
                await asyncio.sleep(5)

        except Exception as e:
            errors.append(f"Fatal: {str(e)}")
            logger.error(f"Daily collection fatal error: {e}")
        finally:
            self._stats["is_running"] = False
            self._stats["last_completed"] = datetime.utcnow().isoformat()
            self._stats["total_collected"] += collected
            self._stats["errors"] = (self._stats["errors"] + errors)[-50:]

            logger.info(
                f"Daily collection completed: {collected} profiles collected, "
                f"{self._stats['today_searches']} searches used, {len(errors)} errors"
            )


# 싱글톤
_collector: Optional[InfluencerAutoCollector] = None


def get_auto_collector() -> InfluencerAutoCollector:
    global _collector
    if _collector is None:
        _collector = InfluencerAutoCollector()
    return _collector
