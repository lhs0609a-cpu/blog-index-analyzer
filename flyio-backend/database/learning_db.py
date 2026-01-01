"""
Database models and setup for learning engine
"""
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import Dict, List, Optional
import json
import os

# Use persistent volume path for database
DATABASE_PATH = "/app/data/blog_analyzer.db"

@contextmanager
def get_db():
    """Database connection context manager"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

# Alias for backward compatibility
get_learning_db = get_db

def init_learning_tables():
    """Initialize learning database tables"""
    with get_db() as conn:
        cursor = conn.cursor()

        # 1. learning_samples table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS learning_samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword TEXT NOT NULL,
                blog_id TEXT NOT NULL,
                actual_rank INTEGER NOT NULL,
                predicted_score REAL NOT NULL,

                c_rank_score REAL,
                dia_score REAL,
                post_count INTEGER,
                neighbor_count INTEGER,
                blog_age_days INTEGER,
                recent_posts_30d INTEGER,
                visitor_count INTEGER,

                collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_keyword ON learning_samples(keyword)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_collected_at ON learning_samples(collected_at)")

        # 2. learning_sessions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS learning_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,

                samples_used INTEGER,
                accuracy_before REAL,
                accuracy_after REAL,
                improvement REAL,

                duration_seconds REAL,
                epochs INTEGER,
                learning_rate REAL,

                keywords TEXT,
                weight_changes TEXT,

                started_at TIMESTAMP,
                completed_at TIMESTAMP
            )
        """)

        # Add columns if they don't exist (for existing databases)
        try:
            cursor.execute("ALTER TABLE learning_sessions ADD COLUMN keywords TEXT")
        except:
            pass
        try:
            cursor.execute("ALTER TABLE learning_sessions ADD COLUMN weight_changes TEXT")
        except:
            pass

        # Add post analysis columns to learning_samples (for existing databases)
        post_columns = [
            ("title_has_keyword", "INTEGER DEFAULT 0"),
            ("title_keyword_position", "INTEGER DEFAULT -1"),
            ("content_length", "INTEGER DEFAULT 0"),
            ("image_count", "INTEGER DEFAULT 0"),
            ("video_count", "INTEGER DEFAULT 0"),
            ("keyword_count", "INTEGER DEFAULT 0"),
            ("keyword_density", "REAL DEFAULT 0"),
            ("heading_count", "INTEGER DEFAULT 0"),
            ("paragraph_count", "INTEGER DEFAULT 0"),
            ("has_map", "INTEGER DEFAULT 0"),
            ("has_link", "INTEGER DEFAULT 0"),
            ("like_count", "INTEGER DEFAULT 0"),
            ("comment_count", "INTEGER DEFAULT 0"),
            ("post_age_days", "INTEGER"),
        ]
        for col_name, col_type in post_columns:
            try:
                cursor.execute(f"ALTER TABLE learning_samples ADD COLUMN {col_name} {col_type}")
            except:
                pass

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_started_at ON learning_sessions(started_at)")

        # 3. weight_history table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS weight_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,

                weights TEXT NOT NULL,

                accuracy REAL,
                total_samples INTEGER,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_session ON weight_history(session_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON weight_history(created_at)")

        # 4. current_weights table (single row)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS current_weights (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                weights TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Initialize default weights if not exists
        cursor.execute("SELECT COUNT(*) FROM current_weights WHERE id = 1")
        if cursor.fetchone()[0] == 0:
            default_weights = {
                "c_rank": {
                    "weight": 0.50,
                    "sub_weights": {
                        "context": 0.35,
                        "content": 0.40,
                        "chain": 0.25
                    }
                },
                "dia": {
                    "weight": 0.50,
                    "sub_weights": {
                        "depth": 0.33,
                        "information": 0.34,
                        "accuracy": 0.33
                    }
                },
                "extra_factors": {
                    "post_count": 0.15,
                    "neighbor_count": 0.10,
                    "blog_age": 0.08,
                    "recent_activity": 0.12,
                    "visitor_count": 0.05
                }
            }
            cursor.execute(
                "INSERT INTO current_weights (id, weights) VALUES (1, ?)",
                (json.dumps(default_weights),)
            )

def get_current_weights() -> Dict:
    """Get current weights from database"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT weights FROM current_weights WHERE id = 1")
        row = cursor.fetchone()
        if row:
            return json.loads(row[0])
        return {}

def save_current_weights(weights: Dict):
    """Save current weights to database"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE current_weights SET weights = ?, updated_at = ? WHERE id = 1",
            (json.dumps(weights), datetime.now().isoformat())
        )

def add_learning_sample(
    keyword: str,
    blog_id: str,
    actual_rank: int,
    predicted_score: float,
    blog_features: Dict
) -> int:
    """Add a learning sample with blog + post features"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO learning_samples (
                keyword, blog_id, actual_rank, predicted_score,
                c_rank_score, dia_score, post_count, neighbor_count,
                blog_age_days, recent_posts_30d, visitor_count,
                title_has_keyword, title_keyword_position, content_length,
                image_count, video_count, keyword_count, keyword_density,
                heading_count, paragraph_count, has_map, has_link,
                like_count, comment_count, post_age_days
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            keyword,
            blog_id,
            actual_rank,
            predicted_score,
            # 블로그 전체 특성
            blog_features.get('c_rank_score'),
            blog_features.get('dia_score'),
            blog_features.get('post_count'),
            blog_features.get('neighbor_count'),
            blog_features.get('blog_age_days'),
            blog_features.get('recent_posts_30d'),
            blog_features.get('visitor_count'),
            # 개별 글 특성
            1 if blog_features.get('title_has_keyword') else 0,
            blog_features.get('title_keyword_position', -1),
            blog_features.get('content_length', 0),
            blog_features.get('image_count', 0),
            blog_features.get('video_count', 0),
            blog_features.get('keyword_count', 0),
            blog_features.get('keyword_density', 0),
            blog_features.get('heading_count', 0),
            blog_features.get('paragraph_count', 0),
            1 if blog_features.get('has_map') else 0,
            1 if blog_features.get('has_link') else 0,
            blog_features.get('like_count', 0),
            blog_features.get('comment_count', 0),
            blog_features.get('post_age_days'),
        ))
        return cursor.lastrowid

def get_learning_samples(limit: int = 1000) -> List[Dict]:
    """Get recent learning samples"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM learning_samples
            ORDER BY collected_at DESC
            LIMIT ?
        """, (limit,))
        return [dict(row) for row in cursor.fetchall()]

def save_training_session(
    session_id: str,
    samples_used: int,
    accuracy_before: float,
    accuracy_after: float,
    improvement: float,
    duration_seconds: float,
    epochs: int,
    learning_rate: float,
    started_at: str,
    completed_at: str,
    keywords: List[str] = None,
    weight_changes: Dict = None
):
    """Save training session"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO learning_sessions (
                session_id, samples_used, accuracy_before, accuracy_after,
                improvement, duration_seconds, epochs, learning_rate,
                started_at, completed_at, keywords, weight_changes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            session_id, samples_used, accuracy_before, accuracy_after,
            improvement, duration_seconds, epochs, learning_rate,
            started_at, completed_at,
            json.dumps(keywords) if keywords else None,
            json.dumps(weight_changes) if weight_changes else None
        ))

def save_weight_history(session_id: str, weights: Dict, accuracy: float, total_samples: int):
    """Save weight history"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO weight_history (session_id, weights, accuracy, total_samples)
            VALUES (?, ?, ?, ?)
        """, (session_id, json.dumps(weights), accuracy, total_samples))

def get_training_history(limit: int = 50) -> List[Dict]:
    """Get training history"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM learning_sessions
            ORDER BY started_at DESC
            LIMIT ?
        """, (limit,))
        results = []
        for row in cursor.fetchall():
            session = dict(row)
            # Parse JSON fields
            if session.get('keywords'):
                try:
                    session['keywords'] = json.loads(session['keywords'])
                except:
                    session['keywords'] = []
            else:
                session['keywords'] = []
            if session.get('weight_changes'):
                try:
                    session['weight_changes'] = json.loads(session['weight_changes'])
                except:
                    session['weight_changes'] = {}
            else:
                session['weight_changes'] = {}
            results.append(session)
        return results

def get_learning_statistics() -> Dict:
    """Get learning statistics with real-time accuracy calculation"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Total samples
        cursor.execute("SELECT COUNT(*) FROM learning_samples")
        total_samples = cursor.fetchone()[0]

        # Training count
        cursor.execute("SELECT COUNT(*) FROM learning_sessions")
        training_count = cursor.fetchone()[0]

        # Last training time
        cursor.execute("SELECT completed_at FROM learning_sessions ORDER BY completed_at DESC LIMIT 1")
        last_training_row = cursor.fetchone()
        last_training = last_training_row[0] if last_training_row else None

        # 실시간 정확도 계산 (키워드별 그룹화)
        current_accuracy = 0.0
        accuracy_within_3 = 0.0

        if total_samples >= 26:  # 최소 2개 키워드 * 13개 블로그
            try:
                samples = get_learning_samples(limit=1000)
                if samples:
                    from services.learning_engine import (
                        calculate_predicted_scores,
                        calculate_exact_match_rate_by_keyword,
                        DEFAULT_WEIGHTS
                    )
                    weights = get_current_weights() or DEFAULT_WEIGHTS

                    import numpy as np
                    predicted_scores = calculate_predicted_scores(samples, weights)
                    metrics = calculate_exact_match_rate_by_keyword(samples, predicted_scores)

                    current_accuracy = metrics.get('exact_match', 0)
                    accuracy_within_3 = metrics.get('within_3', 0)
            except Exception as e:
                print(f"Accuracy calculation error: {e}")
                # Fallback to session-based accuracy
                cursor.execute("SELECT accuracy_after FROM learning_sessions ORDER BY completed_at DESC LIMIT 1")
                accuracy_row = cursor.fetchone()
                current_accuracy = accuracy_row[0] if accuracy_row else 0.0
                accuracy_within_3 = current_accuracy * 1.1

        return {
            "total_samples": total_samples,
            "current_accuracy": round(current_accuracy, 1),
            "accuracy_within_3": round(accuracy_within_3, 1),
            "last_training": last_training or "-",
            "training_count": training_count
        }


def clear_all_samples():
    """Delete all learning samples and sessions - for complete reset"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM learning_samples")
        cursor.execute("DELETE FROM learning_sessions")
        cursor.execute("DELETE FROM weight_history")
        return {
            "samples_deleted": cursor.rowcount
        }


# ==============================================
# 키워드 학습 이력 관리 (중복 방지용)
# ==============================================

def init_keyword_tracking_tables():
    """키워드 추적 테이블 초기화"""
    with get_db() as conn:
        cursor = conn.cursor()

        # 1. 학습된 키워드 이력 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS learned_keywords (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword TEXT NOT NULL,
                learned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                samples_count INTEGER DEFAULT 13,
                source TEXT DEFAULT 'auto',
                UNIQUE(keyword, learned_at)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_learned_keyword ON learned_keywords(keyword)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_learned_at ON learned_keywords(learned_at)")

        # 2. 키워드 풀 테이블 (학습 대상 키워드)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS keyword_pool (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword TEXT UNIQUE NOT NULL,
                category TEXT,
                priority INTEGER DEFAULT 0,
                learn_count INTEGER DEFAULT 0,
                last_learned_at TIMESTAMP,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                source TEXT DEFAULT 'system',
                is_active INTEGER DEFAULT 1
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pool_keyword ON keyword_pool(keyword)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pool_priority ON keyword_pool(priority DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pool_learn_count ON keyword_pool(learn_count)")


def add_to_keyword_pool(keyword: str, category: str = None, source: str = 'system', priority: int = 0) -> bool:
    """키워드 풀에 새 키워드 추가"""
    with get_db() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT OR IGNORE INTO keyword_pool (keyword, category, source, priority)
                VALUES (?, ?, ?, ?)
            """, (keyword, category, source, priority))
            return cursor.rowcount > 0
        except Exception:
            return False


def add_keywords_to_pool_bulk(keywords: List[Dict]) -> int:
    """키워드 풀에 대량 추가

    Args:
        keywords: [{"keyword": "...", "category": "...", "priority": 0}, ...]
    """
    with get_db() as conn:
        cursor = conn.cursor()
        added = 0
        for kw in keywords:
            try:
                cursor.execute("""
                    INSERT OR IGNORE INTO keyword_pool (keyword, category, source, priority)
                    VALUES (?, ?, ?, ?)
                """, (
                    kw.get('keyword'),
                    kw.get('category'),
                    kw.get('source', 'system'),
                    kw.get('priority', 0)
                ))
                if cursor.rowcount > 0:
                    added += 1
            except Exception:
                pass
        return added


def get_next_keywords_from_pool(count: int, min_days_since_last: int = 1) -> List[str]:
    """학습할 다음 키워드 가져오기 (중복 방지)

    Args:
        count: 가져올 키워드 수
        min_days_since_last: 마지막 학습 후 최소 경과일

    Returns:
        키워드 리스트
    """
    with get_db() as conn:
        cursor = conn.cursor()

        # 우선순위:
        # 1. 한 번도 학습 안된 키워드 (learn_count = 0)
        # 2. 학습 횟수가 적고, 마지막 학습이 오래된 키워드
        cursor.execute("""
            SELECT keyword FROM keyword_pool
            WHERE is_active = 1
            AND (
                last_learned_at IS NULL
                OR julianday('now') - julianday(last_learned_at) >= ?
            )
            ORDER BY
                learn_count ASC,
                CASE WHEN last_learned_at IS NULL THEN 0 ELSE 1 END,
                priority DESC,
                RANDOM()
            LIMIT ?
        """, (min_days_since_last, count))

        return [row[0] for row in cursor.fetchall()]


def mark_keyword_learned(keyword: str, samples_count: int = 13, source: str = 'auto'):
    """키워드 학습 완료 기록"""
    with get_db() as conn:
        cursor = conn.cursor()
        now = datetime.now().isoformat()

        # 학습 이력 추가
        cursor.execute("""
            INSERT INTO learned_keywords (keyword, learned_at, samples_count, source)
            VALUES (?, ?, ?, ?)
        """, (keyword, now, samples_count, source))

        # 키워드 풀 업데이트
        cursor.execute("""
            UPDATE keyword_pool
            SET learn_count = learn_count + 1, last_learned_at = ?
            WHERE keyword = ?
        """, (now, keyword))


def get_keyword_learning_stats() -> Dict:
    """키워드 학습 통계"""
    with get_db() as conn:
        cursor = conn.cursor()

        # 전체 키워드 풀 크기
        cursor.execute("SELECT COUNT(*) FROM keyword_pool WHERE is_active = 1")
        total_pool = cursor.fetchone()[0]

        # 학습된 적 있는 키워드 수
        cursor.execute("SELECT COUNT(*) FROM keyword_pool WHERE learn_count > 0")
        learned_at_least_once = cursor.fetchone()[0]

        # 아직 학습 안된 키워드 수
        cursor.execute("SELECT COUNT(*) FROM keyword_pool WHERE learn_count = 0 AND is_active = 1")
        never_learned = cursor.fetchone()[0]

        # 오늘 학습된 키워드 수
        cursor.execute("""
            SELECT COUNT(DISTINCT keyword) FROM learned_keywords
            WHERE date(learned_at) = date('now')
        """)
        learned_today = cursor.fetchone()[0]

        # 최근 7일 학습된 고유 키워드 수
        cursor.execute("""
            SELECT COUNT(DISTINCT keyword) FROM learned_keywords
            WHERE learned_at >= datetime('now', '-7 days')
        """)
        learned_7days = cursor.fetchone()[0]

        # 카테고리별 분포
        cursor.execute("""
            SELECT category, COUNT(*) as cnt
            FROM keyword_pool
            WHERE is_active = 1
            GROUP BY category
            ORDER BY cnt DESC
        """)
        categories = {row[0] or '미분류': row[1] for row in cursor.fetchall()}

        return {
            "total_pool": total_pool,
            "learned_at_least_once": learned_at_least_once,
            "never_learned": never_learned,
            "learned_today": learned_today,
            "learned_7days": learned_7days,
            "categories": categories
        }


def add_user_search_keyword(keyword: str, user_id: str = None):
    """사용자가 검색한 키워드를 풀에 추가 (높은 우선순위)"""
    with get_db() as conn:
        cursor = conn.cursor()

        # 이미 존재하면 우선순위만 높임
        cursor.execute("""
            INSERT INTO keyword_pool (keyword, category, source, priority)
            VALUES (?, 'user_search', 'user', 10)
            ON CONFLICT(keyword) DO UPDATE SET
                priority = MAX(priority, 5),
                source = CASE WHEN source != 'user' THEN 'user' ELSE source END
        """, (keyword,))


def get_unlearned_keywords(limit: int = 100) -> List[str]:
    """아직 한 번도 학습되지 않은 키워드 목록"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT keyword FROM keyword_pool
            WHERE learn_count = 0 AND is_active = 1
            ORDER BY priority DESC, added_at ASC
            LIMIT ?
        """, (limit,))
        return [row[0] for row in cursor.fetchall()]


def initialize_default_keyword_pool():
    """기본 키워드 풀 초기화 (300개+)"""
    default_keywords = [
        # 의료 (50개)
        {"keyword": "강남치과", "category": "의료"},
        {"keyword": "임플란트", "category": "의료"},
        {"keyword": "교정치과", "category": "의료"},
        {"keyword": "피부과", "category": "의료"},
        {"keyword": "성형외과", "category": "의료"},
        {"keyword": "내과", "category": "의료"},
        {"keyword": "정형외과", "category": "의료"},
        {"keyword": "안과", "category": "의료"},
        {"keyword": "이비인후과", "category": "의료"},
        {"keyword": "산부인과", "category": "의료"},
        {"keyword": "치아미백", "category": "의료"},
        {"keyword": "라미네이트", "category": "의료"},
        {"keyword": "충치치료", "category": "의료"},
        {"keyword": "스케일링", "category": "의료"},
        {"keyword": "신경치료", "category": "의료"},
        {"keyword": "발치", "category": "의료"},
        {"keyword": "틀니", "category": "의료"},
        {"keyword": "잇몸치료", "category": "의료"},
        {"keyword": "라식", "category": "의료"},
        {"keyword": "라섹", "category": "의료"},
        {"keyword": "백내장", "category": "의료"},
        {"keyword": "녹내장", "category": "의료"},
        {"keyword": "보톡스", "category": "의료"},
        {"keyword": "필러", "category": "의료"},
        {"keyword": "리프팅", "category": "의료"},
        {"keyword": "쌍꺼풀수술", "category": "의료"},
        {"keyword": "코성형", "category": "의료"},
        {"keyword": "지방흡입", "category": "의료"},
        {"keyword": "건강검진", "category": "의료"},
        {"keyword": "종합검진", "category": "의료"},
        {"keyword": "위내시경", "category": "의료"},
        {"keyword": "대장내시경", "category": "의료"},
        {"keyword": "MRI검사", "category": "의료"},
        {"keyword": "CT검사", "category": "의료"},
        {"keyword": "초음파검사", "category": "의료"},
        {"keyword": "물리치료", "category": "의료"},
        {"keyword": "도수치료", "category": "의료"},
        {"keyword": "추나요법", "category": "의료"},
        {"keyword": "척추측만증", "category": "의료"},
        {"keyword": "허리디스크", "category": "의료"},
        {"keyword": "목디스크", "category": "의료"},
        {"keyword": "무릎통증", "category": "의료"},
        {"keyword": "어깨통증", "category": "의료"},
        {"keyword": "관절염", "category": "의료"},
        {"keyword": "류마티스", "category": "의료"},
        {"keyword": "당뇨병", "category": "의료"},
        {"keyword": "고혈압", "category": "의료"},
        {"keyword": "갑상선", "category": "의료"},
        {"keyword": "비염치료", "category": "의료"},
        {"keyword": "축농증", "category": "의료"},

        # 맛집 (50개)
        {"keyword": "강남맛집", "category": "맛집"},
        {"keyword": "홍대맛집", "category": "맛집"},
        {"keyword": "이태원맛집", "category": "맛집"},
        {"keyword": "삼겹살맛집", "category": "맛집"},
        {"keyword": "초밥맛집", "category": "맛집"},
        {"keyword": "파스타맛집", "category": "맛집"},
        {"keyword": "신촌맛집", "category": "맛집"},
        {"keyword": "명동맛집", "category": "맛집"},
        {"keyword": "건대맛집", "category": "맛집"},
        {"keyword": "잠실맛집", "category": "맛집"},
        {"keyword": "여의도맛집", "category": "맛집"},
        {"keyword": "판교맛집", "category": "맛집"},
        {"keyword": "분당맛집", "category": "맛집"},
        {"keyword": "수원맛집", "category": "맛집"},
        {"keyword": "인천맛집", "category": "맛집"},
        {"keyword": "대전맛집", "category": "맛집"},
        {"keyword": "대구맛집", "category": "맛집"},
        {"keyword": "부산맛집", "category": "맛집"},
        {"keyword": "광주맛집", "category": "맛집"},
        {"keyword": "제주맛집", "category": "맛집"},
        {"keyword": "스테이크맛집", "category": "맛집"},
        {"keyword": "피자맛집", "category": "맛집"},
        {"keyword": "치킨맛집", "category": "맛집"},
        {"keyword": "족발맛집", "category": "맛집"},
        {"keyword": "보쌈맛집", "category": "맛집"},
        {"keyword": "곱창맛집", "category": "맛집"},
        {"keyword": "막창맛집", "category": "맛집"},
        {"keyword": "냉면맛집", "category": "맛집"},
        {"keyword": "칼국수맛집", "category": "맛집"},
        {"keyword": "짬뽕맛집", "category": "맛집"},
        {"keyword": "짜장면맛집", "category": "맛집"},
        {"keyword": "라멘맛집", "category": "맛집"},
        {"keyword": "우동맛집", "category": "맛집"},
        {"keyword": "돈까스맛집", "category": "맛집"},
        {"keyword": "샤브샤브맛집", "category": "맛집"},
        {"keyword": "훠궈맛집", "category": "맛집"},
        {"keyword": "베트남음식", "category": "맛집"},
        {"keyword": "태국음식", "category": "맛집"},
        {"keyword": "인도음식", "category": "맛집"},
        {"keyword": "멕시코음식", "category": "맛집"},
        {"keyword": "브런치카페", "category": "맛집"},
        {"keyword": "디저트카페", "category": "맛집"},
        {"keyword": "애견동반카페", "category": "맛집"},
        {"keyword": "루프탑카페", "category": "맛집"},
        {"keyword": "베이커리카페", "category": "맛집"},
        {"keyword": "수제버거", "category": "맛집"},
        {"keyword": "이자카야", "category": "맛집"},
        {"keyword": "오마카세", "category": "맛집"},
        {"keyword": "와인바", "category": "맛집"},
        {"keyword": "칵테일바", "category": "맛집"},

        # 여행 (40개)
        {"keyword": "제주여행", "category": "여행"},
        {"keyword": "부산여행", "category": "여행"},
        {"keyword": "강릉여행", "category": "여행"},
        {"keyword": "속초여행", "category": "여행"},
        {"keyword": "경주여행", "category": "여행"},
        {"keyword": "전주여행", "category": "여행"},
        {"keyword": "여수여행", "category": "여행"},
        {"keyword": "통영여행", "category": "여행"},
        {"keyword": "거제도여행", "category": "여행"},
        {"keyword": "울릉도여행", "category": "여행"},
        {"keyword": "오사카여행", "category": "여행"},
        {"keyword": "도쿄여행", "category": "여행"},
        {"keyword": "교토여행", "category": "여행"},
        {"keyword": "후쿠오카여행", "category": "여행"},
        {"keyword": "삿포로여행", "category": "여행"},
        {"keyword": "오키나와여행", "category": "여행"},
        {"keyword": "방콕여행", "category": "여행"},
        {"keyword": "치앙마이여행", "category": "여행"},
        {"keyword": "푸켓여행", "category": "여행"},
        {"keyword": "발리여행", "category": "여행"},
        {"keyword": "싱가포르여행", "category": "여행"},
        {"keyword": "홍콩여행", "category": "여행"},
        {"keyword": "마카오여행", "category": "여행"},
        {"keyword": "대만여행", "category": "여행"},
        {"keyword": "베트남여행", "category": "여행"},
        {"keyword": "다낭여행", "category": "여행"},
        {"keyword": "나트랑여행", "category": "여행"},
        {"keyword": "하와이여행", "category": "여행"},
        {"keyword": "괌여행", "category": "여행"},
        {"keyword": "사이판여행", "category": "여행"},
        {"keyword": "파리여행", "category": "여행"},
        {"keyword": "런던여행", "category": "여행"},
        {"keyword": "로마여행", "category": "여행"},
        {"keyword": "바르셀로나여행", "category": "여행"},
        {"keyword": "스위스여행", "category": "여행"},
        {"keyword": "뉴욕여행", "category": "여행"},
        {"keyword": "LA여행", "category": "여행"},
        {"keyword": "호주여행", "category": "여행"},
        {"keyword": "뉴질랜드여행", "category": "여행"},
        {"keyword": "몰디브여행", "category": "여행"},

        # 뷰티/패션 (30개)
        {"keyword": "화장품추천", "category": "뷰티"},
        {"keyword": "선크림추천", "category": "뷰티"},
        {"keyword": "샴푸추천", "category": "뷰티"},
        {"keyword": "트리트먼트추천", "category": "뷰티"},
        {"keyword": "스킨케어루틴", "category": "뷰티"},
        {"keyword": "파운데이션추천", "category": "뷰티"},
        {"keyword": "립스틱추천", "category": "뷰티"},
        {"keyword": "아이섀도우", "category": "뷰티"},
        {"keyword": "마스카라추천", "category": "뷰티"},
        {"keyword": "클렌징오일", "category": "뷰티"},
        {"keyword": "토너추천", "category": "뷰티"},
        {"keyword": "세럼추천", "category": "뷰티"},
        {"keyword": "아이크림추천", "category": "뷰티"},
        {"keyword": "네일아트", "category": "뷰티"},
        {"keyword": "헤어스타일", "category": "뷰티"},
        {"keyword": "염색추천", "category": "뷰티"},
        {"keyword": "펌추천", "category": "뷰티"},
        {"keyword": "향수추천", "category": "뷰티"},
        {"keyword": "청바지추천", "category": "패션"},
        {"keyword": "코트추천", "category": "패션"},
        {"keyword": "패딩추천", "category": "패션"},
        {"keyword": "운동화추천", "category": "패션"},
        {"keyword": "구두추천", "category": "패션"},
        {"keyword": "가방추천", "category": "패션"},
        {"keyword": "지갑추천", "category": "패션"},
        {"keyword": "시계추천", "category": "패션"},
        {"keyword": "선글라스추천", "category": "패션"},
        {"keyword": "악세사리추천", "category": "패션"},
        {"keyword": "남자코디", "category": "패션"},
        {"keyword": "여자코디", "category": "패션"},

        # IT/전자제품 (30개)
        {"keyword": "아이폰", "category": "IT"},
        {"keyword": "갤럭시", "category": "IT"},
        {"keyword": "맥북", "category": "IT"},
        {"keyword": "노트북추천", "category": "IT"},
        {"keyword": "모니터추천", "category": "IT"},
        {"keyword": "키보드추천", "category": "IT"},
        {"keyword": "마우스추천", "category": "IT"},
        {"keyword": "이어폰추천", "category": "IT"},
        {"keyword": "헤드폰추천", "category": "IT"},
        {"keyword": "블루투스스피커", "category": "IT"},
        {"keyword": "태블릿추천", "category": "IT"},
        {"keyword": "아이패드", "category": "IT"},
        {"keyword": "갤럭시탭", "category": "IT"},
        {"keyword": "스마트워치", "category": "IT"},
        {"keyword": "애플워치", "category": "IT"},
        {"keyword": "갤럭시워치", "category": "IT"},
        {"keyword": "에어팟", "category": "IT"},
        {"keyword": "갤럭시버즈", "category": "IT"},
        {"keyword": "카메라추천", "category": "IT"},
        {"keyword": "미러리스카메라", "category": "IT"},
        {"keyword": "DSLR카메라", "category": "IT"},
        {"keyword": "빔프로젝터", "category": "IT"},
        {"keyword": "게이밍노트북", "category": "IT"},
        {"keyword": "게이밍의자", "category": "IT"},
        {"keyword": "NAS추천", "category": "IT"},
        {"keyword": "외장하드", "category": "IT"},
        {"keyword": "SSD추천", "category": "IT"},
        {"keyword": "공유기추천", "category": "IT"},
        {"keyword": "드론추천", "category": "IT"},
        {"keyword": "전자책리더기", "category": "IT"},

        # 생활/인테리어 (30개)
        {"keyword": "이사업체", "category": "생활"},
        {"keyword": "청소업체", "category": "생활"},
        {"keyword": "인테리어", "category": "생활"},
        {"keyword": "냉장고추천", "category": "생활"},
        {"keyword": "에어컨추천", "category": "생활"},
        {"keyword": "세탁기추천", "category": "생활"},
        {"keyword": "건조기추천", "category": "생활"},
        {"keyword": "청소기추천", "category": "생활"},
        {"keyword": "로봇청소기", "category": "생활"},
        {"keyword": "공기청정기", "category": "생활"},
        {"keyword": "가습기추천", "category": "생활"},
        {"keyword": "제습기추천", "category": "생활"},
        {"keyword": "전기밥솥", "category": "생활"},
        {"keyword": "에어프라이어", "category": "생활"},
        {"keyword": "전자레인지", "category": "생활"},
        {"keyword": "커피머신", "category": "생활"},
        {"keyword": "정수기추천", "category": "생활"},
        {"keyword": "비데추천", "category": "생활"},
        {"keyword": "매트리스추천", "category": "생활"},
        {"keyword": "소파추천", "category": "생활"},
        {"keyword": "책상추천", "category": "생활"},
        {"keyword": "의자추천", "category": "생활"},
        {"keyword": "조명추천", "category": "생활"},
        {"keyword": "커튼추천", "category": "생활"},
        {"keyword": "러그추천", "category": "생활"},
        {"keyword": "벽지시공", "category": "생활"},
        {"keyword": "바닥시공", "category": "생활"},
        {"keyword": "싱크대교체", "category": "생활"},
        {"keyword": "보일러교체", "category": "생활"},
        {"keyword": "방충망교체", "category": "생활"},

        # 교육 (25개)
        {"keyword": "영어학원", "category": "교육"},
        {"keyword": "수학학원", "category": "교육"},
        {"keyword": "코딩학원", "category": "교육"},
        {"keyword": "토익", "category": "교육"},
        {"keyword": "토플", "category": "교육"},
        {"keyword": "아이엘츠", "category": "교육"},
        {"keyword": "공무원시험", "category": "교육"},
        {"keyword": "자격증시험", "category": "교육"},
        {"keyword": "온라인강의", "category": "교육"},
        {"keyword": "인강추천", "category": "교육"},
        {"keyword": "독서실", "category": "교육"},
        {"keyword": "스터디카페", "category": "교육"},
        {"keyword": "과외선생님", "category": "교육"},
        {"keyword": "입시컨설팅", "category": "교육"},
        {"keyword": "유학원", "category": "교육"},
        {"keyword": "어학연수", "category": "교육"},
        {"keyword": "원어민회화", "category": "교육"},
        {"keyword": "HSK", "category": "교육"},
        {"keyword": "JLPT", "category": "교육"},
        {"keyword": "피아노학원", "category": "교육"},
        {"keyword": "미술학원", "category": "교육"},
        {"keyword": "음악학원", "category": "교육"},
        {"keyword": "체육학원", "category": "교육"},
        {"keyword": "태권도", "category": "교육"},
        {"keyword": "수영강습", "category": "교육"},

        # 취미/스포츠 (25개)
        {"keyword": "골프", "category": "취미"},
        {"keyword": "테니스", "category": "취미"},
        {"keyword": "등산", "category": "취미"},
        {"keyword": "캠핑", "category": "취미"},
        {"keyword": "낚시", "category": "취미"},
        {"keyword": "헬스장", "category": "취미"},
        {"keyword": "필라테스", "category": "취미"},
        {"keyword": "요가", "category": "취미"},
        {"keyword": "크로스핏", "category": "취미"},
        {"keyword": "수영", "category": "취미"},
        {"keyword": "클라이밍", "category": "취미"},
        {"keyword": "볼링", "category": "취미"},
        {"keyword": "당구", "category": "취미"},
        {"keyword": "스키장", "category": "취미"},
        {"keyword": "보드", "category": "취미"},
        {"keyword": "서핑", "category": "취미"},
        {"keyword": "카약", "category": "취미"},
        {"keyword": "스쿠버다이빙", "category": "취미"},
        {"keyword": "자전거", "category": "취미"},
        {"keyword": "러닝", "category": "취미"},
        {"keyword": "마라톤", "category": "취미"},
        {"keyword": "축구동호회", "category": "취미"},
        {"keyword": "농구동호회", "category": "취미"},
        {"keyword": "배드민턴", "category": "취미"},
        {"keyword": "탁구", "category": "취미"},

        # 반려동물 (20개)
        {"keyword": "강아지분양", "category": "반려동물"},
        {"keyword": "고양이분양", "category": "반려동물"},
        {"keyword": "강아지사료", "category": "반려동물"},
        {"keyword": "고양이사료", "category": "반려동물"},
        {"keyword": "동물병원", "category": "반려동물"},
        {"keyword": "강아지미용", "category": "반려동물"},
        {"keyword": "고양이미용", "category": "반려동물"},
        {"keyword": "펫호텔", "category": "반려동물"},
        {"keyword": "애견카페", "category": "반려동물"},
        {"keyword": "고양이카페", "category": "반려동물"},
        {"keyword": "강아지훈련", "category": "반려동물"},
        {"keyword": "강아지간식", "category": "반려동물"},
        {"keyword": "고양이간식", "category": "반려동물"},
        {"keyword": "강아지옷", "category": "반려동물"},
        {"keyword": "강아지장난감", "category": "반려동물"},
        {"keyword": "고양이장난감", "category": "반려동물"},
        {"keyword": "강아지집", "category": "반려동물"},
        {"keyword": "고양이타워", "category": "반려동물"},
        {"keyword": "강아지유모차", "category": "반려동물"},
        {"keyword": "펫보험", "category": "반려동물"},

        # 웨딩/육아 (20개)
        {"keyword": "웨딩홀", "category": "웨딩"},
        {"keyword": "웨딩드레스", "category": "웨딩"},
        {"keyword": "신혼여행", "category": "웨딩"},
        {"keyword": "결혼반지", "category": "웨딩"},
        {"keyword": "웨딩촬영", "category": "웨딩"},
        {"keyword": "스튜디오촬영", "category": "웨딩"},
        {"keyword": "본식영상", "category": "웨딩"},
        {"keyword": "신혼집인테리어", "category": "웨딩"},
        {"keyword": "혼수가전", "category": "웨딩"},
        {"keyword": "예단", "category": "웨딩"},
        {"keyword": "출산준비", "category": "육아"},
        {"keyword": "유모차", "category": "육아"},
        {"keyword": "카시트", "category": "육아"},
        {"keyword": "아기용품", "category": "육아"},
        {"keyword": "분유추천", "category": "육아"},
        {"keyword": "기저귀추천", "category": "육아"},
        {"keyword": "아기옷", "category": "육아"},
        {"keyword": "장난감추천", "category": "육아"},
        {"keyword": "어린이집", "category": "육아"},
        {"keyword": "유치원", "category": "육아"},

        # 재테크/금융 (20개)
        {"keyword": "주식투자", "category": "재테크"},
        {"keyword": "부동산투자", "category": "재테크"},
        {"keyword": "코인투자", "category": "재테크"},
        {"keyword": "ETF투자", "category": "재테크"},
        {"keyword": "적금추천", "category": "재테크"},
        {"keyword": "예금금리", "category": "재테크"},
        {"keyword": "대출금리", "category": "재테크"},
        {"keyword": "신용카드추천", "category": "재테크"},
        {"keyword": "체크카드추천", "category": "재테크"},
        {"keyword": "연금저축", "category": "재테크"},
        {"keyword": "IRP", "category": "재테크"},
        {"keyword": "보험추천", "category": "재테크"},
        {"keyword": "자동차보험", "category": "재테크"},
        {"keyword": "실비보험", "category": "재테크"},
        {"keyword": "종신보험", "category": "재테크"},
        {"keyword": "재테크방법", "category": "재테크"},
        {"keyword": "절세방법", "category": "재테크"},
        {"keyword": "연말정산", "category": "재테크"},
        {"keyword": "가계부앱", "category": "재테크"},
        {"keyword": "재무설계", "category": "재테크"},
    ]

    added = add_keywords_to_pool_bulk(default_keywords)
    return added


# Initialize tables on import
try:
    init_learning_tables()
    init_keyword_tracking_tables()
except Exception as e:
    print(f"Warning: Could not initialize learning tables: {e}")
