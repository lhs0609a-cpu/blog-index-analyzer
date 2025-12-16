"""
Legal Compliance Router
API endpoints for compliance monitoring and risk management
"""
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel
from typing import Optional, List
import logging

from database.compliance_db import (
    init_compliance_tables,
    log_feature_usage,
    log_user_consent,
    get_usage_logs,
    get_risk_alerts,
    resolve_alert,
    get_compliance_stats,
    get_feature_risks,
    check_user_consent,
    FEATURE_RISKS
)
from routers.auth import get_current_user
from routers.admin import require_admin

logger = logging.getLogger(__name__)
router = APIRouter()

# Initialize tables
try:
    init_compliance_tables()
except Exception as e:
    logger.error(f"Failed to initialize compliance tables: {e}")


# Request/Response models
class LogUsageRequest(BaseModel):
    feature_name: str
    action: str
    target_data: Optional[str] = None
    consent_given: bool = False
    additional_info: Optional[dict] = None


class ConsentRequest(BaseModel):
    feature_name: str
    consent_type: str
    consent_given: bool
    consent_text: Optional[str] = None


class ResolveAlertRequest(BaseModel):
    alert_id: int


# Public endpoints (for logging usage from features)
@router.post("/log-usage")
async def log_usage(
    request: Request,
    body: LogUsageRequest,
    current_user: Optional[dict] = Depends(get_current_user)
):
    """Log feature usage for compliance tracking"""
    try:
        user_id = current_user['id'] if current_user else None
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get('user-agent')

        log_id = log_feature_usage(
            user_id=user_id,
            feature_name=body.feature_name,
            action=body.action,
            target_data=body.target_data,
            ip_address=ip_address,
            user_agent=user_agent,
            consent_given=body.consent_given,
            additional_info=body.additional_info
        )

        return {
            "success": True,
            "log_id": log_id
        }
    except Exception as e:
        logger.error(f"Failed to log usage: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/consent")
async def record_consent(
    request: Request,
    body: ConsentRequest,
    current_user: dict = Depends(get_current_user)
):
    """Record user consent for a feature"""
    try:
        ip_address = request.client.host if request.client else None

        log_user_consent(
            user_id=current_user['id'],
            feature_name=body.feature_name,
            consent_type=body.consent_type,
            consent_given=body.consent_given,
            consent_text=body.consent_text,
            ip_address=ip_address
        )

        return {
            "success": True,
            "message": "동의가 기록되었습니다"
        }
    except Exception as e:
        logger.error(f"Failed to record consent: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/check-consent/{feature_name}")
async def check_consent(
    feature_name: str,
    current_user: dict = Depends(get_current_user)
):
    """Check if user has consented to a feature"""
    has_consent = check_user_consent(current_user['id'], feature_name)
    feature_info = FEATURE_RISKS.get(feature_name, {})

    return {
        "feature": feature_name,
        "has_consent": has_consent,
        "consent_required": feature_info.get("user_consent_required", False)
    }


@router.get("/feature-risk/{feature_name}")
async def get_feature_risk_info(feature_name: str):
    """Get risk information for a specific feature"""
    risk_info = FEATURE_RISKS.get(feature_name)

    if not risk_info:
        return {
            "feature": feature_name,
            "found": False,
            "message": "해당 기능의 위험도 정보가 없습니다"
        }

    return {
        "feature": feature_name,
        "found": True,
        **risk_info
    }


# Admin-only endpoints
@router.get("/guidelines")
async def get_guidelines(admin: dict = Depends(require_admin)):
    """Get all legal compliance guidelines (admin only)"""
    risks = get_feature_risks()

    # Group by risk level
    grouped = {
        "high": [],
        "medium": [],
        "low": []
    }

    for feature_name, info in risks.items():
        risk_level = info.get("risk_level", "low")
        if hasattr(risk_level, 'value'):
            risk_level = risk_level.value

        grouped[risk_level].append({
            "feature_name": feature_name,
            **info
        })

    return {
        "success": True,
        "guidelines": grouped,
        "summary": {
            "high_risk_count": len(grouped["high"]),
            "medium_risk_count": len(grouped["medium"]),
            "low_risk_count": len(grouped["low"]),
            "total": sum(len(v) for v in grouped.values())
        }
    }


@router.get("/dashboard")
async def get_compliance_dashboard(admin: dict = Depends(require_admin)):
    """Get compliance dashboard statistics (admin only)"""
    try:
        stats = get_compliance_stats()

        return {
            "success": True,
            "data": stats
        }
    except Exception as e:
        logger.error(f"Failed to get compliance stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs")
async def get_logs(
    feature_name: Optional[str] = Query(None),
    risk_level: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: int = Query(100),
    admin: dict = Depends(require_admin)
):
    """Get feature usage logs (admin only)"""
    try:
        logs = get_usage_logs(
            feature_name=feature_name,
            risk_level=risk_level,
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            limit=limit
        )

        return {
            "success": True,
            "count": len(logs),
            "logs": logs
        }
    except Exception as e:
        logger.error(f"Failed to get logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts")
async def get_alerts(
    resolved: Optional[bool] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = Query(50),
    admin: dict = Depends(require_admin)
):
    """Get risk alerts (admin only)"""
    try:
        alerts = get_risk_alerts(
            resolved=resolved,
            severity=severity,
            limit=limit
        )

        return {
            "success": True,
            "count": len(alerts),
            "alerts": alerts
        }
    except Exception as e:
        logger.error(f"Failed to get alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alerts/resolve")
async def resolve_risk_alert(
    body: ResolveAlertRequest,
    admin: dict = Depends(require_admin)
):
    """Resolve a risk alert (admin only)"""
    try:
        success = resolve_alert(body.alert_id, admin['id'])

        if success:
            return {
                "success": True,
                "message": "알림이 해결 처리되었습니다"
            }
        else:
            raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to resolve alert: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/report")
async def get_compliance_report(
    days: int = Query(7, description="리포트 기간 (일)"),
    admin: dict = Depends(require_admin)
):
    """Generate compliance report (admin only)"""
    try:
        stats = get_compliance_stats()
        logs = get_usage_logs(risk_level="high", limit=50)
        alerts = get_risk_alerts(resolved=False)

        return {
            "success": True,
            "report": {
                "period_days": days,
                "statistics": stats,
                "high_risk_logs": logs,
                "pending_alerts": alerts,
                "recommendations": _generate_recommendations(stats, alerts)
            }
        }
    except Exception as e:
        logger.error(f"Failed to generate report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _generate_recommendations(stats: dict, alerts: list) -> List[str]:
    """Generate compliance recommendations based on stats"""
    recommendations = []

    if stats.get('unresolved_alerts', 0) > 5:
        recommendations.append("미해결 알림이 5개 이상입니다. 즉시 검토가 필요합니다.")

    if stats.get('high_risk_today', 0) > 50:
        recommendations.append("오늘 고위험 기능 사용량이 높습니다. 모니터링을 강화하세요.")

    usage_by_risk = stats.get('usage_by_risk', {})
    if usage_by_risk.get('high', 0) > usage_by_risk.get('low', 0):
        recommendations.append("고위험 기능 사용 비중이 높습니다. 사용자 교육을 고려하세요.")

    if not recommendations:
        recommendations.append("현재 특별한 조치가 필요하지 않습니다.")

    return recommendations
