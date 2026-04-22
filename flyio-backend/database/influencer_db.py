"""
인플루언서 발굴 데이터베이스
- 검색 캐시, 프로필 캐시, 게시물 캐시, 즐겨찾기
"""
import sqlite3
import os
import sys
import json
import uuid
import hashlib
import logging
from typing import List, Dict, Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

if sys.platform == "win32":
    _default_path = os.path.join(os.path.dirname(__file__), "..", "data", "influencer.db")
else:
    _default_path = "/data/influencer.db"

INFLUENCER_DB_PATH = os.environ.get("INFLUENCER_DB_PATH", _default_path)


class InfluencerDB:
    """인플루언서 발굴 데이터베이스"""

    def __init__(self, db_path: str = INFLUENCER_DB_PATH):
        self.db_path = db_path
        self._ensure_db_exists()
        self._init_tables()

    def _ensure_db_exists(self):
        db_dir = os.path.dirname(self.db_path)
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init_tables(self):
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # 검색 캐시
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS influencer_searches (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    query TEXT NOT NULL,
                    filters_json TEXT DEFAULT '{}',
                    platforms_json TEXT DEFAULT '[]',
                    results_count INTEGER DEFAULT 0,
                    cache_key TEXT,
                    created_at TEXT DEFAULT (datetime('now')),
                    expires_at TEXT
                )
            """)

            # 인플루언서 프로필 캐시
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS influencer_profiles (
                    id TEXT PRIMARY KEY,
                    platform TEXT NOT NULL,
                    platform_user_id TEXT,
                    username TEXT NOT NULL,
                    display_name TEXT DEFAULT '',
                    bio TEXT DEFAULT '',
                    profile_image_url TEXT DEFAULT '',
                    follower_count INTEGER DEFAULT 0,
                    following_count INTEGER DEFAULT 0,
                    post_count INTEGER DEFAULT 0,
                    avg_engagement_rate REAL DEFAULT 0.0,
                    avg_likes REAL DEFAULT 0.0,
                    avg_comments REAL DEFAULT 0.0,
                    avg_views REAL DEFAULT 0.0,
                    category TEXT DEFAULT '',
                    language TEXT DEFAULT '',
                    region TEXT DEFAULT '',
                    profile_url TEXT DEFAULT '',
                    verified INTEGER DEFAULT 0,
                    last_updated_at TEXT DEFAULT (datetime('now')),
                    created_at TEXT DEFAULT (datetime('now')),
                    UNIQUE(platform, username)
                )
            """)

            # 최근 게시물 캐시
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS influencer_posts (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    platform_post_id TEXT DEFAULT '',
                    content_type TEXT DEFAULT 'text',
                    content_text TEXT DEFAULT '',
                    thumbnail_url TEXT DEFAULT '',
                    post_url TEXT DEFAULT '',
                    like_count INTEGER DEFAULT 0,
                    comment_count INTEGER DEFAULT 0,
                    share_count INTEGER DEFAULT 0,
                    view_count INTEGER DEFAULT 0,
                    published_at TEXT DEFAULT '',
                    collected_at TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (profile_id) REFERENCES influencer_profiles(id)
                )
            """)

            # 검색-프로필 다대다
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS influencer_search_results (
                    id TEXT PRIMARY KEY,
                    search_id TEXT NOT NULL,
                    profile_id TEXT NOT NULL,
                    relevance_score REAL DEFAULT 0.0,
                    rank_position INTEGER DEFAULT 0,
                    FOREIGN KEY (search_id) REFERENCES influencer_searches(id),
                    FOREIGN KEY (profile_id) REFERENCES influencer_profiles(id)
                )
            """)

            # 즐겨찾기
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS influencer_favorites (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    profile_id TEXT NOT NULL,
                    notes TEXT DEFAULT '',
                    tags_json TEXT DEFAULT '[]',
                    created_at TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (profile_id) REFERENCES influencer_profiles(id),
                    UNIQUE(user_id, profile_id)
                )
            """)

            # 인덱스
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_searches_user ON influencer_searches(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_searches_cache ON influencer_searches(cache_key)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_profiles_platform ON influencer_profiles(platform)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_profiles_username ON influencer_profiles(username)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_posts_profile ON influencer_posts(profile_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_search_results_search ON influencer_search_results(search_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_favorites_user ON influencer_favorites(user_id)")

            # Browse 모드용 인덱스
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_profiles_category ON influencer_profiles(category)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_profiles_followers ON influencer_profiles(follower_count)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_profiles_engagement ON influencer_profiles(avg_engagement_rate)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_profiles_region ON influencer_profiles(region)")

            conn.commit()
        except Exception as e:
            logger.error(f"Failed to init influencer tables: {e}")
        finally:
            conn.close()

    # ===== 검색 캐시 =====

    def get_cached_search(self, cache_key: str) -> Optional[Dict]:
        """캐시된 검색 결과 조회 (24시간 TTL)"""
        conn = self._get_connection()
        try:
            row = conn.execute(
                "SELECT * FROM influencer_searches WHERE cache_key = ? AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1",
                (cache_key,)
            ).fetchone()
            if not row:
                return None
            search = dict(row)
            # 연관 프로필 조회
            results = conn.execute(
                """SELECT sr.relevance_score, sr.rank_position, p.*
                   FROM influencer_search_results sr
                   JOIN influencer_profiles p ON sr.profile_id = p.id
                   WHERE sr.search_id = ?
                   ORDER BY sr.rank_position ASC""",
                (search["id"],)
            ).fetchall()
            search["profiles"] = [dict(r) for r in results]
            return search
        finally:
            conn.close()

    def create_search(self, user_id: str, query: str, filters: dict, platforms: list, cache_key: str) -> str:
        """검색 기록 저장"""
        search_id = str(uuid.uuid4())
        expires_at = (datetime.utcnow() + timedelta(hours=24)).isoformat()
        conn = self._get_connection()
        try:
            conn.execute(
                "INSERT INTO influencer_searches (id, user_id, query, filters_json, platforms_json, cache_key, expires_at) VALUES (?,?,?,?,?,?,?)",
                (search_id, user_id, query, json.dumps(filters, ensure_ascii=False),
                 json.dumps(platforms), cache_key, expires_at)
            )
            conn.commit()
            return search_id
        finally:
            conn.close()

    def update_search_count(self, search_id: str, count: int):
        conn = self._get_connection()
        try:
            conn.execute("UPDATE influencer_searches SET results_count = ? WHERE id = ?", (count, search_id))
            conn.commit()
        finally:
            conn.close()

    def get_search_history(self, user_id: str, limit: int = 20) -> List[Dict]:
        conn = self._get_connection()
        try:
            rows = conn.execute(
                "SELECT id, query, filters_json, platforms_json, results_count, created_at FROM influencer_searches WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
                (user_id, limit)
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    # ===== 프로필 =====

    def upsert_profile(self, profile_data: dict) -> str:
        """프로필 저장 또는 업데이트"""
        conn = self._get_connection()
        try:
            existing = conn.execute(
                "SELECT id FROM influencer_profiles WHERE platform = ? AND username = ?",
                (profile_data["platform"], profile_data["username"])
            ).fetchone()

            if existing:
                profile_id = existing["id"]
                fields = []
                values = []
                for key in ["display_name", "bio", "profile_image_url", "follower_count",
                            "following_count", "post_count", "avg_engagement_rate",
                            "avg_likes", "avg_comments", "avg_views", "category",
                            "language", "region", "profile_url", "verified", "platform_user_id"]:
                    if key in profile_data:
                        fields.append(f"{key} = ?")
                        values.append(profile_data[key])
                fields.append("last_updated_at = datetime('now')")
                values.append(profile_id)
                conn.execute(
                    f"UPDATE influencer_profiles SET {', '.join(fields)} WHERE id = ?",
                    values
                )
            else:
                profile_id = str(uuid.uuid4())
                conn.execute(
                    """INSERT INTO influencer_profiles
                       (id, platform, platform_user_id, username, display_name, bio,
                        profile_image_url, follower_count, following_count, post_count,
                        avg_engagement_rate, avg_likes, avg_comments, avg_views,
                        category, language, region, profile_url, verified)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (profile_id, profile_data.get("platform", ""),
                     profile_data.get("platform_user_id", ""),
                     profile_data.get("username", ""),
                     profile_data.get("display_name", ""),
                     profile_data.get("bio", ""),
                     profile_data.get("profile_image_url", ""),
                     profile_data.get("follower_count", 0),
                     profile_data.get("following_count", 0),
                     profile_data.get("post_count", 0),
                     profile_data.get("avg_engagement_rate", 0.0),
                     profile_data.get("avg_likes", 0.0),
                     profile_data.get("avg_comments", 0.0),
                     profile_data.get("avg_views", 0.0),
                     profile_data.get("category", ""),
                     profile_data.get("language", ""),
                     profile_data.get("region", ""),
                     profile_data.get("profile_url", ""),
                     profile_data.get("verified", 0))
                )
            conn.commit()
            return profile_id
        finally:
            conn.close()

    def get_profile(self, profile_id: str) -> Optional[Dict]:
        conn = self._get_connection()
        try:
            row = conn.execute("SELECT * FROM influencer_profiles WHERE id = ?", (profile_id,)).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    def get_profile_by_username(self, platform: str, username: str) -> Optional[Dict]:
        conn = self._get_connection()
        try:
            row = conn.execute(
                "SELECT * FROM influencer_profiles WHERE platform = ? AND username = ?",
                (platform, username)
            ).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    def is_profile_stale(self, profile_id: str, hours: int = 168) -> bool:
        """프로필이 stale인지 확인 (기본 7일)"""
        conn = self._get_connection()
        try:
            row = conn.execute(
                "SELECT last_updated_at FROM influencer_profiles WHERE id = ?",
                (profile_id,)
            ).fetchone()
            if not row or not row["last_updated_at"]:
                return True
            last_updated = datetime.fromisoformat(row["last_updated_at"])
            return datetime.utcnow() - last_updated > timedelta(hours=hours)
        finally:
            conn.close()

    # ===== 검색 결과 연결 =====

    def add_search_result(self, search_id: str, profile_id: str, relevance_score: float, rank_position: int):
        conn = self._get_connection()
        try:
            conn.execute(
                "INSERT INTO influencer_search_results (id, search_id, profile_id, relevance_score, rank_position) VALUES (?,?,?,?,?)",
                (str(uuid.uuid4()), search_id, profile_id, relevance_score, rank_position)
            )
            conn.commit()
        finally:
            conn.close()

    # ===== 게시물 =====

    def save_posts(self, profile_id: str, posts: List[Dict]):
        """게시물 저장 (기존 삭제 후 재삽입)"""
        conn = self._get_connection()
        try:
            conn.execute("DELETE FROM influencer_posts WHERE profile_id = ?", (profile_id,))
            for post in posts:
                conn.execute(
                    """INSERT INTO influencer_posts
                       (id, profile_id, platform_post_id, content_type, content_text,
                        thumbnail_url, post_url, like_count, comment_count, share_count,
                        view_count, published_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (str(uuid.uuid4()), profile_id,
                     post.get("platform_post_id", ""),
                     post.get("content_type", "text"),
                     post.get("content_text", ""),
                     post.get("thumbnail_url", ""),
                     post.get("post_url", ""),
                     post.get("like_count", 0),
                     post.get("comment_count", 0),
                     post.get("share_count", 0),
                     post.get("view_count", 0),
                     post.get("published_at", ""))
                )
            conn.commit()
        finally:
            conn.close()

    def get_posts(self, profile_id: str, limit: int = 12) -> List[Dict]:
        conn = self._get_connection()
        try:
            rows = conn.execute(
                "SELECT * FROM influencer_posts WHERE profile_id = ? ORDER BY published_at DESC LIMIT ?",
                (profile_id, limit)
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    # ===== 즐겨찾기 =====

    def add_favorite(self, user_id: str, profile_id: str, notes: str = "", tags: list = None) -> str:
        fav_id = str(uuid.uuid4())
        conn = self._get_connection()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO influencer_favorites (id, user_id, profile_id, notes, tags_json) VALUES (?,?,?,?,?)",
                (fav_id, user_id, profile_id, notes, json.dumps(tags or [], ensure_ascii=False))
            )
            conn.commit()
            return fav_id
        finally:
            conn.close()

    def remove_favorite(self, favorite_id: str, user_id: str) -> bool:
        conn = self._get_connection()
        try:
            cursor = conn.execute(
                "DELETE FROM influencer_favorites WHERE id = ? AND user_id = ?",
                (favorite_id, user_id)
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def get_favorites(self, user_id: str) -> List[Dict]:
        conn = self._get_connection()
        try:
            rows = conn.execute(
                """SELECT f.id as favorite_id, f.notes, f.tags_json, f.created_at as favorited_at, p.*
                   FROM influencer_favorites f
                   JOIN influencer_profiles p ON f.profile_id = p.id
                   WHERE f.user_id = ?
                   ORDER BY f.created_at DESC""",
                (user_id,)
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def is_favorited(self, user_id: str, profile_id: str) -> bool:
        conn = self._get_connection()
        try:
            row = conn.execute(
                "SELECT id FROM influencer_favorites WHERE user_id = ? AND profile_id = ?",
                (user_id, profile_id)
            ).fetchone()
            return row is not None
        finally:
            conn.close()

    # ===== Browse 모드 =====

    def browse_profiles(
        self,
        platforms: List[str] = None,
        min_followers: int = 0,
        max_followers: int = 0,
        min_engagement_rate: float = 0.0,
        category: str = "",
        region: str = "",
        verified_only: bool = False,
        sort_by: str = "follower_count",
        sort_order: str = "DESC",
        page: int = 1,
        page_size: int = 20,
    ) -> Dict:
        """DB에서 필터링/정렬/페이지네이션으로 프로필 브라우징 (API 호출 없음)"""
        conn = self._get_connection()
        try:
            conditions = []
            params = []

            if platforms:
                placeholders = ",".join(["?" for _ in platforms])
                conditions.append(f"platform IN ({placeholders})")
                params.extend(platforms)

            if min_followers > 0:
                conditions.append("follower_count >= ?")
                params.append(min_followers)

            if max_followers > 0:
                conditions.append("follower_count <= ?")
                params.append(max_followers)

            if min_engagement_rate > 0:
                conditions.append("avg_engagement_rate >= ?")
                params.append(min_engagement_rate)

            if category:
                conditions.append("category LIKE ?")
                params.append(f"%{category}%")

            if region:
                conditions.append("region LIKE ?")
                params.append(f"%{region}%")

            if verified_only:
                conditions.append("verified = 1")

            where_clause = " AND ".join(conditions) if conditions else "1=1"

            # 허용된 정렬 컬럼
            allowed_sorts = {
                "follower_count", "avg_engagement_rate", "last_updated_at", "created_at"
            }
            if sort_by not in allowed_sorts:
                sort_by = "follower_count"
            if sort_order not in ("ASC", "DESC"):
                sort_order = "DESC"

            # 총 개수
            count_row = conn.execute(
                f"SELECT COUNT(*) as cnt FROM influencer_profiles WHERE {where_clause}",
                params
            ).fetchone()
            total = count_row["cnt"] if count_row else 0

            # 페이지네이션
            offset = (page - 1) * page_size
            rows = conn.execute(
                f"SELECT * FROM influencer_profiles WHERE {where_clause} ORDER BY {sort_by} {sort_order} LIMIT ? OFFSET ?",
                params + [page_size, offset]
            ).fetchall()

            return {
                "profiles": [dict(r) for r in rows],
                "total": total,
                "page": page,
                "page_size": page_size,
            }
        finally:
            conn.close()

    def get_browse_stats(self) -> Dict:
        """DB 내 프로필 통계 (플랫폼별, 카테고리별)"""
        conn = self._get_connection()
        try:
            # 총 프로필 수
            total_row = conn.execute("SELECT COUNT(*) as cnt FROM influencer_profiles").fetchone()
            total = total_row["cnt"] if total_row else 0

            # 플랫폼별
            platform_rows = conn.execute(
                "SELECT platform, COUNT(*) as cnt FROM influencer_profiles GROUP BY platform ORDER BY cnt DESC"
            ).fetchall()

            # 카테고리별 (상위 20개)
            category_rows = conn.execute(
                "SELECT category, COUNT(*) as cnt FROM influencer_profiles WHERE category != '' GROUP BY category ORDER BY cnt DESC LIMIT 20"
            ).fetchall()

            return {
                "total_profiles": total,
                "by_platform": {r["platform"]: r["cnt"] for r in platform_rows},
                "by_category": {r["category"]: r["cnt"] for r in category_rows},
            }
        finally:
            conn.close()

    # ===== 유틸리티 =====

    @staticmethod
    def make_cache_key(query: str, platforms: list, filters: dict) -> str:
        """검색 캐시 키 생성"""
        raw = f"{query}|{sorted(platforms)}|{json.dumps(filters, sort_keys=True)}"
        return hashlib.md5(raw.encode()).hexdigest()

    def get_daily_search_count(self, user_id: str) -> int:
        """오늘 검색 횟수"""
        conn = self._get_connection()
        try:
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM influencer_searches WHERE user_id = ? AND created_at >= date('now')",
                (user_id,)
            ).fetchone()
            return row["cnt"] if row else 0
        finally:
            conn.close()


# Singleton
_influencer_db: Optional[InfluencerDB] = None


def get_influencer_db() -> InfluencerDB:
    global _influencer_db
    if _influencer_db is None:
        _influencer_db = InfluencerDB()
    return _influencer_db


def init_influencer_tables():
    """main.py에서 호출할 초기화 함수"""
    get_influencer_db()
    logger.info("Influencer DB initialized")
