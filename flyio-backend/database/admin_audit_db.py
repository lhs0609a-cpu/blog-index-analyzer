"""
Admin Audit Log Database
관리자 활동 감사 로그 관리
"""
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import Dict, List, Optional, Any
import json
import logging
import os
import sys

# Windows 로컬 개발환경에서는 ./data 사용
if sys.platform == "win32":
    DATABASE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "blog_analyzer.db")
else:
    DATABASE_PATH = "/app/data/blog_analyzer.db"

logger = logging.getLogger(__name__)


@contextmanager
def get_db():
    """Database connection context manager"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_audit_tables():
    """Initialize audit log tables"""
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS admin_audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_id INTEGER NOT NULL,
                admin_email TEXT NOT NULL,
                action_type TEXT NOT NULL,
                target_user_id INTEGER,
                target_email TEXT,
                details TEXT,
                ip_address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_logs(admin_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_action ON admin_audit_logs(action_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_date ON admin_audit_logs(created_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_target ON admin_audit_logs(target_user_id)")

        logger.info("Admin audit tables initialized successfully")


# Action types
ACTION_GRANT_PREMIUM = "grant_premium"
ACTION_REVOKE_PREMIUM = "revoke_premium"
ACTION_EXTEND_SUBSCRIPTION = "extend_subscription"
ACTION_SET_ADMIN = "set_admin"
ACTION_VIEW_USER = "view_user"


def log_admin_action(
    admin_id: int,
    admin_email: str,
    action_type: str,
    target_user_id: Optional[int] = None,
    target_email: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None
) -> int:
    """
    관리자 활동 로그 기록

    Args:
        admin_id: 작업 수행한 관리자 ID
        admin_email: 관리자 이메일
        action_type: 작업 유형 (grant_premium, revoke_premium, extend_subscription, set_admin)
        target_user_id: 대상 사용자 ID
        target_email: 대상 사용자 이메일
        details: 추가 상세 정보 (JSON)
        ip_address: 요청 IP 주소

    Returns:
        로그 ID
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO admin_audit_logs
            (admin_id, admin_email, action_type, target_user_id, target_email, details, ip_address)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            admin_id,
            admin_email,
            action_type,
            target_user_id,
            target_email,
            json.dumps(details, ensure_ascii=False) if details else None,
            ip_address
        ))
        log_id = cursor.lastrowid
        logger.info(f"Audit log created: {action_type} by {admin_email} on user {target_user_id}")
        return log_id


def get_audit_logs(
    limit: int = 50,
    offset: int = 0,
    action_type: Optional[str] = None,
    admin_id: Optional[int] = None,
    target_user_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    감사 로그 조회

    Args:
        limit: 조회 개수
        offset: 시작 위치
        action_type: 필터할 작업 유형
        admin_id: 필터할 관리자 ID
        target_user_id: 필터할 대상 사용자 ID

    Returns:
        로그 목록과 총 개수
    """
    with get_db() as conn:
        cursor = conn.cursor()

        # Build query with filters
        where_clauses = []
        params = []

        if action_type and action_type != "all":
            where_clauses.append("action_type = ?")
            params.append(action_type)

        if admin_id:
            where_clauses.append("admin_id = ?")
            params.append(admin_id)

        if target_user_id:
            where_clauses.append("target_user_id = ?")
            params.append(target_user_id)

        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

        # Get total count
        cursor.execute(f"SELECT COUNT(*) FROM admin_audit_logs WHERE {where_sql}", params)
        total = cursor.fetchone()[0]

        # Get logs
        cursor.execute(f"""
            SELECT * FROM admin_audit_logs
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        """, params + [limit, offset])

        logs = []
        for row in cursor.fetchall():
            log = dict(row)
            if log.get('details'):
                try:
                    log['details'] = json.loads(log['details'])
                except:
                    pass
            logs.append(log)

        return {
            "logs": logs,
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + limit < total
        }


def get_user_audit_history(user_id: int, limit: int = 20) -> List[Dict]:
    """특정 사용자에 대한 관리자 활동 이력 조회"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM admin_audit_logs
            WHERE target_user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        """, (user_id, limit))

        logs = []
        for row in cursor.fetchall():
            log = dict(row)
            if log.get('details'):
                try:
                    log['details'] = json.loads(log['details'])
                except:
                    pass
            logs.append(log)

        return logs


def get_action_type_stats() -> Dict[str, int]:
    """작업 유형별 통계"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT action_type, COUNT(*) as count
            FROM admin_audit_logs
            GROUP BY action_type
        """)
        return {row['action_type']: row['count'] for row in cursor.fetchall()}


# Initialize tables on import
try:
    init_audit_tables()
except Exception as e:
    logger.warning(f"Could not initialize audit tables: {e}")
