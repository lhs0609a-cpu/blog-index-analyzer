"""
사용자 저장 블로그 관리 데이터베이스
- 사용자가 저장한 블로그 목록 관리
- 블로그 분석 결과 캐시
"""
import sqlite3
import os
from datetime import datetime
from typing import Optional, Dict, List, Any
import logging
import json

logger = logging.getLogger(__name__)

# 데이터베이스 경로 - /data 볼륨에 저장 (영속적)
# Windows 로컬 개발환경에서는 ./data 사용
import sys
if sys.platform == "win32":
    DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
else:
    DATA_DIR = os.environ.get("DATA_DIR", "/data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "user_blogs.db")


def get_connection():
    """SQLite 연결"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_user_blogs_tables():
    """사용자 블로그 관련 테이블 초기화"""
    conn = get_connection()
    cursor = conn.cursor()

    # 사용자 저장 블로그 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_saved_blogs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            blog_id TEXT NOT NULL,
            blog_name TEXT,
            blog_url TEXT,
            avatar TEXT DEFAULT '📝',
            level INTEGER DEFAULT 0,
            grade TEXT DEFAULT '',
            total_score REAL DEFAULT 0,
            score_change REAL DEFAULT 0,
            total_posts INTEGER DEFAULT 0,
            total_visitors INTEGER DEFAULT 0,
            neighbor_count INTEGER DEFAULT 0,
            last_analyzed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, blog_id)
        )
    """)

    # 블로그 분석 히스토리 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS blog_analysis_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            blog_id TEXT NOT NULL,
            total_score REAL,
            level INTEGER,
            grade TEXT,
            total_posts INTEGER,
            total_visitors INTEGER,
            neighbor_count INTEGER,
            score_breakdown TEXT,
            analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES user_saved_blogs(user_id)
        )
    """)

    # 인덱스 생성
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_saved_blogs_user_id
        ON user_saved_blogs(user_id)
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_blog_analysis_history_user_blog
        ON blog_analysis_history(user_id, blog_id)
    """)

    conn.commit()
    conn.close()
    logger.info("✅ User blogs tables initialized")


# ============ 사용자 블로그 관리 함수 ============

def get_user_blogs(user_id: int) -> List[Dict]:
    """사용자가 저장한 블로그 목록 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM user_saved_blogs
        WHERE user_id = ?
        ORDER BY updated_at DESC
    """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_user_blog(user_id: int, blog_id: str) -> Optional[Dict]:
    """특정 저장된 블로그 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM user_saved_blogs
        WHERE user_id = ? AND blog_id = ?
    """, (user_id, blog_id))

    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


def save_user_blog(
    user_id: int,
    blog_id: str,
    blog_name: str = None,
    blog_url: str = None,
    avatar: str = '📝',
    level: int = 0,
    grade: str = '',
    total_score: float = 0,
    total_posts: int = 0,
    total_visitors: int = 0,
    neighbor_count: int = 0,
    score_breakdown: Dict = None
) -> Dict:
    """블로그 저장 또는 업데이트"""
    conn = get_connection()
    cursor = conn.cursor()

    # 이전 점수 조회 (변화량 계산용)
    cursor.execute("""
        SELECT total_score FROM user_saved_blogs
        WHERE user_id = ? AND blog_id = ?
    """, (user_id, blog_id))

    prev_row = cursor.fetchone()
    prev_score = prev_row['total_score'] if prev_row else 0
    score_change = round(total_score - prev_score, 1) if prev_row else 0

    # UPSERT
    cursor.execute("""
        INSERT INTO user_saved_blogs
        (user_id, blog_id, blog_name, blog_url, avatar, level, grade,
         total_score, score_change, total_posts, total_visitors, neighbor_count,
         last_analyzed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, blog_id) DO UPDATE SET
            blog_name = COALESCE(excluded.blog_name, blog_name),
            blog_url = COALESCE(excluded.blog_url, blog_url),
            avatar = excluded.avatar,
            level = excluded.level,
            grade = excluded.grade,
            total_score = excluded.total_score,
            score_change = ?,
            total_posts = excluded.total_posts,
            total_visitors = excluded.total_visitors,
            neighbor_count = excluded.neighbor_count,
            last_analyzed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
    """, (user_id, blog_id, blog_name, blog_url, avatar, level, grade,
          total_score, score_change, total_posts, total_visitors, neighbor_count,
          score_change))

    # 히스토리 추가
    score_breakdown_json = json.dumps(score_breakdown) if score_breakdown else None
    cursor.execute("""
        INSERT INTO blog_analysis_history
        (user_id, blog_id, total_score, level, grade, total_posts,
         total_visitors, neighbor_count, score_breakdown)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, blog_id, total_score, level, grade, total_posts,
          total_visitors, neighbor_count, score_breakdown_json))

    conn.commit()
    conn.close()

    return get_user_blog(user_id, blog_id)


def delete_user_blog(user_id: int, blog_id: str) -> bool:
    """저장된 블로그 삭제"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        DELETE FROM user_saved_blogs
        WHERE user_id = ? AND blog_id = ?
    """, (user_id, blog_id))

    success = cursor.rowcount > 0
    conn.commit()
    conn.close()

    return success


def get_blog_history(user_id: int, blog_id: str, limit: int = 30) -> List[Dict]:
    """블로그 분석 히스토리 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM blog_analysis_history
        WHERE user_id = ? AND blog_id = ?
        ORDER BY analyzed_at DESC
        LIMIT ?
    """, (user_id, blog_id, limit))

    rows = cursor.fetchall()
    conn.close()

    result = []
    for row in rows:
        item = dict(row)
        if item.get('score_breakdown'):
            try:
                item['score_breakdown'] = json.loads(item['score_breakdown'])
            except:
                pass
        result.append(item)

    return result


def get_user_blogs_count(user_id: int) -> int:
    """사용자 저장 블로그 수 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT COUNT(*) as count FROM user_saved_blogs
        WHERE user_id = ?
    """, (user_id,))

    row = cursor.fetchone()
    conn.close()

    return row['count'] if row else 0


# 초기화
if __name__ == "__main__":
    init_user_blogs_tables()
    print("User blogs tables created successfully!")
