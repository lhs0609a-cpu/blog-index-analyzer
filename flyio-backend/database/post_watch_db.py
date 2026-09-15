"""
새 글 누락 감시 저장소 — docs/POST_EXPOSURE_WATCH_SPEC.md.

글은 블로그 기준으로 한 번만 확인한다. 여러 사용자가 같은 블로그를 감시해도
검색 호출은 한 번이고, 알림만 사용자별로 나간다(watched_blogs 가 사용자↔블로그 연결).

시각은 전부 UTC ISO 문자열로 적재한다. 문자열 비교로 정렬·필터가 되도록
항상 같은 형식(_iso)으로만 쓴다.
"""
import logging
import json
import uuid
import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

if sys.platform == "win32":
    _DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "post_watch.db")
else:
    _DEFAULT_PATH = "/data/post_watch.db"

POST_WATCH_DB_PATH = os.environ.get("POST_WATCH_DB_PATH", _DEFAULT_PATH)

KST = timezone(timedelta(hours=9))

# 확인이 끝나지 않은 상태 — 확인 큐 대상
OPEN_STATUSES = ("pending", "delayed")


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _connect() -> sqlite3.Connection:
    db_dir = os.path.dirname(POST_WATCH_DB_PATH)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(POST_WATCH_DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_post_watch_db() -> None:
    conn = _connect()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS watch_lease (
                kind TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS watch_runtime (
                kind TEXT PRIMARY KEY, updated_at TEXT NOT NULL, payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS watched_blogs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                blog_id TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                rss_state TEXT DEFAULT 'ok',
                rss_fail_count INTEGER DEFAULT 0,
                last_rss_at TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(user_id, blog_id)
            );

            CREATE TABLE IF NOT EXISTS watched_posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                blog_id TEXT NOT NULL,
                log_no TEXT NOT NULL,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                published_at TEXT NOT NULL,
                detected_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                checks_done INTEGER DEFAULT 0,
                fail_count INTEGER DEFAULT 0,
                next_check_at TEXT,
                indexed_at TEXT,
                first_rank INTEGER,
                last_checked_at TEXT,
                UNIQUE(blog_id, log_no)
            );
            CREATE INDEX IF NOT EXISTS idx_wp_due ON watched_posts(status, next_check_at);

            CREATE TABLE IF NOT EXISTS post_checks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER NOT NULL,
                checked_at TEXT NOT NULL,
                found INTEGER,
                rank INTEGER,
                error TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_pc_post ON post_checks(post_id);

            CREATE TABLE IF NOT EXISTS api_budget (
                day_kst TEXT PRIMARY KEY,
                calls INTEGER DEFAULT 0
            );
        """)
        conn.commit()
    finally:
        conn.close()


# ===== 감시 블로그 =====

def add_watch(user_id: int, blog_id: str) -> bool:
    """등록. 이미 있으면 다시 활성화한다. 새로 생겼거나 재활성화되면 True."""
    conn = _connect()
    try:
        cur = conn.execute(
            "SELECT id, is_active FROM watched_blogs WHERE user_id = ? AND blog_id = ?",
            (user_id, blog_id),
        )
        row = cur.fetchone()
        if row:
            if row["is_active"]:
                return False
            conn.execute("UPDATE watched_blogs SET is_active = 1 WHERE id = ?", (row["id"],))
        else:
            conn.execute(
                "INSERT INTO watched_blogs (user_id, blog_id, created_at) VALUES (?, ?, ?)",
                (user_id, blog_id, _iso(datetime.now(timezone.utc))),
            )
        conn.commit()
        return True
    finally:
        conn.close()


def remove_watch(user_id: int, blog_id: str) -> bool:
    conn = _connect()
    try:
        cur = conn.execute(
            "UPDATE watched_blogs SET is_active = 0 WHERE user_id = ? AND blog_id = ? AND is_active = 1",
            (user_id, blog_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def list_active_blog_ids() -> List[str]:
    """RSS 순회 대상 — 사용자 수와 무관하게 블로그당 한 번."""
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT DISTINCT blog_id FROM watched_blogs WHERE is_active = 1 ORDER BY blog_id"
        ).fetchall()
        return [r["blog_id"] for r in rows]
    finally:
        conn.close()


def list_watches(user_id: Optional[int] = None) -> List[Dict]:
    conn = _connect()
    try:
        if user_id is None:
            rows = conn.execute(
                "SELECT * FROM watched_blogs WHERE is_active = 1 ORDER BY created_at"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM watched_blogs WHERE is_active = 1 AND user_id = ? ORDER BY created_at",
                (user_id,),
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def record_rss_result(blog_id: str, ok: bool, fail_limit: int = 3) -> None:
    """RSS 성공/실패를 블로그의 모든 감시 행에 반영한다."""
    now = _iso(datetime.now(timezone.utc))
    conn = _connect()
    try:
        if ok:
            conn.execute(
                "UPDATE watched_blogs SET rss_state = 'ok', rss_fail_count = 0, last_rss_at = ? "
                "WHERE blog_id = ? AND is_active = 1",
                (now, blog_id),
            )
        else:
            conn.execute(
                "UPDATE watched_blogs SET rss_fail_count = rss_fail_count + 1, last_rss_at = ?, "
                "rss_state = CASE WHEN rss_fail_count + 1 >= ? THEN 'failing' ELSE rss_state END "
                "WHERE blog_id = ? AND is_active = 1",
                (now, fail_limit, blog_id),
            )
        conn.commit()
    finally:
        conn.close()


# ===== 글 =====

def known_log_nos(blog_id: str) -> set:
    conn = _connect()
    try:
        rows = conn.execute("SELECT log_no FROM watched_posts WHERE blog_id = ?", (blog_id,)).fetchall()
        return {r["log_no"] for r in rows}
    finally:
        conn.close()


def insert_post(blog_id: str, log_no: str, title: str, url: str, published_at: datetime,
                status: str, next_check_at: Optional[datetime]) -> bool:
    conn = _connect()
    try:
        cur = conn.execute(
            "INSERT OR IGNORE INTO watched_posts "
            "(blog_id, log_no, title, url, published_at, detected_at, status, next_check_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                blog_id, log_no, title, url, _iso(published_at),
                _iso(datetime.now(timezone.utc)), status,
                _iso(next_check_at) if next_check_at else None,
            ),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def open_posts_for_blog(blog_id: str) -> List[Dict]:
    conn = _connect()
    try:
        rows = conn.execute(
            f"SELECT * FROM watched_posts WHERE blog_id = ? AND status IN {OPEN_STATUSES}",
            (blog_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def due_posts(now: datetime, limit: int = 50) -> List[Dict]:
    conn = _connect()
    try:
        rows = conn.execute(
            f"SELECT * FROM watched_posts WHERE status IN {OPEN_STATUSES} "
            "AND EXISTS (SELECT 1 FROM watched_blogs b WHERE b.blog_id = watched_posts.blog_id AND b.is_active = 1) "
            "AND next_check_at IS NOT NULL AND next_check_at <= ? "
            "ORDER BY next_check_at ASC LIMIT ?",
            (_iso(now), limit),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def apply_update(post_id: int, update: Dict) -> None:
    """transition() 이 돌려준 필드만 갱신한다."""
    if not update:
        return
    cols, vals = [], []
    for k, v in update.items():
        cols.append(f"{k} = ?")
        vals.append(_iso(v) if isinstance(v, datetime) else v)
    vals.append(post_id)
    conn = _connect()
    try:
        conn.execute(f"UPDATE watched_posts SET {', '.join(cols)} WHERE id = ?", vals)
        conn.commit()
    finally:
        conn.close()


def log_check(post_id: int, found: Optional[bool], rank: Optional[int], error: Optional[str]) -> None:
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO post_checks (post_id, checked_at, found, rank, error) VALUES (?, ?, ?, ?, ?)",
            (
                post_id, _iso(datetime.now(timezone.utc)),
                None if found is None else int(found), rank, error,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def posts_for_blog(blog_id: str, limit: int = 30) -> List[Dict]:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT * FROM watched_posts WHERE blog_id = ? AND status != 'baseline' "
            "ORDER BY published_at DESC LIMIT ?",
            (blog_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def status_summary() -> Dict:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT status, COUNT(*) AS n FROM watched_posts GROUP BY status"
        ).fetchall()
        return {r["status"]: r["n"] for r in rows}
    finally:
        conn.close()


# ===== 검색 API 예산 =====

def _today_kst() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d")


def budget_used_today() -> int:
    conn = _connect()
    try:
        row = conn.execute("SELECT calls FROM api_budget WHERE day_kst = ?", (_today_kst(),)).fetchone()
        return row["calls"] if row else 0
    finally:
        conn.close()


def budget_add(n: int = 1) -> None:
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO api_budget (day_kst, calls) VALUES (?, ?) "
            "ON CONFLICT(day_kst) DO UPDATE SET calls = calls + excluded.calls",
            (_today_kst(), n),
        )
        conn.commit()
    finally:
        conn.close()


def record_runtime(kind: str, payload: Dict) -> None:
    conn = _connect()
    try:
        conn.execute('INSERT OR REPLACE INTO watch_runtime VALUES (?, ?, ?)',
                     (kind, _iso(datetime.now(timezone.utc)), json.dumps(payload)))
        conn.commit()
    finally:
        conn.close()


def acquire_check_lease() -> Optional[str]:
    conn = _connect()
    try:
        conn.execute('BEGIN IMMEDIATE')
        now = datetime.now(timezone.utc)
        conn.execute('DELETE FROM watch_lease WHERE expires_at <= ?', (_iso(now),))
        owner = uuid.uuid4().hex
        cur = conn.execute("INSERT OR IGNORE INTO watch_lease VALUES ('check', ?, ?)",
                           (owner, _iso(now + timedelta(minutes=15))))
        conn.commit()
        return owner if cur.rowcount else None
    finally:
        conn.close()


def release_check_lease(owner: str) -> None:
    conn = _connect()
    try:
        conn.execute("DELETE FROM watch_lease WHERE kind = 'check' AND owner = ?", (owner,))
        conn.commit()
    finally:
        conn.close()


def runtime_status() -> Dict:
    conn = _connect()
    try:
        return {r['kind']: {'updated_at': r['updated_at'], **json.loads(r['payload'])}
                for r in conn.execute('SELECT * FROM watch_runtime')}
    finally:
        conn.close()


def repair_legacy_verdicts() -> int:
    """One-time invalidation of API-only negatives; preserve the original check history."""
    conn = _connect()
    try:
        conn.execute('BEGIN IMMEDIATE')
        if conn.execute("SELECT 1 FROM watch_runtime WHERE kind = 'serp_v2_migration'").fetchone():
            return 0
        now = _iso(datetime.now(timezone.utc))
        cur = conn.execute("UPDATE watched_posts SET status = 'pending', fail_count = 0, next_check_at = ? "
                           "WHERE status IN ('missing', 'delayed', 'removed', 'unmeasurable')", (now,))
        count = cur.rowcount
        conn.execute('INSERT INTO watch_runtime VALUES (?, ?, ?)',
                     ('serp_v2_migration', now, json.dumps({'requeued': count})))
        conn.commit()
        return count
    finally:
        conn.close()
