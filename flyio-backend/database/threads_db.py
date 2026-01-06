"""
Threads 자동화 시스템 - 데이터베이스
"""
import sqlite3
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pathlib import Path

logger = logging.getLogger(__name__)

# DB 경로 - Windows/Linux 호환
import sys
import os
if sys.platform == "win32":
    _data_dir = Path(os.path.dirname(__file__)).parent / "data"
else:
    _data_dir = Path("/data")
DB_PATH = _data_dir / "threads_automation.db"

def get_db_connection():
    """DB 연결"""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_threads_db():
    """Threads 자동화 테이블 초기화"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 페르소나 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS personas (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            age INTEGER,
            job TEXT,
            personality TEXT,
            tone TEXT DEFAULT 'friendly',
            interests TEXT,
            background_story TEXT,
            speech_patterns TEXT,
            emoji_usage TEXT DEFAULT 'moderate',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 캠페인 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS campaigns (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            persona_id TEXT,
            threads_account_id TEXT,
            name TEXT NOT NULL,
            brand_name TEXT NOT NULL,
            brand_description TEXT,
            target_audience TEXT,
            final_goal TEXT,
            duration_days INTEGER DEFAULT 90,
            start_date DATE,
            end_date DATE,
            posts_per_day INTEGER DEFAULT 1,
            status TEXT DEFAULT 'draft',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (persona_id) REFERENCES personas(id)
        )
    """)

    # 콘텐츠 게시물 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS content_posts (
            id TEXT PRIMARY KEY,
            campaign_id TEXT NOT NULL,
            day_number INTEGER NOT NULL,
            scheduled_at TIMESTAMP,
            layer TEXT DEFAULT 'daily',
            content_type TEXT DEFAULT 'mood',
            arc_phase TEXT DEFAULT 'warmup',
            emotion TEXT DEFAULT 'neutral',
            content TEXT NOT NULL,
            hashtags TEXT,
            media_urls TEXT,
            status TEXT DEFAULT 'scheduled',
            threads_post_id TEXT,
            posted_at TIMESTAMP,
            likes_count INTEGER DEFAULT 0,
            replies_count INTEGER DEFAULT 0,
            reposts_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
        )
    """)

    # AI 생성 로그 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_generation_logs (
            id TEXT PRIMARY KEY,
            campaign_id TEXT,
            post_id TEXT,
            prompt TEXT,
            response TEXT,
            model TEXT,
            tokens_used INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Threads 계정 연동 테이블 (향후 OAuth 연동용)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS threads_accounts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            threads_user_id TEXT,
            username TEXT,
            access_token TEXT,
            token_expires_at TIMESTAMP,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 사용자별 Threads API 자격증명 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS threads_api_credentials (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL UNIQUE,
            app_id TEXT NOT NULL,
            app_secret TEXT NOT NULL,
            redirect_uri TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    conn.close()
    logger.info("Threads DB initialized")


# ===== 페르소나 CRUD =====

def create_persona(
    user_id: str,
    name: str,
    age: int = None,
    job: str = None,
    personality: str = None,
    tone: str = "friendly",
    interests: List[str] = None,
    background_story: str = None,
    speech_patterns: List[str] = None,
    emoji_usage: str = "moderate"
) -> str:
    """페르소나 생성"""
    import uuid
    persona_id = str(uuid.uuid4())

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO personas (
            id, user_id, name, age, job, personality, tone,
            interests, background_story, speech_patterns, emoji_usage
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        persona_id, user_id, name, age, job, personality, tone,
        json.dumps(interests or [], ensure_ascii=False),
        background_story,
        json.dumps(speech_patterns or [], ensure_ascii=False),
        emoji_usage
    ))

    conn.commit()
    conn.close()
    logger.info(f"Created persona: {name} ({persona_id})")
    return persona_id


def get_persona(persona_id: str) -> Optional[Dict]:
    """페르소나 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM personas WHERE id = ?", (persona_id,))
    row = cursor.fetchone()
    conn.close()

    if row:
        data = dict(row)
        data['interests'] = json.loads(data.get('interests') or '[]')
        data['speech_patterns'] = json.loads(data.get('speech_patterns') or '[]')
        return data
    return None


def get_user_personas(user_id: str) -> List[Dict]:
    """사용자의 모든 페르소나 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM personas
        WHERE user_id = ?
        ORDER BY created_at DESC
    """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    personas = []
    for row in rows:
        data = dict(row)
        data['interests'] = json.loads(data.get('interests') or '[]')
        data['speech_patterns'] = json.loads(data.get('speech_patterns') or '[]')
        personas.append(data)

    return personas


def update_persona(persona_id: str, **kwargs) -> bool:
    """페르소나 업데이트"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # JSON 필드 처리
    if 'interests' in kwargs and isinstance(kwargs['interests'], list):
        kwargs['interests'] = json.dumps(kwargs['interests'], ensure_ascii=False)
    if 'speech_patterns' in kwargs and isinstance(kwargs['speech_patterns'], list):
        kwargs['speech_patterns'] = json.dumps(kwargs['speech_patterns'], ensure_ascii=False)

    kwargs['updated_at'] = datetime.now().isoformat()

    set_clause = ", ".join([f"{k} = ?" for k in kwargs.keys()])
    values = list(kwargs.values()) + [persona_id]

    cursor.execute(f"""
        UPDATE personas SET {set_clause} WHERE id = ?
    """, values)

    conn.commit()
    affected = cursor.rowcount
    conn.close()

    return affected > 0


def delete_persona(persona_id: str) -> bool:
    """페르소나 삭제"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM personas WHERE id = ?", (persona_id,))

    conn.commit()
    affected = cursor.rowcount
    conn.close()

    return affected > 0


# ===== 캠페인 CRUD =====

def create_campaign(
    user_id: str,
    name: str,
    brand_name: str,
    persona_id: str = None,
    brand_description: str = None,
    target_audience: str = None,
    final_goal: str = None,
    duration_days: int = 90,
    start_date: str = None,
    posts_per_day: int = 1
) -> str:
    """캠페인 생성"""
    import uuid
    campaign_id = str(uuid.uuid4())

    if not start_date:
        start_date = datetime.now().strftime("%Y-%m-%d")

    end_date = (datetime.strptime(start_date, "%Y-%m-%d") + timedelta(days=duration_days)).strftime("%Y-%m-%d")

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO campaigns (
            id, user_id, persona_id, name, brand_name, brand_description,
            target_audience, final_goal, duration_days, start_date, end_date, posts_per_day
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        campaign_id, user_id, persona_id, name, brand_name, brand_description,
        target_audience, final_goal, duration_days, start_date, end_date, posts_per_day
    ))

    conn.commit()
    conn.close()
    logger.info(f"Created campaign: {name} ({campaign_id})")
    return campaign_id


def get_campaign(campaign_id: str) -> Optional[Dict]:
    """캠페인 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT c.*, p.name as persona_name, p.tone as persona_tone
        FROM campaigns c
        LEFT JOIN personas p ON c.persona_id = p.id
        WHERE c.id = ?
    """, (campaign_id,))

    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


def get_user_campaigns(user_id: str) -> List[Dict]:
    """사용자의 모든 캠페인 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT c.*, p.name as persona_name,
               (SELECT COUNT(*) FROM content_posts WHERE campaign_id = c.id) as total_posts,
               (SELECT COUNT(*) FROM content_posts WHERE campaign_id = c.id AND status = 'posted') as posted_count
        FROM campaigns c
        LEFT JOIN personas p ON c.persona_id = p.id
        WHERE c.user_id = ?
        ORDER BY c.created_at DESC
    """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def update_campaign(campaign_id: str, **kwargs) -> bool:
    """캠페인 업데이트"""
    conn = get_db_connection()
    cursor = conn.cursor()

    kwargs['updated_at'] = datetime.now().isoformat()

    set_clause = ", ".join([f"{k} = ?" for k in kwargs.keys()])
    values = list(kwargs.values()) + [campaign_id]

    cursor.execute(f"""
        UPDATE campaigns SET {set_clause} WHERE id = ?
    """, values)

    conn.commit()
    affected = cursor.rowcount
    conn.close()

    return affected > 0


def delete_campaign(campaign_id: str) -> bool:
    """캠페인 삭제 (관련 게시물도 함께)"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 관련 게시물 먼저 삭제
    cursor.execute("DELETE FROM content_posts WHERE campaign_id = ?", (campaign_id,))
    cursor.execute("DELETE FROM campaigns WHERE id = ?", (campaign_id,))

    conn.commit()
    affected = cursor.rowcount
    conn.close()

    return affected > 0


# ===== 콘텐츠 게시물 CRUD =====

def create_content_post(
    campaign_id: str,
    day_number: int,
    content: str,
    scheduled_at: str = None,
    layer: str = "daily",
    content_type: str = "mood",
    arc_phase: str = "warmup",
    emotion: str = "neutral",
    hashtags: List[str] = None
) -> str:
    """콘텐츠 게시물 생성"""
    import uuid
    post_id = str(uuid.uuid4())

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO content_posts (
            id, campaign_id, day_number, scheduled_at, layer, content_type,
            arc_phase, emotion, content, hashtags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        post_id, campaign_id, day_number, scheduled_at, layer, content_type,
        arc_phase, emotion, content, json.dumps(hashtags or [], ensure_ascii=False)
    ))

    conn.commit()
    conn.close()

    return post_id


def create_content_posts_bulk(posts: List[Dict]) -> int:
    """콘텐츠 게시물 일괄 생성"""
    import uuid

    conn = get_db_connection()
    cursor = conn.cursor()

    count = 0
    for post in posts:
        post_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO content_posts (
                id, campaign_id, day_number, scheduled_at, layer, content_type,
                arc_phase, emotion, content, hashtags
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            post_id,
            post['campaign_id'],
            post['day_number'],
            post.get('scheduled_at'),
            post.get('layer', 'daily'),
            post.get('content_type', 'mood'),
            post.get('arc_phase', 'warmup'),
            post.get('emotion', 'neutral'),
            post['content'],
            json.dumps(post.get('hashtags', []), ensure_ascii=False)
        ))
        count += 1

    conn.commit()
    conn.close()
    logger.info(f"Created {count} content posts in bulk")

    return count


def get_campaign_posts(campaign_id: str, status: str = None) -> List[Dict]:
    """캠페인의 모든 게시물 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    if status:
        cursor.execute("""
            SELECT * FROM content_posts
            WHERE campaign_id = ? AND status = ?
            ORDER BY day_number ASC
        """, (campaign_id, status))
    else:
        cursor.execute("""
            SELECT * FROM content_posts
            WHERE campaign_id = ?
            ORDER BY day_number ASC
        """, (campaign_id,))

    rows = cursor.fetchall()
    conn.close()

    posts = []
    for row in rows:
        data = dict(row)
        data['hashtags'] = json.loads(data.get('hashtags') or '[]')
        posts.append(data)

    return posts


def get_post(post_id: str) -> Optional[Dict]:
    """게시물 단일 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM content_posts WHERE id = ?", (post_id,))
    row = cursor.fetchone()
    conn.close()

    if row:
        data = dict(row)
        data['hashtags'] = json.loads(data.get('hashtags') or '[]')
        return data
    return None


def update_post(post_id: str, **kwargs) -> bool:
    """게시물 업데이트"""
    conn = get_db_connection()
    cursor = conn.cursor()

    if 'hashtags' in kwargs and isinstance(kwargs['hashtags'], list):
        kwargs['hashtags'] = json.dumps(kwargs['hashtags'], ensure_ascii=False)

    kwargs['updated_at'] = datetime.now().isoformat()

    set_clause = ", ".join([f"{k} = ?" for k in kwargs.keys()])
    values = list(kwargs.values()) + [post_id]

    cursor.execute(f"""
        UPDATE content_posts SET {set_clause} WHERE id = ?
    """, values)

    conn.commit()
    affected = cursor.rowcount
    conn.close()

    return affected > 0


def delete_campaign_posts(campaign_id: str) -> int:
    """캠페인의 모든 게시물 삭제"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM content_posts WHERE campaign_id = ?", (campaign_id,))

    conn.commit()
    deleted = cursor.rowcount
    conn.close()

    return deleted


def get_posts_by_date_range(campaign_id: str, start_day: int, end_day: int) -> List[Dict]:
    """특정 날짜 범위의 게시물 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM content_posts
        WHERE campaign_id = ? AND day_number >= ? AND day_number <= ?
        ORDER BY day_number ASC
    """, (campaign_id, start_day, end_day))

    rows = cursor.fetchall()
    conn.close()

    posts = []
    for row in rows:
        data = dict(row)
        data['hashtags'] = json.loads(data.get('hashtags') or '[]')
        posts.append(data)

    return posts


# ===== AI 생성 로그 =====

def log_ai_generation(
    campaign_id: str,
    post_id: str = None,
    prompt: str = None,
    response: str = None,
    model: str = None,
    tokens_used: int = 0
) -> str:
    """AI 생성 로그 저장"""
    import uuid
    log_id = str(uuid.uuid4())

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO ai_generation_logs (
            id, campaign_id, post_id, prompt, response, model, tokens_used
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (log_id, campaign_id, post_id, prompt, response, model, tokens_used))

    conn.commit()
    conn.close()

    return log_id


# ===== 통계 =====

def get_campaign_stats(campaign_id: str) -> Dict:
    """캠페인 통계"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            COUNT(*) as total_posts,
            SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END) as posted_count,
            SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled_count,
            SUM(likes_count) as total_likes,
            SUM(replies_count) as total_replies,
            SUM(reposts_count) as total_reposts,
            AVG(likes_count) as avg_likes,
            AVG(replies_count) as avg_replies
        FROM content_posts
        WHERE campaign_id = ?
    """, (campaign_id,))

    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else {}


# ===== Threads 계정 관리 =====

def save_threads_account(
    user_id: str,
    threads_user_id: str,
    username: str,
    access_token: str,
    token_expires_at: datetime
) -> str:
    """Threads 계정 저장 (있으면 업데이트)"""
    import uuid

    conn = get_db_connection()
    cursor = conn.cursor()

    # 기존 계정 확인
    cursor.execute("""
        SELECT id FROM threads_accounts
        WHERE user_id = ? AND threads_user_id = ?
    """, (user_id, threads_user_id))

    existing = cursor.fetchone()

    if existing:
        # 업데이트
        cursor.execute("""
            UPDATE threads_accounts
            SET username = ?, access_token = ?, token_expires_at = ?, is_active = 1
            WHERE id = ?
        """, (username, access_token, token_expires_at.isoformat(), existing['id']))
        account_id = existing['id']
    else:
        # 새로 생성
        account_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO threads_accounts (
                id, user_id, threads_user_id, username, access_token, token_expires_at
            ) VALUES (?, ?, ?, ?, ?, ?)
        """, (account_id, user_id, threads_user_id, username, access_token, token_expires_at.isoformat()))

    conn.commit()
    conn.close()
    logger.info(f"Saved Threads account: {username} ({account_id})")
    return account_id


def get_threads_account(account_id: str) -> Optional[Dict]:
    """Threads 계정 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM threads_accounts WHERE id = ?", (account_id,))
    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


def get_user_threads_accounts(user_id: str) -> List[Dict]:
    """사용자의 모든 Threads 계정 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM threads_accounts
        WHERE user_id = ? AND is_active = 1
        ORDER BY created_at DESC
    """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def delete_threads_account(account_id: str) -> bool:
    """Threads 계정 삭제 (비활성화)"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE threads_accounts SET is_active = 0 WHERE id = ?
    """, (account_id,))

    conn.commit()
    affected = cursor.rowcount
    conn.close()

    return affected > 0


def get_accounts_needing_refresh() -> List[Dict]:
    """토큰 갱신이 필요한 계정 조회 (만료 7일 전)"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM threads_accounts
        WHERE is_active = 1
        AND datetime(token_expires_at) < datetime('now', '+7 days')
    """)

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


# ===== API 자격증명 관리 =====

def save_api_credentials(
    user_id: str,
    app_id: str,
    app_secret: str,
    redirect_uri: str = None
) -> str:
    """API 자격증명 저장 (있으면 업데이트)"""
    import uuid

    if not redirect_uri:
        redirect_uri = "https://blog-index-analyzer.vercel.app/threads/callback"

    conn = get_db_connection()
    cursor = conn.cursor()

    # 기존 자격증명 확인
    cursor.execute("SELECT id FROM threads_api_credentials WHERE user_id = ?", (user_id,))
    existing = cursor.fetchone()

    if existing:
        # 업데이트
        cursor.execute("""
            UPDATE threads_api_credentials
            SET app_id = ?, app_secret = ?, redirect_uri = ?, updated_at = ?
            WHERE user_id = ?
        """, (app_id, app_secret, redirect_uri, datetime.now().isoformat(), user_id))
        cred_id = existing['id']
    else:
        # 새로 생성
        cred_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO threads_api_credentials (id, user_id, app_id, app_secret, redirect_uri)
            VALUES (?, ?, ?, ?, ?)
        """, (cred_id, user_id, app_id, app_secret, redirect_uri))

    conn.commit()
    conn.close()
    logger.info(f"Saved API credentials for user: {user_id}")
    return cred_id


def get_api_credentials(user_id: str) -> Optional[Dict]:
    """API 자격증명 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM threads_api_credentials WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


def delete_api_credentials(user_id: str) -> bool:
    """API 자격증명 삭제"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM threads_api_credentials WHERE user_id = ?", (user_id,))

    conn.commit()
    affected = cursor.rowcount
    conn.close()

    return affected > 0


# DB 초기화 실행
init_threads_db()
