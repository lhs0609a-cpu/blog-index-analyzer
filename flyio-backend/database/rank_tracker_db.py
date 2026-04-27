"""
블로그 순위 추적 데이터베이스
- 사용자별 추적 블로그 관리
- 포스팅별 키워드 및 순위 히스토리
"""
import sqlite3
import os
from datetime import datetime, date, timedelta
from typing import Optional, Dict, List, Any
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)

# 데이터베이스 경로
# Windows 로컬 개발환경에서는 ./data 사용
import sys
if sys.platform == "win32":
    _default_path = os.path.join(os.path.dirname(__file__), "..", "data", "blog_analyzer.db")
else:
    _default_path = "/data/blog_analyzer.db"
DB_PATH = os.environ.get("DATABASE_PATH", _default_path)


class RankTrackerDB:
    """블로그 순위 추적 데이터베이스 클라이언트"""

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._ensure_db_exists()
        self._init_tables()

    def _ensure_db_exists(self):
        """데이터베이스 디렉토리 생성"""
        db_dir = os.path.dirname(self.db_path)
        if db_dir and not os.path.exists(db_dir):
            try:
                os.makedirs(db_dir, exist_ok=True)
            except Exception as e:
                logger.warning(f"Could not create db directory: {e}")

    @contextmanager
    def get_connection(self):
        """데이터베이스 연결 컨텍스트 매니저"""
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
        """테이블 초기화"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # 1. 추적 블로그 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS tracked_blogs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    blog_id TEXT NOT NULL,
                    blog_name TEXT,
                    is_active INTEGER DEFAULT 1,
                    last_checked_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, blog_id)
                )
            """)

            # 2. 추적 포스팅 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS tracked_posts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tracked_blog_id INTEGER NOT NULL,
                    post_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    url TEXT NOT NULL,
                    published_date DATE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (tracked_blog_id) REFERENCES tracked_blogs(id) ON DELETE CASCADE,
                    UNIQUE(tracked_blog_id, post_id)
                )
            """)

            # 3. 포스팅 키워드 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS post_keywords (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tracked_post_id INTEGER NOT NULL,
                    keyword TEXT NOT NULL,
                    priority INTEGER DEFAULT 1,
                    is_manual INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (tracked_post_id) REFERENCES tracked_posts(id) ON DELETE CASCADE
                )
            """)

            # 4. 순위 히스토리 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS rank_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    post_keyword_id INTEGER NOT NULL,
                    rank_blog_tab INTEGER,
                    rank_view_tab INTEGER,
                    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (post_keyword_id) REFERENCES post_keywords(id) ON DELETE CASCADE
                )
            """)

            # 5. 순위 확인 작업 테이블 (진행 상태 추적)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS rank_check_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT UNIQUE NOT NULL,
                    user_id INTEGER NOT NULL,
                    tracked_blog_id INTEGER NOT NULL,
                    status TEXT DEFAULT 'pending',
                    progress REAL DEFAULT 0.0,
                    total_keywords INTEGER DEFAULT 0,
                    completed_keywords INTEGER DEFAULT 0,
                    current_keyword TEXT,
                    error_message TEXT,
                    started_at TIMESTAMP,
                    completed_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (tracked_blog_id) REFERENCES tracked_blogs(id) ON DELETE CASCADE
                )
            """)

            # 인덱스 생성
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_tracked_blogs_user_id ON tracked_blogs(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_tracked_posts_blog_id ON tracked_posts(tracked_blog_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_post_keywords_post_id ON post_keywords(tracked_post_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_rank_history_keyword_id ON rank_history(post_keyword_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_rank_history_checked_at ON rank_history(checked_at)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_rank_check_tasks_task_id ON rank_check_tasks(task_id)")

            logger.info("Rank tracker tables initialized")

    # ============ 추적 블로그 관리 ============

    def add_tracked_blog(self, user_id: int, blog_id: str, blog_name: str = None) -> Dict:
        """추적 블로그 추가"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            try:
                cursor.execute("""
                    INSERT INTO tracked_blogs (user_id, blog_id, blog_name)
                    VALUES (?, ?, ?)
                """, (user_id, blog_id, blog_name))

                return {
                    "id": cursor.lastrowid,
                    "user_id": user_id,
                    "blog_id": blog_id,
                    "blog_name": blog_name,
                    "is_active": True
                }
            except sqlite3.IntegrityError:
                # 이미 존재하는 경우 기존 데이터 반환
                cursor.execute("""
                    SELECT * FROM tracked_blogs WHERE user_id = ? AND blog_id = ?
                """, (user_id, blog_id))
                row = cursor.fetchone()
                if row:
                    return dict(row)
                raise

    def get_tracked_blogs(self, user_id: int, active_only: bool = True) -> List[Dict]:
        """사용자의 추적 블로그 목록 조회"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            if active_only:
                cursor.execute("""
                    SELECT * FROM tracked_blogs
                    WHERE user_id = ? AND is_active = 1
                    ORDER BY created_at DESC
                """, (user_id,))
            else:
                cursor.execute("""
                    SELECT * FROM tracked_blogs
                    WHERE user_id = ?
                    ORDER BY created_at DESC
                """, (user_id,))

            return [dict(row) for row in cursor.fetchall()]

    def get_tracked_blog(self, user_id: int, blog_id: str) -> Optional[Dict]:
        """특정 추적 블로그 조회"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM tracked_blogs
                WHERE user_id = ? AND blog_id = ?
            """, (user_id, blog_id))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_tracked_blog_by_id(self, tracked_blog_id: int) -> Optional[Dict]:
        """ID로 추적 블로그 조회"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM tracked_blogs WHERE id = ?", (tracked_blog_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def update_tracked_blog(self, tracked_blog_id: int, **kwargs) -> bool:
        """추적 블로그 정보 업데이트"""
        allowed_fields = ['blog_name', 'is_active', 'last_checked_at']
        updates = {k: v for k, v in kwargs.items() if k in allowed_fields}

        if not updates:
            return False

        with self.get_connection() as conn:
            cursor = conn.cursor()

            set_clause = ", ".join([f"{k} = ?" for k in updates.keys()])
            values = list(updates.values()) + [tracked_blog_id]

            cursor.execute(f"""
                UPDATE tracked_blogs
                SET {set_clause}, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, values)

            return cursor.rowcount > 0

    def delete_tracked_blog(self, user_id: int, blog_id: str) -> bool:
        """추적 블로그 삭제 (CASCADE로 관련 데이터 모두 삭제)"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                DELETE FROM tracked_blogs WHERE user_id = ? AND blog_id = ?
            """, (user_id, blog_id))
            return cursor.rowcount > 0

    def count_tracked_blogs(self, user_id: int) -> int:
        """사용자의 활성 추적 블로그 수"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT COUNT(*) FROM tracked_blogs
                WHERE user_id = ? AND is_active = 1
            """, (user_id,))
            return cursor.fetchone()[0]

    # ============ 포스팅 관리 ============

    def add_tracked_post(self, tracked_blog_id: int, post_id: str, title: str,
                        url: str, published_date: str = None) -> Dict:
        """추적 포스팅 추가"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            try:
                cursor.execute("""
                    INSERT INTO tracked_posts (tracked_blog_id, post_id, title, url, published_date)
                    VALUES (?, ?, ?, ?, ?)
                """, (tracked_blog_id, post_id, title, url, published_date))

                return {
                    "id": cursor.lastrowid,
                    "tracked_blog_id": tracked_blog_id,
                    "post_id": post_id,
                    "title": title,
                    "url": url,
                    "published_date": published_date
                }
            except sqlite3.IntegrityError:
                # 이미 존재하면 업데이트
                cursor.execute("""
                    UPDATE tracked_posts
                    SET title = ?, url = ?, published_date = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE tracked_blog_id = ? AND post_id = ?
                """, (title, url, published_date, tracked_blog_id, post_id))

                cursor.execute("""
                    SELECT * FROM tracked_posts WHERE tracked_blog_id = ? AND post_id = ?
                """, (tracked_blog_id, post_id))
                return dict(cursor.fetchone())

    def get_tracked_posts(self, tracked_blog_id: int, limit: int = 50) -> List[Dict]:
        """블로그의 추적 포스팅 목록"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM tracked_posts
                WHERE tracked_blog_id = ?
                ORDER BY published_date DESC, created_at DESC
                LIMIT ?
            """, (tracked_blog_id, limit))
            return [dict(row) for row in cursor.fetchall()]

    def get_tracked_post_by_id(self, post_id: int) -> Optional[Dict]:
        """ID로 추적 포스팅 조회"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM tracked_posts WHERE id = ?", (post_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    # ============ 키워드 관리 ============

    def add_post_keyword(self, tracked_post_id: int, keyword: str,
                        priority: int = 1, is_manual: bool = False) -> Dict:
        """포스팅 키워드 추가"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO post_keywords (tracked_post_id, keyword, priority, is_manual)
                VALUES (?, ?, ?, ?)
            """, (tracked_post_id, keyword, priority, 1 if is_manual else 0))

            return {
                "id": cursor.lastrowid,
                "tracked_post_id": tracked_post_id,
                "keyword": keyword,
                "priority": priority,
                "is_manual": is_manual
            }

    def get_post_keywords(self, tracked_post_id: int) -> List[Dict]:
        """포스팅의 키워드 목록"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM post_keywords
                WHERE tracked_post_id = ?
                ORDER BY priority ASC, created_at ASC
            """, (tracked_post_id,))
            return [dict(row) for row in cursor.fetchall()]

    def get_all_keywords_for_blog(self, tracked_blog_id: int) -> List[Dict]:
        """블로그의 모든 키워드 조회 (포스팅 정보 포함)"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT
                    pk.id as keyword_id,
                    pk.keyword,
                    pk.priority,
                    pk.is_manual,
                    tp.id as post_id,
                    tp.title as post_title,
                    tp.url as post_url,
                    tp.published_date
                FROM post_keywords pk
                JOIN tracked_posts tp ON pk.tracked_post_id = tp.id
                WHERE tp.tracked_blog_id = ?
                ORDER BY tp.published_date DESC, pk.priority ASC
            """, (tracked_blog_id,))
            return [dict(row) for row in cursor.fetchall()]

    def delete_post_keywords(self, tracked_post_id: int):
        """포스팅의 모든 키워드 삭제"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM post_keywords WHERE tracked_post_id = ?", (tracked_post_id,))

    # ============ 순위 히스토리 ============

    def add_rank_history(self, post_keyword_id: int, rank_blog_tab: int = None,
                        rank_view_tab: int = None) -> Dict:
        """순위 히스토리 추가"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO rank_history (post_keyword_id, rank_blog_tab, rank_view_tab)
                VALUES (?, ?, ?)
            """, (post_keyword_id, rank_blog_tab, rank_view_tab))

            return {
                "id": cursor.lastrowid,
                "post_keyword_id": post_keyword_id,
                "rank_blog_tab": rank_blog_tab,
                "rank_view_tab": rank_view_tab
            }

    def get_latest_ranks(self, tracked_blog_id: int) -> List[Dict]:
        """블로그의 최신 순위 조회"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT
                    pk.id as keyword_id,
                    pk.keyword,
                    tp.title as post_title,
                    tp.url as post_url,
                    rh.rank_blog_tab,
                    rh.rank_view_tab,
                    rh.checked_at
                FROM post_keywords pk
                JOIN tracked_posts tp ON pk.tracked_post_id = tp.id
                LEFT JOIN (
                    SELECT post_keyword_id, rank_blog_tab, rank_view_tab, checked_at,
                           ROW_NUMBER() OVER (PARTITION BY post_keyword_id ORDER BY checked_at DESC) as rn
                    FROM rank_history
                ) rh ON pk.id = rh.post_keyword_id AND rh.rn = 1
                WHERE tp.tracked_blog_id = ?
                ORDER BY tp.published_date DESC, pk.priority ASC
            """, (tracked_blog_id,))
            return [dict(row) for row in cursor.fetchall()]

    def get_rank_history(self, tracked_blog_id: int, days: int = 30) -> List[Dict]:
        """블로그의 순위 히스토리 (일별 통계)"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

            cursor.execute("""
                SELECT
                    DATE(rh.checked_at) as check_date,
                    COUNT(DISTINCT pk.id) as total_keywords,
                    SUM(CASE WHEN rh.rank_blog_tab IS NOT NULL THEN 1 ELSE 0 END) as blog_exposed,
                    SUM(CASE WHEN rh.rank_view_tab IS NOT NULL THEN 1 ELSE 0 END) as view_exposed,
                    AVG(rh.rank_blog_tab) as avg_blog_rank,
                    AVG(rh.rank_view_tab) as avg_view_rank,
                    MIN(rh.rank_blog_tab) as best_blog_rank,
                    MIN(rh.rank_view_tab) as best_view_rank
                FROM rank_history rh
                JOIN post_keywords pk ON rh.post_keyword_id = pk.id
                JOIN tracked_posts tp ON pk.tracked_post_id = tp.id
                WHERE tp.tracked_blog_id = ?
                  AND DATE(rh.checked_at) >= ?
                GROUP BY DATE(rh.checked_at)
                ORDER BY check_date DESC
            """, (tracked_blog_id, start_date))

            return [dict(row) for row in cursor.fetchall()]

    def get_statistics(self, tracked_blog_id: int) -> Dict:
        """블로그 순위 통계 계산"""
        ranks = self.get_latest_ranks(tracked_blog_id)

        if not ranks:
            return {
                "total_keywords": 0,
                "blog_tab": self._empty_stats(),
                "view_tab": self._empty_stats()
            }

        total = len(ranks)

        # 블로그탭 통계
        blog_ranks = [r['rank_blog_tab'] for r in ranks if r['rank_blog_tab'] is not None]
        blog_stats = self._calculate_stats(blog_ranks, total)

        # VIEW탭 통계
        view_ranks = [r['rank_view_tab'] for r in ranks if r['rank_view_tab'] is not None]
        view_stats = self._calculate_stats(view_ranks, total)

        return {
            "total_keywords": total,
            "blog_tab": blog_stats,
            "view_tab": view_stats
        }

    def _calculate_stats(self, ranks: List[int], total: int) -> Dict:
        """순위 통계 계산"""
        if not ranks:
            return self._empty_stats()

        exposed = len(ranks)
        top3 = len([r for r in ranks if 1 <= r <= 3])
        mid = len([r for r in ranks if 4 <= r <= 7])
        low = len([r for r in ranks if 8 <= r <= 10])

        return {
            "exposed_count": exposed,
            "exposure_rate": round(exposed / total * 100, 1) if total > 0 else 0,
            "avg_rank": round(sum(ranks) / len(ranks), 1),
            "best_rank": min(ranks),
            "worst_rank": max(ranks),
            "top3_count": top3,
            "mid_count": mid,
            "low_count": low
        }

    def _empty_stats(self) -> Dict:
        """빈 통계"""
        return {
            "exposed_count": 0,
            "exposure_rate": 0,
            "avg_rank": 0,
            "best_rank": 0,
            "worst_rank": 0,
            "top3_count": 0,
            "mid_count": 0,
            "low_count": 0
        }

    # ============ B-2 검증 결과 활용: 노출 유지일수 + 인덱싱 속도 ============
    # 단일 시점 SERP 순위는 noisy(B 검증 ρ≈0.04). 시계열 기반 robust 메트릭으로 전환.

    def get_post_lifecycle(self, post_keyword_id: int) -> Dict:
        """
        포스트-키워드 페어의 SERP lifecycle 분석.

        핵심 메트릭 — B 검증에서 '단일 시점 순위는 noisy하다'는 발견 후 도입:
        - first_indexed_at: 첫 SERP 등장 시점 (둘 중 어느 탭이든 양수 순위)
        - indexing_delay_days: 발행일 → 첫 SERP 등장까지 일수 (인덱싱 속도)
        - total_exposure_days: 누적 노출 일수 (양수 순위 기록된 고유 날짜 수)
        - max_consecutive_exposure_days: 최대 연속 노출 일수
        - drop_count: 노출 → 누락 전환 횟수
        - avg_blog_rank, avg_view_rank: 노출됐을 때만 평균 순위
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # 발행일 + 모든 rank 측정 시점·순위 조회
            cursor.execute("""
                SELECT
                    tp.published_date,
                    DATE(rh.checked_at) as check_date,
                    rh.rank_blog_tab,
                    rh.rank_view_tab
                FROM rank_history rh
                JOIN post_keywords pk ON rh.post_keyword_id = pk.id
                JOIN tracked_posts tp ON pk.tracked_post_id = tp.id
                WHERE pk.id = ?
                ORDER BY rh.checked_at ASC
            """, (post_keyword_id,))
            rows = [dict(r) for r in cursor.fetchall()]

        if not rows:
            return {
                "samples": 0,
                "first_indexed_at": None,
                "last_indexed_at": None,
                "indexing_delay_days": None,
                "total_exposure_days": 0,
                "max_consecutive_exposure_days": 0,
                "drop_count": 0,
                "avg_blog_rank": None,
                "avg_view_rank": None,
            }

        published_date = rows[0].get("published_date")

        # 일자별 노출 여부 집계 (한 날짜에 여러 측정 있을 수 있음)
        from collections import OrderedDict
        per_day: "OrderedDict[str, bool]" = OrderedDict()
        for r in rows:
            d = r["check_date"]
            exposed = (
                (r["rank_blog_tab"] is not None and r["rank_blog_tab"] > 0)
                or (r["rank_view_tab"] is not None and r["rank_view_tab"] > 0)
            )
            per_day[d] = per_day.get(d, False) or exposed

        # 첫/마지막 노출일
        exposure_days = [d for d, v in per_day.items() if v]
        first_indexed = exposure_days[0] if exposure_days else None
        last_indexed = exposure_days[-1] if exposure_days else None

        # 인덱싱 지연 — 발행일이 있어야 계산 가능
        indexing_delay = None
        if published_date and first_indexed:
            try:
                p = datetime.strptime(str(published_date)[:10], "%Y-%m-%d").date()
                f = datetime.strptime(first_indexed, "%Y-%m-%d").date()
                indexing_delay = (f - p).days
            except Exception:
                pass

        # 최대 연속 노출 일수 — per_day 시계열 따라
        max_consec = 0
        cur_consec = 0
        prev_date = None
        for d, exposed in per_day.items():
            if exposed:
                cur_date = datetime.strptime(d, "%Y-%m-%d").date()
                if prev_date and (cur_date - prev_date).days == 1:
                    cur_consec += 1
                else:
                    cur_consec = 1
                prev_date = cur_date
                if cur_consec > max_consec:
                    max_consec = cur_consec
            else:
                cur_consec = 0
                prev_date = None

        # 노출 → 누락 전환 횟수 (drop count)
        drop_count = 0
        was_exposed = False
        for exposed in per_day.values():
            if was_exposed and not exposed:
                drop_count += 1
            was_exposed = exposed

        # 노출됐을 때만의 평균 순위
        blog_ranks = [r["rank_blog_tab"] for r in rows if r.get("rank_blog_tab")]
        view_ranks = [r["rank_view_tab"] for r in rows if r.get("rank_view_tab")]
        avg_blog = round(sum(blog_ranks) / len(blog_ranks), 1) if blog_ranks else None
        avg_view = round(sum(view_ranks) / len(view_ranks), 1) if view_ranks else None

        return {
            "samples": len(rows),
            "tracked_days": len(per_day),
            "first_indexed_at": first_indexed,
            "last_indexed_at": last_indexed,
            "indexing_delay_days": indexing_delay,
            "total_exposure_days": len(exposure_days),
            "exposure_rate": round(len(exposure_days) / len(per_day), 3) if per_day else 0,
            "max_consecutive_exposure_days": max_consec,
            "drop_count": drop_count,
            "avg_blog_rank": avg_blog,
            "avg_view_rank": avg_view,
        }

    def detect_lifecycle_alerts(self, tracked_blog_id: int) -> List[Dict]:
        """
        시계열 lifecycle 이상 감지 → 알림 후보 반환.

        임계값 (검증 결과 기반 보수적):
        - 미노출률 ≥ 50% (high)        : 저품질/색인 누락 의심
        - 평균 인덱싱 지연 ≥ 7일 (medium): 색인 문제
        - 평균 누락 전환 ≥ 3회 (low)    : 노출 불안정

        반환: [{severity, code, title, message, data}, ...]
        """
        stats = self.get_blog_indexing_stats(tracked_blog_id)
        alerts: List[Dict] = []

        if stats["total_tracked_keywords"] == 0:
            return alerts

        # 1) 미노출률 — 등록 키워드 중 한 번도 SERP 노출 안 됨
        never = stats["never_indexed_rate"]
        if never >= 0.5:
            alerts.append({
                "severity": "high",
                "code": "high_never_indexed",
                "title": "미노출 비율 50% 이상",
                "message": (
                    f"등록한 키워드의 {int(never*100)}%가 한 번도 SERP에 노출되지 않았습니다. "
                    "저품질 또는 색인 누락이 의심됩니다."
                ),
                "data": {"never_indexed_rate": never},
            })

        # 2) 평균 인덱싱 지연
        delay = stats["avg_indexing_delay_days"]
        if delay is not None and delay >= 7:
            alerts.append({
                "severity": "medium",
                "code": "slow_indexing",
                "title": f"평균 인덱싱 지연 {delay:.0f}일",
                "message": (
                    f"발행 후 SERP에 등장하기까지 평균 {delay:.0f}일이 걸립니다. "
                    "글 구조·키워드 매칭을 점검하세요."
                ),
                "data": {"avg_indexing_delay_days": delay},
            })

        # 3) 누락 전환 — 노출 → 누락 빈도
        drops = stats["avg_drop_count"]
        if drops >= 3:
            alerts.append({
                "severity": "low",
                "code": "unstable_exposure",
                "title": "노출이 자주 빠짐",
                "message": (
                    f"포스트가 평균 {drops}회 노출됐다가 다시 빠지고 있습니다. "
                    "콘텐츠 품질 개선이 필요합니다."
                ),
                "data": {"avg_drop_count": drops},
            })

        return alerts

    def get_blog_indexing_stats(self, tracked_blog_id: int) -> Dict:
        """
        블로그 전체의 인덱싱 통계.

        - 등록된 포스트들의 평균 인덱싱 지연
        - SERP 누락율 (등록했지만 한 번도 노출 안 된 키워드 비율)
        - 노출 유지율 분포 (지난 30일 기준 노출/총측정일)
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()

            cursor.execute("""
                SELECT pk.id as pk_id
                FROM post_keywords pk
                JOIN tracked_posts tp ON pk.tracked_post_id = tp.id
                WHERE tp.tracked_blog_id = ?
            """, (tracked_blog_id,))
            keyword_ids = [row["pk_id"] for row in cursor.fetchall()]

        if not keyword_ids:
            return {
                "total_tracked_keywords": 0,
                "ever_indexed_count": 0,
                "never_indexed_rate": 0,
                "avg_indexing_delay_days": None,
                "avg_exposure_rate": None,
                "avg_drop_count": None,
            }

        delays = []
        rates = []
        drops = []
        ever_indexed = 0
        for pk_id in keyword_ids:
            life = self.get_post_lifecycle(pk_id)
            if life["first_indexed_at"]:
                ever_indexed += 1
            if life["indexing_delay_days"] is not None:
                delays.append(life["indexing_delay_days"])
            if life["tracked_days"] > 0:
                rates.append(life["exposure_rate"])
            drops.append(life["drop_count"])

        return {
            "total_tracked_keywords": len(keyword_ids),
            "ever_indexed_count": ever_indexed,
            "never_indexed_rate": round(1 - ever_indexed / len(keyword_ids), 3),
            "avg_indexing_delay_days": round(sum(delays) / len(delays), 1) if delays else None,
            "avg_exposure_rate": round(sum(rates) / len(rates), 3) if rates else None,
            "avg_drop_count": round(sum(drops) / len(drops), 2) if drops else 0,
        }

    # ============ 작업 상태 관리 ============

    def create_check_task(self, task_id: str, user_id: int, tracked_blog_id: int,
                         total_keywords: int = 0) -> Dict:
        """순위 확인 작업 생성"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO rank_check_tasks
                (task_id, user_id, tracked_blog_id, status, total_keywords, started_at)
                VALUES (?, ?, ?, 'running', ?, CURRENT_TIMESTAMP)
            """, (task_id, user_id, tracked_blog_id, total_keywords))

            return {
                "task_id": task_id,
                "user_id": user_id,
                "tracked_blog_id": tracked_blog_id,
                "status": "running",
                "total_keywords": total_keywords
            }

    def update_task_progress(self, task_id: str, completed: int, current_keyword: str = None):
        """작업 진행 상태 업데이트"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            cursor.execute("SELECT total_keywords FROM rank_check_tasks WHERE task_id = ?", (task_id,))
            row = cursor.fetchone()
            total = row[0] if row else 1

            progress = completed / total if total > 0 else 0

            cursor.execute("""
                UPDATE rank_check_tasks
                SET progress = ?, completed_keywords = ?, current_keyword = ?
                WHERE task_id = ?
            """, (progress, completed, current_keyword, task_id))

    def complete_task(self, task_id: str, error_message: str = None):
        """작업 완료 처리"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            status = "error" if error_message else "completed"
            cursor.execute("""
                UPDATE rank_check_tasks
                SET status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP, progress = 1.0
                WHERE task_id = ?
            """, (status, error_message, task_id))

    def get_task_status(self, task_id: str) -> Optional[Dict]:
        """작업 상태 조회"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM rank_check_tasks WHERE task_id = ?", (task_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_user_running_task(self, user_id: int) -> Optional[Dict]:
        """사용자의 실행 중인 작업 조회"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM rank_check_tasks
                WHERE user_id = ? AND status = 'running'
                ORDER BY created_at DESC
                LIMIT 1
            """, (user_id,))
            row = cursor.fetchone()
            return dict(row) if row else None


# Singleton instance
_rank_tracker_db: Optional[RankTrackerDB] = None


def get_rank_tracker_db() -> RankTrackerDB:
    """RankTrackerDB 싱글톤 인스턴스"""
    global _rank_tracker_db
    if _rank_tracker_db is None:
        _rank_tracker_db = RankTrackerDB()
    return _rank_tracker_db
