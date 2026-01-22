"""
알림 시스템 API 라우터
이메일/푸시/인앱 알림 관리
"""
from fastapi import APIRouter, Query, Body, BackgroundTasks
from typing import Dict, Any, Optional, List
import logging
import os

from database.notification_db import get_notification_db, NotificationType, NotificationCategory

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["알림시스템"])


# ============ 알림 조회 ============

@router.get("/user/{user_id}")
async def get_user_notifications(
    user_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    include_read: bool = Query(default=True),
    category: Optional[str] = Query(default=None)
) -> Dict[str, Any]:
    """사용자 알림 목록 조회"""
    try:
        db = get_notification_db()
        notifications = db.get_user_notifications(
            user_id,
            limit=limit,
            include_read=include_read,
            category=category
        )
        unread_count = db.get_unread_count(user_id)
        return {
            "success": True,
            "count": len(notifications),
            "unread_count": unread_count,
            "notifications": notifications
        }
    except Exception as e:
        logger.error(f"Failed to get notifications: {e}")
        return {"success": False, "error": str(e)}


@router.get("/user/{user_id}/unread-count")
async def get_unread_count(user_id: str) -> Dict[str, Any]:
    """읽지 않은 알림 수 조회"""
    try:
        db = get_notification_db()
        count = db.get_unread_count(user_id)
        return {"success": True, "unread_count": count}
    except Exception as e:
        logger.error(f"Failed to get unread count: {e}")
        return {"success": False, "error": str(e)}


# ============ 알림 관리 ============

@router.post("/")
async def create_notification(
    user_id: str = Body(...),
    notification_type: str = Body(..., description="email, push, in_app"),
    category: str = Body(..., description="system, marketing, analysis, alert, reminder"),
    title: str = Body(...),
    message: str = Body(...),
    data: Optional[Dict] = Body(default=None),
    scheduled_at: Optional[str] = Body(default=None),
    expires_at: Optional[str] = Body(default=None),
    background_tasks: BackgroundTasks = None
) -> Dict[str, Any]:
    """
    알림 생성

    notification_type:
        - email: 이메일 알림
        - push: 푸시 알림
        - in_app: 인앱 알림

    category:
        - system: 시스템 공지
        - marketing: 마케팅/프로모션
        - analysis: 분석 완료 알림
        - alert: 경고/알림
        - reminder: 리마인더
        - achievement: 업적 달성
    """
    try:
        db = get_notification_db()

        # 사용자 설정 확인
        settings = db.get_user_settings(user_id)

        # 알림 수신 여부 확인
        should_send = True
        if notification_type == 'email':
            if not settings.get('email_enabled', True):
                should_send = False
            elif category == 'marketing' and not settings.get('email_marketing', False):
                should_send = False
            elif category == 'analysis' and not settings.get('email_analysis', True):
                should_send = False
        elif notification_type == 'push':
            if not settings.get('push_enabled', True):
                should_send = False
            elif category == 'marketing' and not settings.get('push_marketing', False):
                should_send = False

        if not should_send:
            return {
                "success": True,
                "notification_id": None,
                "message": "Notification skipped due to user settings"
            }

        notification_id = db.create_notification(
            user_id=user_id,
            notification_type=notification_type,
            category=category,
            title=title,
            message=message,
            data=data,
            scheduled_at=scheduled_at,
            expires_at=expires_at
        )

        return {
            "success": True,
            "notification_id": notification_id,
            "message": "Notification created"
        }
    except Exception as e:
        logger.error(f"Failed to create notification: {e}")
        return {"success": False, "error": str(e)}


@router.post("/batch")
async def create_batch_notifications(
    notifications: List[Dict] = Body(...)
) -> Dict[str, Any]:
    """
    일괄 알림 생성
    """
    try:
        db = get_notification_db()
        created = 0
        skipped = 0
        errors = []

        for n in notifications:
            try:
                settings = db.get_user_settings(n['user_id'])
                notification_type = n.get('type', 'in_app')
                category = n.get('category', 'system')

                # 설정 확인
                should_send = True
                if notification_type == 'email' and not settings.get('email_enabled', True):
                    should_send = False
                elif notification_type == 'push' and not settings.get('push_enabled', True):
                    should_send = False

                if not should_send:
                    skipped += 1
                    continue

                db.create_notification(
                    user_id=n['user_id'],
                    notification_type=notification_type,
                    category=category,
                    title=n['title'],
                    message=n['message'],
                    data=n.get('data'),
                    scheduled_at=n.get('scheduled_at'),
                    expires_at=n.get('expires_at')
                )
                created += 1
            except Exception as e:
                errors.append(str(e))

        return {
            "success": True,
            "created": created,
            "skipped": skipped,
            "total": len(notifications),
            "errors": errors if errors else None
        }
    except Exception as e:
        logger.error(f"Failed to create batch notifications: {e}")
        return {"success": False, "error": str(e)}


@router.put("/{notification_id}/read")
async def mark_notification_read(notification_id: int) -> Dict[str, Any]:
    """알림 읽음 처리"""
    try:
        db = get_notification_db()
        success = db.mark_as_read(notification_id)
        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to mark notification as read: {e}")
        return {"success": False, "error": str(e)}


@router.put("/user/{user_id}/read-all")
async def mark_all_notifications_read(user_id: str) -> Dict[str, Any]:
    """모든 알림 읽음 처리"""
    try:
        db = get_notification_db()
        count = db.mark_all_as_read(user_id)
        return {"success": True, "marked_count": count}
    except Exception as e:
        logger.error(f"Failed to mark all notifications as read: {e}")
        return {"success": False, "error": str(e)}


@router.delete("/{notification_id}")
async def delete_notification(notification_id: int) -> Dict[str, Any]:
    """알림 삭제"""
    try:
        db = get_notification_db()
        success = db.delete_notification(notification_id)
        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to delete notification: {e}")
        return {"success": False, "error": str(e)}


# ============ 알림 설정 ============

@router.get("/user/{user_id}/settings")
async def get_notification_settings(user_id: str) -> Dict[str, Any]:
    """사용자 알림 설정 조회"""
    try:
        db = get_notification_db()
        settings = db.get_user_settings(user_id)
        return {"success": True, "settings": settings}
    except Exception as e:
        logger.error(f"Failed to get notification settings: {e}")
        return {"success": False, "error": str(e)}


@router.put("/user/{user_id}/settings")
async def update_notification_settings(
    user_id: str,
    settings: Dict[str, Any] = Body(...)
) -> Dict[str, Any]:
    """
    사용자 알림 설정 업데이트

    가능한 설정:
        - email_enabled: 이메일 알림 활성화
        - push_enabled: 푸시 알림 활성화
        - in_app_enabled: 인앱 알림 활성화
        - email_marketing: 마케팅 이메일 수신
        - email_analysis: 분석 완료 이메일 수신
        - push_marketing: 마케팅 푸시 수신
        - push_analysis: 분석 완료 푸시 수신
        - quiet_hours_start: 방해 금지 시작 시간 (0-23)
        - quiet_hours_end: 방해 금지 종료 시간 (0-23)
        - timezone: 타임존
    """
    try:
        db = get_notification_db()
        success = db.update_user_settings(user_id, settings)
        if success:
            updated_settings = db.get_user_settings(user_id)
            return {"success": True, "settings": updated_settings}
        return {"success": False, "error": "No settings updated"}
    except Exception as e:
        logger.error(f"Failed to update notification settings: {e}")
        return {"success": False, "error": str(e)}


# ============ 푸시 토큰 ============

@router.post("/push-token")
async def register_push_token(
    user_id: str = Body(...),
    token: str = Body(...),
    device_type: Optional[str] = Body(default=None, description="ios, android, web"),
    device_name: Optional[str] = Body(default=None)
) -> Dict[str, Any]:
    """푸시 토큰 등록"""
    try:
        db = get_notification_db()
        success = db.register_push_token(user_id, token, device_type, device_name)
        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to register push token: {e}")
        return {"success": False, "error": str(e)}


@router.get("/user/{user_id}/push-tokens")
async def get_push_tokens(user_id: str) -> Dict[str, Any]:
    """사용자 푸시 토큰 목록 조회"""
    try:
        db = get_notification_db()
        tokens = db.get_user_push_tokens(user_id)
        return {"success": True, "tokens": tokens}
    except Exception as e:
        logger.error(f"Failed to get push tokens: {e}")
        return {"success": False, "error": str(e)}


@router.delete("/push-token/{token}")
async def deactivate_push_token(token: str) -> Dict[str, Any]:
    """푸시 토큰 비활성화"""
    try:
        db = get_notification_db()
        success = db.deactivate_push_token(token)
        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to deactivate push token: {e}")
        return {"success": False, "error": str(e)}


# ============ 이메일 템플릿 ============

@router.get("/templates/{name}")
async def get_email_template(name: str) -> Dict[str, Any]:
    """이메일 템플릿 조회"""
    try:
        db = get_notification_db()
        template = db.get_email_template(name)
        if template:
            return {"success": True, "template": template}
        return {"success": False, "error": "Template not found"}
    except Exception as e:
        logger.error(f"Failed to get email template: {e}")
        return {"success": False, "error": str(e)}


# ============ 테스트용 ============

@router.post("/test/send")
async def send_test_notification(
    user_id: str = Body(...),
    notification_type: str = Body(default="in_app"),
    title: str = Body(default="테스트 알림"),
    message: str = Body(default="이것은 테스트 알림입니다.")
) -> Dict[str, Any]:
    """테스트 알림 발송"""
    try:
        db = get_notification_db()
        notification_id = db.create_notification(
            user_id=user_id,
            notification_type=notification_type,
            category="system",
            title=title,
            message=message
        )

        # 로그 기록
        db.log_notification(
            notification_id=notification_id,
            user_id=user_id,
            notification_type=notification_type,
            status="sent",
            metadata={"test": True}
        )

        return {
            "success": True,
            "notification_id": notification_id,
            "message": "Test notification sent"
        }
    except Exception as e:
        logger.error(f"Failed to send test notification: {e}")
        return {"success": False, "error": str(e)}


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """알림 시스템 상태 확인"""
    try:
        db = get_notification_db()
        pending = db.get_pending_notifications(limit=1)
        return {
            "status": "healthy",
            "pending_notifications": len(pending)
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
