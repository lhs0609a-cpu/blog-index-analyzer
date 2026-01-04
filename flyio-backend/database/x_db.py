"""
X (Twitter) 자동화 데이터베이스
"""
import sqlite3
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import uuid

logger = logging.getLogger(__name__)

# 데이터베이스 경로 - /app/data 볼륨에 저장 (영속적)
# Windows 로컬 개발환경에서는 ./data 사용
import sys
if sys.platform == "win32":
    DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
else:
    DATA_DIR = os.environ.get("DATA_DIR", "/app/data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "blog_analyzer.db")


def get_connection():
    """SQLite 연결"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_x_tables():
    """X 관련 테이블 초기화"""
    conn = get_connection()
    cursor = conn.cursor()

    # X 페르소나 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS x_personas (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            age INTEGER,
            job TEXT,
            personality TEXT,
            tone TEXT DEFAULT 'friendly',
            interests TEXT,
            background_story TEXT,
            speech_patterns TEXT,
            emoji_usage TEXT DEFAULT 'moderate',
            avatar_url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # X 계정 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS x_accounts (
            id TEXT PRIMARY KEY,
            user_id INTEGER,
            x_user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            name TEXT,
            profile_image_url TEXT,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            token_expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(x_user_id)
        )
    """)

    # X 캠페인 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS x_campaigns (
            id TEXT PRIMARY KEY,
            user_id INTEGER,
            account_id TEXT,
            name TEXT NOT NULL,
            brand_name TEXT NOT NULL,
            brand_description TEXT,
            target_audience TEXT,
            final_goal TEXT,
            persona_id TEXT,
            status TEXT DEFAULT 'draft',
            duration_days INTEGER DEFAULT 90,
            start_date DATE,
            end_date DATE,
            posting_times TEXT DEFAULT '["09:00", "12:00", "18:00", "21:00"]',
            content_style TEXT DEFAULT 'casual',
            hashtag_strategy TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES x_accounts(id)
        )
    """)

    # X 게시물 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS x_posts (
            id TEXT PRIMARY KEY,
            campaign_id TEXT NOT NULL,
            content TEXT NOT NULL,
            content_type TEXT DEFAULT 'regular',
            hashtags TEXT,
            media_urls TEXT,
            scheduled_at TIMESTAMP,
            posted_at TIMESTAMP,
            x_tweet_id TEXT,
            status TEXT DEFAULT 'pending',
            engagement_likes INTEGER DEFAULT 0,
            engagement_retweets INTEGER DEFAULT 0,
            engagement_replies INTEGER DEFAULT 0,
            engagement_views INTEGER DEFAULT 0,
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (campaign_id) REFERENCES x_campaigns(id)
        )
    """)

    # X 스레드 테이블 (여러 트윗 연결)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS x_threads (
            id TEXT PRIMARY KEY,
            campaign_id TEXT NOT NULL,
            title TEXT,
            scheduled_at TIMESTAMP,
            posted_at TIMESTAMP,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (campaign_id) REFERENCES x_campaigns(id)
        )
    """)

    # 스레드 내 트윗 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS x_thread_tweets (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            content TEXT NOT NULL,
            position INTEGER NOT NULL,
            x_tweet_id TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (thread_id) REFERENCES x_threads(id)
        )
    """)

    conn.commit()
    conn.close()
    logger.info("X tables initialized")


# ========== 계정 관리 ==========

def create_x_account(
    user_id: int,
    x_user_id: str,
    username: str,
    name: str,
    access_token: str,
    refresh_token: Optional[str] = None,
    token_expires_at: Optional[datetime] = None,
    profile_image_url: Optional[str] = None
) -> str:
    """X 계정 연결"""
    account_id = str(uuid.uuid4())

    conn = get_connection()
    cursor = conn.cursor()

    # 기존 계정 확인
    cursor.execute(
        "SELECT id FROM x_accounts WHERE x_user_id = ?",
        (x_user_id,)
    )
    existing = cursor.fetchone()

    if existing:
        # 토큰 업데이트
        cursor.execute("""
            UPDATE x_accounts
            SET access_token = ?, refresh_token = ?, token_expires_at = ?,
                username = ?, name = ?, profile_image_url = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE x_user_id = ?
        """, (access_token, refresh_token, token_expires_at,
              username, name, profile_image_url, x_user_id))
        conn.commit()
        conn.close()
        return existing["id"]

    cursor.execute("""
        INSERT INTO x_accounts
        (id, user_id, x_user_id, username, name, profile_image_url,
         access_token, refresh_token, token_expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (account_id, user_id, x_user_id, username, name, profile_image_url,
          access_token, refresh_token, token_expires_at))
    conn.commit()
    conn.close()

    return account_id


def get_x_accounts(user_id: Optional[int] = None) -> List[Dict]:
    """X 계정 목록 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    if user_id:
        cursor.execute("""
            SELECT id, x_user_id, username, name, profile_image_url,
                   token_expires_at, created_at
            FROM x_accounts WHERE user_id = ?
        """, (user_id,))
    else:
        cursor.execute("""
            SELECT id, x_user_id, username, name, profile_image_url,
                   token_expires_at, created_at
            FROM x_accounts
        """)

    result = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return result


def get_x_account(account_id: str) -> Optional[Dict]:
    """X 계정 상세 조회"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM x_accounts WHERE id = ?", (account_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def delete_x_account(account_id: str) -> bool:
    """X 계정 연결 해제"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM x_accounts WHERE id = ?", (account_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


# ========== 캠페인 관리 ==========

def create_x_campaign(
    user_id: int,
    name: str,
    brand_name: str,
    brand_description: Optional[str] = None,
    target_audience: Optional[str] = None,
    final_goal: Optional[str] = None,
    persona_id: Optional[str] = None,
    account_id: Optional[str] = None,
    duration_days: int = 90,
    content_style: str = "casual"
) -> str:
    """X 캠페인 생성"""
    campaign_id = str(uuid.uuid4())
    start_date = datetime.now().date()
    end_date = start_date + timedelta(days=duration_days)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO x_campaigns
        (id, user_id, account_id, name, brand_name, brand_description,
         target_audience, final_goal, persona_id, duration_days,
         start_date, end_date, content_style)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (campaign_id, user_id, account_id, name, brand_name, brand_description,
          target_audience, final_goal, persona_id, duration_days,
          start_date, end_date, content_style))
    conn.commit()
    conn.close()

    return campaign_id


def get_x_campaigns(user_id: Optional[int] = None) -> List[Dict]:
    """X 캠페인 목록 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        SELECT c.*, a.username as account_username,
               (SELECT COUNT(*) FROM x_posts WHERE campaign_id = c.id) as total_posts,
               (SELECT COUNT(*) FROM x_posts WHERE campaign_id = c.id AND status = 'posted') as posted_count
        FROM x_campaigns c
        LEFT JOIN x_accounts a ON c.account_id = a.id
    """

    if user_id:
        query += " WHERE c.user_id = ?"
        cursor.execute(query + " ORDER BY c.created_at DESC", (user_id,))
    else:
        cursor.execute(query + " ORDER BY c.created_at DESC")

    result = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return result


def get_x_campaign(campaign_id: str) -> Optional[Dict]:
    """X 캠페인 상세 조회"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.*, a.username as account_username
        FROM x_campaigns c
        LEFT JOIN x_accounts a ON c.account_id = a.id
        WHERE c.id = ?
    """, (campaign_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_x_campaign(campaign_id: str, **kwargs) -> bool:
    """X 캠페인 업데이트"""
    allowed_fields = ['name', 'brand_name', 'brand_description', 'target_audience',
                      'final_goal', 'persona_id', 'account_id', 'status',
                      'posting_times', 'content_style', 'hashtag_strategy']

    updates = {k: v for k, v in kwargs.items() if k in allowed_fields}
    if not updates:
        return False

    conn = get_connection()
    cursor = conn.cursor()
    set_clause = ", ".join([f"{k} = ?" for k in updates.keys()])
    values = list(updates.values()) + [campaign_id]

    cursor.execute(f"""
        UPDATE x_campaigns
        SET {set_clause}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, values)
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated


def delete_x_campaign(campaign_id: str) -> bool:
    """X 캠페인 삭제"""
    conn = get_connection()
    cursor = conn.cursor()
    # 관련 게시물 먼저 삭제
    cursor.execute("DELETE FROM x_posts WHERE campaign_id = ?", (campaign_id,))
    cursor.execute("DELETE FROM x_thread_tweets WHERE thread_id IN (SELECT id FROM x_threads WHERE campaign_id = ?)", (campaign_id,))
    cursor.execute("DELETE FROM x_threads WHERE campaign_id = ?", (campaign_id,))
    cursor.execute("DELETE FROM x_campaigns WHERE id = ?", (campaign_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


# ========== 게시물 관리 ==========

def create_x_post(
    campaign_id: str,
    content: str,
    content_type: str = "regular",
    hashtags: Optional[List[str]] = None,
    media_urls: Optional[List[str]] = None,
    scheduled_at: Optional[datetime] = None
) -> str:
    """X 게시물 생성"""
    post_id = str(uuid.uuid4())

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO x_posts
        (id, campaign_id, content, content_type, hashtags, media_urls, scheduled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (post_id, campaign_id, content, content_type,
          json.dumps(hashtags) if hashtags else None,
          json.dumps(media_urls) if media_urls else None,
          scheduled_at))
    conn.commit()
    conn.close()

    return post_id


def get_x_posts(campaign_id: str, status: Optional[str] = None) -> List[Dict]:
    """X 게시물 목록 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM x_posts WHERE campaign_id = ?"
    params = [campaign_id]

    if status:
        query += " AND status = ?"
        params.append(status)

    query += " ORDER BY scheduled_at ASC"
    cursor.execute(query, params)

    posts = []
    for row in cursor.fetchall():
        post = dict(row)
        if post.get("hashtags"):
            post["hashtags"] = json.loads(post["hashtags"])
        if post.get("media_urls"):
            post["media_urls"] = json.loads(post["media_urls"])
        posts.append(post)

    conn.close()
    return posts


def get_pending_x_posts() -> List[Dict]:
    """게시 대기 중인 X 게시물 조회"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT p.*, c.account_id, a.access_token, a.username
        FROM x_posts p
        JOIN x_campaigns c ON p.campaign_id = c.id
        JOIN x_accounts a ON c.account_id = a.id
        WHERE p.status = 'pending'
        AND p.scheduled_at <= datetime('now')
        AND c.status = 'active'
        ORDER BY p.scheduled_at ASC
        LIMIT 10
    """)

    posts = []
    for row in cursor.fetchall():
        post = dict(row)
        if post.get("hashtags"):
            post["hashtags"] = json.loads(post["hashtags"])
        posts.append(post)

    conn.close()
    return posts


def update_x_post_status(
    post_id: str,
    status: str,
    x_tweet_id: Optional[str] = None,
    error_message: Optional[str] = None
) -> bool:
    """X 게시물 상태 업데이트"""
    conn = get_connection()
    cursor = conn.cursor()

    if status == "posted":
        cursor.execute("""
            UPDATE x_posts
            SET status = ?, x_tweet_id = ?, posted_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (status, x_tweet_id, post_id))
    else:
        cursor.execute("""
            UPDATE x_posts
            SET status = ?, error_message = ?
            WHERE id = ?
        """, (status, error_message, post_id))

    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated


def bulk_create_x_posts(campaign_id: str, posts: List[Dict]) -> int:
    """X 게시물 대량 생성"""
    conn = get_connection()
    cursor = conn.cursor()

    for post in posts:
        post_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO x_posts
            (id, campaign_id, content, content_type, hashtags, scheduled_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            post_id,
            campaign_id,
            post["content"],
            post.get("content_type", "regular"),
            json.dumps(post.get("hashtags")) if post.get("hashtags") else None,
            post.get("scheduled_at")
        ))

    conn.commit()
    count = len(posts)
    conn.close()
    return count


# ========== 페르소나 관리 ==========

def create_x_persona(
    user_id: int,
    name: str,
    age: Optional[int] = None,
    job: Optional[str] = None,
    personality: Optional[str] = None,
    tone: str = "friendly",
    interests: Optional[List[str]] = None,
    background_story: Optional[str] = None,
    speech_patterns: Optional[List[str]] = None,
    emoji_usage: str = "moderate",
    avatar_url: Optional[str] = None
) -> str:
    """X 페르소나 생성"""
    persona_id = str(uuid.uuid4())

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO x_personas
        (id, user_id, name, age, job, personality, tone,
         interests, background_story, speech_patterns, emoji_usage, avatar_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        persona_id, user_id, name, age, job, personality, tone,
        json.dumps(interests or [], ensure_ascii=False),
        background_story,
        json.dumps(speech_patterns or [], ensure_ascii=False),
        emoji_usage, avatar_url
    ))

    conn.commit()
    conn.close()
    logger.info(f"Created X persona: {name} ({persona_id})")
    return persona_id


def get_x_persona(persona_id: str) -> Optional[Dict]:
    """X 페르소나 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM x_personas WHERE id = ?", (persona_id,))
    row = cursor.fetchone()
    conn.close()

    if row:
        data = dict(row)
        data['interests'] = json.loads(data.get('interests') or '[]')
        data['speech_patterns'] = json.loads(data.get('speech_patterns') or '[]')
        return data
    return None


def get_x_personas(user_id: Optional[int] = None) -> List[Dict]:
    """X 페르소나 목록 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    if user_id:
        cursor.execute("""
            SELECT p.*,
                   (SELECT COUNT(*) FROM x_campaigns WHERE persona_id = p.id) as campaign_count
            FROM x_personas p
            WHERE p.user_id = ?
            ORDER BY p.created_at DESC
        """, (user_id,))
    else:
        cursor.execute("""
            SELECT p.*,
                   (SELECT COUNT(*) FROM x_campaigns WHERE persona_id = p.id) as campaign_count
            FROM x_personas p
            ORDER BY p.created_at DESC
        """)

    personas = []
    for row in cursor.fetchall():
        data = dict(row)
        data['interests'] = json.loads(data.get('interests') or '[]')
        data['speech_patterns'] = json.loads(data.get('speech_patterns') or '[]')
        personas.append(data)

    conn.close()
    return personas


def update_x_persona(persona_id: str, **kwargs) -> bool:
    """X 페르소나 업데이트"""
    allowed_fields = ['name', 'age', 'job', 'personality', 'tone',
                      'interests', 'background_story', 'speech_patterns',
                      'emoji_usage', 'avatar_url']

    updates = {}
    for k, v in kwargs.items():
        if k in allowed_fields:
            if k in ['interests', 'speech_patterns'] and isinstance(v, list):
                updates[k] = json.dumps(v, ensure_ascii=False)
            else:
                updates[k] = v

    if not updates:
        return False

    conn = get_connection()
    cursor = conn.cursor()

    set_clause = ", ".join([f"{k} = ?" for k in updates.keys()])
    values = list(updates.values()) + [persona_id]

    cursor.execute(f"""
        UPDATE x_personas
        SET {set_clause}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, values)

    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated


def delete_x_persona(persona_id: str) -> bool:
    """X 페르소나 삭제"""
    conn = get_connection()
    cursor = conn.cursor()

    # 연결된 캠페인에서 페르소나 연결 해제
    cursor.execute("""
        UPDATE x_campaigns SET persona_id = NULL WHERE persona_id = ?
    """, (persona_id,))

    # 페르소나 삭제
    cursor.execute("DELETE FROM x_personas WHERE id = ?", (persona_id,))

    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def get_x_campaign_stats(campaign_id: str) -> Dict:
    """X 캠페인 통계 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            COUNT(*) as total_posts,
            SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END) as posted_count,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
            SUM(engagement_likes) as total_likes,
            SUM(engagement_retweets) as total_retweets,
            SUM(engagement_replies) as total_replies,
            SUM(engagement_views) as total_views
        FROM x_posts
        WHERE campaign_id = ?
    """, (campaign_id,))

    row = cursor.fetchone()
    conn.close()

    if row:
        data = dict(row)
        total = data.get('total_posts', 0) or 0
        posted = data.get('posted_count', 0) or 0
        data['progress_percent'] = round((posted / total * 100) if total > 0 else 0, 1)
        data['engagement'] = {
            'likes': data.get('total_likes', 0) or 0,
            'retweets': data.get('total_retweets', 0) or 0,
            'replies': data.get('total_replies', 0) or 0,
            'views': data.get('total_views', 0) or 0,
            'total': (data.get('total_likes', 0) or 0) +
                     (data.get('total_retweets', 0) or 0) +
                     (data.get('total_replies', 0) or 0)
        }
        return data
    return {}
