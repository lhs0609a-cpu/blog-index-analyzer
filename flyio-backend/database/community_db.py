"""
커뮤니티 기능 데이터베이스
- 실시간 활동 피드
- 포인트 & 레벨 시스템
- 리더보드
- 인사이트 게시판
- 키워드 트렌드
- 상위노출 성공 알림
"""
import sqlite3
import json
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# 데이터 경로
import sys
import os
if sys.platform == "win32":
    DATA_DIR = Path(os.environ.get("DATA_DIR", Path(os.path.dirname(__file__)).parent / "data"))
else:
    DATA_DIR = Path("/data") if Path("/data").exists() else Path("./data")
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "community.db"


def get_db_connection():
    """DB 연결"""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_community_tables():
    """커뮤니티 테이블 초기화"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. 사용자 포인트 & 레벨 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_points (
            user_id INTEGER PRIMARY KEY,
            total_points INTEGER DEFAULT 0,
            weekly_points INTEGER DEFAULT 0,
            monthly_points INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            level_name VARCHAR(50) DEFAULT 'Bronze',
            streak_days INTEGER DEFAULT 0,
            last_activity_date DATE,
            top_ranking_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 2. 포인트 이력 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS point_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            points INTEGER NOT NULL,
            action_type VARCHAR(50) NOT NULL,
            description TEXT,
            metadata TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 3. 실시간 활동 피드 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS activity_feed (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            user_name VARCHAR(100),
            activity_type VARCHAR(50) NOT NULL,
            title TEXT,
            description TEXT,
            metadata TEXT,
            points_earned INTEGER DEFAULT 0,
            is_public BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 4. 인사이트 게시판 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS insights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            user_level VARCHAR(50),
            content TEXT NOT NULL,
            category VARCHAR(50) DEFAULT 'general',
            likes INTEGER DEFAULT 0,
            comments_count INTEGER DEFAULT 0,
            is_anonymous BOOLEAN DEFAULT TRUE,
            is_approved BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 5. 인사이트 댓글 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS insight_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            insight_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            user_level VARCHAR(50),
            content TEXT NOT NULL,
            is_anonymous BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (insight_id) REFERENCES insights(id)
        )
    """)

    # 6. 인사이트 좋아요 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS insight_likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            insight_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(insight_id, user_id)
        )
    """)

    # 7. 키워드 트렌드 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS keyword_trends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword VARCHAR(100) NOT NULL,
            search_count INTEGER DEFAULT 1,
            user_count INTEGER DEFAULT 1,
            trend_score REAL DEFAULT 0,
            prev_trend_score REAL DEFAULT 0,
            trend_change REAL DEFAULT 0,
            is_hot BOOLEAN DEFAULT FALSE,
            recommended_by INTEGER,
            recommendation_reason TEXT,
            date DATE DEFAULT (DATE('now')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(keyword, date)
        )
    """)

    # 8. 상위노출 성공 기록 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ranking_success (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            user_name VARCHAR(100),
            blog_id VARCHAR(100),
            keyword VARCHAR(100) NOT NULL,
            prev_rank INTEGER,
            new_rank INTEGER NOT NULL,
            post_url TEXT,
            is_new_entry BOOLEAN DEFAULT FALSE,
            consecutive_days INTEGER DEFAULT 1,
            is_public BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 9. 주간/월간 챌린지 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS challenges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title VARCHAR(200) NOT NULL,
            description TEXT,
            challenge_type VARCHAR(50) NOT NULL,
            target_value INTEGER NOT NULL,
            current_participants INTEGER DEFAULT 0,
            max_participants INTEGER,
            reward_points INTEGER DEFAULT 0,
            reward_description TEXT,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 10. 챌린지 참여 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS challenge_participants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            challenge_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            progress INTEGER DEFAULT 0,
            is_completed BOOLEAN DEFAULT FALSE,
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(challenge_id, user_id),
            FOREIGN KEY (challenge_id) REFERENCES challenges(id)
        )
    """)

    # 인덱스 생성
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_point_history_user ON point_history(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_point_history_created ON point_history(created_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_feed_created ON activity_feed(created_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_feed_public ON activity_feed(is_public, created_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_insights_created ON insights(created_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_keyword_trends_date ON keyword_trends(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ranking_success_created ON ranking_success(created_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_points_weekly ON user_points(weekly_points DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_points_monthly ON user_points(monthly_points DESC)")

    conn.commit()
    conn.close()
    logger.info("Community DB initialized")


# ============ 포인트 시스템 ============

POINT_VALUES = {
    "keyword_search": 5,
    "blog_analysis": 10,
    "top_ranking": 50,
    "streak_7days": 100,
    "streak_30days": 500,
    "share_insight": 20,
    "insight_liked": 10,
    "daily_login": 3,
    "first_analysis": 30,
    "level_up": 50,
    "challenge_complete": 100,
    # 커뮤니티 활동
    "post_create": 15,       # 게시글 작성
    "comment_create": 5,     # 댓글 작성
    "post_liked": 3,         # 게시글 좋아요 받음
}

LEVEL_THRESHOLDS = [
    (0, "Bronze", "🥉"),
    (500, "Silver", "🥈"),
    (2000, "Gold", "🥇"),
    (5000, "Platinum", "💎"),
    (10000, "Diamond", "👑"),
    (25000, "Master", "🏆"),
]


def get_level_info(points: int) -> Dict:
    """포인트에 따른 레벨 정보 반환"""
    level = 1
    level_name = "Bronze"
    level_icon = "🥉"
    next_level_points = 500

    for i, (threshold, name, icon) in enumerate(LEVEL_THRESHOLDS):
        if points >= threshold:
            level = i + 1
            level_name = name
            level_icon = icon
            if i + 1 < len(LEVEL_THRESHOLDS):
                next_level_points = LEVEL_THRESHOLDS[i + 1][0]
            else:
                next_level_points = None

    return {
        "level": level,
        "level_name": level_name,
        "level_icon": level_icon,
        "next_level_points": next_level_points,
        "progress_to_next": (points - LEVEL_THRESHOLDS[level-1][0]) / (next_level_points - LEVEL_THRESHOLDS[level-1][0]) * 100 if next_level_points else 100
    }


def add_points(user_id: int, action_type: str, description: str = None, metadata: dict = None) -> Dict:
    """포인트 추가"""
    points = POINT_VALUES.get(action_type, 0)
    if points == 0:
        return {"success": False, "message": "Unknown action type"}

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # 사용자 포인트 조회 또는 생성
        cursor.execute("SELECT * FROM user_points WHERE user_id = ?", (user_id,))
        user_points = cursor.fetchone()

        today = datetime.now().date().isoformat()

        if user_points:
            old_level = user_points['level']
            new_total = user_points['total_points'] + points
            new_weekly = user_points['weekly_points'] + points
            new_monthly = user_points['monthly_points'] + points

            # 연속 접속 체크
            streak = user_points['streak_days']
            last_activity = user_points['last_activity_date']
            if last_activity:
                last_date = datetime.fromisoformat(last_activity).date()
                today_date = datetime.now().date()
                if (today_date - last_date).days == 1:
                    streak += 1
                elif (today_date - last_date).days > 1:
                    streak = 1
            else:
                streak = 1

            level_info = get_level_info(new_total)

            cursor.execute("""
                UPDATE user_points
                SET total_points = ?, weekly_points = ?, monthly_points = ?,
                    level = ?, level_name = ?, streak_days = ?,
                    last_activity_date = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            """, (new_total, new_weekly, new_monthly,
                  level_info['level'], level_info['level_name'], streak,
                  today, user_id))

            leveled_up = level_info['level'] > old_level
        else:
            level_info = get_level_info(points)
            cursor.execute("""
                INSERT INTO user_points (user_id, total_points, weekly_points, monthly_points,
                                        level, level_name, streak_days, last_activity_date)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            """, (user_id, points, points, points,
                  level_info['level'], level_info['level_name'], today))
            leveled_up = False
            new_total = points

        # 포인트 이력 기록
        cursor.execute("""
            INSERT INTO point_history (user_id, points, action_type, description, metadata)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, points, action_type, description, json.dumps(metadata) if metadata else None))

        conn.commit()

        return {
            "success": True,
            "points_earned": points,
            "total_points": new_total,
            "level_info": level_info,
            "leveled_up": leveled_up
        }
    except Exception as e:
        logger.error(f"Error adding points: {e}")
        return {"success": False, "message": str(e)}
    finally:
        conn.close()


def get_user_points(user_id: int) -> Optional[Dict]:
    """사용자 포인트 정보 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM user_points WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()

    if row:
        result = dict(row)
        result['level_info'] = get_level_info(result['total_points'])
        return result
    return None


def get_leaderboard(period: str = "weekly", limit: int = 20) -> List[Dict]:
    """리더보드 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    if period == "weekly":
        order_by = "weekly_points"
    elif period == "monthly":
        order_by = "monthly_points"
    else:
        order_by = "total_points"

    # user_points 테이블만 조회 (users 테이블은 다른 DB에 있음)
    cursor.execute(f"""
        SELECT * FROM user_points
        ORDER BY {order_by} DESC
        LIMIT ?
    """, (limit,))

    rows = cursor.fetchall()
    conn.close()

    result = []
    for i, row in enumerate(rows):
        data = dict(row)
        data['rank'] = i + 1
        data['level_info'] = get_level_info(data['total_points'])
        # 익명 처리 (user_id 기반)
        data['masked_name'] = f"블로거{data['user_id'] % 10000:04d}"
        result.append(data)

    return result


def reset_weekly_points():
    """주간 포인트 리셋 (매주 월요일 실행)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE user_points SET weekly_points = 0")
    conn.commit()
    conn.close()


def reset_monthly_points():
    """월간 포인트 리셋 (매월 1일 실행)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE user_points SET monthly_points = 0")
    conn.commit()
    conn.close()


# ============ 활동 피드 ============

def log_activity(
    user_id: int,
    activity_type: str,
    title: str,
    description: str = None,
    metadata: dict = None,
    points_earned: int = 0,
    user_name: str = None,
    is_public: bool = True
) -> int:
    """활동 로그 기록"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO activity_feed
        (user_id, user_name, activity_type, title, description, metadata, points_earned, is_public)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, user_name, activity_type, title, description,
          json.dumps(metadata) if metadata else None, points_earned, is_public))

    activity_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return activity_id


def get_activity_feed(limit: int = 50, offset: int = 0) -> List[Dict]:
    """공개 활동 피드 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM activity_feed
        WHERE is_public = TRUE
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    """, (limit, offset))

    rows = cursor.fetchall()
    conn.close()

    result = []
    for row in rows:
        data = dict(row)
        if data.get('metadata'):
            data['metadata'] = json.loads(data['metadata'])
        # 이름 마스킹
        if data.get('user_name'):
            name = data['user_name']
            if len(name) > 1:
                data['masked_name'] = name[0] + '*' * (len(name) - 1)
            else:
                data['masked_name'] = name
        else:
            data['masked_name'] = '익명'
        result.append(data)

    return result


def get_active_users_count() -> int:
    """현재 활성 사용자 수 (최근 5분 내 활동)"""
    conn = get_db_connection()
    cursor = conn.cursor()

    five_min_ago = (datetime.now() - timedelta(minutes=5)).isoformat()
    cursor.execute("""
        SELECT COUNT(DISTINCT user_id) as count
        FROM activity_feed
        WHERE created_at >= ?
    """, (five_min_ago,))

    result = cursor.fetchone()
    conn.close()

    return result['count'] if result else 0


# ============ 인사이트 게시판 ============

def create_insight(
    user_id: int,
    content: str,
    category: str = "general",
    is_anonymous: bool = True
) -> int:
    """인사이트 작성"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 사용자 레벨 조회
    cursor.execute("SELECT level_name FROM user_points WHERE user_id = ?", (user_id,))
    user_point = cursor.fetchone()
    user_level = user_point['level_name'] if user_point else "Bronze"

    cursor.execute("""
        INSERT INTO insights (user_id, user_level, content, category, is_anonymous)
        VALUES (?, ?, ?, ?, ?)
    """, (user_id, user_level, content, category, is_anonymous))

    insight_id = cursor.lastrowid
    conn.commit()
    conn.close()

    # 포인트 추가
    add_points(user_id, "share_insight", f"인사이트 공유: {content[:30]}...")

    return insight_id


def get_insights(
    category: str = None,
    limit: int = 20,
    offset: int = 0,
    sort_by: str = "recent"
) -> List[Dict]:
    """인사이트 목록 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM insights WHERE is_approved = TRUE"
    params = []

    if category:
        query += " AND category = ?"
        params.append(category)

    if sort_by == "popular":
        query += " ORDER BY likes DESC, created_at DESC"
    else:
        query += " ORDER BY created_at DESC"

    query += " LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def like_insight(insight_id: int, user_id: int) -> Dict:
    """인사이트 좋아요"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT INTO insight_likes (insight_id, user_id)
            VALUES (?, ?)
        """, (insight_id, user_id))

        cursor.execute("""
            UPDATE insights SET likes = likes + 1 WHERE id = ?
        """, (insight_id,))

        # 인사이트 작성자에게 포인트 추가
        cursor.execute("SELECT user_id FROM insights WHERE id = ?", (insight_id,))
        insight = cursor.fetchone()
        if insight:
            add_points(insight['user_id'], "insight_liked", "인사이트 좋아요 받음")

        conn.commit()
        return {"success": True, "message": "좋아요 완료"}
    except sqlite3.IntegrityError:
        return {"success": False, "message": "이미 좋아요한 인사이트입니다"}
    finally:
        conn.close()


def add_insight_comment(
    insight_id: int,
    user_id: int,
    content: str,
    is_anonymous: bool = True
) -> int:
    """인사이트 댓글 작성"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 사용자 레벨 조회
    cursor.execute("SELECT level_name FROM user_points WHERE user_id = ?", (user_id,))
    user_point = cursor.fetchone()
    user_level = user_point['level_name'] if user_point else "Bronze"

    cursor.execute("""
        INSERT INTO insight_comments (insight_id, user_id, user_level, content, is_anonymous)
        VALUES (?, ?, ?, ?, ?)
    """, (insight_id, user_id, user_level, content, is_anonymous))

    comment_id = cursor.lastrowid

    cursor.execute("""
        UPDATE insights SET comments_count = comments_count + 1 WHERE id = ?
    """, (insight_id,))

    conn.commit()
    conn.close()

    return comment_id


def get_insight_comments(insight_id: int) -> List[Dict]:
    """인사이트 댓글 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM insight_comments
        WHERE insight_id = ?
        ORDER BY created_at ASC
    """, (insight_id,))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


# ============ 키워드 트렌드 ============

def update_keyword_trend(keyword: str, user_id: int = None) -> Dict:
    """키워드 트렌드 업데이트"""
    conn = get_db_connection()
    cursor = conn.cursor()

    today = datetime.now().date().isoformat()

    # 오늘 해당 키워드 조회
    cursor.execute("""
        SELECT * FROM keyword_trends WHERE keyword = ? AND date = ?
    """, (keyword, today))
    existing = cursor.fetchone()

    if existing:
        cursor.execute("""
            UPDATE keyword_trends
            SET search_count = search_count + 1,
                trend_score = search_count + 1
            WHERE keyword = ? AND date = ?
        """, (keyword, today))
    else:
        # 어제 트렌드 점수 조회
        yesterday = (datetime.now() - timedelta(days=1)).date().isoformat()
        cursor.execute("""
            SELECT trend_score FROM keyword_trends WHERE keyword = ? AND date = ?
        """, (keyword, yesterday))
        prev = cursor.fetchone()
        prev_score = prev['trend_score'] if prev else 0

        cursor.execute("""
            INSERT INTO keyword_trends (keyword, search_count, user_count, trend_score, prev_trend_score, date)
            VALUES (?, 1, 1, 1, ?, ?)
        """, (keyword, prev_score, today))

    conn.commit()
    conn.close()

    return {"keyword": keyword, "updated": True}


def get_trending_keywords(limit: int = 10) -> List[Dict]:
    """실시간 트렌딩 키워드 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    today = datetime.now().date().isoformat()
    yesterday = (datetime.now() - timedelta(days=1)).date().isoformat()

    cursor.execute("""
        SELECT
            t.keyword,
            t.search_count,
            t.trend_score,
            COALESCE(y.trend_score, 0) as prev_score,
            CASE
                WHEN COALESCE(y.trend_score, 0) > 0
                THEN ((t.trend_score - COALESCE(y.trend_score, 0)) / COALESCE(y.trend_score, 1)) * 100
                ELSE 100
            END as change_percent
        FROM keyword_trends t
        LEFT JOIN keyword_trends y ON t.keyword = y.keyword AND y.date = ?
        WHERE t.date = ?
        ORDER BY t.trend_score DESC
        LIMIT ?
    """, (yesterday, today, limit))

    rows = cursor.fetchall()
    conn.close()

    result = []
    for i, row in enumerate(rows):
        data = dict(row)
        data['rank'] = i + 1
        data['is_hot'] = data['change_percent'] > 50
        result.append(data)

    return result


def recommend_keyword(user_id: int, keyword: str, reason: str) -> int:
    """키워드 추천"""
    conn = get_db_connection()
    cursor = conn.cursor()

    today = datetime.now().date().isoformat()

    cursor.execute("""
        INSERT OR REPLACE INTO keyword_trends
        (keyword, search_count, trend_score, recommended_by, recommendation_reason, date)
        VALUES (?, 1, 10, ?, ?, ?)
    """, (keyword, user_id, reason, today))

    trend_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return trend_id


# ============ 상위노출 성공 ============

def log_ranking_success(
    user_id: int,
    keyword: str,
    new_rank: int,
    prev_rank: int = None,
    blog_id: str = None,
    post_url: str = None,
    user_name: str = None
) -> int:
    """상위노출 성공 기록"""
    conn = get_db_connection()
    cursor = conn.cursor()

    is_new_entry = prev_rank is None or prev_rank > 10

    # 연속 일수 확인
    cursor.execute("""
        SELECT consecutive_days FROM ranking_success
        WHERE user_id = ? AND keyword = ?
        ORDER BY created_at DESC LIMIT 1
    """, (user_id, keyword))
    prev_record = cursor.fetchone()
    consecutive = (prev_record['consecutive_days'] + 1) if prev_record else 1

    cursor.execute("""
        INSERT INTO ranking_success
        (user_id, user_name, blog_id, keyword, prev_rank, new_rank, post_url, is_new_entry, consecutive_days)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, user_name, blog_id, keyword, prev_rank, new_rank, post_url, is_new_entry, consecutive))

    success_id = cursor.lastrowid

    # 상위노출 횟수 업데이트
    cursor.execute("""
        UPDATE user_points SET top_ranking_count = top_ranking_count + 1
        WHERE user_id = ?
    """, (user_id,))

    conn.commit()
    conn.close()

    # 포인트 추가
    add_points(user_id, "top_ranking", f"'{keyword}' 키워드 {new_rank}위 달성!")

    # 활동 피드에 기록
    log_activity(
        user_id=user_id,
        activity_type="ranking_success",
        title=f"'{keyword}' 상위노출 성공!",
        description=f"{new_rank}위 달성" + (f" (이전 {prev_rank}위)" if prev_rank else " (신규 진입)"),
        metadata={"keyword": keyword, "rank": new_rank, "prev_rank": prev_rank},
        points_earned=POINT_VALUES["top_ranking"],
        user_name=user_name
    )

    return success_id


def get_ranking_successes(limit: int = 20, today_only: bool = False) -> List[Dict]:
    """상위노출 성공 목록 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    query = """
        SELECT * FROM ranking_success
        WHERE is_public = TRUE
    """
    params = []

    if today_only:
        today = datetime.now().date().isoformat()
        query += " AND DATE(created_at) = ?"
        params.append(today)

    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    result = []
    for row in rows:
        data = dict(row)
        # 이름 마스킹
        if data.get('user_name'):
            name = data['user_name']
            if len(name) > 1:
                data['masked_name'] = name[0] + '*' * (len(name) - 1)
            else:
                data['masked_name'] = name
        else:
            data['masked_name'] = '익명'
        result.append(data)

    return result


def get_today_success_count() -> int:
    """오늘 상위노출 성공 수"""
    conn = get_db_connection()
    cursor = conn.cursor()

    today = datetime.now().date().isoformat()
    cursor.execute("""
        SELECT COUNT(*) as count FROM ranking_success
        WHERE DATE(created_at) = ?
    """, (today,))

    result = cursor.fetchone()
    conn.close()

    return result['count'] if result else 0


# ============ 통계 ============

def get_platform_stats() -> Dict:
    """플랫폼 전체 통계"""
    conn = get_db_connection()
    cursor = conn.cursor()

    today = datetime.now().date().isoformat()

    # 오늘 키워드 검색 수
    cursor.execute("""
        SELECT COUNT(*) as count FROM activity_feed
        WHERE activity_type = 'keyword_search' AND DATE(created_at) = ?
    """, (today,))
    keyword_searches = cursor.fetchone()['count']

    # 오늘 블로그 분석 수
    cursor.execute("""
        SELECT COUNT(*) as count FROM activity_feed
        WHERE activity_type = 'blog_analysis' AND DATE(created_at) = ?
    """, (today,))
    blog_analyses = cursor.fetchone()['count']

    # 오늘 상위노출 성공 수
    cursor.execute("""
        SELECT COUNT(*) as count FROM ranking_success
        WHERE DATE(created_at) = ?
    """, (today,))
    ranking_successes = cursor.fetchone()['count']

    # 활성 사용자 수
    active_users = get_active_users_count()

    # 인기 키워드
    trending = get_trending_keywords(1)
    hot_keyword = trending[0]['keyword'] if trending else None

    conn.close()

    return {
        "keyword_searches": keyword_searches,
        "blog_analyses": blog_analyses,
        "ranking_successes": ranking_successes,
        "active_users": active_users,
        "hot_keyword": hot_keyword
    }


# ============ 게시판 ============

def init_post_tables():
    """게시판 테이블 초기화"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 게시글 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            user_name VARCHAR(100),
            title VARCHAR(200) NOT NULL,
            content TEXT NOT NULL,
            category VARCHAR(50) DEFAULT 'free',
            tags TEXT,
            views INTEGER DEFAULT 0,
            likes INTEGER DEFAULT 0,
            comments_count INTEGER DEFAULT 0,
            is_pinned BOOLEAN DEFAULT FALSE,
            is_deleted BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 게시글 좋아요 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS post_likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(post_id, user_id)
        )
    """)

    # 게시글 댓글 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS post_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            user_name VARCHAR(100),
            content TEXT NOT NULL,
            parent_id INTEGER,
            is_deleted BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES posts(id)
        )
    """)

    # 인덱스
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id)")

    conn.commit()
    conn.close()


def create_post(
    user_id: int,
    title: str,
    content: str,
    category: str = "free",
    tags: list = None
) -> int:
    """게시글 작성"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 사용자 이름 조회 (마스킹)
    cursor.execute("SELECT level_name FROM user_points WHERE user_id = ?", (user_id,))
    user_point = cursor.fetchone()
    user_level = user_point['level_name'] if user_point else "Bronze"

    tags_json = json.dumps(tags) if tags else None

    cursor.execute("""
        INSERT INTO posts (user_id, user_name, title, content, category, tags)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (user_id, user_level, title, content, category, tags_json))

    post_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return post_id


def get_posts(
    category: str = None,
    sort_by: str = "recent",
    limit: int = 20,
    offset: int = 0,
    search: str = None
) -> list:
    """게시글 목록 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM posts WHERE is_deleted = FALSE"
    params = []

    if category:
        query += " AND category = ?"
        params.append(category)

    if search:
        query += " AND (title LIKE ? OR content LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])

    # 정렬
    if sort_by == "popular":
        query += " ORDER BY likes DESC, created_at DESC"
    elif sort_by == "comments":
        query += " ORDER BY comments_count DESC, created_at DESC"
    else:  # recent
        query += " ORDER BY is_pinned DESC, created_at DESC"

    query += " LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    result = []
    for row in rows:
        data = dict(row)
        data['tags'] = json.loads(data['tags']) if data.get('tags') else []
        # 마스킹된 사용자 ID 생성
        data['author'] = f"블로거{data['user_id'] % 10000:04d}"
        result.append(data)

    return result


def get_post(post_id: int, user_id: int = None) -> dict:
    """게시글 상세 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM posts WHERE id = ? AND is_deleted = FALSE", (post_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return None

    # 조회수 증가
    cursor.execute("UPDATE posts SET views = views + 1 WHERE id = ?", (post_id,))
    conn.commit()

    data = dict(row)
    data['tags'] = json.loads(data['tags']) if data.get('tags') else []
    data['author'] = f"블로거{data['user_id'] % 10000:04d}"
    data['is_mine'] = user_id == data['user_id'] if user_id else False

    # 좋아요 여부
    if user_id:
        cursor.execute("SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?", (post_id, user_id))
        data['is_liked'] = cursor.fetchone() is not None
    else:
        data['is_liked'] = False

    conn.close()
    return data


def update_post(post_id: int, update_data: dict) -> bool:
    """게시글 수정"""
    conn = get_db_connection()
    cursor = conn.cursor()

    if 'tags' in update_data and isinstance(update_data['tags'], list):
        update_data['tags'] = json.dumps(update_data['tags'])

    update_data['updated_at'] = datetime.now().isoformat()

    set_clause = ", ".join([f"{k} = ?" for k in update_data.keys()])
    values = list(update_data.values()) + [post_id]

    cursor.execute(f"UPDATE posts SET {set_clause} WHERE id = ?", values)
    conn.commit()
    conn.close()

    return True


def delete_post(post_id: int) -> bool:
    """게시글 삭제 (소프트 삭제)"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("UPDATE posts SET is_deleted = TRUE WHERE id = ?", (post_id,))
    conn.commit()
    conn.close()

    return True


def like_post(post_id: int, user_id: int) -> dict:
    """게시글 좋아요 토글"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 이미 좋아요 했는지 확인
    cursor.execute("SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?", (post_id, user_id))
    existing = cursor.fetchone()

    if existing:
        # 좋아요 취소
        cursor.execute("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?", (post_id, user_id))
        cursor.execute("UPDATE posts SET likes = likes - 1 WHERE id = ?", (post_id,))
        result = {"success": True, "liked": False, "message": "좋아요 취소"}
    else:
        # 좋아요
        cursor.execute("INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)", (post_id, user_id))
        cursor.execute("UPDATE posts SET likes = likes + 1 WHERE id = ?", (post_id,))
        result = {"success": True, "liked": True, "message": "좋아요 완료"}

    conn.commit()
    conn.close()

    return result


def create_post_comment(post_id: int, user_id: int, content: str, parent_id: int = None) -> int:
    """게시글 댓글 작성"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO post_comments (post_id, user_id, content, parent_id)
        VALUES (?, ?, ?, ?)
    """, (post_id, user_id, content, parent_id))

    comment_id = cursor.lastrowid

    # 댓글 수 증가
    cursor.execute("UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?", (post_id,))

    conn.commit()
    conn.close()

    return comment_id


def get_post_comments(post_id: int) -> list:
    """게시글 댓글 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM post_comments
        WHERE post_id = ? AND is_deleted = FALSE
        ORDER BY created_at ASC
    """, (post_id,))

    rows = cursor.fetchall()
    conn.close()

    result = []
    for row in rows:
        data = dict(row)
        data['author'] = f"블로거{data['user_id'] % 10000:04d}"
        result.append(data)

    return result


# 초기화
init_community_tables()
init_post_tables()
