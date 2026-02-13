"""
플랫폼 연동 정보 DB 저장소
unified_ads.py의 인메모리 딕셔너리를 대체하는 SQLite 기반 영속 저장소
"""
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime

from database.sqlite_db import get_connection
from services.credential_encryption import encrypt_credentials, decrypt_credentials

logger = logging.getLogger(__name__)


def init_platform_tables():
    """플랫폼 관련 테이블 생성"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS unified_platform_connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform_id TEXT NOT NULL,
            is_connected BOOLEAN DEFAULT FALSE,
            account_name TEXT,
            connected_at TEXT,
            stats TEXT DEFAULT '{}',
            UNIQUE(user_id, platform_id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS unified_platform_credentials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform_id TEXT NOT NULL,
            encrypted_credentials TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, platform_id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS unified_optimization_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform_id TEXT NOT NULL,
            is_active BOOLEAN DEFAULT FALSE,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, platform_id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS unified_optimization_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform_id TEXT NOT NULL,
            settings TEXT DEFAULT '{}',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, platform_id)
        )
    """)

    conn.commit()
    logger.info("Platform store tables initialized")


# ============ 연동 상태 ============

def get_user_platforms(user_id: int) -> Dict[str, Any]:
    """사용자의 모든 플랫폼 연동 상태 조회"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT platform_id, is_connected, account_name, connected_at, stats FROM unified_platform_connections WHERE user_id = ?",
        (user_id,)
    )
    result = {}
    for row in cursor.fetchall():
        stats = {}
        try:
            stats = json.loads(row[4]) if row[4] else {}
        except Exception:
            pass
        result[row[0]] = {
            "is_connected": bool(row[1]),
            "account_name": row[2],
            "connected_at": row[3],
            "stats": stats,
        }
    return result


def save_platform_connection(user_id: int, platform_id: str, account_name: Optional[str] = None) -> bool:
    """플랫폼 연동 저장"""
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute("""
        INSERT INTO unified_platform_connections (user_id, platform_id, is_connected, account_name, connected_at)
        VALUES (?, ?, 1, ?, ?)
        ON CONFLICT(user_id, platform_id)
        DO UPDATE SET is_connected = 1, account_name = ?, connected_at = ?
    """, (user_id, platform_id, account_name, now, account_name, now))
    conn.commit()
    return True


def delete_platform_connection(user_id: int, platform_id: str) -> bool:
    """플랫폼 연동 해제"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE unified_platform_connections SET is_connected = 0 WHERE user_id = ? AND platform_id = ?",
        (user_id, platform_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def update_platform_stats(user_id: int, platform_id: str, stats: Dict[str, Any]) -> bool:
    """플랫폼 통계 업데이트"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE unified_platform_connections SET stats = ? WHERE user_id = ? AND platform_id = ?",
        (json.dumps(stats, ensure_ascii=False), user_id, platform_id)
    )
    conn.commit()
    return cursor.rowcount > 0


# ============ 자격증명 (암호화 저장) ============

def save_platform_credentials(user_id: int, platform_id: str, credentials: Dict[str, str]) -> bool:
    """플랫폼 자격증명 암호화 저장"""
    encrypted = encrypt_credentials(credentials)
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute("""
        INSERT INTO unified_platform_credentials (user_id, platform_id, encrypted_credentials, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, platform_id)
        DO UPDATE SET encrypted_credentials = ?, updated_at = ?
    """, (user_id, platform_id, encrypted, now, encrypted, now))
    conn.commit()
    return True


def get_platform_credentials(user_id: int, platform_id: str) -> Dict[str, str]:
    """플랫폼 자격증명 복호화 조회"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT encrypted_credentials FROM unified_platform_credentials WHERE user_id = ? AND platform_id = ?",
        (user_id, platform_id)
    )
    row = cursor.fetchone()
    if not row:
        return {}
    return decrypt_credentials(row[0])


def delete_platform_credentials(user_id: int, platform_id: str) -> bool:
    """플랫폼 자격증명 삭제"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM unified_platform_credentials WHERE user_id = ? AND platform_id = ?",
        (user_id, platform_id)
    )
    conn.commit()
    return cursor.rowcount > 0


# ============ 최적화 상태 ============

def get_optimization_status(user_id: int) -> Dict[str, bool]:
    """사용자의 모든 플랫폼 최적화 상태"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT platform_id, is_active FROM unified_optimization_status WHERE user_id = ?",
        (user_id,)
    )
    return {row[0]: bool(row[1]) for row in cursor.fetchall()}


def set_optimization_status(user_id: int, platform_id: str, is_active: bool) -> bool:
    """최적화 상태 설정"""
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute("""
        INSERT INTO unified_optimization_status (user_id, platform_id, is_active, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, platform_id)
        DO UPDATE SET is_active = ?, updated_at = ?
    """, (user_id, platform_id, is_active, now, is_active, now))
    conn.commit()
    return True


# ============ 최적화 설정 ============

def get_platform_opt_settings(user_id: int, platform_id: str) -> Dict[str, Any]:
    """플랫폼별 최적화 설정 조회"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT settings FROM unified_optimization_settings WHERE user_id = ? AND platform_id = ?",
        (user_id, platform_id)
    )
    row = cursor.fetchone()
    if not row:
        return {}
    try:
        return json.loads(row[0])
    except Exception:
        return {}


def save_platform_opt_settings(user_id: int, platform_id: str, settings: Dict[str, Any]) -> bool:
    """플랫폼별 최적화 설정 저장"""
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute("""
        INSERT INTO unified_optimization_settings (user_id, platform_id, settings, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, platform_id)
        DO UPDATE SET settings = ?, updated_at = ?
    """, (user_id, platform_id, json.dumps(settings, ensure_ascii=False), now,
          json.dumps(settings, ensure_ascii=False), now))
    conn.commit()
    return True


# 테이블 초기화
try:
    init_platform_tables()
except Exception as e:
    logger.error(f"Failed to initialize platform tables: {e}")
