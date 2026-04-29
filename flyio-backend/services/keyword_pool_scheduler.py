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
        # 3 분리: collect 5분, register 2분, inspect-full 10분.
        # 과거: tick 한 번에 collect+register+inspect 다 돌려서 5분 초과 → max_instances=1
        # 으로 다음 tick 스킵 → register 가 40분 동안 못 돌아가는 사고 발생.
        self.scheduler.add_job(
            self._collect_only,
            IntervalTrigger(seconds=interval_seconds),
            id="keyword_pool_collect",
            name="키워드 풀 collect (5분 주기)",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        self.scheduler.add_job(
            self._register_only,
            IntervalTrigger(seconds=120),
            id="keyword_pool_register",
            name="키워드 풀 register (2분 주기)",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        self.scheduler.add_job(
            self._inspect_full,
            IntervalTrigger(seconds=600),
            id="keyword_pool_inspect_full",
            name="키워드 풀 전체 노출제한 검사 (10분 주기)",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        self.scheduler.start()
        self._running = True
        logger.warning(
            f"[pool/scheduler] 시작 — collect {interval_seconds}s / register 120s / inspect 600s"
        )

    def stop(self):
        if self._running:
            self.scheduler.shutdown(wait=False)
            self._running = False

    async def _inspect_full(self):
        """전체 풀 광고그룹 노출제한 검사 + 자동 네이버 DELETE/PAUSE.
        다중 광고주(B 시나리오) — (user_id, customer_id) 페어 모두 처리."""
        try:
            from routers.naver_ad import _inspect_ad_groups
            from database.naver_ad_db import list_connected_ad_accounts, get_ad_account_by_customer
            from database.registered_keywords_db import get_registered_keywords_db
            from services.naver_ad_service import NaverAdApiClient
            import sqlite3
            accts = list_connected_ad_accounts() or []
            for a in accts:
                uid = a.get("user_id")
                cid_str = a.get("customer_id")
                if not uid or not cid_str:
                    continue
                account = get_ad_account_by_customer(uid, str(cid_str))
                if not account or not account.get("is_connected"):
                    continue
                customer_id = int(account.get("customer_id"))
                reg = get_registered_keywords_db()
                with sqlite3.connect(reg.db_path) as conn:
                    ag_ids = [r[0] for r in conn.execute(
                        "SELECT DISTINCT ad_group_id FROM registered_keywords WHERE account_customer_id=? AND ad_group_id IS NOT NULL",
                        (customer_id,),
                    ).fetchall()]
                if not ag_ids:
                    continue
                client = NaverAdApiClient()
                client.customer_id = account["customer_id"]
                client.api_key = account["api_key"]
                client.secret_key = account["secret_key"]
                logger.warning(f"[pool/inspect-full] user={uid} 시작 ({len(ag_ids)} 그룹)")
                await _inspect_ad_groups(uid, customer_id, client, ag_ids, delete_from_naver=True)
                logger.warning(f"[pool/inspect-full] user={uid} 완료")
        except Exception as e:
            logger.error(f"[pool/inspect-full] 실패: {e}", exc_info=True)

    async def _collect_only(self):
        """collect 만 — 모든 활성 광고주 순차. register/inspect 는 별도 cron."""
        try:
            from routers.naver_ad import _run_pool_collect
            from database.naver_ad_db import list_connected_ad_accounts
            accts = list_connected_ad_accounts() or []
            if not accts:
                return
            pairs = [(int(a["user_id"]), int(a["customer_id"])) for a in accts if a.get("user_id") and a.get("customer_id")]
            logger.warning(f"[pool/scheduler] collect tick — accounts={len(pairs)}")
            for uid, cid in pairs:
                try:
                    await _run_pool_collect(uid, customer_id=cid)
                except Exception as e:
                    logger.error(f"[pool/scheduler] collect 실패 user={uid} cid={cid}: {e}", exc_info=True)
        except Exception as e:
            logger.error(f"[pool/scheduler] collect tick 실패: {type(e).__name__}: {e}", exc_info=True)

    async def _register_only(self):
        """register 만 — 2분 주기로 pending 빠르게 처리. 다른 cron 과 독립."""
        try:
            from routers.naver_ad import _run_pool_register
            from database.naver_ad_db import list_connected_ad_accounts
            accts = list_connected_ad_accounts() or []
            if not accts:
                return
            pairs = [(int(a["user_id"]), int(a["customer_id"])) for a in accts if a.get("user_id") and a.get("customer_id")]
            for uid, cid in pairs:
                try:
                    await _run_pool_register(uid, customer_id=cid)
                except Exception as e:
                    logger.error(f"[pool/scheduler] register 실패 user={uid} cid={cid}: {e}", exc_info=True)
        except Exception as e:
            logger.error(f"[pool/scheduler] register tick 실패: {type(e).__name__}: {e}", exc_info=True)


keyword_pool_scheduler = KeywordPoolScheduler()
