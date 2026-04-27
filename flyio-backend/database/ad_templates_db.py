"""
광고 소재 템플릿 — 광고그룹 생성 시 라운드로빈 자동 매칭용.

테이블:
  ad_templates (
    id, user_id, account_customer_id,
    headline_pc, description_pc,
    headline_mobile, description_mobile,
    display_url, final_url_pc, final_url_mobile,
    is_active, used_count,
    created_at, last_used_at
  )

  ad_extension_templates (
    id, user_id, account_customer_id, kind,  -- PHONE / DESCRIPTION / SUBLINK 등
    payload_json, is_active
  )
"""
import os
import sqlite3
import sys
import json as _json
from contextlib import contextmanager
from typing import Iterable, List, Optional, Dict
import logging

logger = logging.getLogger(__name__)

if sys.platform == "win32":
    _default_path = os.path.join(os.path.dirname(__file__), "..", "data", "blog_analyzer.db")
else:
    _default_path = "/data/blog_analyzer.db"
DB_PATH = os.environ.get("DATABASE_PATH", _default_path)


class AdTemplatesDB:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._init_tables()

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

    def _init_tables(self):
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ad_templates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    account_customer_id INTEGER NOT NULL,
                    headline_pc TEXT NOT NULL,
                    description_pc TEXT NOT NULL,
                    headline_mobile TEXT,
                    description_mobile TEXT,
                    display_url TEXT NOT NULL,
                    final_url_pc TEXT NOT NULL,
                    final_url_mobile TEXT,
                    is_active INTEGER DEFAULT 1,
                    used_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_used_at TIMESTAMP
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_adtpl_user
                ON ad_templates(user_id, is_active)
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ad_extension_templates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    account_customer_id INTEGER NOT NULL,
                    kind TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    is_active INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

    # ─────────────────────────────────────
    # 일반 소재 (T&D)
    # ─────────────────────────────────────
    def list_templates(self, user_id: int, account_customer_id: int) -> List[Dict]:
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT * FROM ad_templates
                   WHERE user_id=? AND account_customer_id=?
                   ORDER BY id ASC""",
                (user_id, account_customer_id),
            )
            return [dict(r) for r in cur.fetchall()]

    def list_active(self, user_id: int, account_customer_id: int) -> List[Dict]:
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT * FROM ad_templates
                   WHERE user_id=? AND account_customer_id=? AND is_active=1
                   ORDER BY used_count ASC, id ASC""",
                (user_id, account_customer_id),
            )
            return [dict(r) for r in cur.fetchall()]

    def claim_round_robin(self, user_id: int, account_customer_id: int) -> Optional[Dict]:
        """라운드로빈: used_count 가장 작은 활성 템플릿을 반환하고 카운터 +1.

        반환 None = 활성 템플릿 없음 (소재 생성 skip).
        """
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT * FROM ad_templates
                   WHERE user_id=? AND account_customer_id=? AND is_active=1
                   ORDER BY used_count ASC, id ASC LIMIT 1""",
                (user_id, account_customer_id),
            )
            row = cur.fetchone()
            if not row:
                return None
            tpl = dict(row)
            cur.execute(
                """UPDATE ad_templates
                   SET used_count = used_count + 1, last_used_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (tpl["id"],),
            )
            return tpl

    def create_template(
        self,
        user_id: int,
        account_customer_id: int,
        *,
        headline_pc: str,
        description_pc: str,
        display_url: str,
        final_url_pc: str,
        headline_mobile: Optional[str] = None,
        description_mobile: Optional[str] = None,
        final_url_mobile: Optional[str] = None,
        is_active: bool = True,
    ) -> int:
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """INSERT INTO ad_templates
                   (user_id, account_customer_id, headline_pc, description_pc,
                    headline_mobile, description_mobile, display_url,
                    final_url_pc, final_url_mobile, is_active)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    user_id, account_customer_id,
                    headline_pc.strip(), description_pc.strip(),
                    (headline_mobile or headline_pc).strip(),
                    (description_mobile or description_pc).strip(),
                    display_url.strip(),
                    final_url_pc.strip(),
                    (final_url_mobile or final_url_pc).strip(),
                    1 if is_active else 0,
                ),
            )
            return cur.lastrowid

    def get_or_create_template(
        self,
        user_id: int,
        account_customer_id: int,
        *,
        headline_pc: str,
        description_pc: str,
        display_url: str,
        final_url_pc: str,
        headline_mobile: Optional[str] = None,
        description_mobile: Optional[str] = None,
        final_url_mobile: Optional[str] = None,
    ) -> Dict:
        """동일 콘텐츠(headline_pc/description_pc/display_url/final_url_pc) 4-tuple로 dedupe.
        존재 시 기존 row 반환. 없으면 생성 후 새 row 반환.
        반환 dict: {id, created: bool}
        """
        h = (headline_pc or "").strip()
        d = (description_pc or "").strip()
        du = (display_url or "").strip()
        fp = (final_url_pc or "").strip()
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT id FROM ad_templates
                   WHERE user_id=? AND account_customer_id=?
                     AND headline_pc=? AND description_pc=?
                     AND display_url=? AND final_url_pc=?
                   LIMIT 1""",
                (user_id, account_customer_id, h, d, du, fp),
            )
            row = cur.fetchone()
            if row:
                return {"id": row["id"], "created": False}
            cur.execute(
                """INSERT INTO ad_templates
                   (user_id, account_customer_id, headline_pc, description_pc,
                    headline_mobile, description_mobile, display_url,
                    final_url_pc, final_url_mobile, is_active)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)""",
                (
                    user_id, account_customer_id, h, d,
                    (headline_mobile or h).strip(),
                    (description_mobile or d).strip(),
                    du, fp,
                    (final_url_mobile or fp).strip(),
                ),
            )
            return {"id": cur.lastrowid, "created": True}

    def get_or_create_extension(
        self,
        user_id: int,
        account_customer_id: int,
        kind: str,
        payload: Dict,
    ) -> Dict:
        """kind + payload_json 정확 일치로 dedupe."""
        k = (kind or "").strip()
        # 정렬된 JSON으로 안정적 비교
        pj = _json.dumps(payload or {}, ensure_ascii=False, sort_keys=True)
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT id FROM ad_extension_templates
                   WHERE user_id=? AND account_customer_id=?
                     AND kind=? AND payload_json=?
                   LIMIT 1""",
                (user_id, account_customer_id, k, pj),
            )
            row = cur.fetchone()
            if row:
                return {"id": row["id"], "created": False}
            cur.execute(
                """INSERT INTO ad_extension_templates
                   (user_id, account_customer_id, kind, payload_json)
                   VALUES (?, ?, ?, ?)""",
                (user_id, account_customer_id, k, pj),
            )
            return {"id": cur.lastrowid, "created": True}

    def update_active(self, template_id: int, is_active: bool) -> int:
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "UPDATE ad_templates SET is_active=? WHERE id=?",
                (1 if is_active else 0, template_id),
            )
            return cur.rowcount

    def delete_template(self, template_id: int, user_id: int) -> int:
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "DELETE FROM ad_templates WHERE id=? AND user_id=?",
                (template_id, user_id),
            )
            return cur.rowcount

    # ─────────────────────────────────────
    # 확장소재
    # ─────────────────────────────────────
    def list_extensions(self, user_id: int, account_customer_id: int, active_only: bool = True) -> List[Dict]:
        with self._conn() as conn:
            cur = conn.cursor()
            if active_only:
                cur.execute(
                    """SELECT * FROM ad_extension_templates
                       WHERE user_id=? AND account_customer_id=? AND is_active=1
                       ORDER BY id ASC""",
                    (user_id, account_customer_id),
                )
            else:
                cur.execute(
                    """SELECT * FROM ad_extension_templates
                       WHERE user_id=? AND account_customer_id=?
                       ORDER BY id ASC""",
                    (user_id, account_customer_id),
                )
            rows = [dict(r) for r in cur.fetchall()]
            for r in rows:
                try:
                    r["payload"] = _json.loads(r.get("payload_json") or "{}")
                except Exception:
                    r["payload"] = {}
            return rows

    def create_extension(
        self,
        user_id: int,
        account_customer_id: int,
        kind: str,
        payload: Dict,
    ) -> int:
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """INSERT INTO ad_extension_templates
                   (user_id, account_customer_id, kind, payload_json)
                   VALUES (?, ?, ?, ?)""",
                (user_id, account_customer_id, kind.strip(), _json.dumps(payload, ensure_ascii=False)),
            )
            return cur.lastrowid

    def delete_extension(self, ext_id: int, user_id: int) -> int:
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "DELETE FROM ad_extension_templates WHERE id=? AND user_id=?",
                (ext_id, user_id),
            )
            return cur.rowcount


_singleton: Optional[AdTemplatesDB] = None


def get_ad_templates_db() -> AdTemplatesDB:
    global _singleton
    if _singleton is None:
        _singleton = AdTemplatesDB()
    return _singleton
