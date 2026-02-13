"""
이상 징후 감지 API
- 성과 이상 징후 모니터링
- 알림 관리
- 임계값 설정
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from datetime import datetime
import logging

from routers.auth import get_current_user
from services.anomaly_detection_service import (
    get_anomaly_detector,
    AnomalyType,
    AlertSeverity,
    AutoAction,
    AnomalyThreshold,
)
from database.ad_optimization_db import (
    get_active_anomaly_alerts,
    get_anomaly_alert_history,
    acknowledge_anomaly_alert,
    resolve_anomaly_alert,
    batch_resolve_anomaly_alerts,
    get_anomaly_summary,
    save_anomaly_threshold,
    get_anomaly_thresholds,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ads/anomaly", tags=["Anomaly Detection"])


# ============ Request/Response Models ============

class AnalyzeMetricsRequest(BaseModel):
    """메트릭 분석 요청"""
    platform_id: str
    metrics: Dict[str, float] = Field(
        ...,
        description="분석할 메트릭 (cpc, ctr, cvr, roas, spend, impressions)"
    )
    campaign_id: Optional[str] = None
    keyword_id: Optional[str] = None


class ThresholdConfigRequest(BaseModel):
    """임계값 설정 요청"""
    platform_id: str
    anomaly_type: str
    metric: str
    low_threshold: float = Field(ge=0.05, le=1.0)
    medium_threshold: float = Field(ge=0.1, le=1.5)
    high_threshold: float = Field(ge=0.2, le=2.0)
    critical_threshold: float = Field(ge=0.3, le=3.0)
    direction: str = Field(default="both", pattern="^(up|down|both)$")
    auto_action: str = Field(default="none")
    lookback_hours: int = Field(default=24, ge=1, le=168)


class ResolveAlertRequest(BaseModel):
    """알림 해결 요청"""
    alert_id: str
    notes: Optional[str] = None


class AcknowledgeAlertRequest(BaseModel):
    """알림 확인 요청"""
    alert_id: str


# ============ Endpoints ============

@router.get("/summary")
async def get_alert_summary(current_user: dict = Depends(get_current_user)):
    """이상 징후 알림 요약"""
    user_id = current_user.get("id")

    summary = get_anomaly_summary(user_id)

    # 메모리 기반 탐지기에서도 요약 가져오기
    detector = get_anomaly_detector()
    memory_summary = detector.get_alert_summary(user_id)

    # 두 요약 병합
    combined = {
        "total_active": summary["total_active"] + memory_summary.get("total_active", 0),
        "by_severity": {
            k: summary.get("by_severity", {}).get(k, 0) + memory_summary.get("by_severity", {}).get(k, 0)
            for k in ["critical", "high", "medium", "low"]
        },
        "by_platform": summary.get("by_platform", {}),
        "by_type": summary.get("by_type", {}),
        "needs_attention": summary.get("needs_attention", False) or memory_summary.get("needs_attention", False)
    }

    return {
        "success": True,
        "data": combined
    }


@router.get("/alerts")
async def get_alerts(
    platform_id: Optional[str] = None,
    severity: Optional[str] = None,
    include_resolved: bool = False,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """이상 징후 알림 목록 조회"""
    user_id = current_user.get("id")

    if include_resolved:
        alerts = get_anomaly_alert_history(
            user_id=user_id,
            platform_id=platform_id,
            days=30,
            limit=limit
        )
    else:
        alerts = get_active_anomaly_alerts(
            user_id=user_id,
            platform_id=platform_id,
            severity=severity,
            limit=limit
        )

    # 권장 조치 추가
    detector = get_anomaly_detector()
    for alert in alerts:
        try:
            anomaly_type = AnomalyType(alert.get("anomaly_type", ""))
            sev = AlertSeverity(alert.get("severity", "low"))

            # 간단한 권장 조치 생성
            action = _get_recommended_action(anomaly_type, sev)
            alert["recommended_action"] = action
        except Exception:
            alert["recommended_action"] = {"action": "모니터링 필요", "urgency": "review"}

    return {
        "success": True,
        "data": alerts,
        "total": len(alerts)
    }


@router.get("/alerts/{platform_id}/latest")
async def get_latest_alerts(
    platform_id: str,
    limit: int = 10,
    current_user: dict = Depends(get_current_user)
):
    """특정 플랫폼의 최신 알림"""
    user_id = current_user.get("id")

    alerts = get_active_anomaly_alerts(
        user_id=user_id,
        platform_id=platform_id,
        limit=limit
    )

    return {
        "success": True,
        "data": alerts
    }


@router.post("/analyze")
async def analyze_metrics(
    request: AnalyzeMetricsRequest,
    current_user: dict = Depends(get_current_user)
):
    """성과 메트릭 분석 및 이상 징후 탐지"""
    user_id = current_user.get("id")
    detector = get_anomaly_detector()

    alerts = detector.analyze_performance(
        user_id=user_id,
        platform_id=request.platform_id,
        current_metrics=request.metrics,
        campaign_id=request.campaign_id,
        keyword_id=request.keyword_id
    )

    # 알림을 DB에 저장
    from database.ad_optimization_db import save_anomaly_alert
    for alert in alerts:
        save_anomaly_alert(
            alert_id=alert.id,
            user_id=alert.user_id,
            platform_id=alert.platform_id,
            anomaly_type=alert.anomaly_type.value,
            severity=alert.severity.value,
            metric_name=alert.metric_name,
            current_value=alert.current_value,
            baseline_value=alert.baseline_value,
            change_percent=alert.change_percent,
            detected_at=alert.detected_at,
            z_score=alert.z_score,
            campaign_id=alert.campaign_id,
            keyword_id=alert.keyword_id
        )

    return {
        "success": True,
        "alerts_detected": len(alerts),
        "alerts": [
            {
                "id": a.id,
                "type": a.anomaly_type.value,
                "severity": a.severity.value,
                "metric": a.metric_name,
                "current_value": round(a.current_value, 2),
                "baseline_value": round(a.baseline_value, 2),
                "change_percent": round(a.change_percent, 1),
                "recommended_action": _get_recommended_action(a.anomaly_type, a.severity)
            }
            for a in alerts
        ]
    }


@router.post("/alerts/acknowledge")
async def acknowledge_alert(
    request: AcknowledgeAlertRequest,
    current_user: dict = Depends(get_current_user)
):
    """알림 확인 처리"""
    user_id = current_user.get("id")

    # DB에서 확인 처리
    result = acknowledge_anomaly_alert(request.alert_id, user_id)

    # 메모리에서도 확인 처리
    detector = get_anomaly_detector()
    detector.acknowledge_alert(user_id, request.alert_id)

    return {
        "success": True,
        "message": "알림이 확인되었습니다."
    }


@router.post("/alerts/resolve")
async def resolve_alert(
    request: ResolveAlertRequest,
    current_user: dict = Depends(get_current_user)
):
    """알림 해결 처리"""
    user_id = current_user.get("id")

    # DB에서 해결 처리
    result = resolve_anomaly_alert(request.alert_id, user_id, request.notes)

    # 메모리에서도 해결 처리
    detector = get_anomaly_detector()
    detector.resolve_alert(user_id, request.alert_id, request.notes)

    return {
        "success": True,
        "message": "알림이 해결 처리되었습니다."
    }


@router.post("/alerts/resolve-all")
async def resolve_all_alerts(
    platform_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """모든 알림 일괄 해결 (단일 SQL 배치 처리)"""
    user_id = current_user.get("id")

    count = batch_resolve_anomaly_alerts(user_id, platform_id, "일괄 해결 처리")

    # 메모리 캐시도 클리어
    detector = get_anomaly_detector()
    detector.clear_resolved_alerts(user_id)

    return {
        "success": True,
        "message": f"{count}개의 알림이 해결 처리되었습니다.",
        "resolved_count": count
    }


# ============ Thresholds ============

@router.get("/thresholds/{platform_id}")
async def get_thresholds(
    platform_id: str,
    current_user: dict = Depends(get_current_user)
):
    """이상 징후 임계값 설정 조회"""
    user_id = current_user.get("id")

    # 사용자 정의 임계값
    custom = get_anomaly_thresholds(user_id, platform_id)

    # 기본 임계값
    detector = get_anomaly_detector()
    default_thresholds = detector.get_thresholds(user_id, platform_id)

    # 병합
    thresholds = {}
    for anomaly_type, default in default_thresholds.items():
        thresholds[anomaly_type] = {
            "metric": default.metric,
            "low_threshold": default.low_threshold,
            "medium_threshold": default.medium_threshold,
            "high_threshold": default.high_threshold,
            "critical_threshold": default.critical_threshold,
            "direction": default.direction,
            "auto_action": default.auto_action.value if hasattr(default.auto_action, 'value') else default.auto_action,
            "lookback_hours": default.lookback_hours,
            "is_custom": False
        }

    # 사용자 정의로 덮어쓰기
    for custom_t in custom:
        anomaly_type = custom_t.get("anomaly_type")
        if anomaly_type:
            thresholds[anomaly_type] = {
                **custom_t,
                "is_custom": True
            }

    return {
        "success": True,
        "data": thresholds
    }


@router.post("/thresholds")
async def save_threshold(
    request: ThresholdConfigRequest,
    current_user: dict = Depends(get_current_user)
):
    """이상 징후 임계값 설정 저장"""
    user_id = current_user.get("id")

    # 유효성 검사
    if request.low_threshold >= request.medium_threshold:
        raise HTTPException(status_code=400, detail="low_threshold는 medium_threshold보다 작아야 합니다.")
    if request.medium_threshold >= request.high_threshold:
        raise HTTPException(status_code=400, detail="medium_threshold는 high_threshold보다 작아야 합니다.")
    if request.high_threshold >= request.critical_threshold:
        raise HTTPException(status_code=400, detail="high_threshold는 critical_threshold보다 작아야 합니다.")

    threshold_id = save_anomaly_threshold(
        user_id=user_id,
        platform_id=request.platform_id,
        anomaly_type=request.anomaly_type,
        metric=request.metric,
        low_threshold=request.low_threshold,
        medium_threshold=request.medium_threshold,
        high_threshold=request.high_threshold,
        critical_threshold=request.critical_threshold,
        direction=request.direction,
        auto_action=request.auto_action,
        lookback_hours=request.lookback_hours
    )

    return {
        "success": True,
        "message": f"임계값 설정이 저장되었습니다.",
        "threshold_id": threshold_id
    }


@router.delete("/thresholds/{platform_id}/{anomaly_type}")
async def reset_threshold(
    platform_id: str,
    anomaly_type: str,
    current_user: dict = Depends(get_current_user)
):
    """임계값 기본값으로 초기화"""
    # 사용자 정의 임계값 삭제 (실제로는 is_enabled = 0으로 설정)
    from database.ad_optimization_db import get_ad_db

    user_id = current_user.get("id")
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE anomaly_thresholds SET is_enabled = 0
        WHERE user_id = ? AND platform_id = ? AND anomaly_type = ?
    """, (user_id, platform_id, anomaly_type))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return {
        "success": True,
        "message": "임계값이 기본값으로 초기화되었습니다."
    }


# ============ Anomaly Types ============

@router.get("/types")
async def get_anomaly_types(current_user: dict = Depends(get_current_user)):
    """이상 징후 유형 목록"""
    types = [
        {
            "type": AnomalyType.CPC_SPIKE.value,
            "name": "CPC 급등",
            "description": "클릭당 비용이 급격히 상승",
            "metric": "cpc",
            "direction": "up",
            "icon": "📈"
        },
        {
            "type": AnomalyType.CTR_DROP.value,
            "name": "CTR 급락",
            "description": "클릭률이 급격히 하락",
            "metric": "ctr",
            "direction": "down",
            "icon": "📉"
        },
        {
            "type": AnomalyType.CVR_DROP.value,
            "name": "전환율 급락",
            "description": "전환율이 급격히 하락",
            "metric": "cvr",
            "direction": "down",
            "icon": "🔻"
        },
        {
            "type": AnomalyType.ROAS_DROP.value,
            "name": "ROAS 급락",
            "description": "광고 수익률이 급격히 하락",
            "metric": "roas",
            "direction": "down",
            "icon": "💸"
        },
        {
            "type": AnomalyType.SPEND_SPIKE.value,
            "name": "비용 급증",
            "description": "광고 비용이 예상보다 급증",
            "metric": "spend",
            "direction": "up",
            "icon": "💰"
        },
        {
            "type": AnomalyType.IMPRESSION_DROP.value,
            "name": "노출 급락",
            "description": "광고 노출이 급격히 감소",
            "metric": "impressions",
            "direction": "down",
            "icon": "👁️"
        },
    ]

    return {
        "success": True,
        "data": types
    }


@router.get("/severities")
async def get_severity_levels(current_user: dict = Depends(get_current_user)):
    """심각도 수준 목록"""
    levels = [
        {
            "level": AlertSeverity.LOW.value,
            "name": "주의",
            "description": "10-30% 변화, 모니터링 권장",
            "color": "#FFC107",
            "icon": "⚠️"
        },
        {
            "level": AlertSeverity.MEDIUM.value,
            "name": "경고",
            "description": "30-50% 변화, 점검 필요",
            "color": "#FF9800",
            "icon": "🔔"
        },
        {
            "level": AlertSeverity.HIGH.value,
            "name": "위험",
            "description": "50%+ 변화, 즉시 조치 권장",
            "color": "#F44336",
            "icon": "🚨"
        },
        {
            "level": AlertSeverity.CRITICAL.value,
            "name": "심각",
            "description": "긴급 조치 필요, 손실 위험",
            "color": "#D32F2F",
            "icon": "🆘"
        },
    ]

    return {
        "success": True,
        "data": levels
    }


# ============ Helper Functions ============

def _get_recommended_action(anomaly_type: AnomalyType, severity: AlertSeverity) -> Dict[str, str]:
    """권장 조치 생성"""
    actions = {
        AnomalyType.CPC_SPIKE: {
            AlertSeverity.LOW: ("입찰가 10% 감소 검토", "review"),
            AlertSeverity.MEDIUM: ("입찰가 20% 감소 권장", "review"),
            AlertSeverity.HIGH: ("입찰가 30% 감소 및 키워드 검토", "immediate"),
            AlertSeverity.CRITICAL: ("캠페인 일시 중지 및 원인 분석", "immediate"),
        },
        AnomalyType.CTR_DROP: {
            AlertSeverity.LOW: ("광고 소재 점검", "review"),
            AlertSeverity.MEDIUM: ("A/B 테스트 시작 권장", "review"),
            AlertSeverity.HIGH: ("광고 소재 즉시 교체 필요", "immediate"),
            AlertSeverity.CRITICAL: ("캠페인 재검토 및 타겟팅 수정", "immediate"),
        },
        AnomalyType.CVR_DROP: {
            AlertSeverity.LOW: ("랜딩페이지 점검", "review"),
            AlertSeverity.MEDIUM: ("랜딩페이지 A/B 테스트", "review"),
            AlertSeverity.HIGH: ("랜딩페이지 긴급 수정", "immediate"),
            AlertSeverity.CRITICAL: ("캠페인 중지 및 랜딩페이지 전면 수정", "immediate"),
        },
        AnomalyType.ROAS_DROP: {
            AlertSeverity.LOW: ("예산 배분 재검토", "review"),
            AlertSeverity.MEDIUM: ("저성과 키워드 입찰가 감소", "review"),
            AlertSeverity.HIGH: ("저성과 캠페인 예산 20% 감소", "immediate"),
            AlertSeverity.CRITICAL: ("긴급 예산 동결 및 원인 분석", "immediate"),
        },
        AnomalyType.SPEND_SPIKE: {
            AlertSeverity.LOW: ("예산 소진 속도 모니터링", "review"),
            AlertSeverity.MEDIUM: ("일일 예산 한도 검토", "review"),
            AlertSeverity.HIGH: ("예산 한도 긴급 조정", "immediate"),
            AlertSeverity.CRITICAL: ("캠페인 일시 중지", "immediate"),
        },
        AnomalyType.IMPRESSION_DROP: {
            AlertSeverity.LOW: ("입찰가 및 예산 점검", "review"),
            AlertSeverity.MEDIUM: ("경쟁 상황 분석", "review"),
            AlertSeverity.HIGH: ("입찰가 상향 검토", "immediate"),
            AlertSeverity.CRITICAL: ("긴급 캠페인 점검", "immediate"),
        },
    }

    action_data = actions.get(anomaly_type, {}).get(severity, ("모니터링 필요", "review"))

    return {
        "action": action_data[0],
        "urgency": action_data[1]
    }
