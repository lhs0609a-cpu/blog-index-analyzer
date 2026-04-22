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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """애플리케이션 라이프사이클 관리"""
    # Startup
    logger.info(f"🚀 {settings.APP_NAME} starting up...")
    logger.info(f"Environment: {settings.APP_ENV}")
    logger.info(f"Debug mode: {settings.DEBUG}")

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
    try:
        from services.backup_service import backup_scheduler
        backup_scheduler.start()
        logger.info("✅ Backup scheduler started (every 2 hours)")
    except Exception as e:
        logger.warning(f"⚠️ Backup scheduler failed to start: {e}")

    # 자동 학습 스케줄러 시작 (비활성화 - 메모리 절약, 필요시 API로 수동 활성화)
    try:
        from services.auto_learning_service import auto_learning_scheduler
        # auto_learning_scheduler.start()  # 메모리 절약을 위해 비활성화
        logger.info("⚠️ Auto learning scheduler DISABLED (memory optimization)")
    except Exception as e:
        logger.warning(f"⚠️ Auto learning scheduler failed to start: {e}")

    # 광고 자동 최적화 스케줄러 시작
    try:
        from services.ad_auto_optimizer import ad_auto_optimizer
        ad_auto_optimizer.start(interval_seconds=900)  # 15분마다 실행 (메모리 절약)
        logger.info("✅ Ad auto optimizer started (every 15 min)")
    except Exception as e:
        logger.warning(f"⚠️ Ad auto optimizer failed to start: {e}")

    # Threads DB 초기화
    try:
        from database.threads_db import init_threads_db
        init_threads_db()
        logger.info("✅ Threads tables initialized")
    except Exception as e:
        logger.warning(f"⚠️ Threads tables initialization failed: {e}")

    # Threads 자동 게시 스케줄러 시작
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
