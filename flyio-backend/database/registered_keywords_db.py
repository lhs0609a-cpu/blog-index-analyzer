"""
네이버 광고에 등록된 키워드 추적 DB.

목적:
  10만+ 키워드 자동 등록 시스템에서 같은 키워드를 두 번 등록하지 않도록 보호.
  네이버 API에 보내기 전 (account_customer_id, keyword) UNIQUE로 차집합 처리.

테이블:
  registered_keywords (
    id, user_id, account_customer_id, keyword,
    ad_group_id, campaign_id, bid_amt,
    registered_at, removed_at
  )
  - 등록 성공 시 INSERT
  - 네이버에서 수동 삭제 시 별도 sync job이 removed_at 채움 (현재 미구현)
"""
import os
import sqlite3
import sys
from contextlib import contextmanager
from datetime import datetime
from typing import Iterable, List, Set, Optional, Dict
import logging

logger = logging.getLogger(__name__)

if sys.platform == "win32":
    _default_path = os.path.join(os.path.dirname(__file__), "..", "data", "blog_analyzer.db")
else:
    _default_path = "/data/blog_analyzer.db"
DB_PATH = os.environ.get("DATABASE_PATH", _default_path)


class RegisteredKeywordsDB:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._ensure_db_exists()
        self._init_table()

    def _ensure_db_exists(self):
        d = os.path.dirname(self.db_path)
        if d and not os.path.exists(d):
            try:
                os.makedirs(d, exist_ok=True)
            except Exception as e:
                logger.warning(f"Could not create db directory: {e}")

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
                CREATE TABLE IF NOT EXISTS registered_keywords (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    account_customer_id INTEGER NOT NULL,
                    keyword TEXT NOT NULL,
                    ad_group_id TEXT,
                    campaign_id TEXT,
                    bid_amt INTEGER,
                    ncc_keyword_id TEXT,
                    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    removed_at TIMESTAMP,
                    UNIQUE(account_customer_id, keyword)
                )
            """)
            # 인덱스 — 차집합 조회용
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_regkw_account
                ON registered_keywords(account_customer_id)
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_regkw_user
                ON registered_keywords(user_id)
            """)

    def get_existing_set(self, account_customer_id: int, keywords: Iterable[str]) -> Set[str]:
        """주어진 키워드 중 이미 등록된 키워드만 set으로 반환.

        SQLite IN 절 한계(~999개)를 chunk로 처리.
        """
        kws = list(set(k.strip() for k in keywords if k and k.strip()))
        if not kws:
            return set()
        existing: Set[str] = set()
        chunk_size = 500
        with self._conn() as conn:
            cur = conn.cursor()
            for i in range(0, len(kws), chunk_size):
                chunk = kws[i:i + chunk_size]
                placeholders = ",".join("?" * len(chunk))
                cur.execute(
                    f"""SELECT keyword FROM registered_keywords
                        WHERE account_customer_id = ? AND removed_at IS NULL
                          AND keyword IN ({placeholders})""",
                    [account_customer_id, *chunk],
                )
                for row in cur.fetchall():
                    existing.add(row["keyword"])
        return existing

    def filter_new(self, account_customer_id: int, keywords: List[str]) -> List[str]:
        """차집합: 미등록 키워드만 반환. 등록 순서 보존."""
        existing = self.get_existing_set(account_customer_id, keywords)
        seen: Set[str] = set()
        out: List[str] = []
        for k in keywords:
            kk = (k or "").strip()
            if not kk or kk in existing or kk in seen:
                continue
            seen.add(kk)
            out.append(kk)
        return out

    def insert_batch(
        self,
        user_id: int,
        account_customer_id: int,
        rows: List[Dict],
    ) -> int:
        """
        rows: [{keyword, ad_group_id?, campaign_id?, bid_amt?, ncc_keyword_id?}, ...]
        return: 새로 INSERT된 건수.
        """
        if not rows:
            return 0
        inserted = 0
        with self._conn() as conn:
            cur = conn.cursor()
            for r in rows:
                kw = (r.get("keyword") or "").strip()
                if not kw:
                    continue
                try:
                    cur.execute(
                        """INSERT OR IGNORE INTO registered_keywords
                           (user_id, account_customer_id, keyword, ad_group_id,
                            campaign_id, bid_amt, ncc_keyword_id)
                           VALUES (?, ?, ?, ?, ?, ?, ?)""",
                        (
                            user_id,
                            account_customer_id,
                            kw,
                            r.get("ad_group_id"),
                            r.get("campaign_id"),
                            r.get("bid_amt"),
                            r.get("ncc_keyword_id"),
                        ),
                    )
                    if cur.rowcount > 0:
                        inserted += 1
                except sqlite3.Error as e:
                    logger.warning(f"insert_batch row 실패 {kw}: {e}")
        return inserted

    def stats(self, account_customer_id: int) -> Dict:
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT
                     COUNT(*) AS total,
                     SUM(CASE WHEN removed_at IS NULL THEN 1 ELSE 0 END) AS active,
                     COUNT(DISTINCT ad_group_id) AS ad_groups,
                     COUNT(DISTINCT campaign_id) AS campaigns,
                     MIN(registered_at) AS first_at,
                     MAX(registered_at) AS last_at
                   FROM registered_keywords
                   WHERE account_customer_id = ?""",
                (account_customer_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else {}

    def mark_removed(self, account_customer_id: int, keywords: Iterable[str]) -> int:
        """네이버에서 수동 삭제된 키워드를 sync — removed_at 채움.

        호출자: 별도 sync 워커 (현재 미구현).
        """
        kws = list(set(k.strip() for k in keywords if k and k.strip()))
        if not kws:
            return 0
        affected = 0
        with self._conn() as conn:
            cur = conn.cursor()
            for i in range(0, len(kws), 500):
                chunk = kws[i:i + 500]
                placeholders = ",".join("?" * len(chunk))
                cur.execute(
                    f"""UPDATE registered_keywords
                        SET removed_at = CURRENT_TIMESTAMP
                        WHERE account_customer_id = ?
                          AND removed_at IS NULL
                          AND keyword IN ({placeholders})""",
                    [account_customer_id, *chunk],
                )
                affected += cur.rowcount
        return affected


_singleton: Optional[RegisteredKeywordsDB] = None


def get_registered_keywords_db() -> RegisteredKeywordsDB:
    global _singleton
    if _singleton is None:
        _singleton = RegisteredKeywordsDB()
    return _singleton
