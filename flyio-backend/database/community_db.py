"""
커뮤니티 기능 데이터베이스
- Supabase 우선 사용 (영구 저장)
- SQLite 폴백 (로컬 개발용)

Tables:
- posts: 게시글
- post_likes: 게시글 좋아요
- post_comments: 게시글 댓글
- user_points: 사용자 포인트
- activity_feed: 활동 피드
- keyword_trends: 키워드 트렌드
- ranking_success: 상위노출 성공
"""
import sqlite3
import json
import os
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# ============ Supabase 설정 ============
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_KEY)

# Supabase 클라이언트
_supabase_client = None

def get_supabase():
    """Supabase 클라이언트 반환"""
    global _supabase_client
    if not USE_SUPABASE:
        return None
    if _supabase_client is None:
        try:
            from supabase import create_client
            _supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
            logger.info("✅ Supabase client initialized for community")
        except Exception as e:
            logger.error(f"Failed to initialize Supabase: {e}")
            return None
    return _supabase_client

# ============ SQLite 폴백 설정 ============
import sys
if sys.platform == "win32":
    DATA_DIR = Path(os.environ.get("DATA_DIR", Path(os.path.dirname(__file__)).parent / "data"))
else:
    DATA_DIR = Path("/data") if Path("/data").exists() else Path("./data")
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "community.db"


def get_db_connection():
    """SQLite DB 연결 (폴백용)"""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


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
    "post_create": 15,
    "comment_create": 5,
    "post_liked": 3,
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


# ============ 게시판 (Supabase 우선) ============

def create_post(
    user_id: int,
    title: str,
    content: str,
    category: str = "free",
    tags: list = None
) -> int:
    """게시글 작성"""
    supabase = get_supabase()

    if supabase:
        try:
            response = supabase.table("posts").insert({
                "user_id": user_id,
                "title": title,
                "content": content,
                "category": category,
                "tags": tags or []
            }).execute()

            if response.data:
                post_id = response.data[0]["id"]
                logger.info(f"[Supabase] Post created: {post_id}")
                # 포인트 추가
                add_points(user_id, "post_create", f"게시글 작성: {title[:20]}...")
                return post_id
        except Exception as e:
            logger.error(f"[Supabase] create_post error: {e}")

    # SQLite 폴백
    conn = get_db_connection()
    cursor = conn.cursor()

    tags_json = json.dumps(tags) if tags else None

    cursor.execute("""
        INSERT INTO posts (user_id, title, content, category, tags)
        VALUES (?, ?, ?, ?, ?)
    """, (user_id, title, content, category, tags_json))

    post_id = cursor.lastrowid
    conn.commit()
    conn.close()

    add_points(user_id, "post_create", f"게시글 작성: {title[:20]}...")
    return post_id


def get_posts(
    category: str = None,
    sort_by: str = "recent",
    limit: int = 20,
    offset: int = 0,
    search: str = None
) -> list:
    """게시글 목록 조회"""
    supabase = get_supabase()

    if supabase:
        try:
            query = supabase.table("posts").select("*").eq("is_deleted", False)

            if category:
                query = query.eq("category", category)

            if search:
                query = query.or_(f"title.ilike.%{search}%,content.ilike.%{search}%")

            # 정렬
            if sort_by == "popular":
                query = query.order("likes", desc=True).order("created_at", desc=True)
            elif sort_by == "comments":
                query = query.order("comments_count", desc=True).order("created_at", desc=True)
            else:
                query = query.order("is_pinned", desc=True).order("created_at", desc=True)

            response = query.range(offset, offset + limit - 1).execute()

            if response.data:
                result = []
                for row in response.data:
                    row['author'] = f"블로거{row['user_id'] % 10000:04d}"
                    if isinstance(row.get('tags'), str):
                        row['tags'] = json.loads(row['tags'])
                    result.append(row)
                return result
        except Exception as e:
            logger.error(f"[Supabase] get_posts error: {e}")

    # SQLite 폴백
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

    if sort_by == "popular":
        query += " ORDER BY likes DESC, created_at DESC"
    elif sort_by == "comments":
        query += " ORDER BY comments_count DESC, created_at DESC"
    else:
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
        data['author'] = f"블로거{data['user_id'] % 10000:04d}"
        result.append(data)

    return result


def get_post(post_id: int, user_id: int = None) -> dict:
    """게시글 상세 조회"""
    supabase = get_supabase()

    if supabase:
        try:
            response = supabase.table("posts").select("*").eq("id", post_id).eq("is_deleted", False).execute()

            if response.data:
                # 조회수 증가
                supabase.table("posts").update({"views": response.data[0]["views"] + 1}).eq("id", post_id).execute()

                data = response.data[0]
                data['author'] = f"블로거{data['user_id'] % 10000:04d}"
                data['is_mine'] = user_id == data['user_id'] if user_id else False

                # 좋아요 여부
                if user_id:
                    like_check = supabase.table("post_likes").select("id").eq("post_id", post_id).eq("user_id", user_id).execute()
                    data['is_liked'] = len(like_check.data) > 0
                else:
                    data['is_liked'] = False

                return data
        except Exception as e:
            logger.error(f"[Supabase] get_post error: {e}")

    # SQLite 폴백
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM posts WHERE id = ? AND is_deleted = FALSE", (post_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return None

    cursor.execute("UPDATE posts SET views = views + 1 WHERE id = ?", (post_id,))
    conn.commit()

    data = dict(row)
    data['tags'] = json.loads(data['tags']) if data.get('tags') else []
    data['author'] = f"블로거{data['user_id'] % 10000:04d}"
    data['is_mine'] = user_id == data['user_id'] if user_id else False

    if user_id:
        cursor.execute("SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?", (post_id, user_id))
        data['is_liked'] = cursor.fetchone() is not None
    else:
        data['is_liked'] = False

    conn.close()
    return data


def update_post(post_id: int, update_data: dict) -> bool:
    """게시글 수정"""
    supabase = get_supabase()

    if supabase:
        try:
            if 'tags' in update_data and isinstance(update_data['tags'], list):
                pass  # Supabase는 JSONB 지원

            update_data['updated_at'] = datetime.now().isoformat()

            response = supabase.table("posts").update(update_data).eq("id", post_id).execute()
            return len(response.data) > 0
        except Exception as e:
            logger.error(f"[Supabase] update_post error: {e}")

    # SQLite 폴백
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
    supabase = get_supabase()

    if supabase:
        try:
            response = supabase.table("posts").update({"is_deleted": True}).eq("id", post_id).execute()
            return len(response.data) > 0
        except Exception as e:
            logger.error(f"[Supabase] delete_post error: {e}")

    # SQLite 폴백
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE posts SET is_deleted = TRUE WHERE id = ?", (post_id,))
    conn.commit()
    conn.close()
    return True


def like_post(post_id: int, user_id: int) -> dict:
    """게시글 좋아요 토글"""
    supabase = get_supabase()

    if supabase:
        try:
            # RPC 함수 사용 (있으면)
            try:
                response = supabase.rpc("toggle_post_like", {"p_post_id": post_id, "p_user_id": user_id}).execute()
                if response.data:
                    return {"success": True, **response.data}
            except:
                pass

            # 수동 처리
            existing = supabase.table("post_likes").select("id").eq("post_id", post_id).eq("user_id", user_id).execute()

            if existing.data:
                supabase.table("post_likes").delete().eq("post_id", post_id).eq("user_id", user_id).execute()
                supabase.rpc("decrement_post_likes", {"p_post_id": post_id}).execute()
                return {"success": True, "liked": False, "message": "좋아요 취소"}
            else:
                supabase.table("post_likes").insert({"post_id": post_id, "user_id": user_id}).execute()
                # likes 증가
                post = supabase.table("posts").select("likes").eq("id", post_id).execute()
                if post.data:
                    supabase.table("posts").update({"likes": post.data[0]["likes"] + 1}).eq("id", post_id).execute()
                return {"success": True, "liked": True, "message": "좋아요 완료"}
        except Exception as e:
            logger.error(f"[Supabase] like_post error: {e}")

    # SQLite 폴백
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?", (post_id, user_id))
    existing = cursor.fetchone()

    if existing:
        cursor.execute("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?", (post_id, user_id))
        cursor.execute("UPDATE posts SET likes = likes - 1 WHERE id = ?", (post_id,))
        result = {"success": True, "liked": False, "message": "좋아요 취소"}
    else:
        cursor.execute("INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)", (post_id, user_id))
        cursor.execute("UPDATE posts SET likes = likes + 1 WHERE id = ?", (post_id,))
        result = {"success": True, "liked": True, "message": "좋아요 완료"}

    conn.commit()
    conn.close()
    return result


def create_post_comment(post_id: int, user_id: int, content: str, parent_id: int = None) -> int:
    """게시글 댓글 작성"""
    supabase = get_supabase()

    if supabase:
        try:
            response = supabase.table("post_comments").insert({
                "post_id": post_id,
                "user_id": user_id,
                "content": content,
                "parent_id": parent_id
            }).execute()

            if response.data:
                # 댓글 수 증가
                post = supabase.table("posts").select("comments_count").eq("id", post_id).execute()
                if post.data:
                    supabase.table("posts").update({"comments_count": post.data[0]["comments_count"] + 1}).eq("id", post_id).execute()

                add_points(user_id, "comment_create", "댓글 작성")
                return response.data[0]["id"]
        except Exception as e:
            logger.error(f"[Supabase] create_post_comment error: {e}")

    # SQLite 폴백
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO post_comments (post_id, user_id, content, parent_id)
        VALUES (?, ?, ?, ?)
    """, (post_id, user_id, content, parent_id))

    comment_id = cursor.lastrowid
    cursor.execute("UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?", (post_id,))

    conn.commit()
    conn.close()

    add_points(user_id, "comment_create", "댓글 작성")
    return comment_id


def get_post_comments(post_id: int) -> list:
    """게시글 댓글 조회"""
    supabase = get_supabase()

    if supabase:
        try:
            response = supabase.table("post_comments").select("*").eq("post_id", post_id).eq("is_deleted", False).order("created_at").execute()

            if response.data:
                result = []
                for row in response.data:
                    row['author'] = f"블로거{row['user_id'] % 10000:04d}"
                    result.append(row)
                return result
        except Exception as e:
            logger.error(f"[Supabase] get_post_comments error: {e}")

    # SQLite 폴백
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


# ============ 포인트 시스템 (Supabase 우선) ============

def add_points(user_id: int, action_type: str, description: str = None, metadata: dict = None) -> Dict:
    """포인트 추가"""
    points = POINT_VALUES.get(action_type, 0)
    if points == 0:
        return {"success": False, "message": "Unknown action type"}

    supabase = get_supabase()

    if supabase:
        try:
            # RPC 함수 사용
            response = supabase.rpc("add_user_points", {
                "p_user_id": user_id,
                "p_points": points,
                "p_action_type": action_type,
                "p_description": description
            }).execute()

            if response.data:
                return response.data
        except Exception as e:
            logger.warning(f"[Supabase] add_points RPC failed, using manual: {e}")

            # 수동 처리
            try:
                # 기존 포인트 조회
                existing = supabase.table("user_points").select("*").eq("user_id", user_id).execute()

                if existing.data:
                    old = existing.data[0]
                    new_total = old['total_points'] + points
                    level_info = get_level_info(new_total)

                    supabase.table("user_points").update({
                        "total_points": new_total,
                        "weekly_points": old['weekly_points'] + points,
                        "monthly_points": old['monthly_points'] + points,
                        "level": level_info['level'],
                        "level_name": level_info['level_name'],
                        "last_activity_date": datetime.now().date().isoformat()
                    }).eq("user_id", user_id).execute()
                else:
                    level_info = get_level_info(points)
                    supabase.table("user_points").insert({
                        "user_id": user_id,
                        "total_points": points,
                        "weekly_points": points,
                        "monthly_points": points,
                        "level": level_info['level'],
                        "level_name": level_info['level_name'],
                        "last_activity_date": datetime.now().date().isoformat()
                    }).execute()
                    new_total = points

                # 이력 기록
                supabase.table("point_history").insert({
                    "user_id": user_id,
                    "points": points,
                    "action_type": action_type,
                    "description": description,
                    "metadata": metadata
                }).execute()

                return {
                    "success": True,
                    "points_earned": points,
                    "total_points": new_total,
                    "level_info": get_level_info(new_total)
                }
            except Exception as e2:
                logger.error(f"[Supabase] add_points manual failed: {e2}")

    # SQLite 폴백
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT * FROM user_points WHERE user_id = ?", (user_id,))
        user_points = cursor.fetchone()

        today = datetime.now().date().isoformat()

        if user_points:
            new_total = user_points['total_points'] + points
            new_weekly = user_points['weekly_points'] + points
            new_monthly = user_points['monthly_points'] + points
            level_info = get_level_info(new_total)

            cursor.execute("""
                UPDATE user_points
                SET total_points = ?, weekly_points = ?, monthly_points = ?,
                    level = ?, level_name = ?, last_activity_date = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            """, (new_total, new_weekly, new_monthly, level_info['level'], level_info['level_name'], today, user_id))
        else:
            level_info = get_level_info(points)
            cursor.execute("""
                INSERT INTO user_points (user_id, total_points, weekly_points, monthly_points, level, level_name, streak_days, last_activity_date)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            """, (user_id, points, points, points, level_info['level'], level_info['level_name'], today))
            new_total = points

        cursor.execute("""
            INSERT INTO point_history (user_id, points, action_type, description, metadata)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, points, action_type, description, json.dumps(metadata) if metadata else None))

        conn.commit()

        return {
            "success": True,
            "points_earned": points,
            "total_points": new_total,
            "level_info": level_info
        }
    except Exception as e:
        logger.error(f"Error adding points: {e}")
        return {"success": False, "message": str(e)}
    finally:
        conn.close()


def get_user_points(user_id: int) -> Optional[Dict]:
    """사용자 포인트 정보 조회"""
    supabase = get_supabase()

    if supabase:
        try:
            response = supabase.table("user_points").select("*").eq("user_id", user_id).execute()
            if response.data:
                result = response.data[0]
                result['level_info'] = get_level_info(result['total_points'])
                return result
        except Exception as e:
            logger.error(f"[Supabase] get_user_points error: {e}")

    # SQLite 폴백
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
    supabase = get_supabase()

    if period == "weekly":
        order_by = "weekly_points"
    elif period == "monthly":
        order_by = "monthly_points"
    else:
        order_by = "total_points"

    if supabase:
        try:
            response = supabase.table("user_points").select("*").order(order_by, desc=True).limit(limit).execute()

            if response.data:
                result = []
                for i, row in enumerate(response.data):
                    row['rank'] = i + 1
                    row['level_info'] = get_level_info(row['total_points'])
                    row['masked_name'] = f"블로거{row['user_id'] % 10000:04d}"
                    result.append(row)
                return result
        except Exception as e:
            logger.error(f"[Supabase] get_leaderboard error: {e}")

    # SQLite 폴백
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(f"SELECT * FROM user_points ORDER BY {order_by} DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()

    result = []
    for i, row in enumerate(rows):
        data = dict(row)
        data['rank'] = i + 1
        data['level_info'] = get_level_info(data['total_points'])
        data['masked_name'] = f"블로거{data['user_id'] % 10000:04d}"
        result.append(data)

    return result


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
    supabase = get_supabase()

    if supabase:
        try:
            response = supabase.table("activity_feed").insert({
                "user_id": user_id,
                "user_name": user_name,
                "activity_type": activity_type,
                "title": title,
                "description": description,
                "metadata": metadata,
                "points_earned": points_earned,
                "is_public": is_public
            }).execute()

            if response.data:
                return response.data[0]["id"]
        except Exception as e:
            logger.error(f"[Supabase] log_activity error: {e}")

    # SQLite 폴백
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
    supabase = get_supabase()

    if supabase:
        try:
            response = supabase.table("activity_feed").select("*").eq("is_public", True).order("created_at", desc=True).range(offset, offset + limit - 1).execute()

            if response.data:
                result = []
                for row in response.data:
                    if row.get('user_name'):
                        name = row['user_name']
                        row['masked_name'] = name[0] + '*' * (len(name) - 1) if len(name) > 1 else name
                    else:
                        row['masked_name'] = '익명'
                    result.append(row)
                return result
        except Exception as e:
            logger.error(f"[Supabase] get_activity_feed error: {e}")

    # SQLite 폴백
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
        if data.get('user_name'):
            name = data['user_name']
            data['masked_name'] = name[0] + '*' * (len(name) - 1) if len(name) > 1 else name
        else:
            data['masked_name'] = '익명'
        result.append(data)

    return result


def get_active_users_count() -> int:
    """현재 활성 사용자 수 (최근 5분 내 활동)"""
    supabase = get_supabase()
    five_min_ago = (datetime.now() - timedelta(minutes=5)).isoformat()

    if supabase:
        try:
            response = supabase.table("activity_feed").select("user_id", count="exact").gte("created_at", five_min_ago).execute()
            # 유니크 카운트는 별도 처리 필요
            if response.data:
                unique_users = set(r['user_id'] for r in response.data)
                return len(unique_users)
        except Exception as e:
            logger.error(f"[Supabase] get_active_users_count error: {e}")

    # SQLite 폴백
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT COUNT(DISTINCT user_id) as count
        FROM activity_feed
        WHERE created_at >= ?
    """, (five_min_ago,))

    result = cursor.fetchone()
    conn.close()

    return result['count'] if result else 0


# ============ 키워드 트렌드 ============

def update_keyword_trend(keyword: str, user_id: int = None) -> Dict:
    """키워드 트렌드 업데이트"""
    today = datetime.now().date().isoformat()
    supabase = get_supabase()

    if supabase:
        try:
            # 오늘 해당 키워드 조회
            existing = supabase.table("keyword_trends").select("*").eq("keyword", keyword).eq("date", today).execute()

            if existing.data:
                supabase.table("keyword_trends").update({
                    "search_count": existing.data[0]["search_count"] + 1,
                    "trend_score": existing.data[0]["search_count"] + 1
                }).eq("keyword", keyword).eq("date", today).execute()
            else:
                supabase.table("keyword_trends").insert({
                    "keyword": keyword,
                    "search_count": 1,
                    "trend_score": 1,
                    "date": today
                }).execute()

            return {"keyword": keyword, "updated": True}
        except Exception as e:
            logger.error(f"[Supabase] update_keyword_trend error: {e}")

    # SQLite 폴백
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM keyword_trends WHERE keyword = ? AND date = ?", (keyword, today))
    existing = cursor.fetchone()

    if existing:
        cursor.execute("""
            UPDATE keyword_trends SET search_count = search_count + 1, trend_score = search_count + 1
            WHERE keyword = ? AND date = ?
        """, (keyword, today))
    else:
        cursor.execute("""
            INSERT INTO keyword_trends (keyword, search_count, trend_score, date)
            VALUES (?, 1, 1, ?)
        """, (keyword, today))

    conn.commit()
    conn.close()

    return {"keyword": keyword, "updated": True}


def get_trending_keywords(limit: int = 10) -> List[Dict]:
    """실시간 트렌딩 키워드 조회"""
    today = datetime.now().date().isoformat()
    supabase = get_supabase()

    if supabase:
        try:
            response = supabase.table("keyword_trends").select("*").eq("date", today).order("trend_score", desc=True).limit(limit).execute()

            if response.data:
                result = []
                for i, row in enumerate(response.data):
                    row['rank'] = i + 1
                    row['is_hot'] = row.get('trend_score', 0) > 10
                    result.append(row)
                return result
        except Exception as e:
            logger.error(f"[Supabase] get_trending_keywords error: {e}")

    # SQLite 폴백
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM keyword_trends
        WHERE date = ?
        ORDER BY trend_score DESC
        LIMIT ?
    """, (today, limit))

    rows = cursor.fetchall()
    conn.close()

    result = []
    for i, row in enumerate(rows):
        data = dict(row)
        data['rank'] = i + 1
        data['is_hot'] = data.get('trend_score', 0) > 10
        result.append(data)

    return result


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
    is_new_entry = prev_rank is None or prev_rank > 10
    supabase = get_supabase()

    if supabase:
        try:
            response = supabase.table("ranking_success").insert({
                "user_id": user_id,
                "user_name": user_name,
                "blog_id": blog_id,
                "keyword": keyword,
                "prev_rank": prev_rank,
                "new_rank": new_rank,
                "post_url": post_url,
                "is_new_entry": is_new_entry
            }).execute()

            if response.data:
                add_points(user_id, "top_ranking", f"'{keyword}' 키워드 {new_rank}위 달성!")
                log_activity(
                    user_id=user_id,
                    activity_type="ranking_success",
                    title=f"'{keyword}' 상위노출 성공!",
                    description=f"{new_rank}위 달성" + (f" (이전 {prev_rank}위)" if prev_rank else " (신규 진입)"),
                    metadata={"keyword": keyword, "rank": new_rank, "prev_rank": prev_rank},
                    points_earned=POINT_VALUES["top_ranking"],
                    user_name=user_name
                )
                return response.data[0]["id"]
        except Exception as e:
            logger.error(f"[Supabase] log_ranking_success error: {e}")

    # SQLite 폴백
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO ranking_success
        (user_id, user_name, blog_id, keyword, prev_rank, new_rank, post_url, is_new_entry)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, user_name, blog_id, keyword, prev_rank, new_rank, post_url, is_new_entry))

    success_id = cursor.lastrowid
    conn.commit()
    conn.close()

    add_points(user_id, "top_ranking", f"'{keyword}' 키워드 {new_rank}위 달성!")
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
    supabase = get_supabase()

    if supabase:
        try:
            query = supabase.table("ranking_success").select("*").eq("is_public", True)

            if today_only:
                today = datetime.now().date().isoformat()
                query = query.gte("created_at", today)

            response = query.order("created_at", desc=True).limit(limit).execute()

            if response.data:
                result = []
                for row in response.data:
                    if row.get('user_name'):
                        name = row['user_name']
                        row['masked_name'] = name[0] + '*' * (len(name) - 1) if len(name) > 1 else name
                    else:
                        row['masked_name'] = '익명'
                    result.append(row)
                return result
        except Exception as e:
            logger.error(f"[Supabase] get_ranking_successes error: {e}")

    # SQLite 폴백
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM ranking_success WHERE is_public = TRUE"
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
        if data.get('user_name'):
            name = data['user_name']
            data['masked_name'] = name[0] + '*' * (len(name) - 1) if len(name) > 1 else name
        else:
            data['masked_name'] = '익명'
        result.append(data)

    return result


def get_today_success_count() -> int:
    """오늘 상위노출 성공 수"""
    today = datetime.now().date().isoformat()
    supabase = get_supabase()

    if supabase:
        try:
            response = supabase.table("ranking_success").select("id", count="exact").gte("created_at", today).execute()
            return response.count or 0
        except Exception as e:
            logger.error(f"[Supabase] get_today_success_count error: {e}")

    # SQLite 폴백
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as count FROM ranking_success WHERE DATE(created_at) = ?", (today,))
    result = cursor.fetchone()
    conn.close()

    return result['count'] if result else 0


# ============ 통계 ============

def get_platform_stats() -> Dict:
    """플랫폼 전체 통계"""
    import random

    today = datetime.now().date().isoformat()
    current_hour = datetime.now().hour
    hour_multiplier = 0.5 + (current_hour / 24) * 1.5

    supabase = get_supabase()

    keyword_searches = 0
    blog_analyses = 0
    ranking_successes = 0
    active_users = 0
    hot_keyword = None

    if supabase:
        try:
            # 오늘 활동 통계
            ks = supabase.table("activity_feed").select("id", count="exact").eq("activity_type", "keyword_search").gte("created_at", today).execute()
            keyword_searches = ks.count or 0

            ba = supabase.table("activity_feed").select("id", count="exact").eq("activity_type", "blog_analysis").gte("created_at", today).execute()
            blog_analyses = ba.count or 0

            rs = supabase.table("ranking_success").select("id", count="exact").gte("created_at", today).execute()
            ranking_successes = rs.count or 0

            active_users = get_active_users_count()

            trending = get_trending_keywords(1)
            hot_keyword = trending[0]['keyword'] if trending else None
        except Exception as e:
            logger.error(f"[Supabase] get_platform_stats error: {e}")
    else:
        # SQLite 폴백
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as count FROM activity_feed WHERE activity_type = 'keyword_search' AND DATE(created_at) = ?", (today,))
        keyword_searches = cursor.fetchone()['count']

        cursor.execute("SELECT COUNT(*) as count FROM activity_feed WHERE activity_type = 'blog_analysis' AND DATE(created_at) = ?", (today,))
        blog_analyses = cursor.fetchone()['count']

        cursor.execute("SELECT COUNT(*) as count FROM ranking_success WHERE DATE(created_at) = ?", (today,))
        ranking_successes = cursor.fetchone()['count']

        active_users = get_active_users_count()

        trending = get_trending_keywords(1)
        hot_keyword = trending[0]['keyword'] if trending else None

        conn.close()

    # 기본값 설정
    if keyword_searches < 10:
        base_searches = int((50 + random.randint(0, 100)) * hour_multiplier)
        keyword_searches = max(keyword_searches, base_searches + random.randint(-10, 30))

    if blog_analyses < 5:
        base_analyses = int((20 + random.randint(0, 60)) * hour_multiplier)
        blog_analyses = max(blog_analyses, base_analyses + random.randint(-5, 15))

    if ranking_successes < 3:
        base_successes = int((5 + random.randint(0, 20)) * hour_multiplier)
        ranking_successes = max(ranking_successes, base_successes + random.randint(-2, 8))

    if not hot_keyword:
        default_keywords = [
            "서울 맛집", "강남 카페", "다이어트 식단", "여행 코스",
            "육아 일기", "재테크 방법", "취미 생활", "홈카페",
            "인테리어 팁", "자기계발", "독서 추천", "영화 리뷰"
        ]
        hot_keyword = random.choice(default_keywords)

    return {
        "keyword_searches": keyword_searches,
        "blog_analyses": blog_analyses,
        "ranking_successes": ranking_successes,
        "active_users": max(active_users, random.randint(3, 15)),
        "hot_keyword": hot_keyword
    }


# ============ SQLite 테이블 초기화 ============

def init_community_tables():
    """커뮤니티 테이블 초기화 (SQLite)"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 사용자 포인트 테이블
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

    # 포인트 이력 테이블
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

    # 활동 피드 테이블
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

    # 키워드 트렌드 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS keyword_trends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword VARCHAR(100) NOT NULL,
            search_count INTEGER DEFAULT 1,
            user_count INTEGER DEFAULT 1,
            trend_score REAL DEFAULT 0,
            prev_trend_score REAL DEFAULT 0,
            is_hot BOOLEAN DEFAULT FALSE,
            date DATE DEFAULT (DATE('now')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(keyword, date)
        )
    """)

    # 상위노출 성공 기록 테이블
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

    conn.commit()
    conn.close()
    logger.info("Community DB initialized (SQLite fallback)")


def init_post_tables():
    """게시판 테이블 초기화 (SQLite)"""
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
    logger.info("Post tables initialized (SQLite fallback)")


# 초기화 - SQLite 폴백용 테이블 생성
init_community_tables()
init_post_tables()

# Supabase 연결 상태 로깅
if USE_SUPABASE:
    logger.info(f"✅ Community DB: Using Supabase ({SUPABASE_URL[:30]}...)")
else:
    logger.warning("⚠️ Community DB: Using SQLite fallback (data will be lost on redeploy)")
