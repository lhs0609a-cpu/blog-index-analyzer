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


# Initialize tables on import
try:
    init_learning_tables()
except Exception as e:
    print(f"Warning: Could not initialize learning tables: {e}")
