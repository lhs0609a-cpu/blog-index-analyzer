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
    """Add a learning sample"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO learning_samples (
                keyword, blog_id, actual_rank, predicted_score,
                c_rank_score, dia_score, post_count, neighbor_count,
                blog_age_days, recent_posts_30d, visitor_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            keyword,
            blog_id,
            actual_rank,
            predicted_score,
            blog_features.get('c_rank_score'),
            blog_features.get('dia_score'),
            blog_features.get('post_count'),
            blog_features.get('neighbor_count'),
            blog_features.get('blog_age_days'),
            blog_features.get('recent_posts_30d'),
            blog_features.get('visitor_count')
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
    """Get learning statistics"""
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

        # Latest accuracy
        cursor.execute("SELECT accuracy_after FROM learning_sessions ORDER BY completed_at DESC LIMIT 1")
        accuracy_row = cursor.fetchone()
        current_accuracy = accuracy_row[0] if accuracy_row else 0.0

        return {
            "total_samples": total_samples,
            "current_accuracy": current_accuracy,
            "accuracy_within_3": current_accuracy * 1.1,
            "last_training": last_training or "-",
            "training_count": training_count
        }

# Initialize tables on import
try:
    init_learning_tables()
except Exception as e:
    print(f"Warning: Could not initialize learning tables: {e}")
