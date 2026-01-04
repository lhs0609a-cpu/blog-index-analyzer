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
    _default_path = "/app/data/blog_analyzer.db"
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
