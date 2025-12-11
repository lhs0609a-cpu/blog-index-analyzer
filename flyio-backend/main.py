"""
FastAPI 메인 애플리케이션
"""
from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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

    yield

    # Shutdown
    logger.info(f"🛑 {settings.APP_NAME} shutting down...")

    # 데이터베이스 연결 종료
    try:
        # SQLite는 자동으로 연결 종료
        logger.info("✅ Database connections closed")
    except Exception as e:
        logger.error(f"❌ Error closing database: {e}")

    # Redis 연결 종료 (필요 시)
    if settings.REDIS_URL:
        try:
            logger.info("⚠️ Redis connection closed (if applicable)")
        except Exception as e:
            logger.warning(f"⚠️ Error closing Redis: {e}")


# FastAPI 앱 생성
app = FastAPI(
    title=settings.APP_NAME,
    description="네이버 블로그 지수 측정 및 분석 API",
    version=settings.API_VERSION,
    debug=settings.DEBUG,
    lifespan=lifespan
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    """상세 헬스 체크"""
    health_status = {
        "status": "healthy",
        "checks": {}
    }

    # 실제 DB 연결 체크
    try:
        from database.sqlite_db import get_sqlite_client
        client = get_sqlite_client()
        # 간단한 쿼리로 연결 확인
        client.execute_query("SELECT 1")
        health_status["checks"]["database"] = "connected"
    except Exception as e:
        health_status["checks"]["database"] = f"error: {str(e)}"
        health_status["status"] = "degraded"

    # Learning DB 체크
    try:
        from database.learning_db import get_learning_statistics
        stats = get_learning_statistics()
        health_status["checks"]["learning_db"] = f"connected (samples: {stats['total_samples']})"
    except Exception as e:
        health_status["checks"]["learning_db"] = f"error: {str(e)}"

    # Redis 체크 (선택적)
    if settings.REDIS_URL:
        try:
            # Redis 연결 체크 (필요 시 구현)
            health_status["checks"]["redis"] = "not_configured"
        except Exception as e:
            health_status["checks"]["redis"] = f"error: {str(e)}"
    else:
        health_status["checks"]["redis"] = "not_configured"

    # MongoDB 체크 (선택적)
    health_status["checks"]["mongodb"] = "not_configured"

    return health_status


# 라우터 등록
from routers import auth, blogs, comprehensive_analysis, system
from routers import learning

app.include_router(auth.router, prefix="/api/auth", tags=["인증"])
app.include_router(blogs.router, prefix="/api/blogs", tags=["블로그"])
app.include_router(comprehensive_analysis.router, prefix="/api/comprehensive", tags=["종합분석"])
app.include_router(system.router, prefix="/api/system", tags=["시스템"])
app.include_router(learning.router, prefix="/api/learning", tags=["학습엔진"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
