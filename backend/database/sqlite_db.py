"""
SQLite 데이터베이스 클라이언트
"""
import sqlite3
import logging
from pathlib import Path
from typing import Optional
from contextlib import contextmanager

logger = logging.getLogger(__name__)


class SQLiteClient:
    """SQLite 데이터베이스 클라이언트 (WAL 모드 최적화)"""

    def __init__(self, db_path: str = "blog_analyzer.db"):
        """
        Args:
            db_path: 데이터베이스 파일 경로
        """
        self.db_path = db_path
        self._ensure_db_exists()
        self._setup_wal_mode()

    def _ensure_db_exists(self):
        """데이터베이스 파일이 존재하는지 확인하고 생성"""
        db_file = Path(self.db_path)
        if not db_file.exists():
            logger.info(f"Creating new SQLite database at {self.db_path}")
            conn = sqlite3.connect(self.db_path)
            conn.close()

    def _setup_wal_mode(self):
        """WAL 모드 설정 (한 번만 실행)"""
        try:
            conn = sqlite3.connect(self.db_path)
            # WAL 모드로 성능 향상 (쓰기와 읽기 동시 처리)
            conn.execute("PRAGMA journal_mode=WAL")
            # 동기화 모드를 NORMAL로 설정 (성능 향상)
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.close()
            logger.info("WAL mode enabled for database")
        except Exception as e:
            logger.warning(f"Failed to enable WAL mode: {e}")

    @contextmanager
    def get_connection(self):
        """데이터베이스 연결 컨텍스트 매니저 (매번 새 커넥션)"""
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.row_factory = sqlite3.Row
        # 캐시 크기 증가
        conn.execute("PRAGMA cache_size=-64000")  # 64MB
        try:
            yield conn
        except Exception as e:
            conn.rollback()
            raise e
        else:
            conn.commit()
        finally:
            conn.close()

    def execute_query(self, query: str, params: tuple = None):
        """쿼리 실행"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            return cursor.fetchall()

    def execute_one(self, query: str, params: tuple = None):
        """단일 결과 쿼리 실행"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            return cursor.fetchone()

    def execute_insert(self, query: str, params: tuple = None):
        """INSERT 쿼리 실행 후 lastrowid 반환"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            return cursor.lastrowid

    def execute_many(self, query: str, params_list: list):
        """
        Bulk INSERT/UPDATE 쿼리 실행 (성능 최적화)

        Args:
            query: SQL 쿼리
            params_list: 파라미터 리스트 [(param1, param2, ...), ...]

        Returns:
            실행된 행 수
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.executemany(query, params_list)
            return cursor.rowcount

    def init_schema(self):
        """데이터베이스 스키마 초기화"""
        logger.info("Initializing SQLite schema...")

        with self.get_connection() as conn:
            cursor = conn.cursor()

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    is_verified BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS blogs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    blog_id TEXT UNIQUE NOT NULL,
                    blog_name TEXT,
                    blog_url TEXT,
                    description TEXT,
                    total_posts INTEGER DEFAULT 0,
                    total_visitors INTEGER DEFAULT 0,
                    neighbor_count INTEGER DEFAULT 0,
                    is_influencer BOOLEAN DEFAULT FALSE,
                    blog_created_at TIMESTAMP,
                    blog_age_days INTEGER DEFAULT 0,
                    last_analyzed_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 기존 테이블에 blog_created_at 컬럼이 없으면 추가 (마이그레이션)
            try:
                cursor.execute("SELECT blog_created_at FROM blogs LIMIT 1")
            except sqlite3.OperationalError:
                logger.info("Adding blog_created_at column to blogs table")
                cursor.execute("ALTER TABLE blogs ADD COLUMN blog_created_at TIMESTAMP")

            # 기존 테이블에 blog_age_days 컬럼이 없으면 추가
            try:
                cursor.execute("SELECT blog_age_days FROM blogs LIMIT 1")
            except sqlite3.OperationalError:
                logger.info("Adding blog_age_days column to blogs table")
                cursor.execute("ALTER TABLE blogs ADD COLUMN blog_age_days INTEGER DEFAULT 0")

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS blog_indices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    blog_id TEXT NOT NULL,
                    level INTEGER DEFAULT 0,
                    grade TEXT,
                    total_score REAL DEFAULT 0.0,
                    percentile REAL DEFAULT 0.0,
                    trust_score REAL DEFAULT 0.0,
                    content_score REAL DEFAULT 0.0,
                    engagement_score REAL DEFAULT 0.0,
                    seo_score REAL DEFAULT 0.0,
                    traffic_score REAL DEFAULT 0.0,
                    warnings TEXT,
                    recommendations TEXT,
                    measured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (blog_id) REFERENCES blogs(blog_id)
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_blogs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    blog_id TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (blog_id) REFERENCES blogs(blog_id),
                    UNIQUE(user_id, blog_id)
                )
            """)

            # 순위 학습 데이터 테이블 (ML 학습용)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS ranking_learning_data (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    keyword TEXT NOT NULL,
                    search_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                    -- 블로그 정보
                    blog_id TEXT NOT NULL,
                    blog_name TEXT,

                    -- 실제 순위 (네이버)
                    actual_rank INTEGER NOT NULL,
                    actual_tab_type TEXT,

                    -- 우리 예측 순위
                    predicted_rank INTEGER,

                    -- 점수 지표들
                    c_rank_score REAL,
                    dia_score REAL,
                    total_score REAL,

                    -- C-Rank 구성 요소
                    blog_age_days INTEGER,
                    total_posts INTEGER,
                    neighbor_count INTEGER,
                    total_visitors INTEGER,

                    -- D.I.A. 구성 요소
                    avg_content_length REAL,
                    most_recent_post_days INTEGER,
                    experience_score REAL,
                    originality_score REAL,

                    -- 차이 분석
                    rank_difference INTEGER,

                    FOREIGN KEY (blog_id) REFERENCES blogs(blog_id)
                )
            """)

            # ML 모델 가중치 저장 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS ml_model_weights (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    model_version TEXT NOT NULL,
                    trained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                    -- 가중치들
                    weight_c_rank REAL,
                    weight_dia REAL,
                    weight_blog_age REAL,
                    weight_posts REAL,
                    weight_neighbors REAL,
                    weight_visitors REAL,
                    weight_content_length REAL,
                    weight_recency REAL,

                    -- 성능 지표
                    mae REAL,
                    rmse REAL,
                    r2_score REAL,

                    -- 학습 데이터 정보
                    training_samples INTEGER,

                    is_active BOOLEAN DEFAULT FALSE
                )
            """)

            # 성능 최적화를 위한 인덱스 생성
            logger.info("Creating performance indexes...")

            # users 테이블 인덱스
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")

            # blogs 테이블 인덱스
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_blogs_blog_id ON blogs(blog_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_blogs_last_analyzed ON blogs(last_analyzed_at DESC)")

            # blog_indices 테이블 인덱스 (조회 성능 100배 향상)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_blog_indices_blog_id ON blog_indices(blog_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_blog_indices_measured_at ON blog_indices(measured_at DESC)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_blog_indices_total_score ON blog_indices(total_score DESC)")

            # user_blogs 테이블 인덱스
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_blogs_user_id ON user_blogs(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_blogs_blog_id ON user_blogs(blog_id)")

            # ranking_learning_data 테이블 인덱스
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_ranking_learning_keyword ON ranking_learning_data(keyword)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_ranking_learning_date ON ranking_learning_data(search_date DESC)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_ranking_learning_blog ON ranking_learning_data(blog_id)")

            # ml_model_weights 테이블 인덱스
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_ml_weights_active ON ml_model_weights(is_active)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_ml_weights_trained ON ml_model_weights(trained_at DESC)")

            logger.info("SQLite schema and indexes initialized successfully")


_sqlite_client: Optional[SQLiteClient] = None


def get_sqlite_client() -> SQLiteClient:
    """SQLite 클라이언트 싱글톤 인스턴스 반환"""
    global _sqlite_client
    if _sqlite_client is None:
        _sqlite_client = SQLiteClient()
    return _sqlite_client


def initialize_db():
    """데이터베이스 초기화 (앱 시작 시 호출)"""
    client = get_sqlite_client()
    client.init_schema()
    logger.info("Database initialized successfully")


def init_db():
    """데이터베이스 초기화"""
    client = get_sqlite_client()
    client.init_schema()
