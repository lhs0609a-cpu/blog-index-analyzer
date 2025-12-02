"""
애플리케이션 설정 관리
"""
from pydantic_settings import BaseSettings
from typing import List, Optional
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """애플리케이션 설정"""

    # Application
    APP_NAME: str = "Blog Index Analyzer"
    APP_ENV: str = "development"
    DEBUG: bool = True
    API_VERSION: str = "v1"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Database - PostgreSQL
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "blog_analyzer"
    POSTGRES_USER: str = "admin"
    POSTGRES_PASSWORD: str = "password"
    DATABASE_URL: Optional[str] = None

    @property
    def database_url(self) -> str:
        """PostgreSQL 연결 URL"""
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # Database - MongoDB
    MONGO_HOST: str = "localhost"
    MONGO_PORT: int = 27017
    MONGO_DB: str = "blog_analyzer_logs"
    MONGO_USER: str = "admin"
    MONGO_PASSWORD: str = "password"
    MONGO_URL: Optional[str] = None

    @property
    def mongo_url(self) -> str:
        """MongoDB 연결 URL"""
        if self.MONGO_URL:
            return self.MONGO_URL
        return (
            f"mongodb://{self.MONGO_USER}:{self.MONGO_PASSWORD}"
            f"@{self.MONGO_HOST}:{self.MONGO_PORT}/{self.MONGO_DB}"
        )

    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: str = ""
    REDIS_URL: Optional[str] = None

    @property
    def redis_url(self) -> str:
        """Redis 연결 URL"""
        if self.REDIS_URL:
            return self.REDIS_URL
        if self.REDIS_PASSWORD:
            return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    # Celery
    CELERY_BROKER_URL: Optional[str] = None
    CELERY_RESULT_BACKEND: Optional[str] = None

    @property
    def celery_broker_url(self) -> str:
        """Celery 브로커 URL"""
        return self.CELERY_BROKER_URL or self.redis_url

    @property
    def celery_result_backend(self) -> str:
        """Celery 결과 백엔드 URL"""
        return self.CELERY_RESULT_BACKEND or self.redis_url

    # JWT Authentication
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS - 모든 Vercel 도메인 허용
    CORS_ORIGINS: str = "*"

    @property
    def cors_origins_list(self) -> List[str]:
        """CORS 허용 오리진 리스트"""
        if self.CORS_ORIGINS == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_PER_HOUR: int = 1000

    # Crawler Settings
    CRAWLER_USER_AGENTS: str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    CRAWLER_TIMEOUT_MS: int = 30000
    CRAWLER_MAX_RETRIES: int = 3
    CRAWLER_DELAY_SECONDS: float = 1.0

    # Proxy
    USE_PROXY: bool = False
    PROXY_LIST: str = ""

    @property
    def proxy_list(self) -> List[str]:
        """프록시 리스트"""
        if not self.PROXY_LIST:
            return []
        return [proxy.strip() for proxy in self.PROXY_LIST.split(",")]

    # Monitoring
    SENTRY_DSN: str = ""
    SENTRY_ENVIRONMENT: str = "development"
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1

    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@bloganalyzer.com"

    # AWS
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-northeast-2"
    S3_BUCKET: str = ""

    # Subscription Plans
    FREE_DAILY_LIMIT: int = 3
    BASIC_DAILY_LIMIT: int = 20
    PRO_DAILY_LIMIT: int = 100

    # Naver API
    NAVER_CLIENT_ID: str = ""
    NAVER_CLIENT_SECRET: str = ""
    NAVER_LOGIN_CLIENT_ID: str = ""
    NAVER_LOGIN_CLIENT_SECRET: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """설정 싱글톤 인스턴스"""
    settings = Settings()

    # 보안 경고: 프로덕션 환경에서 기본 SECRET_KEY 사용 감지
    if settings.APP_ENV == "production" and settings.SECRET_KEY == "your-super-secret-key-change-in-production":
        logger.critical(
            "🔴 CRITICAL SECURITY WARNING: Using default SECRET_KEY in production! "
            "Please set a unique SECRET_KEY in environment variables immediately. "
            "This exposes your JWT tokens and user authentication!"
        )
        raise ValueError("Default SECRET_KEY is not allowed in production environment")

    # 개발 환경에서도 경고
    if settings.SECRET_KEY == "your-super-secret-key-change-in-production":
        logger.warning(
            "⚠️ WARNING: Using default SECRET_KEY. "
            "Please set a unique SECRET_KEY in .env file for better security."
        )

    return settings


# 전역 설정 인스턴스
settings = get_settings()
