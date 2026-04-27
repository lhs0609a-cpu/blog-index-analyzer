"""
키워드 풀 — 24시간 자동 수집·등록을 위한 큐.

흐름:
  [수집 워커] keywordstool 호출 → naverad_keyword_pool (status=pending)
  [등록 워커] pending pull → 차집합 → 네이버 등록 → status=registered/failed/skipped

테이블:
  naverad_keyword_pool (
    id, user_id, account_customer_id, keyword,
    monthly_total, comp_idx, source, status,
    discovered_at, registered_at, ad_group_id, error_message
  )
  - UNIQUE(account_customer_id, keyword) — 풀 내부 중복 방지
  - status: pending / registered / skipped / failed
"""
import os
import sqlite3
import sys
from contextlib import contextmanager
from typing import Iterable, List, Optional, Dict, Set
import logging

logger = logging.getLogger(__name__)

if sys.platform == "win32":
    _default_path = os.path.join(os.path.dirname(__file__), "..", "data", "blog_analyzer.db")
else:
    _default_path = "/data/blog_analyzer.db"
DB_PATH = os.environ.get("DATABASE_PATH", _default_path)


class KeywordPoolDB:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._init_table()

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_table(self):
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS naverad_keyword_pool (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    account_customer_id INTEGER NOT NULL,
                    keyword TEXT NOT NULL,
                    monthly_total INTEGER DEFAULT 0,
                    monthly_pc INTEGER DEFAULT 0,
                    monthly_mobile INTEGER DEFAULT 0,
                    comp_idx TEXT,
                    source TEXT DEFAULT 'keywordstool',
                    seed TEXT,
                    status TEXT DEFAULT 'pending',
                    discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    registered_at TIMESTAMP,
                    ad_group_id TEXT,
                    error_message TEXT,
                    UNIQUE(account_customer_id, keyword)
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_pool_status
                ON naverad_keyword_pool(account_customer_id, status, monthly_total DESC)
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_pool_user
                ON naverad_keyword_pool(user_id, status)
            """)

    def add_candidates(
        self,
        user_id: int,
        account_customer_id: int,
        items: List[Dict],
    ) -> int:
        """수집 워커가 호출 — pending 상태로 INSERT (중복은 무시)."""
        if not items:
            return 0
        added = 0
        with self._conn() as conn:
            cur = conn.cursor()
            for item in items:
                kw = (item.get("keyword") or "").strip()
                if not kw:
                    continue
                try:
                    cur.execute(
                        """INSERT OR IGNORE INTO naverad_keyword_pool
                           (user_id, account_customer_id, keyword, monthly_total,
                            monthly_pc, monthly_mobile, comp_idx, source, seed, status)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')""",
                        (
                            user_id,
                            account_customer_id,
                            kw,
                            int(item.get("monthly_total") or 0),
                            int(item.get("monthly_pc") or 0),
                            int(item.get("monthly_mobile") or 0),
                            item.get("comp_idx"),
                            item.get("source") or "keywordstool",
                            item.get("seed"),
                        ),
                    )
                    if cur.rowcount > 0:
                        added += 1
                except sqlite3.Error as e:
                    logger.warning(f"add_candidates row 실패 {kw}: {e}")
        return added

    def claim_pending(
        self,
        account_customer_id: int,
        limit: int = 1000,
        min_volume: int = 0,
    ) -> List[Dict]:
        """등록 워커가 호출 — pending 키워드를 가져옴 (검색량 내림차순).

        진짜 lock은 안 걸지만, 호출 직후 register/skip으로 status 갱신해야 함.
        """
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT id, keyword, monthly_total, monthly_pc, monthly_mobile, comp_idx
                   FROM naverad_keyword_pool
                   WHERE account_customer_id = ?
                     AND status = 'pending'
                     AND monthly_total >= ?
                   ORDER BY monthly_total DESC
                   LIMIT ?""",
                (account_customer_id, min_volume, limit),
            )
            return [dict(r) for r in cur.fetchall()]

    def mark_status(
        self,
        ids: List[int],
        status: str,
        ad_group_id: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> int:
        if not ids:
            return 0
        affected = 0
        with self._conn() as conn:
            cur = conn.cursor()
            for i in range(0, len(ids), 500):
                chunk = ids[i:i + 500]
                placeholders = ",".join("?" * len(chunk))
                if status == "registered":
                    cur.execute(
                        f"""UPDATE naverad_keyword_pool
                            SET status='registered', registered_at=CURRENT_TIMESTAMP,
                                ad_group_id=?, error_message=NULL
                            WHERE id IN ({placeholders})""",
                        [ad_group_id, *chunk],
                    )
                elif status == "failed":
                    cur.execute(
                        f"""UPDATE naverad_keyword_pool
                            SET status='failed', error_message=?
                            WHERE id IN ({placeholders})""",
                        [(error_message or "")[:500], *chunk],
                    )
                else:
                    cur.execute(
                        f"""UPDATE naverad_keyword_pool
                            SET status=?
                            WHERE id IN ({placeholders})""",
                        [status, *chunk],
                    )
                affected += cur.rowcount
        return affected

    def stats(self, account_customer_id: int) -> Dict:
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT status, COUNT(*) AS n FROM naverad_keyword_pool
                   WHERE account_customer_id = ?
                   GROUP BY status""",
                (account_customer_id,),
            )
            by_status = {row["status"]: row["n"] for row in cur.fetchall()}

            cur.execute(
                """SELECT
                     COUNT(*) AS total,
                     MIN(discovered_at) AS first_discovered,
                     MAX(discovered_at) AS last_discovered,
                     MAX(registered_at) AS last_registered
                   FROM naverad_keyword_pool
                   WHERE account_customer_id = ?""",
                (account_customer_id,),
            )
            meta = dict(cur.fetchone() or {})
            meta["by_status"] = by_status
            return meta

    def get_recent_seeds(self, account_customer_id: int, limit: int = 50) -> List[str]:
        """최근 사용된 seed 목록 (수집 워커가 다음 round 다양화에 사용)."""
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT DISTINCT seed FROM naverad_keyword_pool
                   WHERE account_customer_id = ? AND seed IS NOT NULL
                   ORDER BY discovered_at DESC LIMIT ?""",
                (account_customer_id, limit),
            )
            return [row["seed"] for row in cur.fetchall() if row["seed"]]


_singleton: Optional[KeywordPoolDB] = None


def get_keyword_pool_db() -> KeywordPoolDB:
    global _singleton
    if _singleton is None:
        _singleton = KeywordPoolDB()
    return _singleton
