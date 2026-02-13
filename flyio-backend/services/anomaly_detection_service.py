"""
광고 성과 이상 징후 감지 서비스
- CPC 급등, CTR 급락, 전환율 하락 등 감지
- 통계적 이상 탐지 (Z-score, IQR)
- 자동 알림 및 보호 조치
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from enum import Enum
import logging
import statistics
import math

logger = logging.getLogger(__name__)


class AnomalyType(str, Enum):
    """이상 징후 유형"""
    CPC_SPIKE = "cpc_spike"           # CPC 급등
    CTR_DROP = "ctr_drop"             # CTR 급락
    CVR_DROP = "cvr_drop"             # 전환율 급락
    ROAS_DROP = "roas_drop"           # ROAS 급락
    SPEND_SPIKE = "spend_spike"       # 비용 급증
    IMPRESSION_DROP = "impression_drop"  # 노출수 급락
    CLICK_DROP = "click_drop"         # 클릭수 급락
    QUALITY_DROP = "quality_drop"     # 품질지수 하락


class AlertSeverity(str, Enum):
    """알림 심각도"""
    LOW = "low"           # 주의 (10-30% 변화)
    MEDIUM = "medium"     # 경고 (30-50% 변화)
    HIGH = "high"         # 위험 (50%+ 변화)
    CRITICAL = "critical" # 심각 (긴급 조치 필요)


class AutoAction(str, Enum):
    """자동 조치 유형"""
    NONE = "none"                 # 알림만
    REDUCE_BID = "reduce_bid"     # 입찰가 감소
    PAUSE_KEYWORD = "pause_keyword"  # 키워드 일시중지
    PAUSE_CAMPAIGN = "pause_campaign"  # 캠페인 일시중지
    REDUCE_BUDGET = "reduce_budget"   # 예산 감소


@dataclass
class AnomalyThreshold:
    """이상 징후 임계값 설정"""
    metric: str
    low_threshold: float      # 주의 수준 (예: 0.2 = 20% 변화)
    medium_threshold: float   # 경고 수준
    high_threshold: float     # 위험 수준
    critical_threshold: float # 심각 수준
    direction: str = "both"   # "up", "down", "both"
    auto_action: AutoAction = AutoAction.NONE
    lookback_hours: int = 24  # 비교 기간


@dataclass
class AnomalyAlert:
    """이상 징후 알림"""
    id: str
    user_id: int
    platform_id: str
    campaign_id: Optional[str]
    keyword_id: Optional[str]
    anomaly_type: AnomalyType
    severity: AlertSeverity
    metric_name: str
    current_value: float
    baseline_value: float
    change_percent: float
    z_score: Optional[float]
    detected_at: datetime
    resolved_at: Optional[datetime] = None
    auto_action_taken: Optional[AutoAction] = None
    is_acknowledged: bool = False
    notes: Optional[str] = None


@dataclass
class MetricHistory:
    """지표 히스토리"""
    values: List[float] = field(default_factory=list)
    timestamps: List[datetime] = field(default_factory=list)

    def add(self, value: float, timestamp: datetime = None):
        self.values.append(value)
        self.timestamps.append(timestamp or datetime.now())
        # 최근 168시간(7일)만 유지
        if len(self.values) > 168:
            self.values = self.values[-168:]
            self.timestamps = self.timestamps[-168:]

    def get_recent(self, hours: int = 24) -> List[float]:
        """최근 N시간 데이터"""
        cutoff = datetime.now() - timedelta(hours=hours)
        return [v for v, t in zip(self.values, self.timestamps) if t >= cutoff]

    def get_baseline(self, hours: int = 24, exclude_recent: int = 1) -> List[float]:
        """비교 기준 데이터 (최근 제외)"""
        now = datetime.now()
        start = now - timedelta(hours=hours + exclude_recent)
        end = now - timedelta(hours=exclude_recent)
        return [v for v, t in zip(self.values, self.timestamps) if start <= t <= end]


class AnomalyDetector:
    """이상 징후 탐지기"""

    # 기본 임계값 설정
    DEFAULT_THRESHOLDS = {
        AnomalyType.CPC_SPIKE: AnomalyThreshold(
            metric="cpc",
            low_threshold=0.2,      # 20% 증가
            medium_threshold=0.4,   # 40% 증가
            high_threshold=0.6,     # 60% 증가
            critical_threshold=1.0, # 100% 증가
            direction="up",
            auto_action=AutoAction.REDUCE_BID,
            lookback_hours=24
        ),
        AnomalyType.CTR_DROP: AnomalyThreshold(
            metric="ctr",
            low_threshold=0.15,
            medium_threshold=0.3,
            high_threshold=0.5,
            critical_threshold=0.7,
            direction="down",
            auto_action=AutoAction.NONE,
            lookback_hours=24
        ),
        AnomalyType.CVR_DROP: AnomalyThreshold(
            metric="cvr",
            low_threshold=0.2,
            medium_threshold=0.4,
            high_threshold=0.6,
            critical_threshold=0.8,
            direction="down",
            auto_action=AutoAction.NONE,
            lookback_hours=48
        ),
        AnomalyType.ROAS_DROP: AnomalyThreshold(
            metric="roas",
            low_threshold=0.2,
            medium_threshold=0.35,
            high_threshold=0.5,
            critical_threshold=0.7,
            direction="down",
            auto_action=AutoAction.REDUCE_BUDGET,
            lookback_hours=24
        ),
        AnomalyType.SPEND_SPIKE: AnomalyThreshold(
            metric="spend",
            low_threshold=0.3,
            medium_threshold=0.5,
            high_threshold=0.8,
            critical_threshold=1.5,
            direction="up",
            auto_action=AutoAction.REDUCE_BUDGET,
            lookback_hours=24
        ),
        AnomalyType.IMPRESSION_DROP: AnomalyThreshold(
            metric="impressions",
            low_threshold=0.3,
            medium_threshold=0.5,
            high_threshold=0.7,
            critical_threshold=0.9,
            direction="down",
            auto_action=AutoAction.NONE,
            lookback_hours=24
        ),
    }

    def __init__(self):
        # 사용자별/플랫폼별 메트릭 히스토리
        self._metric_history: Dict[str, Dict[str, MetricHistory]] = {}
        # 사용자별 커스텀 임계값
        self._custom_thresholds: Dict[str, Dict[AnomalyType, AnomalyThreshold]] = {}
        # 활성 알림
        self._active_alerts: Dict[str, List[AnomalyAlert]] = {}
        # 알림 카운터 (ID 생성용)
        self._alert_counter = 0

    def _get_history_key(self, user_id: int, platform_id: str, entity_id: str = "account") -> str:
        """히스토리 키 생성"""
        return f"{user_id}:{platform_id}:{entity_id}"

    def _get_metric_history(self, key: str, metric: str) -> MetricHistory:
        """메트릭 히스토리 가져오기 또는 생성"""
        if key not in self._metric_history:
            self._metric_history[key] = {}
        if metric not in self._metric_history[key]:
            self._metric_history[key][metric] = MetricHistory()
        return self._metric_history[key][metric]

    def record_metrics(
        self,
        user_id: int,
        platform_id: str,
        metrics: Dict[str, float],
        entity_id: str = "account",
        timestamp: datetime = None
    ):
        """성과 메트릭 기록"""
        key = self._get_history_key(user_id, platform_id, entity_id)
        ts = timestamp or datetime.now()

        for metric_name, value in metrics.items():
            history = self._get_metric_history(key, metric_name)
            history.add(value, ts)

    def calculate_z_score(self, values: List[float], current: float) -> Optional[float]:
        """Z-score 계산"""
        if len(values) < 3:
            return None

        try:
            mean = statistics.mean(values)
            stdev = statistics.stdev(values)
            if stdev == 0:
                return 0
            return (current - mean) / stdev
        except Exception:
            return None

    def calculate_iqr_bounds(self, values: List[float]) -> Tuple[float, float]:
        """IQR 기반 이상치 경계 계산"""
        if len(values) < 4:
            return (min(values) if values else 0, max(values) if values else float('inf'))

        sorted_vals = sorted(values)
        n = len(sorted_vals)
        q1 = sorted_vals[n // 4]
        q3 = sorted_vals[3 * n // 4]
        iqr = q3 - q1

        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr

        return (lower, upper)

    def detect_anomaly(
        self,
        user_id: int,
        platform_id: str,
        anomaly_type: AnomalyType,
        current_value: float,
        entity_id: str = "account",
        campaign_id: str = None,
        keyword_id: str = None
    ) -> Optional[AnomalyAlert]:
        """이상 징후 감지"""

        # 임계값 가져오기
        user_key = f"{user_id}:{platform_id}"
        if user_key in self._custom_thresholds and anomaly_type in self._custom_thresholds[user_key]:
            threshold = self._custom_thresholds[user_key][anomaly_type]
        else:
            threshold = self.DEFAULT_THRESHOLDS.get(anomaly_type)

        if not threshold:
            return None

        # 히스토리 가져오기
        key = self._get_history_key(user_id, platform_id, entity_id)
        history = self._get_metric_history(key, threshold.metric)

        # 기준선 데이터
        baseline_values = history.get_baseline(hours=threshold.lookback_hours)

        if len(baseline_values) < 3:
            # 데이터 부족
            return None

        # 기준선 계산
        baseline = statistics.mean(baseline_values)
        if baseline == 0:
            return None

        # 변화율 계산
        change = (current_value - baseline) / baseline

        # 방향 체크
        if threshold.direction == "up" and change <= 0:
            return None
        if threshold.direction == "down" and change >= 0:
            return None

        # 절대값으로 비교
        abs_change = abs(change)

        # 심각도 판단
        severity = None
        if abs_change >= threshold.critical_threshold:
            severity = AlertSeverity.CRITICAL
        elif abs_change >= threshold.high_threshold:
            severity = AlertSeverity.HIGH
        elif abs_change >= threshold.medium_threshold:
            severity = AlertSeverity.MEDIUM
        elif abs_change >= threshold.low_threshold:
            severity = AlertSeverity.LOW

        if not severity:
            return None

        # Z-score 계산
        z_score = self.calculate_z_score(baseline_values, current_value)

        # 알림 생성
        self._alert_counter += 1
        alert = AnomalyAlert(
            id=f"alert_{user_id}_{platform_id}_{self._alert_counter}",
            user_id=user_id,
            platform_id=platform_id,
            campaign_id=campaign_id,
            keyword_id=keyword_id,
            anomaly_type=anomaly_type,
            severity=severity,
            metric_name=threshold.metric,
            current_value=current_value,
            baseline_value=baseline,
            change_percent=change * 100,
            z_score=z_score,
            detected_at=datetime.now()
        )

        # 활성 알림에 추가
        if user_key not in self._active_alerts:
            self._active_alerts[user_key] = []
        self._active_alerts[user_key].append(alert)

        # 중복 방지: 같은 유형의 미해결 알림이 있으면 업데이트만
        existing = self._find_existing_alert(user_key, anomaly_type, campaign_id, keyword_id)
        if existing:
            existing.current_value = current_value
            existing.change_percent = change * 100
            existing.severity = severity
            return existing

        logger.warning(
            f"🚨 이상 징후 감지: {anomaly_type.value} - "
            f"플랫폼:{platform_id}, 변화:{change*100:.1f}%, 심각도:{severity.value}"
        )

        return alert

    def _find_existing_alert(
        self,
        user_key: str,
        anomaly_type: AnomalyType,
        campaign_id: str = None,
        keyword_id: str = None
    ) -> Optional[AnomalyAlert]:
        """기존 미해결 알림 찾기"""
        if user_key not in self._active_alerts:
            return None

        for alert in self._active_alerts[user_key]:
            if (alert.anomaly_type == anomaly_type and
                alert.resolved_at is None and
                alert.campaign_id == campaign_id and
                alert.keyword_id == keyword_id):
                return alert

        return None

    def analyze_performance(
        self,
        user_id: int,
        platform_id: str,
        current_metrics: Dict[str, float],
        campaign_id: str = None,
        keyword_id: str = None
    ) -> List[AnomalyAlert]:
        """성과 데이터 분석 및 이상 징후 감지"""
        alerts = []
        entity_id = keyword_id or campaign_id or "account"

        # 메트릭 기록
        self.record_metrics(user_id, platform_id, current_metrics, entity_id)

        # 각 이상 유형별 검사
        metric_to_anomaly = {
            "cpc": AnomalyType.CPC_SPIKE,
            "ctr": AnomalyType.CTR_DROP,
            "cvr": AnomalyType.CVR_DROP,
            "roas": AnomalyType.ROAS_DROP,
            "spend": AnomalyType.SPEND_SPIKE,
            "impressions": AnomalyType.IMPRESSION_DROP,
        }

        for metric_name, value in current_metrics.items():
            if metric_name in metric_to_anomaly:
                anomaly_type = metric_to_anomaly[metric_name]
                alert = self.detect_anomaly(
                    user_id=user_id,
                    platform_id=platform_id,
                    anomaly_type=anomaly_type,
                    current_value=value,
                    entity_id=entity_id,
                    campaign_id=campaign_id,
                    keyword_id=keyword_id
                )
                if alert:
                    alerts.append(alert)

        return alerts

    def get_active_alerts(
        self,
        user_id: int,
        platform_id: str = None,
        severity: AlertSeverity = None,
        limit: int = 50
    ) -> List[AnomalyAlert]:
        """활성 알림 조회"""
        all_alerts = []

        for key, alerts in self._active_alerts.items():
            if str(user_id) not in key:
                continue
            if platform_id and platform_id not in key:
                continue

            for alert in alerts:
                if alert.resolved_at is None:
                    if severity is None or alert.severity == severity:
                        all_alerts.append(alert)

        # 심각도 및 시간순 정렬
        severity_order = {
            AlertSeverity.CRITICAL: 0,
            AlertSeverity.HIGH: 1,
            AlertSeverity.MEDIUM: 2,
            AlertSeverity.LOW: 3
        }

        all_alerts.sort(key=lambda a: (severity_order.get(a.severity, 99), -a.detected_at.timestamp()))

        return all_alerts[:limit]

    def acknowledge_alert(self, user_id: int, alert_id: str) -> bool:
        """알림 확인 처리"""
        for key, alerts in self._active_alerts.items():
            if str(user_id) not in key:
                continue
            for alert in alerts:
                if alert.id == alert_id:
                    alert.is_acknowledged = True
                    return True
        return False

    def resolve_alert(self, user_id: int, alert_id: str, notes: str = None) -> bool:
        """알림 해결 처리"""
        for key, alerts in self._active_alerts.items():
            if str(user_id) not in key:
                continue
            for alert in alerts:
                if alert.id == alert_id:
                    alert.resolved_at = datetime.now()
                    if notes:
                        alert.notes = notes
                    return True
        return False

    def clear_resolved_alerts(self, user_id: int):
        """메모리에서 해당 사용자의 모든 활성 알림을 해결 처리"""
        now = datetime.now()
        for key, alerts in self._active_alerts.items():
            if str(user_id) not in key:
                continue
            for alert in alerts:
                if alert.resolved_at is None:
                    alert.resolved_at = now

    def set_custom_threshold(
        self,
        user_id: int,
        platform_id: str,
        anomaly_type: AnomalyType,
        threshold: AnomalyThreshold
    ):
        """사용자 정의 임계값 설정"""
        user_key = f"{user_id}:{platform_id}"
        if user_key not in self._custom_thresholds:
            self._custom_thresholds[user_key] = {}
        self._custom_thresholds[user_key][anomaly_type] = threshold

    def get_thresholds(self, user_id: int, platform_id: str) -> Dict[str, AnomalyThreshold]:
        """현재 임계값 설정 조회"""
        user_key = f"{user_id}:{platform_id}"
        custom = self._custom_thresholds.get(user_key, {})

        result = {}
        for anomaly_type, default_threshold in self.DEFAULT_THRESHOLDS.items():
            if anomaly_type in custom:
                result[anomaly_type.value] = custom[anomaly_type]
            else:
                result[anomaly_type.value] = default_threshold

        return result

    def get_recommended_action(self, alert: AnomalyAlert) -> Dict[str, Any]:
        """알림에 대한 권장 조치"""
        threshold = self.DEFAULT_THRESHOLDS.get(alert.anomaly_type)

        actions = {
            AnomalyType.CPC_SPIKE: {
                AlertSeverity.LOW: "입찰가 10% 감소 검토",
                AlertSeverity.MEDIUM: "입찰가 20% 감소 권장",
                AlertSeverity.HIGH: "입찰가 30% 감소 및 키워드 검토",
                AlertSeverity.CRITICAL: "캠페인 일시 중지 및 원인 분석",
            },
            AnomalyType.CTR_DROP: {
                AlertSeverity.LOW: "광고 소재 점검",
                AlertSeverity.MEDIUM: "A/B 테스트 시작 권장",
                AlertSeverity.HIGH: "광고 소재 즉시 교체 필요",
                AlertSeverity.CRITICAL: "캠페인 재검토 및 타겟팅 수정",
            },
            AnomalyType.CVR_DROP: {
                AlertSeverity.LOW: "랜딩페이지 점검",
                AlertSeverity.MEDIUM: "랜딩페이지 A/B 테스트",
                AlertSeverity.HIGH: "랜딩페이지 긴급 수정",
                AlertSeverity.CRITICAL: "캠페인 중지 및 랜딩페이지 전면 수정",
            },
            AnomalyType.ROAS_DROP: {
                AlertSeverity.LOW: "예산 배분 재검토",
                AlertSeverity.MEDIUM: "저성과 키워드 입찰가 감소",
                AlertSeverity.HIGH: "저성과 캠페인 예산 20% 감소",
                AlertSeverity.CRITICAL: "긴급 예산 동결 및 원인 분석",
            },
            AnomalyType.SPEND_SPIKE: {
                AlertSeverity.LOW: "예산 소진 속도 모니터링",
                AlertSeverity.MEDIUM: "일일 예산 한도 검토",
                AlertSeverity.HIGH: "예산 한도 긴급 조정",
                AlertSeverity.CRITICAL: "캠페인 일시 중지",
            },
        }

        action_text = actions.get(alert.anomaly_type, {}).get(
            alert.severity, "상황을 모니터링하세요."
        )

        return {
            "action": action_text,
            "auto_action": threshold.auto_action.value if threshold else "none",
            "urgency": "immediate" if alert.severity in [AlertSeverity.CRITICAL, AlertSeverity.HIGH] else "review"
        }

    def get_alert_summary(self, user_id: int) -> Dict[str, Any]:
        """사용자 알림 요약"""
        alerts = self.get_active_alerts(user_id)

        by_severity = {s.value: 0 for s in AlertSeverity}
        by_platform = {}
        by_type = {}

        for alert in alerts:
            by_severity[alert.severity.value] += 1
            by_platform[alert.platform_id] = by_platform.get(alert.platform_id, 0) + 1
            by_type[alert.anomaly_type.value] = by_type.get(alert.anomaly_type.value, 0) + 1

        return {
            "total_active": len(alerts),
            "by_severity": by_severity,
            "by_platform": by_platform,
            "by_type": by_type,
            "critical_count": by_severity.get("critical", 0),
            "high_count": by_severity.get("high", 0),
            "needs_attention": by_severity.get("critical", 0) + by_severity.get("high", 0) > 0
        }


# 싱글톤 인스턴스
_anomaly_detector: Optional[AnomalyDetector] = None


def get_anomaly_detector() -> AnomalyDetector:
    """이상 징후 탐지기 싱글톤 인스턴스"""
    global _anomaly_detector
    if _anomaly_detector is None:
        _anomaly_detector = AnomalyDetector()
    return _anomaly_detector
