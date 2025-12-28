"""
XP 시스템 라우터
- 사용자 XP 관리
- 보상 구매
- 업적 시스템
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
import sqlite3
import os

router = APIRouter(prefix="/api/user/xp", tags=["XP System"])

# 데이터베이스 경로
DB_PATH = os.environ.get("DATABASE_PATH", "/data/blog_analyzer.db")


def get_db():
    """데이터베이스 연결"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_xp_tables():
    """XP 관련 테이블 생성"""
    conn = get_db()
    cursor = conn.cursor()

    # 사용자 XP 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_xp (
            user_id INTEGER PRIMARY KEY,
            total_xp INTEGER DEFAULT 0,
            current_xp INTEGER DEFAULT 0,
            bonus_analysis INTEGER DEFAULT 0,
            premium_trial_until TEXT,
            login_streak INTEGER DEFAULT 0,
            last_login_date TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    # XP 획득 기록
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS xp_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount INTEGER NOT NULL,
            source TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    # 보상 구매 기록
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS xp_purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            reward_id TEXT NOT NULL,
            cost INTEGER NOT NULL,
            purchased_at TEXT DEFAULT CURRENT_TIMESTAMP,
            expires_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    # 업적 달성 기록
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            achievement_id TEXT NOT NULL,
            unlocked_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, achievement_id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    conn.commit()
    conn.close()


# 테이블 초기화
try:
    init_xp_tables()
except Exception as e:
    print(f"XP tables initialization warning: {e}")


class XPSyncRequest(BaseModel):
    user_id: int
    total_xp: int
    current_xp: int
    bonus_analysis: int = 0
    premium_trial_until: Optional[str] = None
    login_streak: int = 0
    unlocked_achievements: List[str] = []


class XPSyncResponse(BaseModel):
    success: bool
    total_xp: int
    current_xp: int
    bonus_analysis: int
    premium_trial_until: Optional[str]
    login_streak: int
    unlocked_achievements: List[str]


class EarnXPRequest(BaseModel):
    user_id: int
    amount: int
    source: str


class SpendXPRequest(BaseModel):
    user_id: int
    amount: int
    reward_id: str


class PurchaseRewardRequest(BaseModel):
    user_id: int
    reward_id: str


# 보상 정의
REWARDS = {
    "analysis_1": {"cost": 100, "type": "analysis", "value": 1},
    "analysis_5": {"cost": 450, "type": "analysis", "value": 5},
    "premium_1day": {"cost": 500, "type": "premium_trial", "value": 1},
    "premium_3day": {"cost": 1200, "type": "premium_trial", "value": 3},
    "premium_7day": {"cost": 2500, "type": "premium_trial", "value": 7},
}


@router.post("/sync", response_model=XPSyncResponse)
async def sync_xp(request: XPSyncRequest):
    """클라이언트와 서버 XP 동기화"""
    conn = get_db()
    cursor = conn.cursor()

    try:
        # 기존 데이터 확인
        cursor.execute("SELECT * FROM user_xp WHERE user_id = ?", (request.user_id,))
        existing = cursor.fetchone()

        if existing:
            # 서버 데이터가 더 최신인 경우 클라이언트 업데이트
            server_total = existing["total_xp"]
            client_total = request.total_xp

            if client_total > server_total:
                # 클라이언트가 더 많은 XP를 가지고 있으면 서버 업데이트
                cursor.execute("""
                    UPDATE user_xp SET
                        total_xp = ?,
                        current_xp = ?,
                        bonus_analysis = ?,
                        premium_trial_until = ?,
                        login_streak = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                """, (
                    request.total_xp,
                    request.current_xp,
                    request.bonus_analysis,
                    request.premium_trial_until,
                    request.login_streak,
                    request.user_id
                ))

                # 업적 동기화
                for achievement_id in request.unlocked_achievements:
                    cursor.execute("""
                        INSERT OR IGNORE INTO user_achievements (user_id, achievement_id)
                        VALUES (?, ?)
                    """, (request.user_id, achievement_id))

                conn.commit()

                return XPSyncResponse(
                    success=True,
                    total_xp=request.total_xp,
                    current_xp=request.current_xp,
                    bonus_analysis=request.bonus_analysis,
                    premium_trial_until=request.premium_trial_until,
                    login_streak=request.login_streak,
                    unlocked_achievements=request.unlocked_achievements
                )
            else:
                # 서버 데이터 반환
                cursor.execute(
                    "SELECT achievement_id FROM user_achievements WHERE user_id = ?",
                    (request.user_id,)
                )
                achievements = [row["achievement_id"] for row in cursor.fetchall()]

                return XPSyncResponse(
                    success=True,
                    total_xp=existing["total_xp"],
                    current_xp=existing["current_xp"],
                    bonus_analysis=existing["bonus_analysis"],
                    premium_trial_until=existing["premium_trial_until"],
                    login_streak=existing["login_streak"],
                    unlocked_achievements=achievements
                )
        else:
            # 새 레코드 생성
            cursor.execute("""
                INSERT INTO user_xp (user_id, total_xp, current_xp, bonus_analysis, premium_trial_until, login_streak)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                request.user_id,
                request.total_xp,
                request.current_xp,
                request.bonus_analysis,
                request.premium_trial_until,
                request.login_streak
            ))

            # 업적 저장
            for achievement_id in request.unlocked_achievements:
                cursor.execute("""
                    INSERT OR IGNORE INTO user_achievements (user_id, achievement_id)
                    VALUES (?, ?)
                """, (request.user_id, achievement_id))

            conn.commit()

            return XPSyncResponse(
                success=True,
                total_xp=request.total_xp,
                current_xp=request.current_xp,
                bonus_analysis=request.bonus_analysis,
                premium_trial_until=request.premium_trial_until,
                login_streak=request.login_streak,
                unlocked_achievements=request.unlocked_achievements
            )
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/earn")
async def earn_xp(request: EarnXPRequest):
    """XP 획득"""
    conn = get_db()
    cursor = conn.cursor()

    try:
        # 사용자 XP 레코드 확인/생성
        cursor.execute("SELECT * FROM user_xp WHERE user_id = ?", (request.user_id,))
        existing = cursor.fetchone()

        if existing:
            new_total = existing["total_xp"] + request.amount
            new_current = existing["current_xp"] + request.amount

            cursor.execute("""
                UPDATE user_xp SET
                    total_xp = ?,
                    current_xp = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            """, (new_total, new_current, request.user_id))
        else:
            cursor.execute("""
                INSERT INTO user_xp (user_id, total_xp, current_xp)
                VALUES (?, ?, ?)
            """, (request.user_id, request.amount, request.amount))
            new_total = request.amount
            new_current = request.amount

        # 기록 저장
        cursor.execute("""
            INSERT INTO xp_history (user_id, amount, source)
            VALUES (?, ?, ?)
        """, (request.user_id, request.amount, request.source))

        conn.commit()

        return {
            "success": True,
            "total_xp": new_total,
            "current_xp": new_current,
            "earned": request.amount,
            "source": request.source
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/purchase")
async def purchase_reward(request: PurchaseRewardRequest):
    """보상 구매"""
    if request.reward_id not in REWARDS:
        raise HTTPException(status_code=400, detail="Invalid reward ID")

    reward = REWARDS[request.reward_id]
    conn = get_db()
    cursor = conn.cursor()

    try:
        # 사용자 XP 확인
        cursor.execute("SELECT * FROM user_xp WHERE user_id = ?", (request.user_id,))
        user_xp = cursor.fetchone()

        if not user_xp:
            raise HTTPException(status_code=404, detail="User XP record not found")

        if user_xp["current_xp"] < reward["cost"]:
            raise HTTPException(status_code=400, detail="Insufficient XP")

        # XP 차감
        new_current = user_xp["current_xp"] - reward["cost"]

        # 보상 적용
        expires_at = None
        new_bonus_analysis = user_xp["bonus_analysis"]
        new_premium_until = user_xp["premium_trial_until"]

        if reward["type"] == "analysis":
            new_bonus_analysis += reward["value"]
        elif reward["type"] == "premium_trial":
            # 프리미엄 체험 연장
            now = datetime.now()
            if new_premium_until:
                current_expiry = datetime.fromisoformat(new_premium_until)
                base_date = current_expiry if current_expiry > now else now
            else:
                base_date = now

            new_expiry = base_date + timedelta(days=reward["value"])
            new_premium_until = new_expiry.isoformat()
            expires_at = new_premium_until

        # 업데이트
        cursor.execute("""
            UPDATE user_xp SET
                current_xp = ?,
                bonus_analysis = ?,
                premium_trial_until = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        """, (new_current, new_bonus_analysis, new_premium_until, request.user_id))

        # 구매 기록
        cursor.execute("""
            INSERT INTO xp_purchases (user_id, reward_id, cost, expires_at)
            VALUES (?, ?, ?, ?)
        """, (request.user_id, request.reward_id, reward["cost"], expires_at))

        conn.commit()

        return {
            "success": True,
            "reward_id": request.reward_id,
            "cost": reward["cost"],
            "current_xp": new_current,
            "bonus_analysis": new_bonus_analysis,
            "premium_trial_until": new_premium_until
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/{user_id}")
async def get_user_xp(user_id: int):
    """사용자 XP 정보 조회"""
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT * FROM user_xp WHERE user_id = ?", (user_id,))
        user_xp = cursor.fetchone()

        if not user_xp:
            return {
                "total_xp": 0,
                "current_xp": 0,
                "bonus_analysis": 0,
                "premium_trial_until": None,
                "login_streak": 0,
                "unlocked_achievements": []
            }

        # 업적 조회
        cursor.execute(
            "SELECT achievement_id FROM user_achievements WHERE user_id = ?",
            (user_id,)
        )
        achievements = [row["achievement_id"] for row in cursor.fetchall()]

        return {
            "total_xp": user_xp["total_xp"],
            "current_xp": user_xp["current_xp"],
            "bonus_analysis": user_xp["bonus_analysis"],
            "premium_trial_until": user_xp["premium_trial_until"],
            "login_streak": user_xp["login_streak"],
            "unlocked_achievements": achievements
        }
    finally:
        conn.close()


@router.get("/{user_id}/history")
async def get_xp_history(user_id: int, limit: int = 50):
    """XP 획득 기록 조회"""
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT * FROM xp_history
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        """, (user_id, limit))

        history = [dict(row) for row in cursor.fetchall()]
        return {"history": history}
    finally:
        conn.close()


@router.post("/{user_id}/use-bonus-analysis")
async def use_bonus_analysis(user_id: int):
    """보너스 분석 사용"""
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT bonus_analysis FROM user_xp WHERE user_id = ?", (user_id,))
        user_xp = cursor.fetchone()

        if not user_xp or user_xp["bonus_analysis"] <= 0:
            raise HTTPException(status_code=400, detail="No bonus analysis available")

        cursor.execute("""
            UPDATE user_xp SET
                bonus_analysis = bonus_analysis - 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        """, (user_id,))

        conn.commit()

        return {
            "success": True,
            "remaining_bonus_analysis": user_xp["bonus_analysis"] - 1
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
