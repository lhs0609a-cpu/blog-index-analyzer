"""키워드 풀 cron 백엔드 자체 스케줄러.

GitHub Actions schedule cron은 5분 주기 신뢰성이 낮음 (지연·skip 빈번).
fly machine always-on 활용해 자력으로 매 N초마다 워커 호출.

사용:
  from services.keyword_pool_scheduler import keyword_pool_scheduler
  keyword_pool_scheduler.start(interval_seconds=300)
"""
import asyncio
import logging
from datetime import datetime, timedelta
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
        # 모든 cron 에 next_run_time 시차 적용 — deploy 직후 첫 발동 보장 +
        # 동시 호출 폭주 방지. fly auto-deploy 후 cron interval 까지 대기 안 함.
        _now = datetime.now()
        self.scheduler.add_job(
            self._collect_only,
            IntervalTrigger(seconds=interval_seconds),
            id="keyword_pool_collect",
            name="키워드 풀 collect (5분 주기)",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            next_run_time=_now + timedelta(seconds=10),
        )
        self.scheduler.add_job(
            self._register_only,
            IntervalTrigger(seconds=90),
            id="keyword_pool_register",
            name="키워드 풀 register (90초 주기, 빠른 채움)",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            next_run_time=_now + timedelta(seconds=20),
        )
        self.scheduler.add_job(
            self._inspect_full,
            IntervalTrigger(seconds=600),
            id="keyword_pool_inspect_full",
            name="키워드 풀 전체 노출제한 검사 (10분 주기)",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            next_run_time=_now + timedelta(seconds=120),
        )
        self.scheduler.add_job(
            self._ai_classify_tick,
            IntervalTrigger(seconds=300),
            id="keyword_pool_ai_classify",
            name="키워드 풀 AI reject 분류 (5분 tick, 30분 쿨다운)",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            next_run_time=_now + timedelta(seconds=30),
        )
        self.scheduler.add_job(
            self._autocomplete_mining_tick,
            IntervalTrigger(seconds=300),
            id="keyword_pool_autocomplete_mining",
            name="키워드 풀 자동완성 mining (5분 주기, 시드 200개 rotate)",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            next_run_time=_now + timedelta(seconds=60),
        )
        self.scheduler.add_job(
            self._seed_amplify_tick,
            IntervalTrigger(seconds=600),
            id="keyword_pool_seed_amplify",
            name="키워드 풀 시드 amplify (10분 주기, GPT 패턴 펼침)",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            next_run_time=_now + timedelta(seconds=90),
        )
        # AI 의미 분류 cleanup cron — 등록 KW 대량 DELETE 사고로 비활성.
        # 한 광고주 ~4만 KW 가 GPT 컷 판정으로 다 사라짐 (시드 ↔ 등록 KW 의미 거리 평가
        # 가 과민). 추가 단계의 inline AI 게이트 (`ai_inline`, collect 시 GPT 가
        # 자식 KW 분류 → approved 만 풀 합류) 가 이미 도메인 일치 필터링하므로,
        # 등록 후 사후 DELETE 는 중복이며 위험.
        # 켜고 싶으면 env KEYWORD_POOL_AI_CLEANUP_ENABLED=1 로 활성화 (그래도 신중히).
        import os as _os
        if _os.environ.get("KEYWORD_POOL_AI_CLEANUP_ENABLED") == "1":
            self.scheduler.add_job(
                self._ai_cleanup_tick,
                IntervalTrigger(seconds=600),
                id="keyword_pool_ai_cleanup",
                name="키워드 풀 AI 의미 분류 cleanup (10분 주기, 누적+신규)",
                replace_existing=True,
                max_instances=1,
                coalesce=True,
                next_run_time=_now + timedelta(seconds=240),
            )
        # Domain cleanup — 20분 주기 click 무관 KW 도메인 정리 (물갈이 핵심).
        # 30분 → 15분 시도했으나 fly 1 CPU 과부하 (cron 적체 + Naver ConnectTimeout 다수
        # + /usage 등 사용자 API 45s timeout). 20분으로 절충 — 시간당 1500개 회수.
        # saved_relevance 가 풍부할 때 (≥수백개) 만 발동되며 scoring 은 self_heal 과 동일.
        # 끄려면 env KEYWORD_POOL_DOMAIN_CLEANUP_DISABLED=1.
        if _os.environ.get("KEYWORD_POOL_DOMAIN_CLEANUP_DISABLED") != "1":
            self.scheduler.add_job(
                self._domain_cleanup_tick,
                IntervalTrigger(seconds=1200),
                id="keyword_pool_domain_cleanup",
                name="키워드 풀 도메인 자동 정리 (20분 주기, click 무관)",
                replace_existing=True,
                max_instances=1,
                coalesce=True,
                next_run_time=_now + timedelta(seconds=180),
            )
        # Click cleanup — 매 15분 (900s) 클릭 KW 점수 ≤ threshold 자동 DELETE.
        self.scheduler.add_job(
            self._click_cleanup_tick,
            IntervalTrigger(seconds=900),
            id="keyword_pool_click_cleanup",
            name="키워드 풀 click cleanup (15분 주기)",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            next_run_time=_now + timedelta(seconds=150),
        )
        self.scheduler.start()
        self._running = True
        _ai_cleanup_status = (
            "ai_cleanup 600s"
            if _os.environ.get("KEYWORD_POOL_AI_CLEANUP_ENABLED") == "1"
            else "ai_cleanup OFF"
        )
        _domain_cleanup_status = (
            "domain_cleanup OFF"
            if _os.environ.get("KEYWORD_POOL_DOMAIN_CLEANUP_DISABLED") == "1"
            else "domain_cleanup 1200s"
        )
        logger.warning(
            f"[pool/scheduler] 시작 (AI-first 빠른 채움) — collect {interval_seconds}s / "
            f"register 90s / inspect 600s / ai_classify 300s / "
            f"autocomplete 300s / seed_amplify 600s / {_ai_cleanup_status} / "
            f"{_domain_cleanup_status} / click_cleanup 900s"
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
                # 광고그룹 샘플 cap — 296개 그룹 × ~92 KW × naver API 0.5s = 150s+ event loop
                # 점유로 HTTP 응답 막힘 (10분 cron 인데 1 CPU 1 worker). 매 tick 랜덤 50개만
                # 검사 → ~25s. 6 tick (1시간) 안에 확률적으로 거의 모든 그룹 1회 cover.
                import random as _random
                SAMPLE_CAP = 50
                if len(ag_ids) > SAMPLE_CAP:
                    sampled = _random.sample(ag_ids, SAMPLE_CAP)
                else:
                    sampled = ag_ids
                client = NaverAdApiClient()
                client.customer_id = account["customer_id"]
                client.api_key = account["api_key"]
                client.secret_key = account["secret_key"]
                logger.warning(
                    f"[pool/inspect-full] user={uid} 시작 ({len(sampled)}/{len(ag_ids)} 그룹 샘플)"
                )
                await _inspect_ad_groups(uid, customer_id, client, sampled, delete_from_naver=True)
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

    async def _ai_cleanup_tick(self):
        """AI 의미 분류 cleanup cron — 신규 + 누적 KW 동시 audit.

        실측 보고: 한의원 광고주 (cid 1858907) 13만 등록 KW 중 99% drift (고추/농산물).
        atoms_2 인플레로 점수 기반 cleanup 이 못 잡음. GPT 의미 분류만 정확.

        매 cron:
          1) 인크리멘탈 — 최근 10분 신규 등록 KW max 500개 audit + DELETE
          2) 누적 — 전체 등록순 max 1500개 audit + DELETE (id DESC, 최근부터 점진)
        max DELETE 2000/광고주/cron — 13만 정리 약 5~6시간.
        """
        try:
            from config import settings
            if not settings.OPENAI_API_KEY:
                return
            from routers.naver_ad import _run_pool_ai_cleanup_registered
            from database.naver_ad_db import list_connected_ad_accounts
            accts = list_connected_ad_accounts() or []
            for a in accts:
                uid = a.get("user_id")
                cid = a.get("customer_id")
                if not uid or not cid:
                    continue
                # (1) 인크리멘탈 — 신규 KW 우선 (최근 10분)
                try:
                    await _run_pool_ai_cleanup_registered(
                        int(uid), int(cid),
                        dry_run=False, incremental_minutes=10, max_kws=500,
                    )
                except Exception as e:
                    logger.error(
                        f"[ai-cleanup/incr] 실패 user={uid} cid={cid}: {e}",
                        exc_info=True,
                    )
                # (2) 누적 — 최근 등록순 max 1500개 (이미 audit 된 것은 status='deleted'
                # 로 이미 빠져있으므로 dedup 효과 자연 발생)
                try:
                    await _run_pool_ai_cleanup_registered(
                        int(uid), int(cid),
                        dry_run=False, incremental_minutes=None, max_kws=1500,
                    )
                except Exception as e:
                    logger.error(
                        f"[ai-cleanup/bulk] 실패 user={uid} cid={cid}: {e}",
                        exc_info=True,
                    )
        except Exception as e:
            logger.error(
                f"[ai-cleanup] tick 실패: {type(e).__name__}: {e}", exc_info=True,
            )

    async def _seed_amplify_tick(self):
        """시드 amplify cron — GPT 가 user_seed 패턴 펼쳐 user_seed 합류.

        Layer 3 — 게이트 atom 다양성 확보. niche 도메인 시드의 cartesian 펼침으로
        다음 collect/autocomplete 의 BFS 시드 풀을 ↑.
        OPENAI_API_KEY 없으면 noop.
        """
        try:
            from config import settings
            if not settings.OPENAI_API_KEY:
                return
            from routers.naver_ad import _run_pool_seed_amplify
            from database.naver_ad_db import list_connected_ad_accounts
            accts = list_connected_ad_accounts() or []
            if not accts:
                return
            pairs = [(int(a["user_id"]), int(a["customer_id"]))
                     for a in accts if a.get("user_id") and a.get("customer_id")]
            for uid, cid in pairs:
                try:
                    # target 800 — AI-first 빠른 채움. 시드 펼침 → keywordstool 발굴 다양성 ↑.
                    await _run_pool_seed_amplify(uid, cid, target_count=800)
                except Exception as e:
                    logger.error(
                        f"[pool/amplify] 광고주 처리 실패 user={uid} cid={cid}: {e}",
                        exc_info=True,
                    )
        except Exception as e:
            logger.error(
                f"[pool/amplify] tick 실패: {type(e).__name__}: {e}", exc_info=True,
            )

    async def _autocomplete_mining_tick(self):
        """naver 자동완성 mining cron — 모든 활성 광고주 순회.

        keywordstool BFS 외 추가 발굴 채널. 시드별 자동완성 ~10 KW 수집 →
        검색량 검증 → GPT 분류 통과 KW 만 자식 풀 직접 추가.

        OPENAI_API_KEY 없으면 즉시 noop. 광고주별 쿨다운 없음 (GPT 호출 1회/cron).
        """
        try:
            from config import settings
            if not settings.OPENAI_API_KEY:
                return  # 조용히 skip — collect inline 게이트와 동일 정책
            from routers.naver_ad import _run_pool_autocomplete_mining
            from database.naver_ad_db import list_connected_ad_accounts
            accts = list_connected_ad_accounts() or []
            if not accts:
                return
            pairs = [(int(a["user_id"]), int(a["customer_id"]))
                     for a in accts if a.get("user_id") and a.get("customer_id")]
            for uid, cid in pairs:
                try:
                    await _run_pool_autocomplete_mining(uid, cid)
                except Exception as e:
                    logger.error(
                        f"[pool/autocomplete] 광고주 처리 실패 user={uid} cid={cid}: {e}",
                        exc_info=True,
                    )
        except Exception as e:
            logger.error(
                f"[pool/autocomplete] tick 실패: {type(e).__name__}: {e}",
                exc_info=True,
            )

    async def _ai_classify_tick(self):
        """광고주별로 deadlock 감지 시 AI 분류 발동 — reject 풀 → user_seed promote.

        트리거 조건 (둘 중 하나):
          - detect_collect_deadlock: 최근 5 collect 모두 added=0 + reject≥500
          - 미분류 reject 누적이 1000 초과 (분류 가치 큰 데이터 쌓임)

        쿨다운 30분은 _run_pool_ai_classify 내부에서 처리 (force=False).
        OPENAI_API_KEY 없으면 즉시 noop (로그만).
        """
        try:
            from config import settings
            if not settings.OPENAI_API_KEY:
                logger.warning("[pool/ai-classify] OPENAI_API_KEY 미설정 — skip")
                return
            from routers.naver_ad import _run_pool_ai_classify
            from database.naver_ad_db import list_connected_ad_accounts
            from database.keyword_pool_db import get_keyword_pool_db
            pool = get_keyword_pool_db()
            accts = list_connected_ad_accounts() or []
            if not accts:
                return
            pairs = [(int(a["user_id"]), int(a["customer_id"]))
                     for a in accts if a.get("user_id") and a.get("customer_id")]
            for uid, cid in pairs:
                try:
                    # 트리거 조건 — deadlock 또는 reject 1000+ 누적
                    deadlock = pool.detect_collect_deadlock(cid, n_recent=5, min_rejected=500)
                    rs = pool.reject_stats(cid)
                    pending_rejects = int(rs.get("pending", 0))
                    should_run = (
                        bool(deadlock.get("is_deadlock"))
                        or pending_rejects >= 1000
                    )
                    if not should_run:
                        continue
                    logger.warning(
                        f"[pool/ai-classify] user={uid} cid={cid} 트리거 "
                        f"(deadlock={deadlock.get('is_deadlock')}, "
                        f"pending_rejects={pending_rejects})"
                    )
                    await _run_pool_ai_classify(uid, cid)
                except Exception as e:
                    logger.error(
                        f"[pool/ai-classify] 광고주 처리 실패 user={uid} cid={cid}: {e}",
                        exc_info=True,
                    )
        except Exception as e:
            logger.error(f"[pool/ai-classify] tick 실패: {type(e).__name__}: {e}", exc_info=True)

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

    async def _domain_cleanup_tick(self):
        """매 30분 — auto_cleanup_enabled=1 광고주의 도메인 안 맞는 등록 KW 자동 DELETE.
        click 무관 — 100k 풀의 무관 잔재 점진 청소 (max_delete=500/광고주).
        빈 자리는 collect/register 가 새 도메인 KW 로 채움 → 100k 자기치유.

        click_cleanup_tick 과 동일 사고 (Naver API hang → 다음 tick 영구 skip) 가드:
        per-account 1200s, 전체 1500s timeout.
        """
        # interval 20분 (1200s) — 다음 tick 전에 끝나야 max_instances=1 안 막힘.
        PER_ACCOUNT_TIMEOUT = 800   # 13분 — 광고주 한 명 처리 한계
        TICK_TIMEOUT = 1050         # 17.5분 — 다음 20분 tick 전 양보
        try:
            from routers.naver_ad import _run_domain_cleanup_for_account
            from database.naver_ad_db import list_auto_cleanup_enabled_accounts
            rows = list_auto_cleanup_enabled_accounts() or []
            if not rows:
                logger.info("[pool/domain-cleanup/tick] 자동 cleanup ON 광고주 없음 — skip")
                return

            async def _run_all():
                for r in rows:
                    uid = int(r.get("user_id"))
                    cid = int(r.get("customer_id"))
                    thr = int(r.get("auto_cleanup_threshold") or 30)
                    try:
                        res = await asyncio.wait_for(
                            _run_domain_cleanup_for_account(uid, cid, thr, max_delete=500),
                            timeout=PER_ACCOUNT_TIMEOUT,
                        )
                        logger.warning(f"[pool/domain-cleanup/tick] uid={uid} cid={cid} thr={thr} → {res}")
                    except asyncio.TimeoutError:
                        logger.error(
                            f"[pool/domain-cleanup/tick] uid={uid} cid={cid} TIMEOUT "
                            f"({PER_ACCOUNT_TIMEOUT}s) — skip 후 다음 광고주 진행"
                        )
                    except Exception as e:
                        logger.error(
                            f"[pool/domain-cleanup/tick] uid={uid} cid={cid} 실패: "
                            f"{type(e).__name__}: {e}", exc_info=True
                        )

            try:
                await asyncio.wait_for(_run_all(), timeout=TICK_TIMEOUT)
            except asyncio.TimeoutError:
                logger.error(
                    f"[pool/domain-cleanup/tick] 전체 tick TIMEOUT ({TICK_TIMEOUT}s) — "
                    f"다음 30분 tick 으로 양보. accounts={len(rows)}"
                )
        except Exception as e:
            logger.error(f"[pool/domain-cleanup/tick] tick 실패: {type(e).__name__}: {e}", exc_info=True)

    async def _click_cleanup_tick(self):
        """매 15분 — auto_cleanup_enabled=1 광고주의 클릭 KW 중 점수 ≤ threshold 자동 DELETE.
        기존 GitHub Actions keyword-pool-auto-cleanup.yml 의 백엔드 내장 버전.

        과거 사고: per-account `_run_auto_cleanup_for_account` 가 네이버 stats API 응답
        지연으로 timeout 없이 무한 대기 → max_instances=1 + coalesce=True 라서 그 tick
        한 번에 다음 모든 ticks 영구 skip (사용자 관점에선 "하루 1번만 실행" 처럼 보임).
        per-account 600s, 전체 tick 700s 가드로 다음 tick 살아남게 보장.
        """
        PER_ACCOUNT_TIMEOUT = 600   # 10분 — 한 광고주 stats fetch 한계
        TICK_TIMEOUT = 700          # 11.7분 — 다음 15분 tick 전에 무조건 양보
        try:
            from routers.naver_ad import _run_auto_cleanup_for_account
            from database.naver_ad_db import list_auto_cleanup_enabled_accounts
            rows = list_auto_cleanup_enabled_accounts() or []
            if not rows:
                return

            async def _run_all():
                for r in rows:
                    uid = int(r.get("user_id"))
                    cid = int(r.get("customer_id"))
                    thr = int(r.get("auto_cleanup_threshold") or 30)
                    try:
                        res = await asyncio.wait_for(
                            _run_auto_cleanup_for_account(uid, cid, thr),
                            timeout=PER_ACCOUNT_TIMEOUT,
                        )
                        logger.info(f"[pool/click-cleanup/tick] uid={uid} cid={cid} → {res}")
                    except asyncio.TimeoutError:
                        logger.error(
                            f"[pool/click-cleanup/tick] uid={uid} cid={cid} TIMEOUT "
                            f"({PER_ACCOUNT_TIMEOUT}s) — Naver stats API hang 의심. skip 후 다음 광고주 진행"
                        )
                    except Exception as e:
                        logger.error(
                            f"[pool/click-cleanup/tick] uid={uid} cid={cid} 실패: "
                            f"{type(e).__name__}: {e}", exc_info=True
                        )

            try:
                await asyncio.wait_for(_run_all(), timeout=TICK_TIMEOUT)
            except asyncio.TimeoutError:
                logger.error(
                    f"[pool/click-cleanup/tick] 전체 tick TIMEOUT ({TICK_TIMEOUT}s) — "
                    f"다음 15분 tick 으로 양보. accounts={len(rows)}"
                )
        except Exception as e:
            logger.error(f"[pool/click-cleanup/tick] tick 실패: {type(e).__name__}: {e}", exc_info=True)


keyword_pool_scheduler = KeywordPoolScheduler()
