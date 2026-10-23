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
            /*
              전수 노출 감사 작업.

              왜 작업(job)인가 — 블로그 10개 × 최근 30글이면 글 300개이고 글 하나에
              검색 요청이 최대 2회다. 동기 요청으로 처리하면 10분 넘게 워커를 잡고
              있게 되는데, 이 박스는 동시 4명에서 무너진 전력이 있다. 그래서 큐에
              넣고 하나씩 돌리고 진행률을 따로 읽는다.
            */
            CREATE TABLE IF NOT EXISTS audit_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                blog_ids TEXT NOT NULL,          -- JSON 배열
                status TEXT DEFAULT 'queued',    -- queued|running|done|failed
                total INTEGER DEFAULT 0,         -- 잴 글 수 (RSS 수집 후 확정)
                checked INTEGER DEFAULT 0,
                result TEXT,                     -- JSON (블로그별 집계 + 미발견 목록)
                error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT,
                finished_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_jobs(user_id, created_at);

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


# ===== 전수 노출 감사 작업 =====

def create_audit_job(user_id: int, blog_ids: List[str]) -> int:
    conn = _connect()
    try:
        cur = conn.execute(
            "INSERT INTO audit_jobs (user_id, blog_ids, created_at) VALUES (?, ?, ?)",
            (user_id, json.dumps(blog_ids, ensure_ascii=False), _iso(datetime.now(timezone.utc))),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def get_audit_job(job_id: int) -> Optional[Dict]:
    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM audit_jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            return None
        job = dict(row)
        job["blog_ids"] = json.loads(job["blog_ids"] or "[]")
        job["result"] = json.loads(job["result"]) if job.get("result") else None
        return job
    finally:
        conn.close()


def latest_audit_job(user_id: int) -> Optional[Dict]:
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT id FROM audit_jobs WHERE user_id = ? ORDER BY id DESC LIMIT 1", (user_id,)
        ).fetchone()
        return get_audit_job(row["id"]) if row else None
    finally:
        conn.close()


def update_audit_job(job_id: int, **fields) -> None:
    """status/total/checked/result/error/finished_at 만 받는다."""
    allowed = {"status", "total", "checked", "result", "error", "finished_at"}
    sets, vals = [], []
    for k, v in fields.items():
        if k not in allowed:
            continue
        if k == "result" and v is not None and not isinstance(v, str):
            v = json.dumps(v, ensure_ascii=False)
        sets.append(f"{k} = ?")
        vals.append(v)
    if not sets:
        return
    sets.append("updated_at = ?")
    vals.append(_iso(datetime.now(timezone.utc)))
    vals.append(job_id)
    conn = _connect()
    try:
        conn.execute(f"UPDATE audit_jobs SET {', '.join(sets)} WHERE id = ?", vals)
        conn.commit()
    finally:
        conn.close()


#: 이 시간 넘게 아무 진척이 없는 작업은 죽은 것으로 본다.
#  글 하나에 최대 2초인데 5개마다 진척을 기록하므로 정상이면 분 단위로 갱신된다.
AUDIT_STALE_MINUTES = 20


def running_audit_count() -> int:
    """
    동시 실행을 막는 근거.

    ⚠️ 고아 작업을 세면 안 된다. 감사는 API 프로세스의 asyncio 태스크로 도는데
    배포·재시작이 나면 그 태스크가 사라지고 행은 'running' 으로 남는다. 그걸
    그대로 세면 **기능이 영구히 막힌다**(이 레포는 고아 chromium·고아 루프로
    같은 방식으로 서비스가 멈춘 전력이 있다). 그래서 진척이 멈춘 행은 제외한다.
    """
    conn = _connect()
    try:
        cutoff = _iso(datetime.now(timezone.utc) - timedelta(minutes=AUDIT_STALE_MINUTES))
        return conn.execute(
            "SELECT COUNT(*) FROM audit_jobs WHERE status IN ('queued','running') "
            "AND COALESCE(updated_at, created_at) >= ?",
            (cutoff,),
        ).fetchone()[0]
    finally:
        conn.close()


def reap_stale_audits() -> int:
    """
    진척이 멈춘 감사 작업을 failed 로 닫는다. 기동 시 한 번 부른다.

    이게 없으면 사용자는 영원히 진행률 막대를 보고 있게 된다 — 서버에는 그 작업을
    이어서 돌릴 주체가 없다.
    """
    conn = _connect()
    try:
        cutoff = _iso(datetime.now(timezone.utc) - timedelta(minutes=AUDIT_STALE_MINUTES))
        cur = conn.execute(
            "UPDATE audit_jobs SET status = 'failed', "
            "error = '서버가 재시작되어 중단됐습니다. 다시 시도해주세요.', "
            "finished_at = ?, updated_at = ? "
            "WHERE status IN ('queued','running') "
            "AND COALESCE(updated_at, created_at) < ?",
            (_iso(datetime.now(timezone.utc)), _iso(datetime.now(timezone.utc)), cutoff),
        )
        conn.commit()
        if cur.rowcount:
            logger.warning(f"[audit] 고아 작업 {cur.rowcount}건을 failed 로 닫았다")
        return cur.rowcount
    finally:
        conn.close()


def audit_jobs_today(user_id: int) -> int:
    conn = _connect()
    try:
        today = _today_kst()
        return conn.execute(
            "SELECT COUNT(*) FROM audit_jobs WHERE user_id = ? AND substr(created_at,1,10) >= ?",
            (user_id, today),
        ).fetchone()[0]
    finally:
        conn.close()


def observed_status(blog_id: str, log_no: str) -> Optional[str]:
    """
    이 글을 이미 관측한 적이 있는가. 감사에서 **재측정을 피하는 유일한 수단**이다.

    감시(post_watch)가 이미 indexed 로 확인한 글을 감사가 다시 검색하면 예산을
    두 번 쓰고 결과는 같다. terminal 상태만 재사용한다 — pending/delayed 는
    아직 확정이 아니라 지금 다시 보는 게 맞다.
    """
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT status FROM watched_posts WHERE blog_id = ? AND log_no = ?",
            (blog_id, log_no),
        ).fetchone()
        if row and row["status"] in ("indexed", "absent_in_search", "removed"):
            return row["status"]
        return None
    finally:
        conn.close()


def relabel_absent_in_search(dry_run: bool = True) -> Dict:
    """
    이미 `unmeasurable` 로 끝난 글 중, 확인 이력이 전부 `serp_not_found` 인 것을
    `absent_in_search` 로 되살린다.

    왜 필요한가 — 라벨을 가른 건 2026-10-23 이고 그 전에 끝난 글은 terminal 이라
    다시 확인되지 않는다(`due_posts` 는 pending/delayed 만 꺼낸다). 그대로 두면
    사용자 화면에서 1,351건이 영원히 '확인 불가'로 남는다. 새로 재지 않고
    **이미 남아 있는 근거(post_checks.error)** 만으로 이름을 바꾼다.

    섞인 이력(차단·타임아웃이 한 번이라도 있던 글)은 건드리지 않는다 — 그건
    실제로 못 본 것이다. 기본은 dry_run 이다.
    """
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT p.id AS id, GROUP_CONCAT(COALESCE(c.error, '')) AS errs, COUNT(c.id) AS n "
            "FROM watched_posts p JOIN post_checks c ON c.post_id = p.id "
            "WHERE p.status = 'unmeasurable' GROUP BY p.id"
        ).fetchall()

        targets = []
        for r in rows:
            if not r["n"]:
                continue
            tokens = {t for t in (r["errs"] or "").replace(",", ";").split(";") if t}
            if tokens and tokens <= {"serp_not_found"}:
                targets.append(r["id"])

        if not dry_run and targets:
            conn.executemany(
                "UPDATE watched_posts SET status = 'absent_in_search' WHERE id = ?",
                [(i,) for i in targets],
            )
            conn.commit()
        return {"scanned": len(rows), "candidates": len(targets), "applied": (not dry_run)}
    finally:
        conn.close()


def post_by_id(post_id: int) -> Optional[Dict]:
    """글 한 건. 소유권 검사(이 글의 블로그를 내가 감시하는지)를 하려면 blog_id 가 필요하다."""
    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM watched_posts WHERE id = ?", (post_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def checks_for_post(post_id: int, limit: int = 20) -> List[Dict]:
    """확인 이력. 사용자에게 '언제 확인했고 무엇이 나왔는지'를 보여주는 근거다."""
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT checked_at, found, rank, error FROM post_checks WHERE post_id = ? "
            "ORDER BY checked_at DESC LIMIT ?",
            (post_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def user_status_summary(user_id: int) -> Dict:
    """내가 감시하는 블로그들의 글 상태 집계. baseline(등록 전 글)은 세지 않는다."""
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT p.status AS status, COUNT(*) AS n FROM watched_posts p "
            "WHERE p.status != 'baseline' AND p.blog_id IN ("
            "  SELECT blog_id FROM watched_blogs WHERE user_id = ? AND is_active = 1"
            ") GROUP BY p.status",
            (user_id,),
        ).fetchall()
        return {r["status"]: r["n"] for r in rows}
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
