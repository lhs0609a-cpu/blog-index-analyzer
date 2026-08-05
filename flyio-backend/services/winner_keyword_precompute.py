"""
1위 가능 키워드 — SERP 측정 사전계산 (worker 전용).

사용자 요청 경로에서 SERP 를 긁던 것을 여기로 옮긴다. 여기서 측정하는 값은
누가 물어보든 동일한 값(키워드의 상위 10위 점수·인플루언서 수·검색량)이라
한 번 재서 전 사용자가 공유한다.

부하 원칙:
- worker 프로세스에서만 돈다. API 프로세스에서 돌리면 이벤트루프가 굶어
  /health 조차 30초로 밀린다 (2026-08-05 장애의 원인).
- 한 번에 카테고리 2개만. 오래 방치된 것부터 돌아가며 갱신한다.
- 카테고리 사이에 간격을 둔다.
"""
import asyncio
import logging
import os
from typing import List

logger = logging.getLogger(__name__)

# 블로그 주제 축. 특정 블로그가 아니라 '한국 블로그판 전반'을 덮는 것이 목적이다.
SEED_CATEGORIES: List[str] = [
    "맛집", "카페", "여행", "리뷰", "뷰티",
    "육아", "운동", "인테리어", "재테크", "요리",
    "반려동물", "패션", "캠핑", "독서", "건강",
]

CATEGORIES_PER_RUN = int(os.environ.get("WINNER_PRECOMPUTE_CATEGORIES", "2"))
SPACING_SECONDS = int(os.environ.get("WINNER_PRECOMPUTE_SPACING", "45"))
MAX_KEYWORDS_PER_CATEGORY = int(os.environ.get("WINNER_PRECOMPUTE_MAX_KW", "30"))
MIN_SEARCH_VOLUME = int(os.environ.get("WINNER_PRECOMPUTE_MIN_VOL", "300"))


async def precompute_category(category: str) -> int:
    """카테고리 하나를 측정해 캐시에 저장. 저장한 키워드 수를 돌려준다."""
    from database.winner_keyword_cache_db import upsert_keyword_stats, mark_category_run
    from services.blue_ocean_service import BlueOceanService

    service = BlueOceanService()
    try:
        # my_blog_id 를 넘기지 않는다 — 넘기면 블로그 재분석까지 딸려 오고,
        # 어차피 여기서 재는 값은 블로그와 무관하다.
        result = await service.analyze_blue_ocean(
            main_keyword=category,
            my_blog_id=None,
            expand=True,
            min_search_volume=MIN_SEARCH_VOLUME,
            max_keywords=MAX_KEYWORDS_PER_CATEGORY,
        )
    except Exception as e:
        logger.warning(f"[winner-precompute] {category} 측정 실패: {e}")
        await asyncio.to_thread(mark_category_run, category, 0, str(e)[:200])
        return 0

    rows = []
    for kw in getattr(result, "keywords", []) or []:
        scores = list(getattr(kw, "top10_scores", []) or [])
        rows.append({
            "keyword": kw.keyword,
            "category": category,
            "search_volume": getattr(kw, "search_volume", 0),
            "blog_ratio": getattr(kw, "blog_ratio", None),
            "top10_avg_score": getattr(kw, "top10_avg_score", None),
            "top10_min_score": getattr(kw, "top10_min_score", None),
            "top10_scores": scores,
            "influencer_count": getattr(kw, "influencer_count", 0),
            # 70점 이상 = 만만치 않은 상대. 확률 계산에 쓰이므로 여기서 세어 둔다.
            "high_scorer_count": sum(1 for s in scores if s and s >= 70),
            "safety_score": getattr(kw, "safety_score", None),
            "keyword_scope": getattr(kw, "keyword_scope", None),
            "bos_score": getattr(kw, "bos_score", None),
        })

    stored = await asyncio.to_thread(upsert_keyword_stats, rows)
    await asyncio.to_thread(mark_category_run, category, stored, None)
    logger.info(f"[winner-precompute] {category}: {stored}개 저장")
    return stored


async def run_once() -> dict:
    """가장 오래 방치된 카테고리부터 CATEGORIES_PER_RUN 개 갱신"""
    from database.winner_keyword_cache_db import (
        init_winner_cache_db, pick_categories_to_refresh, cache_summary,
    )

    await asyncio.to_thread(init_winner_cache_db)
    targets = await asyncio.to_thread(
        pick_categories_to_refresh, SEED_CATEGORIES, CATEGORIES_PER_RUN
    )
    if not targets:
        return {"categories": [], "stored": 0}

    logger.info(f"[winner-precompute] 대상: {targets}")
    total = 0
    for i, cat in enumerate(targets):
        total += await precompute_category(cat)
        if i < len(targets) - 1:
            await asyncio.sleep(SPACING_SECONDS)

    summary = await asyncio.to_thread(cache_summary)
    logger.info(f"[winner-precompute] 완료: +{total}, 캐시 {summary}")
    return {"categories": targets, "stored": total, "cache": summary}


class WinnerPrecomputeScheduler:
    def __init__(self):
        self._task = None
        self._running = False

    def start(self, interval_seconds: int = 3 * 3600):
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
        # 부팅 직후에는 다른 초기화와 겹치므로 물러선다
        await asyncio.sleep(240)
        while self._running:
            try:
                await run_once()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"[winner-precompute] tick 실패: {e}")
            await asyncio.sleep(interval_seconds)


winner_precompute_scheduler = WinnerPrecomputeScheduler()
