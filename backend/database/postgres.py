"""
PostgreSQL 데이터베이스 연결 및 관리
"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.declarative import declarative_base
from contextlib import contextmanager
from typing import Generator
import logging

from config import settings

logger = logging.getLogger(__name__)

# SQLAlchemy Base
Base = declarative_base()

# 데이터베이스 엔진
engine = None
SessionLocal = None


def init_db():
    """데이터베이스 초기화"""
    global engine, SessionLocal

    try:
        engine = create_engine(
            settings.database_url,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
            echo=settings.DEBUG
        )

        SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=engine
        )

        # 연결 테스트
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        logger.info("PostgreSQL 연결 성공")

    except Exception as e:
        logger.error(f"PostgreSQL 연결 실패: {e}")
        raise


def get_db() -> Generator[Session, None, None]:
    """
    데이터베이스 세션 생성 (FastAPI Dependency)

    Yields:
        데이터베이스 세션
    """
    if not SessionLocal:
        init_db()

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context():
    """
    데이터베이스 세션 컨텍스트 매니저

    Example:
        with get_db_context() as db:
            result = db.execute(text("SELECT * FROM blogs"))
    """
    if not SessionLocal:
        init_db()

    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


class PostgresClient:
    """PostgreSQL 클라이언트"""

    def __init__(self):
        if not SessionLocal:
            init_db()

    def execute_query(self, query: str, params: dict = None):
        """
        SQL 쿼리 실행

        Args:
            query: SQL 쿼리
            params: 쿼리 파라미터

        Returns:
            쿼리 결과
        """
        with get_db_context() as db:
            result = db.execute(text(query), params or {})
            return result.fetchall()

    def execute_many(self, query: str, params_list: list):
        """
        대량 데이터 삽입

        Args:
            query: SQL 쿼리
            params_list: 파라미터 리스트
        """
        with get_db_context() as db:
            db.execute(text(query), params_list)

    def save_blog(self, blog_data: dict) -> int:
        """
        블로그 정보 저장

        Args:
            blog_data: 블로그 데이터

        Returns:
            블로그 ID
        """
        query = """
        INSERT INTO blogs (
            blog_id, blog_url, blog_name, description,
            created_at, total_posts, total_visitors,
            neighbor_count, is_influencer, last_analyzed_at
        )
        VALUES (
            :blog_id, :blog_url, :blog_name, :description,
            :created_at, :total_posts, :total_visitors,
            :neighbor_count, :is_influencer, NOW()
        )
        ON CONFLICT (blog_id)
        DO UPDATE SET
            blog_name = EXCLUDED.blog_name,
            description = EXCLUDED.description,
            total_posts = EXCLUDED.total_posts,
            total_visitors = EXCLUDED.total_visitors,
            neighbor_count = EXCLUDED.neighbor_count,
            is_influencer = EXCLUDED.is_influencer,
            last_analyzed_at = NOW()
        RETURNING id
        """

        with get_db_context() as db:
            result = db.execute(text(query), blog_data)
            return result.fetchone()[0]

    def save_post(self, post_data: dict) -> int:
        """
        포스트 정보 저장

        Args:
            post_data: 포스트 데이터

        Returns:
            포스트 ID
        """
        query = """
        INSERT INTO posts (
            blog_id, post_id, post_url, title, published_at,
            category, text_length, word_count, paragraph_count,
            image_count, video_count, external_link_count,
            like_count, comment_count, scrap_count, view_count,
            analyzed_at
        )
        VALUES (
            :blog_id, :post_id, :post_url, :title, :published_at,
            :category, :text_length, :word_count, :paragraph_count,
            :image_count, :video_count, :external_link_count,
            :like_count, :comment_count, :scrap_count, :view_count,
            NOW()
        )
        ON CONFLICT (blog_id, post_id)
        DO UPDATE SET
            title = EXCLUDED.title,
            text_length = EXCLUDED.text_length,
            word_count = EXCLUDED.word_count,
            paragraph_count = EXCLUDED.paragraph_count,
            image_count = EXCLUDED.image_count,
            video_count = EXCLUDED.video_count,
            like_count = EXCLUDED.like_count,
            comment_count = EXCLUDED.comment_count,
            scrap_count = EXCLUDED.scrap_count,
            view_count = EXCLUDED.view_count,
            analyzed_at = NOW()
        RETURNING id
        """

        with get_db_context() as db:
            result = db.execute(text(query), post_data)
            return result.fetchone()[0]

    def save_blog_index(self, blog_db_id: int, index_data: dict):
        """
        블로그 지수 저장

        Args:
            blog_db_id: 블로그 DB ID
            index_data: 지수 데이터
        """
        query = """
        INSERT INTO blog_index_snapshots (
            blog_id, total_score, level, grade, percentile,
            trust_score, content_score, engagement_score,
            seo_score, traffic_score, metrics,
            warnings, recommendations
        )
        VALUES (
            :blog_id, :total_score, :level, :grade, :percentile,
            :trust_score, :content_score, :engagement_score,
            :seo_score, :traffic_score, :metrics::jsonb,
            :warnings::jsonb, :recommendations::jsonb
        )
        """

        params = {
            'blog_id': blog_db_id,
            'total_score': index_data['total_score'],
            'level': index_data['level'],
            'grade': index_data['grade'],
            'percentile': index_data.get('percentile', 50.0),
            'trust_score': index_data['score_breakdown']['trust'],
            'content_score': index_data['score_breakdown']['content'],
            'engagement_score': index_data['score_breakdown']['engagement'],
            'seo_score': index_data['score_breakdown']['seo'],
            'traffic_score': index_data['score_breakdown']['traffic'],
            'metrics': index_data.get('metrics', {}),
            'warnings': index_data.get('warnings', []),
            'recommendations': index_data.get('recommendations', [])
        }

        with get_db_context() as db:
            db.execute(text(query), params)

    def get_blog_by_id(self, blog_id: str) -> dict:
        """
        블로그 조회

        Args:
            blog_id: 블로그 ID

        Returns:
            블로그 정보
        """
        query = """
        SELECT * FROM blogs WHERE blog_id = :blog_id
        """

        result = self.execute_query(query, {'blog_id': blog_id})
        if result:
            row = result[0]
            return dict(row._mapping)
        return None

    def get_latest_index(self, blog_id: str) -> dict:
        """
        최신 블로그 지수 조회

        Args:
            blog_id: 블로그 ID

        Returns:
            지수 정보
        """
        query = """
        SELECT bis.*, b.blog_name, b.blog_id as blog_identifier
        FROM blog_index_snapshots bis
        JOIN blogs b ON bis.blog_id = b.id
        WHERE b.blog_id = :blog_id
        ORDER BY bis.measured_at DESC
        LIMIT 1
        """

        result = self.execute_query(query, {'blog_id': blog_id})
        if result:
            row = result[0]
            return dict(row._mapping)
        return None

    def get_blog_history(self, blog_id: str, days: int = 30) -> list:
        """
        블로그 지수 히스토리 조회

        Args:
            blog_id: 블로그 ID
            days: 조회 일수

        Returns:
            지수 히스토리 리스트
        """
        query = """
        SELECT
            measured_at, total_score, level,
            trust_score, content_score, engagement_score,
            seo_score, traffic_score
        FROM blog_index_snapshots bis
        JOIN blogs b ON bis.blog_id = b.id
        WHERE b.blog_id = :blog_id
        AND measured_at >= NOW() - INTERVAL ':days days'
        ORDER BY measured_at ASC
        """

        result = self.execute_query(query, {'blog_id': blog_id, 'days': days})
        return [dict(row._mapping) for row in result]

    def get_posts_by_blog(self, blog_db_id: int, limit: int = 20) -> list:
        """
        블로그의 포스트 목록 조회

        Args:
            blog_db_id: 블로그 DB ID
            limit: 조회 개수

        Returns:
            포스트 리스트
        """
        query = """
        SELECT * FROM posts
        WHERE blog_id = :blog_id
        ORDER BY published_at DESC
        LIMIT :limit
        """

        result = self.execute_query(
            query,
            {'blog_id': blog_db_id, 'limit': limit}
        )
        return [dict(row._mapping) for row in result]


# 싱글톤 인스턴스
_postgres_client = None


def get_postgres_client() -> PostgresClient:
    """PostgreSQL 클라이언트 싱글톤"""
    global _postgres_client
    if _postgres_client is None:
        _postgres_client = PostgresClient()
    return _postgres_client
