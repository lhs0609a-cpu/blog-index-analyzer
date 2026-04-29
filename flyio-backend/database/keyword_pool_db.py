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
            cur.execute("""
                CREATE TABLE IF NOT EXISTS naverad_pool_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    account_customer_id INTEGER,
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    added INTEGER DEFAULT 0,
                    registered INTEGER DEFAULT 0,
                    failed INTEGER DEFAULT 0,
                    skipped INTEGER DEFAULT 0,
                    seeds_count INTEGER DEFAULT 0,
                    pending_after INTEGER,
                    error_message TEXT,
                    duration_ms INTEGER,
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_pool_runs_acct
                ON naverad_pool_runs(account_customer_id, started_at DESC)
            """)
            # 마이그레이션 — 기존 테이블에 skipped 컬럼 추가
            existing_cols = {r[1] for r in cur.execute("PRAGMA table_info(naverad_pool_runs)").fetchall()}
            if "skipped" not in existing_cols:
                cur.execute("ALTER TABLE naverad_pool_runs ADD COLUMN skipped INTEGER DEFAULT 0")
            # 풀 active 캠페인 상태 (캠페인 재사용 — 광고그룹 cap 도달 시 새 캠페인)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS naverad_pool_state (
                    account_customer_id INTEGER PRIMARY KEY,
                    campaign_id TEXT NOT NULL,
                    ad_groups_count INTEGER DEFAULT 0,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

    def record_run(
        self,
        user_id: Optional[int],
        account_customer_id: Optional[int],
        kind: str,
        status: str,
        added: int = 0,
        registered: int = 0,
        failed: int = 0,
        skipped: int = 0,
        seeds_count: int = 0,
        pending_after: Optional[int] = None,
        error_message: Optional[str] = None,
        duration_ms: Optional[int] = None,
    ) -> int:
        """워커 실행 1건 기록 — 화면 실시간 표시용."""
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """INSERT INTO naverad_pool_runs
                   (user_id, account_customer_id, kind, status,
                    added, registered, failed, skipped, seeds_count, pending_after,
                    error_message, duration_ms)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    user_id, account_customer_id, kind, status,
                    added, registered, failed, skipped, seeds_count, pending_after,
                    (error_message or "")[:500] if error_message else None,
                    duration_ms,
                ),
            )
            return cur.lastrowid

    def recent_runs(self, account_customer_id: int, limit: int = 20) -> List[Dict]:
        """최근 N개 실행 이력."""
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT id, kind, status, added, registered, failed,
                          COALESCE(skipped, 0) AS skipped,
                          seeds_count, pending_after, error_message,
                          duration_ms, started_at
                   FROM naverad_pool_runs
                   WHERE account_customer_id = ?
                   ORDER BY id DESC LIMIT ?""",
                (account_customer_id, limit),
            )
            return [dict(r) for r in cur.fetchall()]

    def detect_collect_deadlock(
        self,
        account_customer_id: int,
        n_recent: int = 5,
        min_rejected: int = 500,
    ) -> Dict:
        """최근 N회 collect 가 모두 added=0 + rejected≥min_rejected 면 데드락 판정.

        반환: {is_deadlock, consecutive_zero_runs, total_rejected, last_run_at}
        """
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT id, added, COALESCE(skipped, 0) AS skipped, started_at
                   FROM naverad_pool_runs
                   WHERE account_customer_id = ? AND kind = 'collect'
                   ORDER BY id DESC LIMIT ?""",
                (account_customer_id, n_recent),
            )
            rows = cur.fetchall()
            if len(rows) < n_recent:
                return {
                    "is_deadlock": False,
                    "consecutive_zero_runs": 0,
                    "total_rejected": 0,
                    "last_run_at": None,
                }
            consecutive_zero = 0
            total_rejected = 0
            for r in rows:
                if r["added"] == 0 and r["skipped"] >= min_rejected:
                    consecutive_zero += 1
                    total_rejected += r["skipped"]
                else:
                    break
            return {
                "is_deadlock": consecutive_zero >= n_recent,
                "consecutive_zero_runs": consecutive_zero,
                "total_rejected": total_rejected,
                "last_run_at": rows[0]["started_at"] if rows else None,
            }

    def seed_breakdown(self, account_customer_id: int) -> List[Dict]:
        """시드별 발굴 키워드 카운트 + 시드 origin source — 사용자가 풀 구성을 볼 수 있게."""
        with self._conn() as conn:
            cur = conn.cursor()
            # 시드 자기 자신 row의 source 매핑
            cur.execute(
                """SELECT keyword, source FROM naverad_keyword_pool
                   WHERE account_customer_id = ? AND seed = keyword""",
                (account_customer_id,),
            )
            source_map = {r["keyword"]: (r["source"] or "unknown") for r in cur.fetchall()}

            cur.execute(
                """SELECT
                     COALESCE(seed, '(시드없음)') AS seed,
                     COUNT(*) AS total,
                     SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
                     SUM(CASE WHEN status='registered' THEN 1 ELSE 0 END) AS registered,
                     SUM(CASE WHEN status='skipped_existing' THEN 1 ELSE 0 END) AS skipped_existing,
                     SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
                   FROM naverad_keyword_pool
                   WHERE account_customer_id = ?
                   GROUP BY COALESCE(seed, '(시드없음)')
                   ORDER BY total DESC""",
                (account_customer_id,),
            )
            rows = []
            for r in cur.fetchall():
                d = dict(r)
                d["source"] = source_map.get(d["seed"], "unknown")
                rows.append(d)
            return rows

    def recent_keywords(self, account_customer_id: int, limit: int = 30) -> List[Dict]:
        """최근 풀에 추가된 키워드 샘플 (검수용)."""
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT keyword, seed, monthly_total, status, discovered_at
                   FROM naverad_keyword_pool
                   WHERE account_customer_id = ?
                   ORDER BY id DESC LIMIT ?""",
                (account_customer_id, limit),
            )
            return [dict(r) for r in cur.fetchall()]

    def delete_seed_with_children(self, account_customer_id: int, seed: str) -> int:
        """시드와 그 시드로 발굴된 자식 키워드 모두 삭제 — 화면 X 버튼용."""
        if not seed:
            return 0
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """DELETE FROM naverad_keyword_pool
                   WHERE account_customer_id = ?
                     AND (keyword = ? OR seed = ?)""",
                (account_customer_id, seed, seed),
            )
            return cur.rowcount

    def delete_keywords(self, account_customer_id: int, keywords: List[str]) -> int:
        """특정 키워드들을 풀에서 일괄 삭제 — admin cleanup용."""
        if not keywords:
            return 0
        with self._conn() as conn:
            cur = conn.cursor()
            placeholders = ",".join("?" * len(keywords))
            cur.execute(
                f"""DELETE FROM naverad_keyword_pool
                    WHERE account_customer_id = ?
                      AND keyword IN ({placeholders})""",
                [account_customer_id, *keywords],
            )
            return cur.rowcount

    def list_user_seeds(self, account_customer_id: int) -> List[str]:
        """사용자가 의도적으로 추가한 시드 목록 — substring 필터 기준.

        시드 자체는 keyword == seed인 user_seed source로 INSERT됨.
        """
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT DISTINCT keyword FROM naverad_keyword_pool
                   WHERE account_customer_id = ? AND source = 'user_seed'""",
                (account_customer_id,),
            )
            return [r["keyword"] for r in cur.fetchall() if r["keyword"]]

    def list_seed_whitelist(self, account_customer_id: int) -> List[str]:
        """화이트리스트에 적용할 시드 — user_seed + auto_promoted_seed."""
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT DISTINCT keyword FROM naverad_keyword_pool
                   WHERE account_customer_id = ?
                     AND source IN ('user_seed', 'auto_promoted_seed')""",
                (account_customer_id,),
            )
            return [r["keyword"] for r in cur.fetchall() if r["keyword"]]

    def mark_rejected_by_naver(
        self,
        account_customer_id: int,
        items: List[Dict],
    ) -> int:
        """노출제한 키워드 풀에서 status='rejected_by_naver' mark + 사유 저장.
        items: [{'keyword': ..., 'reason': ...}]"""
        if not items:
            return 0
        with self._conn() as conn:
            cur = conn.cursor()
            n = 0
            for it in items:
                cur.execute(
                    """UPDATE naverad_keyword_pool
                       SET status = 'rejected_by_naver', error_message = ?
                       WHERE account_customer_id = ? AND keyword = ?""",
                    ((it.get("reason") or "")[:300], account_customer_id, it.get("keyword")),
                )
                n += cur.rowcount
            return n

    def get_active_pool_campaign(self, account_customer_id: int) -> Optional[Dict]:
        """현재 풀 active 캠페인 + 광고그룹 카운트."""
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT campaign_id, ad_groups_count
                   FROM naverad_pool_state
                   WHERE account_customer_id = ?""",
                (account_customer_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None

    def set_active_pool_campaign(
        self,
        account_customer_id: int,
        campaign_id: str,
        ad_groups_count: int,
    ) -> None:
        """현재 풀 active 캠페인 update or insert."""
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """INSERT INTO naverad_pool_state (account_customer_id, campaign_id, ad_groups_count, updated_at)
                   VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                   ON CONFLICT(account_customer_id) DO UPDATE SET
                     campaign_id = excluded.campaign_id,
                     ad_groups_count = excluded.ad_groups_count,
                     updated_at = CURRENT_TIMESTAMP""",
                (account_customer_id, campaign_id, ad_groups_count),
            )

    def increment_pool_ad_groups(self, account_customer_id: int, delta: int) -> None:
        """광고그룹 카운트 증가."""
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """UPDATE naverad_pool_state
                   SET ad_groups_count = ad_groups_count + ?, updated_at = CURRENT_TIMESTAMP
                   WHERE account_customer_id = ?""",
                (delta, account_customer_id),
            )

    def cleanup_childless_auto_seeds(
        self,
        account_customer_id: int,
        min_age_minutes: int = 30,
    ) -> int:
        """자동 승격된 시드 중 일정 시간 지나도 자식 0인 것 자력 삭제.
        user_seed는 사용자 의도라 면제."""
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT keyword FROM naverad_keyword_pool sk
                   WHERE account_customer_id = ?
                     AND seed = keyword
                     AND source = 'auto_promoted_seed'
                     AND datetime(discovered_at) < datetime('now', ?)
                     AND NOT EXISTS (
                         SELECT 1 FROM naverad_keyword_pool ck
                         WHERE ck.account_customer_id = sk.account_customer_id
                           AND ck.seed = sk.keyword
                           AND ck.keyword <> ck.seed
                     )""",
                (account_customer_id, f"-{min_age_minutes} minutes"),
            )
            keywords = [r["keyword"] for r in cur.fetchall()]
            if not keywords:
                return 0
            for kw in keywords:
                cur.execute(
                    """DELETE FROM naverad_keyword_pool
                       WHERE account_customer_id = ?
                         AND keyword = ?
                         AND source = 'auto_promoted_seed'""",
                    (account_customer_id, kw),
                )
            return len(keywords)

    def cleanup_offdomain(
        self,
        account_customer_id: int,
        domain_tokens: List[str],
    ) -> int:
        """도메인 토큰 미포함 row 자동 삭제 (registered 제외 — 이미 네이버 등록은 보존)."""
        if not domain_tokens:
            return 0
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT id, keyword FROM naverad_keyword_pool
                   WHERE account_customer_id = ?
                     AND status != 'registered'
                     AND source != 'user_seed'""",
                (account_customer_id,),
            )
            rows = cur.fetchall()
            offdomain_ids = [
                r["id"] for r in rows
                if not any(t in r["keyword"] for t in domain_tokens)
            ]
            if not offdomain_ids:
                return 0
            for i in range(0, len(offdomain_ids), 500):
                chunk = offdomain_ids[i:i + 500]
                placeholders = ",".join("?" * len(chunk))
                cur.execute(
                    f"DELETE FROM naverad_keyword_pool WHERE id IN ({placeholders})",
                    chunk,
                )
            return len(offdomain_ids)

    def promote_seeds(
        self,
        account_customer_id: int,
        limit: int = 5,
        min_volume: int = 1000,
        max_total_seeds: int = 50,
        domain_tokens: Optional[List[str]] = None,
    ) -> List[Dict]:
        """검색량 상위 + 등록 완료된 키워드 중 시드 아닌 것 N개 → 시드로 승격.

        반환: 승격된 키워드 목록 [{keyword, monthly_total}]
        """
        with self._conn() as conn:
            cur = conn.cursor()
            # 현재 시드(자기 자신을 seed로 가진 것) 카운트
            cur.execute(
                """SELECT COUNT(DISTINCT keyword) AS n FROM naverad_keyword_pool
                   WHERE account_customer_id = ? AND seed = keyword""",
                (account_customer_id,),
            )
            current_seed_count = cur.fetchone()["n"]
            available = max(0, max_total_seeds - current_seed_count)
            if available <= 0:
                return []
            target = min(limit, available)

            # 후보: registered, 월 검색량 큰 순, 시드 아님, 길이 >= 2
            cur.execute(
                """SELECT keyword, monthly_total
                   FROM naverad_keyword_pool
                   WHERE account_customer_id = ?
                     AND status = 'registered'
                     AND monthly_total >= ?
                     AND length(keyword) >= 2
                     AND keyword <> COALESCE(seed, '')
                   ORDER BY monthly_total DESC
                   LIMIT ?""",
                (account_customer_id, min_volume, target * 3),  # 여유 있게 fetch 후 슬라이스
            )
            cand_rows = cur.fetchall()

            # 시드 자기 자신과 너무 비슷한 후보 배제 (중복 의미장)
            cur.execute(
                """SELECT DISTINCT keyword FROM naverad_keyword_pool
                   WHERE account_customer_id = ? AND seed = keyword""",
                (account_customer_id,),
            )
            existing_seeds = {r["keyword"] for r in cur.fetchall()}

            promoted: List[Dict] = []
            for row in cand_rows:
                if len(promoted) >= target:
                    break
                kw = row["keyword"]
                if kw in existing_seeds:
                    continue
                # 도메인 토큰 검증 — ambiguous 키워드(은행 등)는 시드로 승격 안 함
                if domain_tokens and not any(t in kw for t in domain_tokens):
                    continue
                # 같은 의미장 중복 제외 — 기존 시드의 substring/superstring이면 가치 적음
                if any(s in kw or kw in s for s in existing_seeds if s and len(s) >= 2):
                    # 기존 시드와 substring 관계지만 다른 표현 — 추가 시드로 가치는 있음.
                    # 단, 정확히 같은 의미장 확장 — 진행은 하되 표시.
                    pass
                # UPDATE: 이 키워드의 seed를 자기 자신으로, source 자동 승격
                cur.execute(
                    """UPDATE naverad_keyword_pool
                       SET seed = keyword, source = 'auto_promoted_seed'
                       WHERE account_customer_id = ? AND keyword = ?""",
                    (account_customer_id, kw),
                )
                if cur.rowcount > 0:
                    promoted.append({"keyword": kw, "monthly_total": row["monthly_total"]})
                    existing_seeds.add(kw)
            return promoted

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
