"""
FastAPI 메인 애플리케이션
Version: 2.3.1 - Rate limiting + security hardening
"""
import os
import time
from collections import defaultdict
from fastapi import FastAPI, APIRouter, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
import logging

from config import settings

# 로깅 설정
logging.basicConfig(
    level=logging.INFO if settings.DEBUG else logging.WARNING,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Process group gate — scheduler/cron 분리.
# fly.io 가 process group 이름을 FLY_PROCESS_GROUP env 로 주입한다 (app | worker).
# 로컬/단일 머신은 ROLE 미설정 → "all" 폴백 (기존 동작 유지, backwards compatible).
#
# - app:    사용자 HTTP 만 처리. cron/heavy scheduler 미기동 → /usage 등 즉시 응답.
# - worker: cron/heavy scheduler 만 기동. uvicorn 은 살아있으나 트래픽 안 받음
#           (fly services 는 app group 바인딩).
# - all:    둘 다 (단일 머신 모드, 로컬 dev).
# ─────────────────────────────────────────────────────────────────────────────
PROCESS_GROUP = os.getenv("FLY_PROCESS_GROUP") or os.getenv("ROLE", "all")
# fly.toml 에 [processes] 정의 없는 단일 machine 모드 — http_service.processes=["app"]
# 이라 FLY_PROCESS_GROUP="app" 자동 설정됨. 옛 RUN_SCHEDULERS 가 ("worker","all") 만
# 허용했으나 단일 머신이라 분리 무의미 + scheduler 영구 정지 사고 발생.
# 모든 process 에서 scheduler 기동 — 강제로 SCHEDULERS_DISABLED=1 시에만 끔.
_SCHED_DISABLED = os.getenv("SCHEDULERS_DISABLED") == "1"
RUN_SCHEDULERS = not _SCHED_DISABLED
RUN_API_ONLY = PROCESS_GROUP == "app" and _SCHED_DISABLED
logger_init = logging.getLogger(__name__)
logger_init.warning(
    f"[lifespan] PROCESS_GROUP={PROCESS_GROUP} RUN_SCHEDULERS={RUN_SCHEDULERS}"
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """애플리케이션 라이프사이클 관리"""
    # Startup
    logger.info(f"🚀 {settings.APP_NAME} starting up...")
    logger.info(f"Environment: {settings.APP_ENV}")
    logger.info(f"Debug mode: {settings.DEBUG}")
    logger.warning(f"🎭 Process group: {PROCESS_GROUP} (schedulers={RUN_SCHEDULERS})")

    # 데이터베이스 연결 초기화
    try:
        from database.sqlite_db import initialize_db
        initialize_db()
        logger.info("✅ SQLite database initialized")
    except Exception as e:
        logger.error(f"❌ Failed to initialize database: {e}")

    # Learning DB 초기화
    try:
        from database.learning_db import init_learning_tables
        init_learning_tables()
        logger.info("✅ Learning database tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ Learning tables initialization failed: {e}")

    # Top Posts Analysis DB 초기화
    try:
        from database.top_posts_db import init_top_posts_tables
        init_top_posts_tables()
        logger.info("✅ Top posts analysis tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ Top posts tables initialization failed: {e}")

    # Subscription DB 초기화
    try:
        from database.subscription_db import init_subscription_tables
        init_subscription_tables()
        logger.info("✅ Subscription tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ Subscription tables initialization failed: {e}")

    # User DB 초기화
    try:
        from database.user_db import get_user_db
        get_user_db()  # 초기화 시 자동으로 테이블 생성
        logger.info("✅ User authentication tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ User tables initialization failed: {e}")

    # 관리자 계정 자동 설정 (환경변수에서 읽음)
    try:
        from database.user_db import get_user_db
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

        user_db = get_user_db()
        admin_email = os.getenv("ADMIN_EMAIL")
        admin_password = os.getenv("ADMIN_PASSWORD")

        # 환경변수가 설정되어 있으면 관리자 생성
        if admin_email and admin_password:
            existing_user = user_db.get_user_by_email(admin_email)
            if existing_user:
                # 기존 사용자를 관리자로 업그레이드
                user_db.set_admin(existing_user["id"], True)
                user_db.update_user(
                    existing_user["id"],
                    hashed_password=pwd_context.hash(admin_password),
                    plan="business",
                    is_premium_granted=1
                )
                logger.info(f"✅ Admin user {admin_email} updated")
            else:
                # 새 관리자 계정 생성
                hashed_password = pwd_context.hash(admin_password)
                user_id = user_db.create_user(
                    email=admin_email,
                    hashed_password=hashed_password,
                    name="관리자"
                )
                user_db.set_admin(user_id, True)
                user_db.update_user(user_id, plan="business", is_premium_granted=1)
                logger.info(f"✅ Admin user {admin_email} created")
        else:
            logger.warning("⚠️ ADMIN_EMAIL or ADMIN_PASSWORD not set. Skipping auto admin creation.")
    except Exception as e:
        logger.warning(f"⚠️ Admin user setup failed: {e}")

    # Usage tracking DB 초기화
    try:
        from database.usage_db import get_usage_db
        get_usage_db()  # 초기화 시 자동으로 테이블 생성
        logger.info("✅ Usage tracking tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ Usage tracking tables initialization failed: {e}")

    # Naver Ad Optimization DB 초기화
    try:
        from database.naver_ad_db import init_naver_ad_tables
        init_naver_ad_tables()
        logger.info("✅ Naver Ad optimization tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ Naver Ad tables initialization failed: {e}")

    # Legal Compliance DB 초기화
    try:
        from database.compliance_db import init_compliance_tables
        init_compliance_tables()
        logger.info("✅ Legal compliance tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ Legal compliance tables initialization failed: {e}")

    # Challenge DB 초기화
    try:
        from database.challenge_db import init_challenge_tables
        init_challenge_tables()
        logger.info("✅ Challenge tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ Challenge tables initialization failed: {e}")

    # User Blogs DB 초기화
    try:
        from database.user_blogs_db import init_user_blogs_tables
        init_user_blogs_tables()
        logger.info("✅ User blogs tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ User blogs tables initialization failed: {e}")

    # Keyword Analysis DB 초기화
    try:
        from database.keyword_analysis_db import init_keyword_analysis_tables
        init_keyword_analysis_tables()
        logger.info("✅ Keyword analysis tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ Keyword analysis tables initialization failed: {e}")

    # 자동 백업 스케줄러 시작 (2시간마다 - 리소스 절약)
    if RUN_SCHEDULERS:
        try:
            from services.backup_service import backup_scheduler
            backup_scheduler.start()
            logger.info("✅ Backup scheduler started (every 2 hours)")
        except Exception as e:
            logger.warning(f"⚠️ Backup scheduler failed to start: {e}")
    else:
        logger.info("⏭️  Backup scheduler skipped (app process — worker only)")

    # 자동 학습 스케줄러 시작 (비활성화 - 메모리 절약, 필요시 API로 수동 활성화)
    try:
        from services.auto_learning_service import auto_learning_scheduler
        # auto_learning_scheduler.start()  # 메모리 절약을 위해 비활성화
        logger.info("⚠️ Auto learning scheduler DISABLED (memory optimization)")
    except Exception as e:
        logger.warning(f"⚠️ Auto learning scheduler failed to start: {e}")

    # 광고 자동 최적화 스케줄러 시작
    if RUN_SCHEDULERS:
        try:
            from services.ad_auto_optimizer import ad_auto_optimizer
            ad_auto_optimizer.start(interval_seconds=900)  # 15분마다 실행 (메모리 절약)
            logger.info("✅ Ad auto optimizer started (every 15 min)")
        except Exception as e:
            logger.warning(f"⚠️ Ad auto optimizer failed to start: {e}")

    # 키워드 풀 스케줄러 — 백엔드 자체 cron (GitHub Actions schedule 신뢰성 낮음)
    if RUN_SCHEDULERS:
        try:
            from services.keyword_pool_scheduler import keyword_pool_scheduler
            keyword_pool_scheduler.start(interval_seconds=300)  # 매 5분 (1 CPU fly 부하 분산)
            logger.info("✅ Keyword pool scheduler started (every 5 min, balanced load)")
        except Exception as e:
            logger.warning(f"⚠️ Keyword pool scheduler failed to start: {e}")

    # Threads DB 초기화
    try:
        from database.threads_db import init_threads_db
        init_threads_db()
        logger.info("✅ Threads tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ Threads tables initialization failed: {e}")

    # Threads 자동 게시 스케줄러 시작
    if RUN_SCHEDULERS:
        try:
            from services.threads_auto_poster import threads_auto_poster
            threads_auto_poster.start(interval_seconds=900)  # 15분마다 실행 (메모리 절약)
            logger.info("✅ Threads auto poster started (every 15 min)")
        except Exception as e:
            logger.warning(f"⚠️ Threads auto poster failed to start: {e}")

    # X (Twitter) DB 초기화
    try:
        from database.x_db import init_x_tables
        init_x_tables()
        logger.info("✅ X (Twitter) tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ X tables initialization failed: {e}")

    # X 자동 게시 스케줄러 시작
    if RUN_SCHEDULERS:
        try:
            from services.x_auto_poster import start_auto_poster
            start_auto_poster()
            logger.info("✅ X auto poster started (every 5 min)")
        except Exception as e:
            logger.warning(f"⚠️ X auto poster failed to start: {e}")

    # Ad Optimization DB 초기화
    try:
        from database.ad_optimization_db import init_ad_optimization_tables
        init_ad_optimization_tables()
        logger.info("✅ Ad optimization tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ Ad optimization tables initialization failed: {e}")

    # Community DB 초기화
    try:
        from database.community_db import init_community_tables
        init_community_tables()
        logger.info("✅ Community tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ Community tables initialization failed: {e}")

    # 커뮤니티 콘텐츠 자동 생성 스케줄러 시작
    if RUN_SCHEDULERS:
        try:
            from services.content_scheduler import get_scheduler
            content_scheduler = get_scheduler()
            content_scheduler.start()
            logger.info("✅ Community content scheduler started")
        except Exception as e:
            logger.warning(f"⚠️ Community content scheduler failed to start: {e}")

    # A/B Test DB 초기화
    try:
        from database.ab_test_db import get_ab_test_db
        get_ab_test_db()
        logger.info("✅ A/B test tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ A/B test tables initialization failed: {e}")

    # Recommendation DB 초기화
    try:
        from database.recommendation_db import get_recommendation_db
        get_recommendation_db()
        logger.info("✅ Recommendation tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ Recommendation tables initialization failed: {e}")

    # Notification DB 초기화
    try:
        from database.notification_db import get_notification_db
        get_notification_db()
        logger.info("✅ Notification tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ Notification tables initialization failed: {e}")

    # Redis 연결 초기화 (선택적)
    if settings.REDIS_URL:
        try:
            # Redis 연결 코드 (필요 시 구현)
            logger.info("⚠️ Redis not configured (optional)")
        except Exception as e:
            logger.warning(f"⚠️ Redis connection failed (optional): {e}")

    # Sentry 초기화 (선택적)
    if settings.SENTRY_DSN:
        try:
            import sentry_sdk
            sentry_sdk.init(dsn=settings.SENTRY_DSN, environment=settings.APP_ENV)
            logger.info("✅ Sentry initialized")
        except Exception as e:
            logger.warning(f"⚠️ Sentry initialization failed (optional): {e}")

    # 커뮤니티 자동 글 생성 시작 (시간당 12개 = 5분마다 1개)
    if RUN_SCHEDULERS:
        try:
            import asyncio
            from routers.admin import auto_generate_content_task
            import routers.admin as admin_module

            admin_module._auto_gen_running = True
            asyncio.create_task(auto_generate_content_task(posts_per_hour=12, include_comments=True))
            logger.info("✅ Community auto-generation started (12 posts/hour)")
        except Exception as e:
            logger.warning(f"⚠️ Community auto-generation failed: {e}")

    # 퍼널 디자이너 DB 초기화
    try:
        from database.funnel_designer_db import init_funnel_designer_tables
        init_funnel_designer_tables()
        logger.info("✅ Funnel Designer DB initialized")
    except Exception as e:
        logger.warning(f"⚠️ Funnel Designer DB init failed: {e}")

    # 인플루언서 발굴 DB 초기화
    try:
        from database.influencer_db import init_influencer_tables
        init_influencer_tables()
        logger.info("✅ Influencer discovery DB initialized")
    except Exception as e:
        logger.warning(f"⚠️ Influencer DB init failed: {e}")

    # 인플루언서 자동 수집 스케줄러 시작
    if RUN_SCHEDULERS:
        try:
            from services.influencer_auto_collector import get_auto_collector
            auto_collector = get_auto_collector()
            auto_collector.start()
            logger.info("✅ Influencer auto collector started (daily 03:10 KST)")
        except Exception as e:
            logger.warning(f"⚠️ Influencer auto collector failed to start: {e}")

    # 평판 모니터링 DB 초기화 + 백그라운드 스케줄러
    try:
        from database.reputation_db import init_reputation_tables
        init_reputation_tables()
        logger.info("✅ Reputation DB initialized")
    except Exception as e:
        logger.warning(f"⚠️ Reputation DB init failed: {e}")

    if RUN_SCHEDULERS:
        try:
            from routers.reputation import reputation_monitor_loop
            asyncio.create_task(reputation_monitor_loop())
            logger.info("✅ Reputation monitor started (every 5 min)")
        except Exception as e:
            logger.warning(f"⚠️ Reputation monitor failed to start: {e}")

    yield

    # Shutdown - 빠른 종료 (타임아웃 방지)
    logger.info(f"🛑 {settings.APP_NAME} shutting down (fast mode)...")

    # 모든 스케줄러 빠르게 중지 (wait=False로 즉시 종료)
    schedulers_to_stop = [
        ("auto_learning_scheduler", "services.auto_learning_service"),
        ("ad_auto_optimizer", "services.ad_auto_optimizer"),
        ("threads_auto_poster", "services.threads_auto_poster"),
        ("backup_scheduler", "services.backup_service"),
    ]

    # 인플루언서 자동 수집 스케줄러 중지
    try:
        from services.influencer_auto_collector import get_auto_collector
        get_auto_collector().stop()
    except Exception:
        pass

    for scheduler_name, module_name in schedulers_to_stop:
        try:
            module = __import__(module_name, fromlist=[scheduler_name])
            scheduler = getattr(module, scheduler_name, None)
            if scheduler and hasattr(scheduler, 'stop'):
                scheduler.stop()
        except Exception as e:
            logger.warning(f"⚠️ {scheduler_name} stop issue: {e}")

    # X 자동 게시 스케줄러 중지
    try:
        from services.x_auto_poster import stop_auto_poster
        stop_auto_poster()
    except Exception:
        pass

    logger.info("✅ All schedulers stopped")


# FastAPI 앱 생성
app = FastAPI(
    title=settings.APP_NAME,
    description="네이버 블로그 지수 측정 및 분석 API",
    version=settings.API_VERSION,
    debug=settings.DEBUG,
    lifespan=lifespan
)

# CORS 설정 - 프로덕션 도메인만 허용
ALLOWED_ORIGINS = [
    "https://blog-index-analyzer.vercel.app",
    "https://blog-index-analyzer-lv33.vercel.app",
    "https://blog-index-analyzer-lv33-fewfs-projects-83cc0821.vercel.app",
    "https://www.blrank.co.kr",
    "https://blrank.co.kr",
]

# Vercel 프리뷰 배포 (PR마다 생성) 자동 허용 regex
import re
ALLOWED_ORIGIN_REGEX = re.compile(r"^https://blog-index-analyzer(-[\w-]+)?-fewfs-projects-83cc0821\.vercel\.app$")

# 개발 환경에서는 localhost 추가
if settings.DEBUG or settings.APP_ENV == "development":
    ALLOWED_ORIGINS.extend([
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
    ])

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX.pattern,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,  # preflight 캐시 1시간
)


# Rate Limiting Middleware
class RateLimitMiddleware(BaseHTTPMiddleware):
    """IP 기반 rate limiting (in-memory, 분/시간 단위)"""

    def __init__(self, app, requests_per_minute: int = 60, requests_per_hour: int = 1000):
        super().__init__(app)
        self.rpm = requests_per_minute
        self.rph = requests_per_hour
        self._minute_hits: dict[str, list[float]] = defaultdict(list)
        self._hour_hits: dict[str, list[float]] = defaultdict(list)
        self._last_cleanup = time.time()

    def _cleanup(self, now: float):
        """5분마다 오래된 기록 정리"""
        if now - self._last_cleanup < 300:
            return
        self._last_cleanup = now
        cutoff_minute = now - 60
        cutoff_hour = now - 3600
        for ip in list(self._minute_hits.keys()):
            self._minute_hits[ip] = [t for t in self._minute_hits[ip] if t > cutoff_minute]
            if not self._minute_hits[ip]:
                del self._minute_hits[ip]
        for ip in list(self._hour_hits.keys()):
            self._hour_hits[ip] = [t for t in self._hour_hits[ip] if t > cutoff_hour]
            if not self._hour_hits[ip]:
                del self._hour_hits[ip]

    async def dispatch(self, request: Request, call_next):
        # 헬스 체크는 rate limit 면제
        if request.url.path in ("/", "/health", "/deployment-test-v6"):
            return await call_next(request)

        # 내부 worker 프록시(127.0.0.1) 면제 — WorkerOffloadMiddleware 가 API→worker 로
        # 위임한 요청. 모두 동일 IP(localhost)라 하나의 버킷에 묶여 오탐 차단되고,
        # public 노출 없는 내부 트래픽이라 면제해도 안전.
        if request.client and request.client.host in ("127.0.0.1", "::1"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()

        self._cleanup(now)

        # 분당 제한 체크
        cutoff_minute = now - 60
        self._minute_hits[client_ip] = [t for t in self._minute_hits[client_ip] if t > cutoff_minute]
        if len(self._minute_hits[client_ip]) >= self.rpm:
            return JSONResponse(
                status_code=429,
                content={"detail": "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."},
                headers={"Retry-After": "60", **get_cors_headers(request)}
            )

        # 시간당 제한 체크
        cutoff_hour = now - 3600
        self._hour_hits[client_ip] = [t for t in self._hour_hits[client_ip] if t > cutoff_hour]
        if len(self._hour_hits[client_ip]) >= self.rph:
            return JSONResponse(
                status_code=429,
                content={"detail": "시간당 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요."},
                headers={"Retry-After": "300", **get_cors_headers(request)}
            )

        # 기록 추가
        self._minute_hits[client_ip].append(now)
        self._hour_hits[client_ip].append(now)

        response = await call_next(request)
        return response


app.add_middleware(
    RateLimitMiddleware,
    requests_per_minute=settings.RATE_LIMIT_PER_MINUTE,
    requests_per_hour=settings.RATE_LIMIT_PER_HOUR,
)


# Security Headers Middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """보안 응답 헤더 추가"""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if not settings.DEBUG:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


app.add_middleware(SecurityHeadersMiddleware)


# ─────────────────────────────────────────────────────────────────────────────
# Worker Offload Middleware — HTTP-트리거 무거운 키워드풀 마이닝을 worker(:8001)로 위임.
#
# 배경(근본 원인): entrypoint.sh 가 cron 스케줄러를 worker 프로세스로 분리했으나,
# 사용자/필러 스크립트가 직접 POST 하는 마이닝 엔드포인트(seed-explode-register,
# trigger-now 등)는 FastAPI BackgroundTask 로 **API 프로세스 이벤트 루프**에서 실행됐다.
# 필러가 30초마다 발사 → _run_seed_explode 코루틴(naver keywordstool ×수십 시드 +
# 429/ConnectTimeout 재시도)이 API 루프를 영구 점유 → login 등 모든 async 요청이
# 수십~98초 hang (sync def·/health 도 공유 2 CPU 포화로 동반 지연). 2-프로세스 분리가
# cron 만 옮기고 HTTP-트리거 경로는 못 옮겨 우회됐던 구조 결함.
#
# 해결: ROLE==app 프로세스는 아래 HEAVY 경로의 POST 를 내부 worker(:8001)로 그대로
# 프록시하고 worker 의 응답을 즉시 반환. worker(ROLE=worker)는 이 미들웨어가 비활성이라
# 자기 루프에서 BackgroundTask 실행 → API 루프는 절대 마이닝에 안 막힘. 별도 프로세스라
# asyncio 루프/세마포어(NAVER_API_GLOBAL_SEMAPHORE) affinity 문제도 없음. 필러 fill 은
# 그대로 작동(요청은 200 ack 즉시 수신, 무거운 작업은 worker 가 수행).
#
# 읽기(GET stats/accounts)·가벼운 저장(seeds/domain-profile)은 목록에서 제외 — API 가
# 즉시 처리해야 페이지가 빠름. 새 무거운 트리거 엔드포인트 추가 시 아래 set 에 등록.
# ROLE 미설정(=all, 로컬/단일프로세스)·worker 에서는 전부 비활성 → 로컬 실행.
# ─────────────────────────────────────────────────────────────────────────────
import httpx as _httpx_offload
from starlette.responses import Response as _StarletteResponse

# 루프로 반복 호출돼 API 루프를 포화시키는 **fire-and-forget**(응답은 정적 ack, 동기 결과
# 불필요) 마이닝 트리거만 대상. 일회성 클릭 + 동기 결과 표시 엔드포인트(rebuild/reconcile/
# cleanup-by-score 등)는 제외 — 포화 원인이 아니고, 프록시하면 결과 데이터 UX 깨짐.
_WORKER_OFFLOAD_PATHS = frozenset({
    "/api/naver-ad/keyword-pool/seed-explode-register",   # 필러 직격 경로(30s마다 ×3)
    "/api/naver-ad/keyword-pool/trigger-now",             # 페이지 '즉시발굴'(fire-and-forget)
    "/api/naver-ad/keyword-pool/admin/run",               # 관리자 즉시발굴(동일 패턴)
    "/api/naver-ad/keyword-pool/extension/image-backfill", # 전 그룹 이미지 백필(7800+ 그룹 순회, cron 점유로 굶음)
    # NOTE: ads/backfill-creative 는 offload 에서 제외 — 워커(nice 19)가 cron 으로 포화돼
    # 8s 안에 ack 못하면 API 가 연결을 끊고 Starlette 가 background task(_run)를 건너뛰어
    # **일회성** 백필이 영영 시작 못 함(202 만 받고 무실행). 응답을 끝까지 기다리는
    # 클라이언트로 app 프로세스(scheduler OFF·free loop)에서 직접 돌리면 안정 완주.
    # I/O 바운드(네이버 await)라 0.12s 페이싱이면 login 등 다른 요청도 안 막힘.
})
_WORKER_INTERNAL_URL = os.getenv("WORKER_INTERNAL_URL", "http://127.0.0.1:8001")
_OFFLOAD_ROLE = os.getenv("ROLE", "all")


class WorkerOffloadMiddleware(BaseHTTPMiddleware):
    """ROLE==app: 무거운 마이닝 POST 를 worker 로 프록시해 API 이벤트 루프를 보호."""

    async def dispatch(self, request: Request, call_next):
        if (
            _OFFLOAD_ROLE == "app"
            and request.method == "POST"
            and request.url.path in _WORKER_OFFLOAD_PATHS
        ):
            body = await request.body()
            fwd_headers = {
                k: v for k, v in request.headers.items()
                if k.lower() not in ("host", "content-length", "connection")
            }
            fwd_headers["x-offloaded-from-api"] = "1"
            url = _WORKER_INTERNAL_URL + request.url.path
            if request.url.query:
                url += "?" + request.url.query
            try:
                # read timeout 짧게(8s) — worker 가 즉시 ack 하면 그 응답을 반환. 못하면
                # (worker 루프가 자기 cron 으로 포화) ReadTimeout → 요청은 이미 worker
                # 소켓에 전달됐으니 worker 가 루프 풀리는 대로 처리. **절대 로컬 실행 안 함**
                # (로컬 폴백이 바로 login 을 막던 원흉) → 즉시 합성 ack 반환.
                async with _httpx_offload.AsyncClient(
                    timeout=_httpx_offload.Timeout(connect=2.0, read=8.0, write=8.0, pool=2.0)
                ) as hc:
                    wr = await hc.request("POST", url, content=body, headers=fwd_headers)
                resp_headers = {}
                ct = wr.headers.get("content-type")
                if ct:
                    resp_headers["content-type"] = ct
                return _StarletteResponse(
                    content=wr.content, status_code=wr.status_code, headers=resp_headers,
                )
            except (_httpx_offload.ReadTimeout, _httpx_offload.PoolTimeout, _httpx_offload.WriteTimeout):
                # worker 가 8s 안에 ack 못함(루프 포화) — 요청은 전달됨. 비동기 ack 즉시 반환,
                # 무거운 작업은 worker 가 처리. fire-and-forget 엔드포인트라 동기 결과 불필요.
                logger.info(f"[worker-offload] {request.url.path} → worker async(202)")
                return JSONResponse(status_code=202, content={
                    "success": True, "queued": True, "async": True,
                    "message": "백그라운드 워커에 전달됨(비동기 처리). 진행은 stats/실행 이력에서 확인.",
                })
            except Exception as e:
                # 연결 자체 실패(worker 다운/부팅중 등) — API 루프 보호가 최우선이므로
                # 로컬 실행 절대 안 함. 503 으로 호출측이 재시도. worker 는 entrypoint trap
                # 으로 API 와 생사 동행하므로 평상시 도달 가능.
                logger.warning(
                    f"[worker-offload] 프록시 연결실패 path={request.url.path} "
                    f"{type(e).__name__}: {str(e)[:120]} — 503(로컬 실행 안 함)"
                )
                return JSONResponse(status_code=503, content={
                    "success": False, "error": "worker_unavailable",
                    "message": "백그라운드 워커 일시 불가 — 잠시 후 재시도하세요.",
                })
        return await call_next(request)


app.add_middleware(WorkerOffloadMiddleware)


# CORS 헤더 헬퍼 함수 (에러 응답용 - 미들웨어가 처리하지 못하는 경우)
def get_cors_headers(request: Request = None):
    origin = "*"
    if request:
        req_origin = request.headers.get("origin", "")
        if req_origin in ALLOWED_ORIGINS:
            origin = req_origin
        elif ALLOWED_ORIGINS:
            origin = ALLOWED_ORIGINS[0]
    elif ALLOWED_ORIGINS:
        origin = ALLOWED_ORIGINS[0]
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
        "Access-Control-Allow-Headers": "*",
    }

# 422 Validation Error 상세 로깅
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation error on {request.method} {request.url}")
    logger.error(f"Validation errors: {exc.errors()}")
    logger.error(f"Request body: {exc.body if hasattr(exc, 'body') else 'N/A'}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
        headers=get_cors_headers(request)
    )

# HTTP 예외 핸들러 (CORS 헤더 포함)
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    logger.error(f"HTTP error {exc.status_code} on {request.method} {request.url}: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=get_cors_headers(request)
    )

# Naver API circuit breaker OPEN — 503 으로 즉시 회신해서 클라이언트가 빠르게 fallback
from services.naver_ad_service import NaverApiCircuitOpenError

@app.exception_handler(NaverApiCircuitOpenError)
async def naver_api_circuit_open_handler(request: Request, exc: NaverApiCircuitOpenError):
    logger.warning(f"NaverApiCircuitOpenError on {request.method} {request.url}: {str(exc)}")
    return JSONResponse(
        status_code=503,
        content={"detail": str(exc), "circuit": "open"},
        headers=get_cors_headers(request)
    )

# 일반 예외 핸들러 (CORS 헤더 포함)
@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.method} {request.url}: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=get_cors_headers(request)
    )


# 배포 테스트 엔드포인트 v6 - 라우트 등록 확인용
@app.get("/deployment-test-v6")
async def deployment_test_v6():
    """배포 확인용 테스트 엔드포인트 v6"""
    return {"status": "v6-route-check", "timestamp": "2026-01-29T20:55"}


@app.get("/")
async def root():
    """헬스 체크"""
    return {
        "status": "ok",
        "service": settings.APP_NAME,
        "version": settings.API_VERSION,
        "environment": settings.APP_ENV
    }


@app.get("/health")
async def health_check():
    """헬스 체크 - 기본 상태만 반환 (상세 정보는 /api/admin/health에서)"""
    # 기본 상태 체크
    is_healthy = True
    try:
        from database.sqlite_db import get_sqlite_client
        client = get_sqlite_client()
        client.execute_query("SELECT 1")
    except Exception:
        is_healthy = False

    return {
        "status": "healthy" if is_healthy else "degraded",
        "service": settings.APP_NAME,
        "version": settings.API_VERSION
    }


# 라우터 등록
from routers import auth, blogs, comprehensive_analysis, system
from routers import learning, backup, supabase_sync, batch_learning, top_posts
from routers import subscription, payment, naver_ad, content_lifespan, admin, compliance
from routers import challenge
from routers import rank_tracker
from routers import user_blogs
from routers import keyword_analysis
from routers import premium_tools
from routers import revenue
from routers import unified_ads
from routers import ad_dashboard
from routers import blue_ocean
from routers import xp
from routers import threads
from routers import x as x_router
from routers import optimization_monitor
from routers import hourly_bidding
from routers import anomaly_detection
from routers import budget_reallocation
from routers import creative_fatigue
from routers import naver_quality
from routers import budget_pacing
from routers import funnel_bidding
from routers import community
from routers import social_proof
from routers import ab_test
from routers import recommendation
from routers import notification
from routers import winner_keywords
from routers import profitable_keywords
from routers import marketplace
from routers import reputation
from routers import funnel_designer
from routers import competitive_analysis
from routers import influencer_discovery

app.include_router(auth.router, prefix="/api/auth", tags=["인증"])
app.include_router(admin.router, prefix="/api/admin", tags=["관리자"])
app.include_router(compliance.router, prefix="/api/compliance", tags=["법적준수"])
app.include_router(blogs.router, prefix="/api/blogs", tags=["블로그"])
app.include_router(comprehensive_analysis.router, prefix="/api/comprehensive", tags=["종합분석"])
app.include_router(system.router, prefix="/api/system", tags=["시스템"])
app.include_router(learning.router, prefix="/api/learning", tags=["학습엔진"])
app.include_router(backup.router, prefix="/api/backup", tags=["백업관리"])
app.include_router(supabase_sync.router, prefix="/api/supabase", tags=["Supabase동기화"])
app.include_router(batch_learning.router, prefix="/api/batch-learning", tags=["대량학습"])
app.include_router(top_posts.router, prefix="/api/top-posts", tags=["상위글분석"])
app.include_router(subscription.router, prefix="/api/subscription", tags=["구독관리"])
app.include_router(payment.router, prefix="/api/payment", tags=["결제"])
app.include_router(naver_ad.router, prefix="/api/naver-ad", tags=["네이버광고최적화"])
app.include_router(content_lifespan.router, prefix="/api/content-lifespan", tags=["콘텐츠수명분석"])
app.include_router(challenge.router, prefix="/api/challenge", tags=["블로그챌린지"])
app.include_router(rank_tracker.router, prefix="/api/rank-tracker", tags=["순위추적"])
app.include_router(user_blogs.router, prefix="/api/user-blogs", tags=["사용자블로그"])
app.include_router(keyword_analysis.router, prefix="/api/keyword-analysis", tags=["키워드분석"])
app.include_router(premium_tools.router, prefix="/api/tools", tags=["프리미엄도구"])
app.include_router(revenue.router, prefix="/api/revenue", tags=["수익관리"])
app.include_router(unified_ads.router)  # prefix already set in router
app.include_router(ad_dashboard.router)  # prefix already set in router
app.include_router(blue_ocean.router, prefix="/api/blue-ocean", tags=["블루오션키워드"])
app.include_router(xp.router, tags=["XP시스템"])
app.include_router(threads.router, tags=["쓰레드자동화"])
app.include_router(x_router.router, tags=["X자동화"])
app.include_router(optimization_monitor.router, tags=["최적화모니터링"])
app.include_router(hourly_bidding.router, tags=["시간대별입찰"])
app.include_router(anomaly_detection.router, tags=["이상징후감지"])
app.include_router(budget_reallocation.router, tags=["예산재분배"])
app.include_router(creative_fatigue.router, tags=["크리에이티브피로도"])
app.include_router(naver_quality.router, tags=["네이버품질지수"])
app.include_router(budget_pacing.router, tags=["예산페이싱"])
app.include_router(funnel_bidding.router, tags=["퍼널입찰"])
app.include_router(community.router, tags=["커뮤니티"])
app.include_router(social_proof.router, tags=["소셜프루프"])
app.include_router(ab_test.router, tags=["A/B테스트"])
app.include_router(recommendation.router, tags=["추천시스템"])
app.include_router(notification.router, tags=["알림시스템"])
app.include_router(winner_keywords.router, prefix="/api/winner-keywords", tags=["1위보장키워드"])
app.include_router(profitable_keywords.router, prefix="/api", tags=["수익성키워드"])
app.include_router(marketplace.router, prefix="/api", tags=["마켓플레이스"])
app.include_router(reputation.router, tags=["평판모니터링"])
app.include_router(funnel_designer.router, tags=["퍼널디자이너"])
app.include_router(competitive_analysis.router, tags=["경쟁력분석"])
app.include_router(influencer_discovery.router, tags=["인플루언서발굴"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
