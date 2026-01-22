"""
알림 시스템 데이터베이스
이메일/푸시 알림 관리
"""
import sqlite3
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
import logging
import os
import json
from enum import Enum

logger = logging.getLogger(__name__)

# Database path
import sys
if sys.platform == "win32":
    _default_path = os.path.join(os.path.dirname(__file__), "..", "data", "notification.db")
else:
    _default_path = "/data/notification.db"
NOTIFICATION_DB_PATH = os.environ.get("NOTIFICATION_DB_PATH", _default_path)


class NotificationType(str, Enum):
    EMAIL = "email"
    PUSH = "push"
    IN_APP = "in_app"
    SMS = "sms"


class NotificationCategory(str, Enum):
    SYSTEM = "system"           # 시스템 공지
    MARKETING = "marketing"     # 마케팅/프로모션
    ANALYSIS = "analysis"       # 분석 완료 알림
    ALERT = "alert"             # 경고/알림
    REMINDER = "reminder"       # 리마인더
    UPDATE = "update"           # 업데이트 알림
    ACHIEVEMENT = "achievement" # 업적 달성


class NotificationDB:
    """알림 시스템 데이터베이스"""

    def __init__(self, db_path: str = NOTIFICATION_DB_PATH):
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

            # 알림 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    category TEXT NOT NULL,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    data TEXT,
                    is_read INTEGER DEFAULT 0,
                    is_sent INTEGER DEFAULT 0,
                    sent_at TIMESTAMP,
                    read_at TIMESTAMP,
                    scheduled_at TIMESTAMP,
                    expires_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 사용자 알림 설정 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS notification_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL UNIQUE,
                    email_enabled INTEGER DEFAULT 1,
                    push_enabled INTEGER DEFAULT 1,
                    in_app_enabled INTEGER DEFAULT 1,
                    email_marketing INTEGER DEFAULT 0,
                    email_analysis INTEGER DEFAULT 1,
                    email_system INTEGER DEFAULT 1,
                    push_marketing INTEGER DEFAULT 0,
                    push_analysis INTEGER DEFAULT 1,
                    push_system INTEGER DEFAULT 1,
                    quiet_hours_start INTEGER,
                    quiet_hours_end INTEGER,
                    timezone TEXT DEFAULT 'Asia/Seoul',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 푸시 토큰 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS push_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    token TEXT NOT NULL UNIQUE,
                    device_type TEXT,
                    device_name TEXT,
                    is_active INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 이메일 템플릿 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS email_templates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    category TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    html_body TEXT NOT NULL,
                    text_body TEXT,
                    variables TEXT,
                    is_active INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 알림 로그 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS notification_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    notification_id INTEGER,
                    user_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    error_message TEXT,
                    metadata TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (notification_id) REFERENCES notifications(id)
                )
            """)

            # 인덱스
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON notifications(scheduled_at)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id)")

            conn.commit()

            # 기본 이메일 템플릿 생성
            self._init_default_templates()

            logger.info("Notification tables initialized")
        finally:
            conn.close()

    def _init_default_templates(self):
        """기본 이메일 템플릿 생성"""
        default_templates = [
            {
                'name': 'welcome',
                'category': 'system',
                'subject': '블랭크에 오신 것을 환영합니다!',
                'html_body': '''
                    <div style="font-family: 'Noto Sans KR', sans-serif; max-width: 600px; margin: 0 auto;">
                        <h1 style="color: #0064FF;">블랭크에 오신 것을 환영합니다!</h1>
                        <p>안녕하세요, {{name}}님!</p>
                        <p>블랭크의 회원이 되신 것을 진심으로 환영합니다.</p>
                        <p>지금 바로 블로그 분석을 시작해보세요!</p>
                        <a href="{{cta_url}}" style="display: inline-block; background: #0064FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">분석 시작하기</a>
                    </div>
                ''',
                'variables': json.dumps(['name', 'cta_url'])
            },
            {
                'name': 'analysis_complete',
                'category': 'analysis',
                'subject': '블로그 분석이 완료되었습니다!',
                'html_body': '''
                    <div style="font-family: 'Noto Sans KR', sans-serif; max-width: 600px; margin: 0 auto;">
                        <h1 style="color: #0064FF;">분석 완료!</h1>
                        <p>{{name}}님의 블로그 분석이 완료되었습니다.</p>
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin: 20px 0;">
                            <p><strong>블로그 점수:</strong> {{score}}점</p>
                            <p><strong>레벨:</strong> {{level}}</p>
                        </div>
                        <a href="{{result_url}}" style="display: inline-block; background: #0064FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">결과 보기</a>
                    </div>
                ''',
                'variables': json.dumps(['name', 'score', 'level', 'result_url'])
            },
            {
                'name': 'trial_expiring',
                'category': 'marketing',
                'subject': '무료 체험 기간이 곧 종료됩니다',
                'html_body': '''
                    <div style="font-family: 'Noto Sans KR', sans-serif; max-width: 600px; margin: 0 auto;">
                        <h1 style="color: #FF6B35;">무료 체험 종료 임박!</h1>
                        <p>안녕하세요, {{name}}님!</p>
                        <p>무료 체험 기간이 {{days_left}}일 남았습니다.</p>
                        <p>지금 Pro로 업그레이드하시면 {{discount}}% 할인 혜택을 받으실 수 있습니다.</p>
                        <a href="{{upgrade_url}}" style="display: inline-block; background: #FF6B35; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">업그레이드하기</a>
                    </div>
                ''',
                'variables': json.dumps(['name', 'days_left', 'discount', 'upgrade_url'])
            },
            {
                'name': 'level_up',
                'category': 'achievement',
                'subject': '축하합니다! 레벨업하셨습니다!',
                'html_body': '''
                    <div style="font-family: 'Noto Sans KR', sans-serif; max-width: 600px; margin: 0 auto;">
                        <h1 style="color: #10B981;">레벨 UP!</h1>
                        <p>{{name}}님, 축하드립니다!</p>
                        <p>블로그 레벨이 <strong>{{old_level}}</strong>에서 <strong>{{new_level}}</strong>로 상승했습니다!</p>
                        <p>앞으로도 멋진 블로그 활동 응원합니다!</p>
                    </div>
                ''',
                'variables': json.dumps(['name', 'old_level', 'new_level'])
            }
        ]

        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            for template in default_templates:
                cursor.execute("""
                    INSERT OR IGNORE INTO email_templates (name, category, subject, html_body, variables)
                    VALUES (?, ?, ?, ?, ?)
                """, (template['name'], template['category'], template['subject'],
                      template['html_body'], template['variables']))
            conn.commit()
        finally:
            conn.close()

    def create_notification(
        self,
        user_id: str,
        notification_type: str,
        category: str,
        title: str,
        message: str,
        data: Optional[Dict] = None,
        scheduled_at: Optional[str] = None,
        expires_at: Optional[str] = None
    ) -> int:
        """알림 생성"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO notifications (user_id, type, category, title, message, data, scheduled_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (user_id, notification_type, category, title, message,
                  json.dumps(data) if data else None, scheduled_at, expires_at))
            conn.commit()
            return cursor.lastrowid
        finally:
            conn.close()

    def get_user_notifications(
        self,
        user_id: str,
        limit: int = 50,
        include_read: bool = True,
        category: Optional[str] = None
    ) -> List[Dict]:
        """사용자 알림 조회"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            query = "SELECT * FROM notifications WHERE user_id = ?"
            params = [user_id]

            if not include_read:
                query += " AND is_read = 0"

            if category:
                query += " AND category = ?"
                params.append(category)

            # 만료되지 않은 알림만
            query += " AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)"

            query += " ORDER BY created_at DESC LIMIT ?"
            params.append(limit)

            cursor.execute(query, params)
            notifications = []
            for row in cursor.fetchall():
                n = dict(row)
                n['data'] = json.loads(n['data']) if n['data'] else None
                notifications.append(n)
            return notifications
        finally:
            conn.close()

    def get_unread_count(self, user_id: str) -> int:
        """읽지 않은 알림 수"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT COUNT(*) as cnt FROM notifications
                WHERE user_id = ? AND is_read = 0
                  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            """, (user_id,))
            return cursor.fetchone()['cnt']
        finally:
            conn.close()

    def mark_as_read(self, notification_id: int) -> bool:
        """알림 읽음 처리"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE notifications
                SET is_read = 1, read_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (notification_id,))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def mark_all_as_read(self, user_id: str) -> int:
        """모든 알림 읽음 처리"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE notifications
                SET is_read = 1, read_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND is_read = 0
            """, (user_id,))
            conn.commit()
            return cursor.rowcount
        finally:
            conn.close()

    def delete_notification(self, notification_id: int) -> bool:
        """알림 삭제"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM notifications WHERE id = ?", (notification_id,))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def get_user_settings(self, user_id: str) -> Dict[str, Any]:
        """사용자 알림 설정 조회"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM notification_settings WHERE user_id = ?", (user_id,))
            row = cursor.fetchone()
            if row:
                return dict(row)

            # 기본 설정 생성
            cursor.execute("""
                INSERT INTO notification_settings (user_id)
                VALUES (?)
            """, (user_id,))
            conn.commit()

            cursor.execute("SELECT * FROM notification_settings WHERE user_id = ?", (user_id,))
            return dict(cursor.fetchone())
        finally:
            conn.close()

    def update_user_settings(self, user_id: str, settings: Dict[str, Any]) -> bool:
        """사용자 알림 설정 업데이트"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # 먼저 설정이 존재하는지 확인
            self.get_user_settings(user_id)

            # 업데이트할 필드 생성
            update_fields = []
            params = []
            allowed_fields = [
                'email_enabled', 'push_enabled', 'in_app_enabled',
                'email_marketing', 'email_analysis', 'email_system',
                'push_marketing', 'push_analysis', 'push_system',
                'quiet_hours_start', 'quiet_hours_end', 'timezone'
            ]

            for field in allowed_fields:
                if field in settings:
                    update_fields.append(f"{field} = ?")
                    params.append(settings[field])

            if not update_fields:
                return False

            update_fields.append("updated_at = CURRENT_TIMESTAMP")
            params.append(user_id)

            cursor.execute(f"""
                UPDATE notification_settings
                SET {', '.join(update_fields)}
                WHERE user_id = ?
            """, params)
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def register_push_token(
        self,
        user_id: str,
        token: str,
        device_type: Optional[str] = None,
        device_name: Optional[str] = None
    ) -> bool:
        """푸시 토큰 등록"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO push_tokens (user_id, token, device_type, device_name, is_active, last_used)
                VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
            """, (user_id, token, device_type, device_name))
            conn.commit()
            return True
        finally:
            conn.close()

    def get_user_push_tokens(self, user_id: str) -> List[Dict]:
        """사용자 푸시 토큰 조회"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM push_tokens
                WHERE user_id = ? AND is_active = 1
            """, (user_id,))
            return [dict(row) for row in cursor.fetchall()]
        finally:
            conn.close()

    def deactivate_push_token(self, token: str) -> bool:
        """푸시 토큰 비활성화"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE push_tokens SET is_active = 0 WHERE token = ?
            """, (token,))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def get_email_template(self, name: str) -> Optional[Dict]:
        """이메일 템플릿 조회"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM email_templates WHERE name = ? AND is_active = 1", (name,))
            row = cursor.fetchone()
            if row:
                template = dict(row)
                template['variables'] = json.loads(template['variables']) if template['variables'] else []
                return template
            return None
        finally:
            conn.close()

    def log_notification(
        self,
        notification_id: Optional[int],
        user_id: str,
        notification_type: str,
        status: str,
        error_message: Optional[str] = None,
        metadata: Optional[Dict] = None
    ):
        """알림 로그 기록"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO notification_logs (notification_id, user_id, type, status, error_message, metadata)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (notification_id, user_id, notification_type, status,
                  error_message, json.dumps(metadata) if metadata else None))
            conn.commit()
        finally:
            conn.close()

    def get_pending_notifications(self, limit: int = 100) -> List[Dict]:
        """발송 대기 중인 알림 조회"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM notifications
                WHERE is_sent = 0
                  AND (scheduled_at IS NULL OR scheduled_at <= CURRENT_TIMESTAMP)
                  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
                ORDER BY created_at ASC
                LIMIT ?
            """, (limit,))
            notifications = []
            for row in cursor.fetchall():
                n = dict(row)
                n['data'] = json.loads(n['data']) if n['data'] else None
                notifications.append(n)
            return notifications
        finally:
            conn.close()

    def mark_as_sent(self, notification_id: int) -> bool:
        """알림 발송 완료 처리"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE notifications
                SET is_sent = 1, sent_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (notification_id,))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()


# 싱글톤
_db_instance = None

def get_notification_db() -> NotificationDB:
    global _db_instance
    if _db_instance is None:
        _db_instance = NotificationDB()
    return _db_instance
