"""
Budget Pacing Service - 예산 페이싱 최적화 서비스

일일/월간 예산을 시간대별로 최적화하여 분배하고,
예산 소진 속도를 모니터링하여 과소진/미소진을 방지합니다.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import List, Dict, Optional, Any
import logging
import math

logger = logging.getLogger(__name__)


class PacingStrategy(str, Enum):
    """예산 페이싱 전략"""
    STANDARD = "standard"           # 균등 분배 (하루 동안 균일하게)
    ACCELERATED = "accelerated"     # 가속 분배 (빠르게 소진)
    FRONT_LOADED = "front_loaded"   # 전반 집중 (오전에 집중)
    BACK_LOADED = "back_loaded"     # 후반 집중 (오후/저녁에 집중)
    PERFORMANCE = "performance"     # 성과 기반 (CTR/ROAS 높은 시간대 집중)
    DAYPARTING = "dayparting"       # 시간대별 맞춤 (커스텀)


class PacingStatus(str, Enum):
    """예산 소진 상태"""
    ON_TRACK = "on_track"           # 정상 (±10% 이내)
    UNDERSPENDING = "underspending" # 미소진 (10% 이상 느림)
    OVERSPENDING = "overspending"   # 과소진 (10% 이상 빠름)
    DEPLETED = "depleted"           # 소진 완료
    PAUSED = "paused"               # 일시 중지


class AlertSeverity(str, Enum):
    """알림 심각도"""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass
class HourlyBudget:
    """시간대별 예산 배분"""
    hour: int  # 0-23
    allocated_budget: float
    actual_spend: float = 0.0
    impressions: int = 0
    clicks: int = 0
    conversions: int = 0
    ctr: float = 0.0
    cpc: float = 0.0
    roas: float = 0.0

    @property
    def utilization(self) -> float:
        """예산 사용률"""
        if self.allocated_budget <= 0:
            return 0.0
        return min((self.actual_spend / self.allocated_budget) * 100, 100)

    @property
    def variance(self) -> float:
        """예산 대비 편차 (%)"""
        if self.allocated_budget <= 0:
            return 0.0
        return ((self.actual_spend - self.allocated_budget) / self.allocated_budget) * 100


@dataclass
class CampaignBudget:
    """캠페인 예산 정보"""
    campaign_id: str
    campaign_name: str
    platform: str
    daily_budget: float
    monthly_budget: float
    spent_today: float = 0.0
    spent_this_month: float = 0.0
    remaining_today: float = 0.0
    remaining_this_month: float = 0.0
    pacing_strategy: PacingStrategy = PacingStrategy.STANDARD
    pacing_status: PacingStatus = PacingStatus.ON_TRACK
    burn_rate: float = 0.0  # 시간당 소진율
    projected_daily_spend: float = 0.0
    projected_monthly_spend: float = 0.0
    hourly_budgets: List[HourlyBudget] = field(default_factory=list)

    def __post_init__(self):
        self.remaining_today = self.daily_budget - self.spent_today
        self.remaining_this_month = self.monthly_budget - self.spent_this_month


@dataclass
class PacingAnalysis:
    """예산 페이싱 분석 결과"""
    campaign_id: str
    analysis_time: datetime
    current_hour: int
    hours_elapsed: int
    hours_remaining: int

    # 예산 상태
    daily_budget: float
    spent_so_far: float
    expected_spend: float  # 현재까지 예상 지출
    actual_vs_expected: float  # 실제 vs 예상 (%)

    # 페이싱 상태
    pacing_status: PacingStatus
    burn_rate_per_hour: float
    projected_end_of_day_spend: float
    budget_utilization: float  # 일일 예산 사용률

    # 권장사항
    recommended_adjustment: float  # 권장 조정 비율 (%)
    recommended_hourly_budget: float
    confidence_score: float


@dataclass
class PacingAlert:
    """예산 페이싱 알림"""
    alert_id: str
    campaign_id: str
    campaign_name: str
    platform: str
    alert_type: str
    severity: AlertSeverity
    message: str
    current_value: float
    threshold_value: float
    recommended_action: str
    created_at: datetime


@dataclass
class PacingRecommendation:
    """페이싱 최적화 권장사항"""
    campaign_id: str
    recommendation_type: str
    title: str
    description: str
    current_strategy: PacingStrategy
    recommended_strategy: PacingStrategy
    expected_improvement: str
    priority: int  # 1-5
    hourly_adjustments: Dict[int, float] = field(default_factory=dict)


class BudgetPacingOptimizer:
    """예산 페이싱 최적화 엔진"""

    # 페이싱 전략별 시간대 가중치
    PACING_WEIGHTS = {
        PacingStrategy.STANDARD: {h: 1.0 for h in range(24)},
        PacingStrategy.ACCELERATED: {
            **{h: 1.5 for h in range(0, 12)},
            **{h: 0.5 for h in range(12, 24)}
        },
        PacingStrategy.FRONT_LOADED: {
            **{h: 0.5 for h in range(0, 6)},
            **{h: 1.8 for h in range(6, 12)},
            **{h: 1.0 for h in range(12, 18)},
            **{h: 0.5 for h in range(18, 24)}
        },
        PacingStrategy.BACK_LOADED: {
            **{h: 0.5 for h in range(0, 12)},
            **{h: 1.2 for h in range(12, 18)},
            **{h: 1.8 for h in range(18, 22)},
            **{h: 0.5 for h in range(22, 24)}
        }
    }

    # 상태별 임계값
    PACING_THRESHOLDS = {
        "underspending": -0.15,  # 15% 이상 미소진
        "overspending": 0.15,    # 15% 이상 과소진
        "critical_underspend": -0.30,
        "critical_overspend": 0.30
    }

    def __init__(self):
        self.campaigns: Dict[str, CampaignBudget] = {}
        self.analyses: List[PacingAnalysis] = []
        self.alerts: List[PacingAlert] = []
        self.recommendations: List[PacingRecommendation] = []

    def calculate_hourly_budget(
        self,
        daily_budget: float,
        strategy: PacingStrategy,
        performance_data: Optional[Dict[int, Dict]] = None
    ) -> Dict[int, float]:
        """시간대별 예산 배분 계산"""
        hourly_budgets = {}

        if strategy == PacingStrategy.PERFORMANCE and performance_data:
            # 성과 기반 배분: CTR/ROAS가 높은 시간대에 더 많이 배분
            total_weight = 0
            weights = {}

            for hour in range(24):
                perf = performance_data.get(hour, {})
                ctr = perf.get('ctr', 0.01)
                roas = perf.get('roas', 1.0)
                # CTR과 ROAS를 기반으로 가중치 계산
                weight = (ctr * 50) + (roas * 0.5)
                weight = max(weight, 0.1)  # 최소 가중치
                weights[hour] = weight
                total_weight += weight

            for hour in range(24):
                hourly_budgets[hour] = (weights[hour] / total_weight) * daily_budget

        elif strategy == PacingStrategy.DAYPARTING and performance_data:
            # 커스텀 시간대별 배분
            total_weight = sum(performance_data.get(h, {}).get('weight', 1.0) for h in range(24))
            for hour in range(24):
                weight = performance_data.get(hour, {}).get('weight', 1.0)
                hourly_budgets[hour] = (weight / total_weight) * daily_budget

        else:
            # 사전 정의된 전략 사용
            weights = self.PACING_WEIGHTS.get(strategy, self.PACING_WEIGHTS[PacingStrategy.STANDARD])
            total_weight = sum(weights.values())

            for hour in range(24):
                hourly_budgets[hour] = (weights[hour] / total_weight) * daily_budget

        return hourly_budgets

    def analyze_pacing(
        self,
        campaign: CampaignBudget,
        current_time: Optional[datetime] = None
    ) -> PacingAnalysis:
        """캠페인 예산 페이싱 분석"""
        if current_time is None:
            current_time = datetime.now()

        current_hour = current_time.hour
        hours_elapsed = current_hour + 1  # 0시부터 현재까지
        hours_remaining = 24 - hours_elapsed

        # 예상 지출 계산 (현재 시간까지)
        hourly_budgets = self.calculate_hourly_budget(
            campaign.daily_budget,
            campaign.pacing_strategy
        )
        expected_spend = sum(hourly_budgets[h] for h in range(hours_elapsed))

        # 실제 vs 예상 비교
        if expected_spend > 0:
            actual_vs_expected = ((campaign.spent_today - expected_spend) / expected_spend) * 100
        else:
            actual_vs_expected = 0.0

        # 페이싱 상태 결정
        if campaign.spent_today >= campaign.daily_budget:
            pacing_status = PacingStatus.DEPLETED
        elif actual_vs_expected < self.PACING_THRESHOLDS["underspending"] * 100:
            pacing_status = PacingStatus.UNDERSPENDING
        elif actual_vs_expected > self.PACING_THRESHOLDS["overspending"] * 100:
            pacing_status = PacingStatus.OVERSPENDING
        else:
            pacing_status = PacingStatus.ON_TRACK

        # 시간당 소진율
        burn_rate = campaign.spent_today / hours_elapsed if hours_elapsed > 0 else 0

        # 일말 예상 지출
        projected_eod = campaign.spent_today + (burn_rate * hours_remaining)

        # 예산 사용률
        utilization = (campaign.spent_today / campaign.daily_budget * 100) if campaign.daily_budget > 0 else 0

        # 권장 조정
        if pacing_status == PacingStatus.UNDERSPENDING:
            # 미소진 시 남은 시간에 더 지출 필요
            recommended_adjustment = ((expected_spend - campaign.spent_today) / hours_remaining * 100) if hours_remaining > 0 else 0
        elif pacing_status == PacingStatus.OVERSPENDING:
            # 과소진 시 남은 시간에 지출 감소 필요
            recommended_adjustment = -((campaign.spent_today - expected_spend) / hours_remaining * 100) if hours_remaining > 0 else 0
        else:
            recommended_adjustment = 0.0

        # 권장 시간당 예산
        remaining_budget = campaign.daily_budget - campaign.spent_today
        recommended_hourly = remaining_budget / hours_remaining if hours_remaining > 0 else 0

        # 신뢰도 점수 (데이터가 많을수록 높음)
        confidence = min(hours_elapsed / 12, 1.0) * 100

        analysis = PacingAnalysis(
            campaign_id=campaign.campaign_id,
            analysis_time=current_time,
            current_hour=current_hour,
            hours_elapsed=hours_elapsed,
            hours_remaining=hours_remaining,
            daily_budget=campaign.daily_budget,
            spent_so_far=campaign.spent_today,
            expected_spend=expected_spend,
            actual_vs_expected=actual_vs_expected,
            pacing_status=pacing_status,
            burn_rate_per_hour=burn_rate,
            projected_end_of_day_spend=projected_eod,
            budget_utilization=utilization,
            recommended_adjustment=recommended_adjustment,
            recommended_hourly_budget=recommended_hourly,
            confidence_score=confidence
        )

        self.analyses.append(analysis)
        return analysis

    def detect_pacing_issues(
        self,
        campaigns: List[CampaignBudget],
        current_time: Optional[datetime] = None
    ) -> List[PacingAlert]:
        """예산 페이싱 이슈 감지"""
        if current_time is None:
            current_time = datetime.now()

        alerts = []

        for campaign in campaigns:
            analysis = self.analyze_pacing(campaign, current_time)

            # 심각한 미소진
            if analysis.actual_vs_expected < self.PACING_THRESHOLDS["critical_underspend"] * 100:
                alerts.append(PacingAlert(
                    alert_id=f"alert_{campaign.campaign_id}_{current_time.timestamp()}",
                    campaign_id=campaign.campaign_id,
                    campaign_name=campaign.campaign_name,
                    platform=campaign.platform,
                    alert_type="critical_underspend",
                    severity=AlertSeverity.CRITICAL,
                    message=f"심각한 예산 미소진: 예상 대비 {abs(analysis.actual_vs_expected):.1f}% 부족",
                    current_value=campaign.spent_today,
                    threshold_value=analysis.expected_spend,
                    recommended_action="입찰가 상향 또는 타겟 확대를 고려하세요",
                    created_at=current_time
                ))

            # 일반 미소진
            elif analysis.pacing_status == PacingStatus.UNDERSPENDING:
                alerts.append(PacingAlert(
                    alert_id=f"alert_{campaign.campaign_id}_{current_time.timestamp()}",
                    campaign_id=campaign.campaign_id,
                    campaign_name=campaign.campaign_name,
                    platform=campaign.platform,
                    alert_type="underspend",
                    severity=AlertSeverity.WARNING,
                    message=f"예산 미소진: 예상 대비 {abs(analysis.actual_vs_expected):.1f}% 부족",
                    current_value=campaign.spent_today,
                    threshold_value=analysis.expected_spend,
                    recommended_action="입찰 전략 또는 타겟팅을 검토하세요",
                    created_at=current_time
                ))

            # 심각한 과소진
            elif analysis.actual_vs_expected > self.PACING_THRESHOLDS["critical_overspend"] * 100:
                alerts.append(PacingAlert(
                    alert_id=f"alert_{campaign.campaign_id}_{current_time.timestamp()}",
                    campaign_id=campaign.campaign_id,
                    campaign_name=campaign.campaign_name,
                    platform=campaign.platform,
                    alert_type="critical_overspend",
                    severity=AlertSeverity.CRITICAL,
                    message=f"심각한 예산 과소진: 예상 대비 {analysis.actual_vs_expected:.1f}% 초과",
                    current_value=campaign.spent_today,
                    threshold_value=analysis.expected_spend,
                    recommended_action="입찰가 하향 또는 예산 상향을 즉시 고려하세요",
                    created_at=current_time
                ))

            # 일반 과소진
            elif analysis.pacing_status == PacingStatus.OVERSPENDING:
                alerts.append(PacingAlert(
                    alert_id=f"alert_{campaign.campaign_id}_{current_time.timestamp()}",
                    campaign_id=campaign.campaign_id,
                    campaign_name=campaign.campaign_name,
                    platform=campaign.platform,
                    alert_type="overspend",
                    severity=AlertSeverity.WARNING,
                    message=f"예산 과소진: 예상 대비 {analysis.actual_vs_expected:.1f}% 초과",
                    current_value=campaign.spent_today,
                    threshold_value=analysis.expected_spend,
                    recommended_action="입찰 전략을 검토하거나 일일 예산을 조정하세요",
                    created_at=current_time
                ))

            # 예산 소진 완료
            if analysis.pacing_status == PacingStatus.DEPLETED and analysis.hours_remaining > 6:
                alerts.append(PacingAlert(
                    alert_id=f"alert_{campaign.campaign_id}_{current_time.timestamp()}_depleted",
                    campaign_id=campaign.campaign_id,
                    campaign_name=campaign.campaign_name,
                    platform=campaign.platform,
                    alert_type="early_depletion",
                    severity=AlertSeverity.CRITICAL,
                    message=f"예산 조기 소진: {analysis.hours_remaining}시간 남기고 일일 예산 소진",
                    current_value=campaign.spent_today,
                    threshold_value=campaign.daily_budget,
                    recommended_action="일일 예산 증액 또는 페이싱 전략 변경을 고려하세요",
                    created_at=current_time
                ))

        self.alerts.extend(alerts)
        return alerts

    def generate_recommendations(
        self,
        campaigns: List[CampaignBudget],
        performance_history: Optional[Dict[str, Dict]] = None
    ) -> List[PacingRecommendation]:
        """페이싱 최적화 권장사항 생성"""
        recommendations = []

        for campaign in campaigns:
            analysis = self.analyze_pacing(campaign)

            # 전략 변경 권장
            if analysis.pacing_status == PacingStatus.UNDERSPENDING:
                if campaign.pacing_strategy == PacingStrategy.STANDARD:
                    recommendations.append(PacingRecommendation(
                        campaign_id=campaign.campaign_id,
                        recommendation_type="strategy_change",
                        title="가속 페이싱 전략으로 전환",
                        description="지속적인 예산 미소진으로 인해 가속 페이싱 전략을 권장합니다. 이를 통해 예산을 더 효율적으로 사용할 수 있습니다.",
                        current_strategy=campaign.pacing_strategy,
                        recommended_strategy=PacingStrategy.ACCELERATED,
                        expected_improvement="예산 사용률 20-30% 개선 예상",
                        priority=2
                    ))

                recommendations.append(PacingRecommendation(
                    campaign_id=campaign.campaign_id,
                    recommendation_type="bid_adjustment",
                    title="입찰가 상향 조정",
                    description=f"현재 예산 사용률이 {analysis.budget_utilization:.1f}%입니다. 입찰가를 10-20% 상향하여 노출을 늘리는 것을 권장합니다.",
                    current_strategy=campaign.pacing_strategy,
                    recommended_strategy=campaign.pacing_strategy,
                    expected_improvement="노출 및 클릭 증가, 예산 사용률 개선",
                    priority=3
                ))

            elif analysis.pacing_status == PacingStatus.OVERSPENDING:
                if campaign.pacing_strategy == PacingStrategy.ACCELERATED:
                    recommendations.append(PacingRecommendation(
                        campaign_id=campaign.campaign_id,
                        recommendation_type="strategy_change",
                        title="표준 페이싱 전략으로 전환",
                        description="예산이 너무 빠르게 소진되고 있습니다. 표준 페이싱 전략으로 전환하여 하루 동안 균등하게 예산을 분배하세요.",
                        current_strategy=campaign.pacing_strategy,
                        recommended_strategy=PacingStrategy.STANDARD,
                        expected_improvement="예산 소진 속도 안정화, 오후/저녁 노출 기회 확보",
                        priority=1
                    ))

                recommendations.append(PacingRecommendation(
                    campaign_id=campaign.campaign_id,
                    recommendation_type="budget_increase",
                    title="일일 예산 증액 검토",
                    description=f"현재 소진율로 예상 시 일일 예산의 {analysis.projected_end_of_day_spend/campaign.daily_budget*100:.0f}%를 사용할 것으로 예상됩니다. 예산 증액을 고려하세요.",
                    current_strategy=campaign.pacing_strategy,
                    recommended_strategy=campaign.pacing_strategy,
                    expected_improvement="광고 노출 기회 확대, 전환 증가",
                    priority=2
                ))

            # 성과 기반 전략 권장
            if performance_history and campaign.campaign_id in performance_history:
                perf_data = performance_history[campaign.campaign_id]
                high_perf_hours = [h for h, p in perf_data.items() if p.get('roas', 0) > 2.0]

                if len(high_perf_hours) >= 4 and campaign.pacing_strategy != PacingStrategy.PERFORMANCE:
                    # 고성과 시간대에 맞는 시간별 조정 계산
                    hourly_adj = {}
                    for h in range(24):
                        if h in high_perf_hours:
                            hourly_adj[h] = 1.5  # 50% 더 많이
                        else:
                            hourly_adj[h] = 0.7  # 30% 덜

                    recommendations.append(PacingRecommendation(
                        campaign_id=campaign.campaign_id,
                        recommendation_type="strategy_change",
                        title="성과 기반 페이싱 전략 적용",
                        description=f"ROAS가 높은 시간대({len(high_perf_hours)}시간)가 식별되었습니다. 해당 시간대에 예산을 집중하면 전체 ROAS를 개선할 수 있습니다.",
                        current_strategy=campaign.pacing_strategy,
                        recommended_strategy=PacingStrategy.PERFORMANCE,
                        expected_improvement="ROAS 15-25% 개선 예상",
                        priority=1,
                        hourly_adjustments=hourly_adj
                    ))

        self.recommendations.extend(recommendations)
        return recommendations

    def get_optimal_hourly_distribution(
        self,
        daily_budget: float,
        performance_data: Dict[int, Dict],
        min_hourly_budget: float = 0.0
    ) -> Dict[int, float]:
        """최적 시간대별 예산 분배 계산"""
        # ROAS와 CTR 기반 가중치 계산
        weights = {}
        for hour in range(24):
            perf = performance_data.get(hour, {})
            roas = perf.get('roas', 1.0)
            ctr = perf.get('ctr', 0.01)
            conversions = perf.get('conversions', 0)

            # 복합 점수 계산
            weight = (roas * 0.4) + (ctr * 20) + (conversions * 0.1)
            weight = max(weight, 0.1)  # 최소값 보장
            weights[hour] = weight

        # 가중치 정규화
        total_weight = sum(weights.values())
        hourly_budgets = {}

        for hour in range(24):
            budget = (weights[hour] / total_weight) * daily_budget
            hourly_budgets[hour] = max(budget, min_hourly_budget)

        # 최소 예산 적용 후 재조정
        actual_total = sum(hourly_budgets.values())
        if actual_total > daily_budget:
            scale = daily_budget / actual_total
            hourly_budgets = {h: b * scale for h, b in hourly_budgets.items()}

        return hourly_budgets

    def project_monthly_spend(
        self,
        campaign: CampaignBudget,
        current_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """월간 예산 소진 예측"""
        if current_date is None:
            current_date = datetime.now()

        day_of_month = current_date.day
        days_in_month = 30  # 간소화
        days_remaining = days_in_month - day_of_month

        # 일평균 지출 계산
        if day_of_month > 0:
            daily_avg_spend = campaign.spent_this_month / day_of_month
        else:
            daily_avg_spend = campaign.spent_today

        # 월말 예상 지출
        projected_monthly = campaign.spent_this_month + (daily_avg_spend * days_remaining)

        # 월간 예산 대비 상태
        monthly_utilization = (campaign.spent_this_month / campaign.monthly_budget * 100) if campaign.monthly_budget > 0 else 0
        expected_utilization = (day_of_month / days_in_month * 100)

        if monthly_utilization < expected_utilization - 10:
            monthly_status = "underspending"
        elif monthly_utilization > expected_utilization + 10:
            monthly_status = "overspending"
        else:
            monthly_status = "on_track"

        # 권장 일일 예산 (월간 목표 달성을 위해)
        remaining_monthly = campaign.monthly_budget - campaign.spent_this_month
        recommended_daily = remaining_monthly / days_remaining if days_remaining > 0 else 0

        return {
            "campaign_id": campaign.campaign_id,
            "monthly_budget": campaign.monthly_budget,
            "spent_this_month": campaign.spent_this_month,
            "projected_monthly_spend": projected_monthly,
            "monthly_utilization": monthly_utilization,
            "expected_utilization": expected_utilization,
            "monthly_status": monthly_status,
            "days_remaining": days_remaining,
            "daily_avg_spend": daily_avg_spend,
            "recommended_daily_budget": recommended_daily,
            "projected_surplus_deficit": campaign.monthly_budget - projected_monthly
        }

    def get_summary(self, campaigns: List[CampaignBudget]) -> Dict[str, Any]:
        """전체 예산 페이싱 요약"""
        if not campaigns:
            return {
                "total_campaigns": 0,
                "total_daily_budget": 0,
                "total_spent_today": 0,
                "overall_utilization": 0,
                "status_distribution": {},
                "alerts_count": {"critical": 0, "warning": 0, "info": 0}
            }

        total_daily_budget = sum(c.daily_budget for c in campaigns)
        total_spent = sum(c.spent_today for c in campaigns)

        # 상태별 분포
        status_dist = {}
        for campaign in campaigns:
            analysis = self.analyze_pacing(campaign)
            status = analysis.pacing_status.value
            status_dist[status] = status_dist.get(status, 0) + 1

        # 알림 분포
        alerts = self.detect_pacing_issues(campaigns)
        alert_counts = {"critical": 0, "warning": 0, "info": 0}
        for alert in alerts:
            alert_counts[alert.severity.value] = alert_counts.get(alert.severity.value, 0) + 1

        return {
            "total_campaigns": len(campaigns),
            "total_daily_budget": total_daily_budget,
            "total_spent_today": total_spent,
            "overall_utilization": (total_spent / total_daily_budget * 100) if total_daily_budget > 0 else 0,
            "status_distribution": status_dist,
            "alerts_count": alert_counts,
            "on_track_rate": (status_dist.get("on_track", 0) / len(campaigns) * 100) if campaigns else 0
        }


# 싱글톤 인스턴스
budget_pacing_optimizer = BudgetPacingOptimizer()
