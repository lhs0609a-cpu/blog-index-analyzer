"""
추천 시스템 데이터베이스
사용자 행동 기반 맞춤형 키워드/콘텐츠 추천
"""
import sqlite3
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
import logging
import os
import json
from collections import Counter
import math

logger = logging.getLogger(__name__)

# Database path
import sys
if sys.platform == "win32":
    _default_path = os.path.join(os.path.dirname(__file__), "..", "data", "recommendation.db")
else:
    _default_path = "/data/recommendation.db"
RECOMMENDATION_DB_PATH = os.environ.get("RECOMMENDATION_DB_PATH", _default_path)


class RecommendationDB:
    """추천 시스템 데이터베이스"""

    def __init__(self, db_path: str = RECOMMENDATION_DB_PATH):
        self.db_path = db_path
        self._ensure_db_exists()
        self._init_tables()

    def _ensure_db_exists(self):
        db_dir = os.path.dirname(self.db_path)
        if db_dir and not os.path.exists(db_dir):
            try:
                os.makedirs(db_dir, exist_ok=True)
            except Exception as e:
                logger.warning(f"Could not create db directory: {e}")

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_tables(self):
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # 사용자 행동 기록 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_behaviors (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    target_type TEXT NOT NULL,
                    target_value TEXT NOT NULL,
                    metadata TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 사용자 프로필/선호도 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_preferences (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL UNIQUE,
                    favorite_categories TEXT,
                    favorite_keywords TEXT,
                    blog_topics TEXT,
                    analysis_count INTEGER DEFAULT 0,
                    avg_blog_score REAL DEFAULT 0,
                    last_active TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 인기 키워드 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS trending_keywords (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    keyword TEXT NOT NULL UNIQUE,
                    category TEXT,
                    search_count INTEGER DEFAULT 1,
                    competition_level TEXT,
                    monthly_volume INTEGER,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 추천 결과 캐시 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS recommendation_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    rec_type TEXT NOT NULL,
                    recommendations TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL,
                    UNIQUE(user_id, rec_type)
                )
            """)

            # 인덱스
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_behaviors_user ON user_behaviors(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_behaviors_action ON user_behaviors(action_type)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_behaviors_date ON user_behaviors(created_at)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_trending_keyword ON trending_keywords(keyword)")

            conn.commit()
            logger.info("Recommendation tables initialized")
        finally:
            conn.close()

    def record_behavior(
        self,
        user_id: str,
        action_type: str,
        target_type: str,
        target_value: str,
        metadata: Optional[Dict] = None
    ):
        """
        사용자 행동 기록

        action_type: search, analyze, click, view, bookmark, share
        target_type: keyword, blog, content, category
        """
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO user_behaviors (user_id, action_type, target_type, target_value, metadata)
                VALUES (?, ?, ?, ?, ?)
            """, (user_id, action_type, target_type, target_value, json.dumps(metadata) if metadata else None))
            conn.commit()

            # 트렌딩 키워드 업데이트 (키워드 검색 시)
            if action_type == 'search' and target_type == 'keyword':
                self._update_trending_keyword(target_value, metadata)

            # 사용자 프로필 업데이트
            self._update_user_preferences(user_id, action_type, target_type, target_value, metadata)

        finally:
            conn.close()

    def _update_trending_keyword(self, keyword: str, metadata: Optional[Dict] = None):
        """트렌딩 키워드 업데이트"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO trending_keywords (keyword, search_count, category, monthly_volume, competition_level)
                VALUES (?, 1, ?, ?, ?)
                ON CONFLICT(keyword) DO UPDATE SET
                    search_count = search_count + 1,
                    last_updated = CURRENT_TIMESTAMP
            """, (
                keyword,
                metadata.get('category') if metadata else None,
                metadata.get('monthly_volume') if metadata else None,
                metadata.get('competition') if metadata else None
            ))
            conn.commit()
        finally:
            conn.close()

    def _update_user_preferences(
        self,
        user_id: str,
        action_type: str,
        target_type: str,
        target_value: str,
        metadata: Optional[Dict] = None
    ):
        """사용자 선호도 업데이트"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # 기존 프로필 조회
            cursor.execute("SELECT * FROM user_preferences WHERE user_id = ?", (user_id,))
            row = cursor.fetchone()

            if row:
                pref = dict(row)
                keywords = json.loads(pref['favorite_keywords'] or '[]')
                categories = json.loads(pref['favorite_categories'] or '[]')

                # 키워드/카테고리 추가
                if target_type == 'keyword' and target_value not in keywords:
                    keywords = [target_value] + keywords[:49]  # 최근 50개 유지
                if metadata and 'category' in metadata and metadata['category'] not in categories:
                    categories = [metadata['category']] + categories[:19]

                # 분석 카운트 업데이트
                analysis_count = pref['analysis_count']
                if action_type == 'analyze':
                    analysis_count += 1

                cursor.execute("""
                    UPDATE user_preferences
                    SET favorite_keywords = ?,
                        favorite_categories = ?,
                        analysis_count = ?,
                        last_active = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                """, (json.dumps(keywords), json.dumps(categories), analysis_count, user_id))
            else:
                # 새 프로필 생성
                keywords = [target_value] if target_type == 'keyword' else []
                categories = [metadata['category']] if metadata and 'category' in metadata else []

                cursor.execute("""
                    INSERT INTO user_preferences (user_id, favorite_keywords, favorite_categories, analysis_count, last_active)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, (user_id, json.dumps(keywords), json.dumps(categories), 1 if action_type == 'analyze' else 0))

            conn.commit()
        finally:
            conn.close()

    def get_user_preferences(self, user_id: str) -> Optional[Dict[str, Any]]:
        """사용자 선호도 조회"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM user_preferences WHERE user_id = ?", (user_id,))
            row = cursor.fetchone()
            if row:
                pref = dict(row)
                pref['favorite_keywords'] = json.loads(pref['favorite_keywords'] or '[]')
                pref['favorite_categories'] = json.loads(pref['favorite_categories'] or '[]')
                pref['blog_topics'] = json.loads(pref['blog_topics'] or '[]')
                return pref
            return None
        finally:
            conn.close()

    def get_trending_keywords(self, limit: int = 20, category: Optional[str] = None) -> List[Dict]:
        """인기 키워드 조회"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            if category:
                cursor.execute("""
                    SELECT * FROM trending_keywords
                    WHERE category = ?
                    ORDER BY search_count DESC
                    LIMIT ?
                """, (category, limit))
            else:
                cursor.execute("""
                    SELECT * FROM trending_keywords
                    ORDER BY search_count DESC
                    LIMIT ?
                """, (limit,))
            return [dict(row) for row in cursor.fetchall()]
        finally:
            conn.close()

    def get_user_recent_behaviors(self, user_id: str, days: int = 30, limit: int = 100) -> List[Dict]:
        """사용자 최근 행동 조회"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            since = (datetime.now() - timedelta(days=days)).isoformat()
            cursor.execute("""
                SELECT * FROM user_behaviors
                WHERE user_id = ? AND created_at >= ?
                ORDER BY created_at DESC
                LIMIT ?
            """, (user_id, since, limit))
            behaviors = []
            for row in cursor.fetchall():
                b = dict(row)
                b['metadata'] = json.loads(b['metadata']) if b['metadata'] else None
                behaviors.append(b)
            return behaviors
        finally:
            conn.close()

    def get_similar_users_keywords(self, user_id: str, limit: int = 20) -> List[str]:
        """유사 사용자들이 검색한 키워드 추천"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # 현재 사용자의 키워드 가져오기
            user_pref = self.get_user_preferences(user_id)
            if not user_pref or not user_pref['favorite_keywords']:
                return []

            user_keywords = set(user_pref['favorite_keywords'][:10])

            # 같은 키워드를 검색한 다른 사용자들 찾기
            keyword_placeholders = ','.join('?' * len(user_keywords))
            cursor.execute(f"""
                SELECT DISTINCT user_id FROM user_behaviors
                WHERE target_type = 'keyword'
                  AND target_value IN ({keyword_placeholders})
                  AND user_id != ?
                LIMIT 100
            """, (*user_keywords, user_id))

            similar_users = [row['user_id'] for row in cursor.fetchall()]
            if not similar_users:
                return []

            # 유사 사용자들의 키워드 가져오기
            user_placeholders = ','.join('?' * len(similar_users))
            cursor.execute(f"""
                SELECT target_value, COUNT(*) as cnt FROM user_behaviors
                WHERE user_id IN ({user_placeholders})
                  AND target_type = 'keyword'
                  AND target_value NOT IN ({keyword_placeholders})
                GROUP BY target_value
                ORDER BY cnt DESC
                LIMIT ?
            """, (*similar_users, *user_keywords, limit))

            return [row['target_value'] for row in cursor.fetchall()]
        finally:
            conn.close()

    def get_recommendations(self, user_id: str, rec_type: str = 'keywords') -> Dict[str, Any]:
        """
        맞춤 추천 생성

        rec_type: keywords, content, blogs, categories
        """
        # 캐시 확인
        cached = self._get_cached_recommendations(user_id, rec_type)
        if cached:
            return cached

        recommendations = {
            'user_id': user_id,
            'type': rec_type,
            'items': [],
            'trending': [],
            'similar_users': [],
            'generated_at': datetime.now().isoformat()
        }

        if rec_type == 'keywords':
            recommendations = self._generate_keyword_recommendations(user_id)
        elif rec_type == 'content':
            recommendations = self._generate_content_recommendations(user_id)

        # 캐시 저장 (1시간)
        self._cache_recommendations(user_id, rec_type, recommendations, hours=1)

        return recommendations

    def _generate_keyword_recommendations(self, user_id: str) -> Dict[str, Any]:
        """키워드 추천 생성"""
        user_pref = self.get_user_preferences(user_id)
        recent_behaviors = self.get_user_recent_behaviors(user_id, days=14, limit=50)

        # 사용자 기반 추천
        user_based = []
        if user_pref and user_pref['favorite_keywords']:
            # 최근 검색한 키워드에서 관련 키워드 생성
            recent_keywords = user_pref['favorite_keywords'][:10]
            # 간단한 접두사/접미사 변형 생성
            for kw in recent_keywords[:5]:
                user_based.append({
                    'keyword': kw,
                    'reason': '최근 검색',
                    'score': 0.9
                })

        # 트렌딩 기반 추천
        trending = self.get_trending_keywords(limit=10)
        trending_keywords = [{
            'keyword': t['keyword'],
            'reason': '인기 키워드',
            'search_count': t['search_count'],
            'score': min(1.0, t['search_count'] / 100)
        } for t in trending]

        # 유사 사용자 기반 추천
        similar_keywords = self.get_similar_users_keywords(user_id, limit=10)
        similar_based = [{
            'keyword': kw,
            'reason': '비슷한 사용자가 검색',
            'score': 0.7
        } for kw in similar_keywords]

        # 카테고리 기반 추천
        category_based = []
        if user_pref and user_pref['favorite_categories']:
            cat_trending = self.get_trending_keywords(limit=5, category=user_pref['favorite_categories'][0])
            category_based = [{
                'keyword': t['keyword'],
                'reason': f"'{user_pref['favorite_categories'][0]}' 카테고리 인기",
                'score': 0.8
            } for t in cat_trending]

        return {
            'user_id': user_id,
            'type': 'keywords',
            'personalized': user_based,
            'trending': trending_keywords,
            'similar_users': similar_based,
            'category_based': category_based,
            'total_recommendations': len(user_based) + len(trending_keywords) + len(similar_based),
            'generated_at': datetime.now().isoformat()
        }

    def _generate_content_recommendations(self, user_id: str) -> Dict[str, Any]:
        """콘텐츠 추천 생성 (블로그 주제 등)"""
        user_pref = self.get_user_preferences(user_id)

        content_ideas = []
        if user_pref and user_pref['favorite_keywords']:
            for kw in user_pref['favorite_keywords'][:5]:
                content_ideas.append({
                    'topic': f"'{kw}' 키워드 완벽 가이드",
                    'type': 'guide',
                    'keyword': kw,
                    'reason': '검색량 높은 키워드'
                })
                content_ideas.append({
                    'topic': f"2024년 {kw} 트렌드 분석",
                    'type': 'trend',
                    'keyword': kw,
                    'reason': '트렌드 관심 증가'
                })

        return {
            'user_id': user_id,
            'type': 'content',
            'content_ideas': content_ideas,
            'generated_at': datetime.now().isoformat()
        }

    def _get_cached_recommendations(self, user_id: str, rec_type: str) -> Optional[Dict]:
        """캐시된 추천 조회"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT recommendations FROM recommendation_cache
                WHERE user_id = ? AND rec_type = ? AND expires_at > CURRENT_TIMESTAMP
            """, (user_id, rec_type))
            row = cursor.fetchone()
            if row:
                return json.loads(row['recommendations'])
            return None
        finally:
            conn.close()

    def _cache_recommendations(self, user_id: str, rec_type: str, recommendations: Dict, hours: int = 1):
        """추천 결과 캐시"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            expires_at = (datetime.now() + timedelta(hours=hours)).isoformat()
            cursor.execute("""
                INSERT OR REPLACE INTO recommendation_cache (user_id, rec_type, recommendations, expires_at)
                VALUES (?, ?, ?, ?)
            """, (user_id, rec_type, json.dumps(recommendations), expires_at))
            conn.commit()
        finally:
            conn.close()

    def invalidate_cache(self, user_id: str, rec_type: Optional[str] = None):
        """캐시 무효화"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            if rec_type:
                cursor.execute("DELETE FROM recommendation_cache WHERE user_id = ? AND rec_type = ?", (user_id, rec_type))
            else:
                cursor.execute("DELETE FROM recommendation_cache WHERE user_id = ?", (user_id,))
            conn.commit()
        finally:
            conn.close()


# 싱글톤
_db_instance = None

def get_recommendation_db() -> RecommendationDB:
    global _db_instance
    if _db_instance is None:
        _db_instance = RecommendationDB()
    return _db_instance
