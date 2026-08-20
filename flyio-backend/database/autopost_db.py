# -*- coding: utf-8 -*-
"""
블로그 자동 작성·발행 — 데이터베이스 (설계서 §4-1, §5)

핵심은 잡 큐의 리스(lease) 규칙이다. 같은 글이 두 번 발행되는 사고를 막는 장치라
여기 로직이 틀리면 상품이 성립하지 않는다.

  · claim 시 lease_expires_at = now + guard_ms, agent_id 기록
  · 에이전트가 30초마다 heartbeat 로 리스 연장
  · 리스 만료 = 에이전트가 죽었다 → queued 로 회수, attempts++
  · attempts >= 3 → failed
  · ★uncertain 은 절대 회수하지 않는다. "발행됐을 수도 있음" 이라
    되돌리면 같은 글이 두 번 예약된다(설계서 §5-2, 원 스펙 10-3 사고).
"""
import json
import logging
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

DB_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
DB_PATH = os.path.join(DB_DIR, 'autopost.db')

FLYIO_DATA_DIR = '/data'
if os.path.exists(FLYIO_DATA_DIR):
    DB_PATH = os.path.join(FLYIO_DATA_DIR, 'autopost.db')

MAX_ATTEMPTS = 3
HEARTBEAT_EXTEND_MS = 120_000     # heartbeat 1회당 연장 폭

# 설계서 §5-1 / §5-2
DRAFT_STATUSES = (
    'pending', 'generating', 'scoring', 'needs_regen',
    'generated', 'approved', 'publishing', 'published', 'failed',
)
JOB_STATUSES = ('queued', 'claimed', 'running', 'succeeded', 'failed', 'uncertain')
TERMINAL_JOB_STATUSES = ('succeeded', 'failed', 'uncertain')


def get_connection() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _ts(dt: datetime) -> str:
    return dt.strftime('%Y-%m-%d %H:%M:%S')


def _row(r: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    return dict(r) if r else None


# ── 스키마 ───────────────────────────────────────────────────
def init_autopost_tables() -> None:
    with get_db() as conn:
        c = conn.cursor()

        c.execute("""
            CREATE TABLE IF NOT EXISTS autopost_blogs (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id          INTEGER NOT NULL,
                blog_id          TEXT    NOT NULL,
                blog_name        TEXT,
                default_category TEXT,
                daily_cap        INTEGER,
                min_gap_minutes  INTEGER DEFAULT 180,
                is_active        INTEGER DEFAULT 1,
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, blog_id)
            )
        """)

        c.execute("""
            CREATE TABLE IF NOT EXISTS autopost_drafts (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id          INTEGER NOT NULL,
                autopost_blog_id INTEGER NOT NULL,
                keyword          TEXT    NOT NULL,
                sub_keywords     TEXT,
                category         TEXT,
                source           TEXT,
                status           TEXT DEFAULT 'pending',
                prompt           TEXT,
                title            TEXT,
                body             TEXT,
                spec_score       REAL,
                spec_report      TEXT,
                regen_count      INTEGER DEFAULT 0,
                guide_snapshot   TEXT,
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (autopost_blog_id)
                    REFERENCES autopost_blogs(id) ON DELETE CASCADE
            )
        """)

        c.execute("""
            CREATE TABLE IF NOT EXISTS autopost_jobs (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id          INTEGER NOT NULL,
                draft_id         INTEGER NOT NULL,
                kind             TEXT NOT NULL,
                status           TEXT DEFAULT 'queued',
                final_action     TEXT DEFAULT 'draft',
                scheduled_at     TIMESTAMP,
                open_type        TEXT DEFAULT 'public',
                allow_search     INTEGER DEFAULT 1,
                category         TEXT,
                expected_blog_id TEXT NOT NULL,
                agent_id         TEXT,
                lease_expires_at TIMESTAMP,
                attempts         INTEGER DEFAULT 0,
                progress_text    TEXT,
                progress_pct     INTEGER,
                result_url       TEXT,
                error            TEXT,
                uncertain        INTEGER DEFAULT 0,
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (draft_id)
                    REFERENCES autopost_drafts(id) ON DELETE CASCADE
            )
        """)
        c.execute("""CREATE INDEX IF NOT EXISTS idx_jobs_queue
                     ON autopost_jobs(status, lease_expires_at)""")
        c.execute("""CREATE INDEX IF NOT EXISTS idx_jobs_user
                     ON autopost_jobs(user_id, status)""")

        c.execute("""
            CREATE TABLE IF NOT EXISTS autopost_agents (
                agent_id     TEXT PRIMARY KEY,
                user_id      INTEGER NOT NULL,
                machine_name TEXT,
                version      TEXT,
                last_seen_at TIMESTAMP,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        c.execute("""
            CREATE TABLE IF NOT EXISTS autopost_images (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id          INTEGER NOT NULL,
                autopost_blog_id INTEGER,
                file_path        TEXT NOT NULL,
                tags             TEXT,
                used_count       INTEGER DEFAULT 0,
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        c.execute("""
            CREATE TABLE IF NOT EXISTS autopost_history (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id          INTEGER NOT NULL,
                autopost_blog_id INTEGER NOT NULL,
                draft_id         INTEGER,
                keyword          TEXT,
                title            TEXT,
                post_url         TEXT,
                published_at     TIMESTAMP,
                action           TEXT,
                tracked_post_id  INTEGER,
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        c.execute("""CREATE INDEX IF NOT EXISTS idx_history_blog
                     ON autopost_history(autopost_blog_id, published_at DESC)""")

    logger.info('autopost tables initialized: %s', DB_PATH)


# ── 블로그 ───────────────────────────────────────────────────
def upsert_blog(user_id: int, blog_id: str, blog_name: str = '',
                default_category: str = '', daily_cap: Optional[int] = None,
                min_gap_minutes: int = 180) -> int:
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            INSERT INTO autopost_blogs
                (user_id, blog_id, blog_name, default_category, daily_cap, min_gap_minutes)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, blog_id) DO UPDATE SET
                blog_name        = excluded.blog_name,
                default_category = excluded.default_category,
                daily_cap        = excluded.daily_cap,
                min_gap_minutes  = excluded.min_gap_minutes,
                is_active        = 1
        """, (user_id, blog_id, blog_name, default_category, daily_cap, min_gap_minutes))
        c.execute('SELECT id FROM autopost_blogs WHERE user_id=? AND blog_id=?',
                  (user_id, blog_id))
        return c.fetchone()['id']


def get_blog(autopost_blog_id: int) -> Optional[Dict]:
    with get_db() as conn:
        c = conn.cursor()
        c.execute('SELECT * FROM autopost_blogs WHERE id=?', (autopost_blog_id,))
        return _row(c.fetchone())


def list_blogs(user_id: int) -> List[Dict]:
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""SELECT * FROM autopost_blogs
                     WHERE user_id=? AND is_active=1 ORDER BY id""", (user_id,))
        return [dict(r) for r in c.fetchall()]


# ── 원고 ─────────────────────────────────────────────────────
def create_draft(user_id: int, autopost_blog_id: int, keyword: str,
                 sub_keywords: Optional[List[str]] = None, category: str = '',
                 source: str = 'manual', prompt: str = '') -> int:
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            INSERT INTO autopost_drafts
                (user_id, autopost_blog_id, keyword, sub_keywords, category, source, prompt)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (user_id, autopost_blog_id, keyword,
              json.dumps(sub_keywords or [], ensure_ascii=False),
              category, source, prompt))
        return c.lastrowid


def get_draft(draft_id: int) -> Optional[Dict]:
    with get_db() as conn:
        c = conn.cursor()
        c.execute('SELECT * FROM autopost_drafts WHERE id=?', (draft_id,))
        return _row(c.fetchone())


def update_draft(draft_id: int, **fields) -> None:
    """status·title·body·spec_score·spec_report·regen_count·guide_snapshot 갱신"""
    allowed = {
        'status', 'prompt', 'title', 'body', 'spec_score', 'spec_report',
        'regen_count', 'guide_snapshot', 'category', 'sub_keywords',
    }
    sets, vals = [], []
    for key, value in fields.items():
        if key not in allowed:
            raise ValueError(f'수정할 수 없는 컬럼: {key}')
        if key == 'status' and value not in DRAFT_STATUSES:
            raise ValueError(f'알 수 없는 draft 상태: {value}')
        if key in ('spec_report', 'guide_snapshot', 'sub_keywords') and not isinstance(value, str):
            value = json.dumps(value, ensure_ascii=False)
        sets.append(f'{key}=?')
        vals.append(value)
    if not sets:
        return
    sets.append('updated_at=?')
    vals.append(_now())
    vals.append(draft_id)
    with get_db() as conn:
        conn.execute(f'UPDATE autopost_drafts SET {", ".join(sets)} WHERE id=?', vals)


def list_drafts(user_id: int, status: Optional[str] = None, limit: int = 100) -> List[Dict]:
    with get_db() as conn:
        c = conn.cursor()
        if status:
            c.execute("""SELECT * FROM autopost_drafts WHERE user_id=? AND status=?
                         ORDER BY id DESC LIMIT ?""", (user_id, status, limit))
        else:
            c.execute("""SELECT * FROM autopost_drafts WHERE user_id=?
                         ORDER BY id DESC LIMIT ?""", (user_id, limit))
        return [dict(r) for r in c.fetchall()]


# ── 잡 큐 ────────────────────────────────────────────────────
def job_guard_ms(kind: str, prompt_len: int = 0, image_count: int = 0) -> int:
    """
    설계서 §5-2. 캡차 대기(180초)보다 반드시 길어야 한다 —
    짧으면 캡차를 푸는 도중에 리스가 만료돼 다른 에이전트가 같은 글을 또 집는다.
    """
    if kind == 'generate':
        return 180_000 + min(120_000, prompt_len // 10 * 1000)
    base = 180_000
    captcha = 200_000
    return base + captcha + image_count * 30_000


def enqueue_job(user_id: int, draft_id: int, kind: str, expected_blog_id: str,
                final_action: str = 'draft', scheduled_at: Optional[str] = None,
                open_type: str = 'public', allow_search: bool = True,
                category: str = '') -> int:
    if kind not in ('generate', 'publish'):
        raise ValueError(f'알 수 없는 잡 종류: {kind}')
    if final_action not in ('draft', 'publishNow', 'schedule'):
        raise ValueError(f'알 수 없는 final_action: {final_action}')
    if final_action == 'schedule' and not scheduled_at:
        raise ValueError('schedule 인데 scheduled_at 이 없습니다')
    if not expected_blog_id:
        raise ValueError('expected_blog_id 는 오발행 방지용이라 필수입니다')

    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            INSERT INTO autopost_jobs
                (user_id, draft_id, kind, expected_blog_id, final_action,
                 scheduled_at, open_type, allow_search, category)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, draft_id, kind, expected_blog_id, final_action,
              scheduled_at, open_type, 1 if allow_search else 0, category))
        return c.lastrowid


def reclaim_expired_jobs() -> int:
    """
    리스가 만료된 잡을 queued 로 회수한다. 폴링 때마다 먼저 호출한다.

    ★uncertain 은 건드리지 않는다. 발행이 됐는지 모르는 상태라
      되돌리면 같은 글이 두 번 올라간다.
    """
    now = _now()
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            SELECT id, attempts FROM autopost_jobs
            WHERE status IN ('claimed', 'running')
              AND lease_expires_at IS NOT NULL
              AND lease_expires_at < ?
        """, (now,))
        rows = c.fetchall()

        reclaimed = 0
        for r in rows:
            attempts = r['attempts'] + 1
            if attempts >= MAX_ATTEMPTS:
                c.execute("""UPDATE autopost_jobs
                             SET status='failed', attempts=?, agent_id=NULL,
                                 lease_expires_at=NULL,
                                 error='리스 만료 3회 — 에이전트가 응답하지 않습니다',
                                 updated_at=?
                             WHERE id=?""", (attempts, now, r['id']))
            else:
                c.execute("""UPDATE autopost_jobs
                             SET status='queued', attempts=?, agent_id=NULL,
                                 lease_expires_at=NULL, updated_at=?
                             WHERE id=?""", (attempts, now, r['id']))
            reclaimed += 1
        return reclaimed


def claim_next_job(agent_id: str, user_id: int,
                   guard_ms: Optional[int] = None) -> Optional[Dict]:
    """
    다음 잡을 하나 집는다. 회수를 먼저 돌리고, 원자적으로 status 를 바꾼다.
    UPDATE ... WHERE status='queued' 의 rowcount 로 경쟁을 판정하므로
    에이전트 둘이 동시에 폴링해도 한쪽만 가져간다.
    """
    reclaim_expired_jobs()
    now = _now()

    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            SELECT j.*, d.prompt AS draft_prompt
            FROM autopost_jobs j
            JOIN autopost_drafts d ON d.id = j.draft_id
            WHERE j.status='queued' AND j.user_id=?
            ORDER BY j.id
        """, (user_id,))
        for row in c.fetchall():
            ms = guard_ms or job_guard_ms(
                row['kind'], len(row['draft_prompt'] or ''), 0
            )
            expires = _ts(datetime.utcnow() + timedelta(milliseconds=ms))
            c.execute("""
                UPDATE autopost_jobs
                SET status='claimed', agent_id=?, lease_expires_at=?, updated_at=?
                WHERE id=? AND status='queued'
            """, (agent_id, expires, now, row['id']))
            if c.rowcount == 1:
                c.execute('SELECT * FROM autopost_jobs WHERE id=?', (row['id'],))
                job = _row(c.fetchone())
                if job:
                    job['guard_ms'] = ms
                return job
        return None


def heartbeat_job(job_id: int, agent_id: str, progress_text: str = '',
                  progress_pct: Optional[int] = None) -> bool:
    """리스 연장. 잡을 쥔 에이전트만 연장할 수 있다."""
    now = datetime.utcnow()
    expires = _ts(now + timedelta(milliseconds=HEARTBEAT_EXTEND_MS))
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            UPDATE autopost_jobs
            SET lease_expires_at=?, status='running',
                progress_text=COALESCE(NULLIF(?, ''), progress_text),
                progress_pct=COALESCE(?, progress_pct),
                updated_at=?
            WHERE id=? AND agent_id=? AND status IN ('claimed', 'running')
        """, (expires, progress_text, progress_pct, _ts(now), job_id, agent_id))
        return c.rowcount == 1


def finish_job(job_id: int, agent_id: str, status: str,
               result_url: str = '', error: str = '') -> bool:
    """
    잡을 종료한다. uncertain 은 uncertain=1 로 표시해 회수 대상에서 영구 제외한다.
    """
    if status not in TERMINAL_JOB_STATUSES:
        raise ValueError(f'종료 상태가 아닙니다: {status}')
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            UPDATE autopost_jobs
            SET status=?, result_url=?, error=?, uncertain=?,
                lease_expires_at=NULL, updated_at=?
            WHERE id=? AND agent_id=?
        """, (status, result_url, error, 1 if status == 'uncertain' else 0,
              _now(), job_id, agent_id))
        return c.rowcount == 1


def get_job(job_id: int) -> Optional[Dict]:
    with get_db() as conn:
        c = conn.cursor()
        c.execute('SELECT * FROM autopost_jobs WHERE id=?', (job_id,))
        return _row(c.fetchone())


# ── 에이전트 ─────────────────────────────────────────────────
def register_agent(user_id: int, machine_name: str = '', version: str = '') -> str:
    agent_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute("""
            INSERT INTO autopost_agents (agent_id, user_id, machine_name, version, last_seen_at)
            VALUES (?, ?, ?, ?, ?)
        """, (agent_id, user_id, machine_name, version, _now()))
    return agent_id


def touch_agent(agent_id: str) -> bool:
    with get_db() as conn:
        c = conn.cursor()
        c.execute('UPDATE autopost_agents SET last_seen_at=? WHERE agent_id=?',
                  (_now(), agent_id))
        return c.rowcount == 1


def get_agent(agent_id: str) -> Optional[Dict]:
    with get_db() as conn:
        c = conn.cursor()
        c.execute('SELECT * FROM autopost_agents WHERE agent_id=?', (agent_id,))
        return _row(c.fetchone())


# ── 발행 이력 (가드 판정용) ──────────────────────────────────
def add_history(user_id: int, autopost_blog_id: int, draft_id: Optional[int],
                keyword: str, title: str, post_url: str, action: str,
                published_at: Optional[str] = None) -> int:
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            INSERT INTO autopost_history
                (user_id, autopost_blog_id, draft_id, keyword, title,
                 post_url, published_at, action)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, autopost_blog_id, draft_id, keyword, title,
              post_url, published_at or _now(), action))
        return c.lastrowid


def count_published_today(autopost_blog_id: int) -> int:
    """일일 상한(§10) 판정용"""
    today = datetime.utcnow().strftime('%Y-%m-%d')
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            SELECT COUNT(*) AS n FROM autopost_history
            WHERE autopost_blog_id=? AND DATE(published_at)=?
        """, (autopost_blog_id, today))
        return c.fetchone()['n']


def last_published_at(autopost_blog_id: int) -> Optional[str]:
    """최소 발행 간격(min_gap_minutes) 판정용"""
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            SELECT published_at FROM autopost_history
            WHERE autopost_blog_id=? ORDER BY published_at DESC LIMIT 1
        """, (autopost_blog_id,))
        r = c.fetchone()
        return r['published_at'] if r else None


def recent_keywords(autopost_blog_id: int, days: int = 30) -> List[str]:
    """중복 주제 가드용 — 최근 발행한 키워드"""
    since = _ts(datetime.utcnow() - timedelta(days=days))
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            SELECT DISTINCT keyword FROM autopost_history
            WHERE autopost_blog_id=? AND published_at >= ? AND keyword IS NOT NULL
        """, (autopost_blog_id, since))
        return [r['keyword'] for r in c.fetchall()]
