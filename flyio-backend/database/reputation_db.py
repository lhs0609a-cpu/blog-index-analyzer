"""
평판 모니터링 데이터베이스
네이버 플레이스/구글/카카오맵 리뷰 수집 및 관리
"""
import sqlite3
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import logging
import os
import json
import uuid

logger = logging.getLogger(__name__)

# Database path
import sys
if sys.platform == "win32":
    _default_path = os.path.join(os.path.dirname(__file__), "..", "data", "reputation.db")
else:
    _default_path = "/data/reputation.db"
REPUTATION_DB_PATH = os.environ.get("REPUTATION_DB_PATH", _default_path)


class ReputationDB:
    """평판 모니터링 데이터베이스"""

    def __init__(self, db_path: str = REPUTATION_DB_PATH):
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
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_tables(self):
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # 모니터링 대상 가게
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS monitored_stores (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    store_name TEXT NOT NULL,
                    naver_place_id TEXT,
                    google_place_id TEXT,
                    kakao_place_id TEXT,
                    category TEXT,
                    address TEXT,
                    is_active INTEGER DEFAULT 1,
                    last_crawled_at TEXT,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                )
            """)

            # 수집된 리뷰
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS reviews (
                    id TEXT PRIMARY KEY,
                    store_id TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    platform_review_id TEXT,
                    author_name TEXT,
                    rating INTEGER,
                    content TEXT,
                    review_date TEXT,
                    sentiment TEXT DEFAULT 'neutral',
                    sentiment_score REAL DEFAULT 0.0,
                    sentiment_category TEXT,
                    keywords TEXT,
                    is_alerted INTEGER DEFAULT 0,
                    ai_response TEXT,
                    response_status TEXT DEFAULT 'pending',
                    collected_at TEXT DEFAULT (datetime('now')),
                    UNIQUE(platform, platform_review_id)
                )
            """)

            # 알림 설정
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS alert_settings (
                    id TEXT PRIMARY KEY,
                    store_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    alert_type TEXT NOT NULL,
                    condition_json TEXT,
                    notification_channel TEXT DEFAULT 'in_app',
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT (datetime('now'))
                )
            """)

            # AI 답변 템플릿
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS response_templates (
                    id TEXT PRIMARY KEY,
                    store_id TEXT,
                    user_id TEXT,
                    template_name TEXT NOT NULL,
                    tone TEXT DEFAULT 'professional',
                    template_text TEXT,
                    category TEXT,
                    created_at TEXT DEFAULT (datetime('now'))
                )
            """)

            # 일별 평판 통계
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS reputation_stats (
                    id TEXT PRIMARY KEY,
                    store_id TEXT NOT NULL,
                    date TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    total_reviews INTEGER DEFAULT 0,
                    new_reviews INTEGER DEFAULT 0,
                    avg_rating REAL DEFAULT 0.0,
                    negative_count INTEGER DEFAULT 0,
                    positive_count INTEGER DEFAULT 0,
                    neutral_count INTEGER DEFAULT 0,
                    response_rate REAL DEFAULT 0.0,
                    UNIQUE(store_id, date, platform)
                )
            """)

            # 경쟁업체
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS competitors (
                    id TEXT PRIMARY KEY,
                    store_id TEXT NOT NULL,
                    competitor_name TEXT NOT NULL,
                    naver_place_id TEXT,
                    google_place_id TEXT,
                    kakao_place_id TEXT,
                    category TEXT,
                    address TEXT,
                    last_checked_at TEXT,
                    cached_rating REAL DEFAULT 0.0,
                    cached_review_count INTEGER DEFAULT 0,
                    cached_negative_count INTEGER DEFAULT 0,
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT (datetime('now'))
                )
            """)

            # AI 인사이트 리포트 캐시
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS insight_reports (
                    id TEXT PRIMARY KEY,
                    store_id TEXT NOT NULL,
                    report_json TEXT NOT NULL,
                    report_type TEXT DEFAULT 'weekly',
                    generated_at TEXT DEFAULT (datetime('now'))
                )
            """)

            # 인덱스
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_reviews_store ON reviews(store_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_reviews_platform ON reviews(platform)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_reviews_sentiment ON reviews(sentiment)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_reviews_collected ON reviews(collected_at)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_stores_user ON monitored_stores(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_stats_store_date ON reputation_stats(store_id, date)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_competitors_store ON competitors(store_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_templates_store ON response_templates(store_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_reports_store ON insight_reports(store_id)")

            conn.commit()
            logger.info("Reputation DB tables initialized")
        except Exception as e:
            logger.error(f"Failed to init reputation tables: {e}")
        finally:
            conn.close()

    # ===== 가게 관리 =====

    def add_store(self, user_id: str, store_name: str, naver_place_id: str = None,
                  google_place_id: str = None, kakao_place_id: str = None,
                  category: str = None, address: str = None) -> Dict:
        store_id = str(uuid.uuid4())
        conn = self._get_connection()
        try:
            conn.execute("""
                INSERT INTO monitored_stores (id, user_id, store_name, naver_place_id,
                    google_place_id, kakao_place_id, category, address)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (store_id, user_id, store_name, naver_place_id,
                  google_place_id, kakao_place_id, category, address))
            conn.commit()
            return {"id": store_id, "store_name": store_name}
        finally:
            conn.close()

    def get_stores(self, user_id: str) -> List[Dict]:
        conn = self._get_connection()
        try:
            rows = conn.execute(
                "SELECT * FROM monitored_stores WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC",
                (user_id,)
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def get_store(self, store_id: str) -> Optional[Dict]:
        conn = self._get_connection()
        try:
            row = conn.execute("SELECT * FROM monitored_stores WHERE id = ?", (store_id,)).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    def delete_store(self, store_id: str, user_id: str) -> bool:
        conn = self._get_connection()
        try:
            cursor = conn.execute(
                "UPDATE monitored_stores SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
                (store_id, user_id)
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def get_all_active_stores(self) -> List[Dict]:
        conn = self._get_connection()
        try:
            rows = conn.execute(
                "SELECT * FROM monitored_stores WHERE is_active = 1"
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def update_last_crawled(self, store_id: str):
        conn = self._get_connection()
        try:
            conn.execute(
                "UPDATE monitored_stores SET last_crawled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
                (store_id,)
            )
            conn.commit()
        finally:
            conn.close()

    # ===== 리뷰 관리 =====

    def add_review(self, store_id: str, platform: str, platform_review_id: str,
                   author_name: str, rating: int, content: str, review_date: str,
                   sentiment: str = "neutral", sentiment_score: float = 0.0,
                   sentiment_category: str = None, keywords: List[str] = None) -> Optional[str]:
        """리뷰 추가. 중복이면 None 반환."""
        review_id = str(uuid.uuid4())
        conn = self._get_connection()
        try:
            conn.execute("""
                INSERT OR IGNORE INTO reviews
                    (id, store_id, platform, platform_review_id, author_name, rating,
                     content, review_date, sentiment, sentiment_score, sentiment_category, keywords)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (review_id, store_id, platform, platform_review_id, author_name, rating,
                  content, review_date, sentiment, sentiment_score, sentiment_category,
                  json.dumps(keywords or [], ensure_ascii=False)))
            conn.commit()
            if conn.total_changes > 0:
                return review_id
            return None
        finally:
            conn.close()

    def get_reviews(self, store_id: str, platform: str = None, sentiment: str = None,
                    limit: int = 50, offset: int = 0) -> List[Dict]:
        conn = self._get_connection()
        try:
            query = "SELECT * FROM reviews WHERE store_id = ?"
            params: list = [store_id]

            if platform:
                query += " AND platform = ?"
                params.append(platform)
            if sentiment:
                query += " AND sentiment = ?"
                params.append(sentiment)

            query += " ORDER BY collected_at DESC LIMIT ? OFFSET ?"
            params.extend([limit, offset])

            rows = conn.execute(query, params).fetchall()
            results = []
            for r in rows:
                d = dict(r)
                if d.get("keywords"):
                    try:
                        d["keywords"] = json.loads(d["keywords"])
                    except Exception:
                        d["keywords"] = []
                results.append(d)
            return results
        finally:
            conn.close()

    def get_review(self, review_id: str) -> Optional[Dict]:
        conn = self._get_connection()
        try:
            row = conn.execute("SELECT * FROM reviews WHERE id = ?", (review_id,)).fetchone()
            if row:
                d = dict(row)
                if d.get("keywords"):
                    try:
                        d["keywords"] = json.loads(d["keywords"])
                    except Exception:
                        d["keywords"] = []
                return d
            return None
        finally:
            conn.close()

    def update_review_response(self, review_id: str, ai_response: str, status: str = "generated"):
        conn = self._get_connection()
        try:
            conn.execute(
                "UPDATE reviews SET ai_response = ?, response_status = ? WHERE id = ?",
                (ai_response, status, review_id)
            )
            conn.commit()
        finally:
            conn.close()

    def mark_alerted(self, review_id: str):
        conn = self._get_connection()
        try:
            conn.execute("UPDATE reviews SET is_alerted = 1 WHERE id = ?", (review_id,))
            conn.commit()
        finally:
            conn.close()

    def get_new_negative_reviews(self, store_id: str) -> List[Dict]:
        """아직 알림 안 보낸 부정 리뷰 조회"""
        conn = self._get_connection()
        try:
            rows = conn.execute("""
                SELECT * FROM reviews
                WHERE store_id = ? AND sentiment = 'negative' AND is_alerted = 0
                ORDER BY collected_at DESC
            """, (store_id,)).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def purge_blog_reviews(self, store_id: str = None) -> int:
        """
        DB에서 블로그 리뷰(구매자 리뷰가 아닌 것) 삭제

        블로그 리뷰 판별 기준:
        - rating=0 (별점 없음) AND content가 짧거나 블로그 제목 패턴
        - content에 '[블로그 리뷰]' 접두사
        - content에 '⭐' 이모지 포함 (블로그 제목 패턴)
        - author_name이 '블로거'
        """
        conn = self._get_connection()
        try:
            if store_id:
                base_where = "store_id = ? AND "
                base_params: list = [store_id]
            else:
                base_where = ""
                base_params = []

            total_deleted = 0

            # 1) rating=0이고 content가 블로그 제목 패턴인 것
            result = conn.execute(f"""
                DELETE FROM reviews WHERE {base_where}rating = 0 AND (
                    content LIKE '%⭐%'
                    OR content LIKE '[블로그 리뷰]%'
                    OR content LIKE '%블로그%리뷰%'
                    OR author_name = '블로거'
                )
            """, base_params)
            total_deleted += result.rowcount

            # 2) rating=0이고 content가 5자 미만 (빈 리뷰)
            result = conn.execute(f"""
                DELETE FROM reviews WHERE {base_where}rating = 0 AND LENGTH(TRIM(content)) < 5
            """, base_params)
            total_deleted += result.rowcount

            conn.commit()
            logger.info(f"Purged {total_deleted} blog/invalid reviews" +
                        (f" for store {store_id}" if store_id else " globally"))
            return total_deleted
        finally:
            conn.close()

    def get_review_count(self, store_id: str, platform: str = None, sentiment: str = None) -> int:
        conn = self._get_connection()
        try:
            query = "SELECT COUNT(*) FROM reviews WHERE store_id = ?"
            params: list = [store_id]
            if platform:
                query += " AND platform = ?"
                params.append(platform)
            if sentiment:
                query += " AND sentiment = ?"
                params.append(sentiment)
            return conn.execute(query, params).fetchone()[0]
        finally:
            conn.close()

    # ===== 통계 =====

    def get_dashboard_stats(self, store_id: str) -> Dict:
        conn = self._get_connection()
        try:
            # 전체 리뷰 수 및 평균 평점 (rating=0인 블로그 리뷰는 평점 계산에서 제외)
            total = conn.execute(
                "SELECT COUNT(*) as cnt, AVG(CASE WHEN rating > 0 THEN rating END) as avg_rating FROM reviews WHERE store_id = ?",
                (store_id,)
            ).fetchone()

            # 감성별 리뷰 수
            sentiment_counts = {}
            for s in ["positive", "neutral", "negative"]:
                row = conn.execute(
                    "SELECT COUNT(*) FROM reviews WHERE store_id = ? AND sentiment = ?",
                    (store_id, s)
                ).fetchone()
                sentiment_counts[s] = row[0] if row else 0

            # 플랫폼별 평균 평점 (rating=0 제외)
            platform_stats = {}
            platforms = conn.execute(
                "SELECT DISTINCT platform FROM reviews WHERE store_id = ?",
                (store_id,)
            ).fetchall()
            for p in platforms:
                pname = p[0]
                prow = conn.execute(
                    "SELECT COUNT(*) as cnt, AVG(CASE WHEN rating > 0 THEN rating END) as avg_rating FROM reviews WHERE store_id = ? AND platform = ?",
                    (store_id, pname)
                ).fetchone()
                platform_stats[pname] = {
                    "count": prow[0],
                    "avg_rating": round(prow[1], 1) if prow[1] else 0
                }

            # 최근 7일 새 리뷰
            seven_days_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
            recent = conn.execute(
                "SELECT COUNT(*) FROM reviews WHERE store_id = ? AND collected_at >= ?",
                (store_id, seven_days_ago)
            ).fetchone()

            # 답변율
            total_cnt = total[0] if total[0] else 0
            responded = conn.execute(
                "SELECT COUNT(*) FROM reviews WHERE store_id = ? AND response_status IN ('generated', 'applied')",
                (store_id,)
            ).fetchone()[0]

            return {
                "total_reviews": total_cnt,
                "avg_rating": round(total[1], 1) if total[1] else 0,
                "sentiment_counts": sentiment_counts,
                "platform_stats": platform_stats,
                "recent_7d_reviews": recent[0],
                "response_rate": round(responded / total_cnt * 100, 1) if total_cnt > 0 else 0,
            }
        finally:
            conn.close()

    def get_rating_trend(self, store_id: str, days: int = 30) -> List[Dict]:
        conn = self._get_connection()
        try:
            since = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
            rows = conn.execute("""
                SELECT DATE(collected_at) as date,
                    AVG(CASE WHEN rating > 0 THEN rating END) as avg_rating,
                    COUNT(*) as count
                FROM reviews WHERE store_id = ? AND collected_at >= ?
                GROUP BY DATE(collected_at)
                ORDER BY date
            """, (store_id, since)).fetchall()
            return [{"date": r[0], "avg_rating": round(r[1], 1) if r[1] else 0, "count": r[2]} for r in rows]
        finally:
            conn.close()

    # ===== 고급 통계 =====

    def get_sentiment_trend(self, store_id: str, days: int = 30) -> List[Dict]:
        """일별 감성 분포 트렌드"""
        conn = self._get_connection()
        try:
            since = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
            rows = conn.execute("""
                SELECT DATE(collected_at) as date,
                    SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive,
                    SUM(CASE WHEN sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral,
                    SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative,
                    COUNT(*) as total
                FROM reviews WHERE store_id = ? AND collected_at >= ?
                GROUP BY DATE(collected_at)
                ORDER BY date
            """, (store_id, since)).fetchall()
            return [{"date": r[0], "positive": r[1], "neutral": r[2], "negative": r[3], "total": r[4]} for r in rows]
        finally:
            conn.close()

    def get_category_breakdown(self, store_id: str) -> List[Dict]:
        """부정 리뷰 카테고리별 분포"""
        conn = self._get_connection()
        try:
            rows = conn.execute("""
                SELECT sentiment_category, COUNT(*) as count
                FROM reviews
                WHERE store_id = ? AND sentiment = 'negative' AND sentiment_category IS NOT NULL
                GROUP BY sentiment_category
                ORDER BY count DESC
            """, (store_id,)).fetchall()
            category_labels = {
                "food": "음식/맛",
                "service": "서비스/응대",
                "hygiene": "위생/청결",
                "price": "가격/가성비",
                "other": "기타",
                "unknown": "미분류",
            }
            return [{"category": r[0], "label": category_labels.get(r[0], r[0]), "count": r[1]} for r in rows]
        finally:
            conn.close()

    def get_platform_comparison(self, store_id: str) -> List[Dict]:
        """플랫폼별 비교 통계"""
        conn = self._get_connection()
        try:
            rows = conn.execute("""
                SELECT platform,
                    COUNT(*) as total,
                    AVG(CASE WHEN rating > 0 THEN rating END) as avg_rating,
                    SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive,
                    SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative,
                    SUM(CASE WHEN response_status IN ('generated', 'applied') THEN 1 ELSE 0 END) as responded
                FROM reviews WHERE store_id = ?
                GROUP BY platform
            """, (store_id,)).fetchall()
            platform_names = {
                "naver_place": "네이버 플레이스",
                "google": "구글 리뷰",
                "kakao": "카카오맵",
            }
            return [{
                "platform": r[0],
                "platform_name": platform_names.get(r[0], r[0]),
                "total": r[1],
                "avg_rating": round(r[2], 1) if r[2] else 0,
                "positive": r[3],
                "negative": r[4],
                "response_rate": round(r[5] / r[1] * 100, 1) if r[1] > 0 else 0,
            } for r in rows]
        finally:
            conn.close()

    def get_response_stats(self, store_id: str) -> Dict:
        """AI 답변 사용 통계"""
        conn = self._get_connection()
        try:
            total = conn.execute(
                "SELECT COUNT(*) FROM reviews WHERE store_id = ?", (store_id,)
            ).fetchone()[0]
            generated = conn.execute(
                "SELECT COUNT(*) FROM reviews WHERE store_id = ? AND response_status = 'generated'",
                (store_id,)
            ).fetchone()[0]
            applied = conn.execute(
                "SELECT COUNT(*) FROM reviews WHERE store_id = ? AND response_status = 'applied'",
                (store_id,)
            ).fetchone()[0]
            pending_negative = conn.execute(
                "SELECT COUNT(*) FROM reviews WHERE store_id = ? AND sentiment = 'negative' AND response_status = 'pending'",
                (store_id,)
            ).fetchone()[0]

            return {
                "total_reviews": total,
                "generated": generated,
                "applied": applied,
                "total_responded": generated + applied,
                "response_rate": round((generated + applied) / total * 100, 1) if total > 0 else 0,
                "pending_negative": pending_negative,
            }
        finally:
            conn.close()

    def get_keyword_frequency(self, store_id: str, limit: int = 20) -> List[Dict]:
        """자주 언급되는 키워드 빈도"""
        conn = self._get_connection()
        try:
            rows = conn.execute(
                "SELECT keywords FROM reviews WHERE store_id = ? AND keywords IS NOT NULL AND keywords != '[]'",
                (store_id,)
            ).fetchall()

            keyword_counts: Dict[str, Dict] = {}
            for row in rows:
                try:
                    kws = json.loads(row[0])
                    for kw in kws:
                        if kw not in keyword_counts:
                            keyword_counts[kw] = {"positive": 0, "negative": 0}
                        # 키워드 분류
                        if kw in ["친절", "맛있", "깨끗", "추천", "최고", "만족", "좋았",
                                  "감사", "또올", "재방문", "굿", "대박", "맛집", "분위기좋",
                                  "신선", "가성비", "훌륭", "정성", "넉넉", "빠르", "따뜻"]:
                            keyword_counts[kw]["positive"] += 1
                        else:
                            keyword_counts[kw]["negative"] += 1
                except (json.JSONDecodeError, TypeError):
                    continue

            result = []
            for kw, counts in keyword_counts.items():
                total = counts["positive"] + counts["negative"]
                result.append({
                    "keyword": kw,
                    "count": total,
                    "type": "positive" if counts["positive"] > counts["negative"] else "negative",
                })

            result.sort(key=lambda x: x["count"], reverse=True)
            return result[:limit]
        finally:
            conn.close()

    # ===== 알림 설정 =====

    def get_alert_settings(self, store_id: str) -> List[Dict]:
        conn = self._get_connection()
        try:
            rows = conn.execute(
                "SELECT * FROM alert_settings WHERE store_id = ? AND is_active = 1",
                (store_id,)
            ).fetchall()
            results = []
            for r in rows:
                d = dict(r)
                if d.get("condition_json"):
                    try:
                        d["condition"] = json.loads(d["condition_json"])
                    except Exception:
                        d["condition"] = {}
                results.append(d)
            return results
        finally:
            conn.close()

    def upsert_alert_setting(self, store_id: str, user_id: str, alert_type: str,
                             condition: dict, channel: str = "in_app",
                             is_active: bool = True) -> str:
        setting_id = str(uuid.uuid4())
        conn = self._get_connection()
        try:
            # 기존 설정 확인 (활성/비활성 모두)
            existing = conn.execute(
                "SELECT id FROM alert_settings WHERE store_id = ? AND alert_type = ?",
                (store_id, alert_type)
            ).fetchone()

            if existing:
                conn.execute("""
                    UPDATE alert_settings SET condition_json = ?, notification_channel = ?, is_active = ?
                    WHERE id = ?
                """, (json.dumps(condition, ensure_ascii=False), channel, 1 if is_active else 0, existing[0]))
                setting_id = existing[0]
            else:
                conn.execute("""
                    INSERT INTO alert_settings (id, store_id, user_id, alert_type, condition_json, notification_channel, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (setting_id, store_id, user_id, alert_type,
                      json.dumps(condition, ensure_ascii=False), channel, 1 if is_active else 0))
            conn.commit()
            return setting_id
        finally:
            conn.close()

    # ===== 답변 템플릿 =====

    def add_template(self, store_id: str, user_id: str, template_name: str,
                     template_text: str, tone: str = "professional", category: str = None) -> Dict:
        tid = str(uuid.uuid4())
        conn = self._get_connection()
        try:
            conn.execute("""
                INSERT INTO response_templates (id, store_id, user_id, template_name, tone, template_text, category)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (tid, store_id, user_id, template_name, tone, template_text, category))
            conn.commit()
            return {"id": tid, "template_name": template_name}
        finally:
            conn.close()

    def get_templates(self, store_id: str) -> List[Dict]:
        conn = self._get_connection()
        try:
            rows = conn.execute(
                "SELECT * FROM response_templates WHERE store_id = ? ORDER BY created_at DESC",
                (store_id,)
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def update_template(self, template_id: str, template_name: str = None,
                        template_text: str = None, tone: str = None, category: str = None) -> bool:
        conn = self._get_connection()
        try:
            updates = []
            params = []
            if template_name is not None:
                updates.append("template_name = ?")
                params.append(template_name)
            if template_text is not None:
                updates.append("template_text = ?")
                params.append(template_text)
            if tone is not None:
                updates.append("tone = ?")
                params.append(tone)
            if category is not None:
                updates.append("category = ?")
                params.append(category)
            if not updates:
                return False
            params.append(template_id)
            cursor = conn.execute(f"UPDATE response_templates SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def delete_template(self, template_id: str) -> bool:
        conn = self._get_connection()
        try:
            cursor = conn.execute("DELETE FROM response_templates WHERE id = ?", (template_id,))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    # ===== 경쟁업체 =====

    def add_competitor(self, store_id: str, competitor_name: str, naver_place_id: str = None,
                       google_place_id: str = None, kakao_place_id: str = None,
                       category: str = None, address: str = None) -> Dict:
        cid = str(uuid.uuid4())
        conn = self._get_connection()
        try:
            conn.execute("""
                INSERT INTO competitors (id, store_id, competitor_name, naver_place_id,
                    google_place_id, kakao_place_id, category, address)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (cid, store_id, competitor_name, naver_place_id,
                  google_place_id, kakao_place_id, category, address))
            conn.commit()
            return {"id": cid, "competitor_name": competitor_name}
        finally:
            conn.close()

    def get_competitors(self, store_id: str) -> List[Dict]:
        conn = self._get_connection()
        try:
            rows = conn.execute(
                "SELECT * FROM competitors WHERE store_id = ? AND is_active = 1 ORDER BY created_at DESC",
                (store_id,)
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def update_competitor_cache(self, competitor_id: str, avg_rating: float,
                                review_count: int, negative_count: int = 0):
        conn = self._get_connection()
        try:
            conn.execute("""
                UPDATE competitors SET cached_rating = ?, cached_review_count = ?,
                    cached_negative_count = ?, last_checked_at = datetime('now')
                WHERE id = ?
            """, (avg_rating, review_count, negative_count, competitor_id))
            conn.commit()
        finally:
            conn.close()

    def delete_competitor(self, competitor_id: str) -> bool:
        conn = self._get_connection()
        try:
            cursor = conn.execute("UPDATE competitors SET is_active = 0 WHERE id = ?", (competitor_id,))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    # ===== 인사이트 리포트 =====

    def save_insight_report(self, store_id: str, report: dict, report_type: str = "weekly") -> str:
        rid = str(uuid.uuid4())
        conn = self._get_connection()
        try:
            conn.execute("""
                INSERT INTO insight_reports (id, store_id, report_json, report_type)
                VALUES (?, ?, ?, ?)
            """, (rid, store_id, json.dumps(report, ensure_ascii=False), report_type))
            conn.commit()
            return rid
        finally:
            conn.close()

    def get_latest_report(self, store_id: str, report_type: str = "weekly") -> Optional[Dict]:
        conn = self._get_connection()
        try:
            row = conn.execute("""
                SELECT * FROM insight_reports
                WHERE store_id = ? AND report_type = ?
                ORDER BY generated_at DESC LIMIT 1
            """, (store_id, report_type)).fetchone()
            if row:
                d = dict(row)
                try:
                    d["report"] = json.loads(d["report_json"])
                except (json.JSONDecodeError, TypeError):
                    d["report"] = {}
                return d
            return None
        finally:
            conn.close()

    def get_report_history(self, store_id: str, limit: int = 10) -> List[Dict]:
        conn = self._get_connection()
        try:
            rows = conn.execute("""
                SELECT id, store_id, report_type, generated_at
                FROM insight_reports WHERE store_id = ?
                ORDER BY generated_at DESC LIMIT ?
            """, (store_id, limit)).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


# 싱글톤 인스턴스
_reputation_db: Optional[ReputationDB] = None

def get_reputation_db() -> ReputationDB:
    global _reputation_db
    if _reputation_db is None:
        _reputation_db = ReputationDB()
    return _reputation_db

def init_reputation_tables():
    """main.py에서 호출할 초기화 함수"""
    get_reputation_db()
    logger.info("Reputation DB initialized")
