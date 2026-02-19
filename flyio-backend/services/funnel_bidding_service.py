"""
Funnel-Based Bidding Service - 퍼널 기반 입찰 최적화 서비스

마케팅 퍼널 단계(TOFU/MOFU/BOFU)에 따른 입찰 전략 최적화
- TOFU (Top of Funnel): 인지 단계 - 브랜드 인지도, 도달
- MOFU (Middle of Funnel): 고려 단계 - 관심, 참여, 트래픽
- BOFU (Bottom of Funnel): 전환 단계 - 구매, 리드, 전환
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Optional, Any
import logging

logger = logging.getLogger(__name__)


class FunnelStage(str, Enum):
    """퍼널 단계"""
    TOFU = "tofu"  # Top of Funnel - 인지
    MOFU = "mofu"  # Middle of Funnel - 고려
    BOFU = "bofu"  # Bottom of Funnel - 전환


class CampaignObjective(str, Enum):
    """캠페인 목표"""
    # TOFU 목표
    BRAND_AWARENESS = "brand_awareness"
    REACH = "reach"
    VIDEO_VIEWS = "video_views"

    # MOFU 목표
    TRAFFIC = "traffic"
    ENGAGEMENT = "engagement"
    APP_INSTALLS = "app_installs"
    LEAD_GENERATION = "lead_generation"

    # BOFU 목표
    CONVERSIONS = "conversions"
    CATALOG_SALES = "catalog_sales"
    STORE_TRAFFIC = "store_traffic"


class BiddingStrategy(str, Enum):
    """입찰 전략"""
    # TOFU 전략
    LOWEST_COST_REACH = "lowest_cost_reach"
    TARGET_CPM = "target_cpm"
    MAXIMIZE_REACH = "maximize_reach"

    # MOFU 전략
    LOWEST_COST_CLICK = "lowest_cost_click"
    TARGET_CPC = "target_cpc"
    MAXIMIZE_CLICKS = "maximize_clicks"

    # BOFU 전략
    LOWEST_COST_CONVERSION = "lowest_cost_conversion"
    TARGET_CPA = "target_cpa"
    TARGET_ROAS = "target_roas"
    MAXIMIZE_CONVERSIONS = "maximize_conversions"


# 목표-퍼널 매핑
OBJECTIVE_TO_FUNNEL = {
    CampaignObjective.BRAND_AWARENESS: FunnelStage.TOFU,
    CampaignObjective.REACH: FunnelStage.TOFU,
    CampaignObjective.VIDEO_VIEWS: FunnelStage.TOFU,
    CampaignObjective.TRAFFIC: FunnelStage.MOFU,
    CampaignObjective.ENGAGEMENT: FunnelStage.MOFU,
    CampaignObjective.APP_INSTALLS: FunnelStage.MOFU,
    CampaignObjective.LEAD_GENERATION: FunnelStage.MOFU,
    CampaignObjective.CONVERSIONS: FunnelStage.BOFU,
    CampaignObjective.CATALOG_SALES: FunnelStage.BOFU,
    CampaignObjective.STORE_TRAFFIC: FunnelStage.BOFU,
}


@dataclass
class FunnelCampaign:
    """퍼널 캠페인 정보"""
    campaign_id: str
    campaign_name: str
    platform: str
    objective: CampaignObjective
    funnel_stage: FunnelStage
    bidding_strategy: BiddingStrategy
    daily_budget: float

    # 성과 지표
    impressions: int = 0
    reach: int = 0
    clicks: int = 0
    conversions: int = 0
    spend: float = 0.0
    revenue: float = 0.0

    # 계산된 지표
    cpm: float = 0.0
    cpc: float = 0.0
    ctr: float = 0.0
    cpa: float = 0.0
    roas: float = 0.0
    conversion_rate: float = 0.0

    def __post_init__(self):
        self.calculate_metrics()

    def calculate_metrics(self):
        """지표 계산"""
        if self.impressions > 0:
            self.cpm = (self.spend / self.impressions) * 1000
            self.ctr = (self.clicks / self.impressions) * 100
        if self.clicks > 0:
            self.cpc = self.spend / self.clicks
            self.conversion_rate = (self.conversions / self.clicks) * 100
        if self.conversions > 0:
            self.cpa = self.spend / self.conversions
        if self.spend > 0:
            self.roas = (self.revenue / self.spend) * 100


@dataclass
class FunnelStageMetrics:
    """퍼널 단계별 집계 지표"""
    stage: FunnelStage
    campaign_count: int = 0
    total_budget: float = 0.0
    total_spend: float = 0.0
    total_impressions: int = 0
    total_reach: int = 0
    total_clicks: int = 0
    total_conversions: int = 0
    total_revenue: float = 0.0

    # 평균 지표
    avg_cpm: float = 0.0
    avg_cpc: float = 0.0
    avg_ctr: float = 0.0
    avg_cpa: float = 0.0
    avg_roas: float = 0.0

    # 벤치마크 대비 성과
    cpm_vs_benchmark: float = 0.0
    cpc_vs_benchmark: float = 0.0
    cpa_vs_benchmark: float = 0.0


@dataclass
class FunnelFlowAnalysis:
    """퍼널 흐름 분석"""
    tofu_reach: int = 0
    mofu_clicks: int = 0
    bofu_conversions: int = 0

    # 전환율
    tofu_to_mofu_rate: float = 0.0  # 도달 -> 클릭 전환율
    mofu_to_bofu_rate: float = 0.0  # 클릭 -> 전환 전환율
    overall_conversion_rate: float = 0.0  # 전체 전환율

    # 단계별 비용
    cost_per_tofu: float = 0.0
    cost_per_mofu: float = 0.0
    cost_per_bofu: float = 0.0


@dataclass
class BiddingRecommendation:
    """입찰 권장사항"""
    campaign_id: str
    campaign_name: str
    funnel_stage: FunnelStage
    current_strategy: BiddingStrategy
    recommended_strategy: BiddingStrategy
    reason: str
    expected_improvement: str
    priority: int  # 1-5

    # 구체적 권장값
    recommended_bid: Optional[float] = None
    recommended_budget: Optional[float] = None


@dataclass
class BudgetAllocationPlan:
    """퍼널별 예산 배분 계획"""
    total_budget: float
    tofu_budget: float
    tofu_percentage: float
    mofu_budget: float
    mofu_percentage: float
    bofu_budget: float
    bofu_percentage: float

    # 권장 대비 현재
    current_tofu_pct: float = 0.0
    current_mofu_pct: float = 0.0
    current_bofu_pct: float = 0.0

    adjustment_needed: bool = False
    recommendation: str = ""


class FunnelBiddingOptimizer:
    """퍼널 기반 입찰 최적화 엔진"""

    # 퍼널 단계별 벤치마크 (업종 평균)
    BENCHMARKS = {
        FunnelStage.TOFU: {
            "cpm": 3000,    # ₩3,000
            "ctr": 0.5,     # 0.5%
            "reach_rate": 80  # 80% 도달률
        },
        FunnelStage.MOFU: {
            "cpc": 500,     # ₩500
            "ctr": 2.0,     # 2%
            "engagement_rate": 5  # 5% 참여율
        },
        FunnelStage.BOFU: {
            "cpa": 20000,   # ₩20,000
            "roas": 300,    # 300%
            "conversion_rate": 3  # 3%
        }
    }

    # 퍼널 단계별 권장 예산 비율
    RECOMMENDED_BUDGET_SPLIT = {
        "awareness_focus": {  # 인지도 중심
            FunnelStage.TOFU: 0.50,
            FunnelStage.MOFU: 0.30,
            FunnelStage.BOFU: 0.20
        },
        "balanced": {  # 균형
            FunnelStage.TOFU: 0.30,
            FunnelStage.MOFU: 0.40,
            FunnelStage.BOFU: 0.30
        },
        "conversion_focus": {  # 전환 중심
            FunnelStage.TOFU: 0.20,
            FunnelStage.MOFU: 0.30,
            FunnelStage.BOFU: 0.50
        },
        "retargeting_heavy": {  # 리타겟팅 중심
            FunnelStage.TOFU: 0.15,
            FunnelStage.MOFU: 0.25,
            FunnelStage.BOFU: 0.60
        }
    }

    # 퍼널 단계별 권장 입찰 전략
    RECOMMENDED_STRATEGIES = {
        FunnelStage.TOFU: [
            BiddingStrategy.LOWEST_COST_REACH,
            BiddingStrategy.TARGET_CPM,
            BiddingStrategy.MAXIMIZE_REACH
        ],
        FunnelStage.MOFU: [
            BiddingStrategy.LOWEST_COST_CLICK,
            BiddingStrategy.TARGET_CPC,
            BiddingStrategy.MAXIMIZE_CLICKS
        ],
        FunnelStage.BOFU: [
            BiddingStrategy.TARGET_ROAS,
            BiddingStrategy.TARGET_CPA,
            BiddingStrategy.MAXIMIZE_CONVERSIONS
        ]
    }

    def __init__(self):
        pass

    def classify_campaign(self, objective: str) -> FunnelStage:
        """캠페인 목표로 퍼널 단계 분류"""
        try:
            obj = CampaignObjective(objective)
            return OBJECTIVE_TO_FUNNEL.get(obj, FunnelStage.MOFU)
        except ValueError:
            # 키워드 기반 분류
            obj_lower = objective.lower()
            if any(kw in obj_lower for kw in ['awareness', 'reach', 'brand', 'video']):
                return FunnelStage.TOFU
            elif any(kw in obj_lower for kw in ['traffic', 'click', 'engagement', 'lead']):
                return FunnelStage.MOFU
            elif any(kw in obj_lower for kw in ['conversion', 'sale', 'purchase', 'roas']):
                return FunnelStage.BOFU
            return FunnelStage.MOFU  # 기본값

    def calculate_stage_metrics(
        self,
        campaigns: List[FunnelCampaign]
    ) -> Dict[FunnelStage, FunnelStageMetrics]:
        """퍼널 단계별 지표 계산"""
        stage_data = {stage: FunnelStageMetrics(stage=stage) for stage in FunnelStage}

        for campaign in campaigns:
            stage = campaign.funnel_stage
            metrics = stage_data[stage]

            metrics.campaign_count += 1
            metrics.total_budget += campaign.daily_budget
            metrics.total_spend += campaign.spend
            metrics.total_impressions += campaign.impressions
            metrics.total_reach += campaign.reach
            metrics.total_clicks += campaign.clicks
            metrics.total_conversions += campaign.conversions
            metrics.total_revenue += campaign.revenue

        # 평균 지표 계산
        for stage, metrics in stage_data.items():
            if metrics.total_impressions > 0:
                metrics.avg_cpm = (metrics.total_spend / metrics.total_impressions) * 1000
                metrics.avg_ctr = (metrics.total_clicks / metrics.total_impressions) * 100
            if metrics.total_clicks > 0:
                metrics.avg_cpc = metrics.total_spend / metrics.total_clicks
            if metrics.total_conversions > 0:
                metrics.avg_cpa = metrics.total_spend / metrics.total_conversions
            if metrics.total_spend > 0:
                metrics.avg_roas = (metrics.total_revenue / metrics.total_spend) * 100

            # 벤치마크 대비
            benchmark = self.BENCHMARKS.get(stage, {})
            if benchmark:
                if benchmark.get('cpm') and metrics.avg_cpm > 0:
                    metrics.cpm_vs_benchmark = ((benchmark['cpm'] - metrics.avg_cpm) / benchmark['cpm']) * 100
                if benchmark.get('cpc') and metrics.avg_cpc > 0:
                    metrics.cpc_vs_benchmark = ((benchmark['cpc'] - metrics.avg_cpc) / benchmark['cpc']) * 100
                if benchmark.get('cpa') and metrics.avg_cpa > 0:
                    metrics.cpa_vs_benchmark = ((benchmark['cpa'] - metrics.avg_cpa) / benchmark['cpa']) * 100

        return stage_data

    def analyze_funnel_flow(
        self,
        campaigns: List[FunnelCampaign],
        stage_metrics: Dict = None
    ) -> FunnelFlowAnalysis:
        """퍼널 흐름 분석"""
        stage_metrics = stage_metrics or self.calculate_stage_metrics(campaigns)

        tofu = stage_metrics[FunnelStage.TOFU]
        mofu = stage_metrics[FunnelStage.MOFU]
        bofu = stage_metrics[FunnelStage.BOFU]

        analysis = FunnelFlowAnalysis(
            tofu_reach=tofu.total_reach or tofu.total_impressions,
            mofu_clicks=mofu.total_clicks,
            bofu_conversions=bofu.total_conversions
        )

        # 전환율 계산
        if analysis.tofu_reach > 0:
            analysis.tofu_to_mofu_rate = (analysis.mofu_clicks / analysis.tofu_reach) * 100
        if analysis.mofu_clicks > 0:
            analysis.mofu_to_bofu_rate = (analysis.bofu_conversions / analysis.mofu_clicks) * 100
        if analysis.tofu_reach > 0:
            analysis.overall_conversion_rate = (analysis.bofu_conversions / analysis.tofu_reach) * 100

        # 단계별 비용
        if analysis.tofu_reach > 0:
            analysis.cost_per_tofu = tofu.total_spend / analysis.tofu_reach
        if analysis.mofu_clicks > 0:
            analysis.cost_per_mofu = mofu.total_spend / analysis.mofu_clicks
        if analysis.bofu_conversions > 0:
            analysis.cost_per_bofu = bofu.total_spend / analysis.bofu_conversions

        return analysis

    def recommend_budget_allocation(
        self,
        campaigns: List[FunnelCampaign],
        strategy: str = "balanced"
    ) -> BudgetAllocationPlan:
        """퍼널별 예산 배분 권장"""
        stage_metrics = self.calculate_stage_metrics(campaigns)

        total_budget = sum(c.daily_budget for c in campaigns)
        total_spend = sum(c.spend for c in campaigns)

        # 현재 배분 계산
        current_tofu = stage_metrics[FunnelStage.TOFU].total_budget
        current_mofu = stage_metrics[FunnelStage.MOFU].total_budget
        current_bofu = stage_metrics[FunnelStage.BOFU].total_budget

        current_tofu_pct = (current_tofu / total_budget * 100) if total_budget > 0 else 0
        current_mofu_pct = (current_mofu / total_budget * 100) if total_budget > 0 else 0
        current_bofu_pct = (current_bofu / total_budget * 100) if total_budget > 0 else 0

        # 권장 배분
        recommended_split = self.RECOMMENDED_BUDGET_SPLIT.get(
            strategy,
            self.RECOMMENDED_BUDGET_SPLIT["balanced"]
        )

        plan = BudgetAllocationPlan(
            total_budget=total_budget,
            tofu_budget=total_budget * recommended_split[FunnelStage.TOFU],
            tofu_percentage=recommended_split[FunnelStage.TOFU] * 100,
            mofu_budget=total_budget * recommended_split[FunnelStage.MOFU],
            mofu_percentage=recommended_split[FunnelStage.MOFU] * 100,
            bofu_budget=total_budget * recommended_split[FunnelStage.BOFU],
            bofu_percentage=recommended_split[FunnelStage.BOFU] * 100,
            current_tofu_pct=current_tofu_pct,
            current_mofu_pct=current_mofu_pct,
            current_bofu_pct=current_bofu_pct
        )

        # 조정 필요 여부 판단
        tofu_diff = abs(current_tofu_pct - plan.tofu_percentage)
        mofu_diff = abs(current_mofu_pct - plan.mofu_percentage)
        bofu_diff = abs(current_bofu_pct - plan.bofu_percentage)

        if tofu_diff > 10 or mofu_diff > 10 or bofu_diff > 10:
            plan.adjustment_needed = True

            recommendations = []
            if current_tofu_pct < plan.tofu_percentage - 10:
                recommendations.append(f"TOFU 예산을 현재 {current_tofu_pct:.0f}%에서 {plan.tofu_percentage:.0f}%로 증가시키세요")
            elif current_tofu_pct > plan.tofu_percentage + 10:
                recommendations.append(f"TOFU 예산을 현재 {current_tofu_pct:.0f}%에서 {plan.tofu_percentage:.0f}%로 감소시키세요")

            if current_mofu_pct < plan.mofu_percentage - 10:
                recommendations.append(f"MOFU 예산을 현재 {current_mofu_pct:.0f}%에서 {plan.mofu_percentage:.0f}%로 증가시키세요")
            elif current_mofu_pct > plan.mofu_percentage + 10:
                recommendations.append(f"MOFU 예산을 현재 {current_mofu_pct:.0f}%에서 {plan.mofu_percentage:.0f}%로 감소시키세요")

            if current_bofu_pct < plan.bofu_percentage - 10:
                recommendations.append(f"BOFU 예산을 현재 {current_bofu_pct:.0f}%에서 {plan.bofu_percentage:.0f}%로 증가시키세요")
            elif current_bofu_pct > plan.bofu_percentage + 10:
                recommendations.append(f"BOFU 예산을 현재 {current_bofu_pct:.0f}%에서 {plan.bofu_percentage:.0f}%로 감소시키세요")

            plan.recommendation = ", ".join(recommendations) if recommendations else "현재 배분이 적절합니다"
        else:
            plan.recommendation = "현재 예산 배분이 권장 비율에 근접합니다"

        return plan

    def generate_bidding_recommendations(
        self,
        campaigns: List[FunnelCampaign],
        stage_metrics: Dict = None
    ) -> List[BiddingRecommendation]:
        """입찰 전략 권장사항 생성"""
        recommendations = []
        stage_metrics = stage_metrics or self.calculate_stage_metrics(campaigns)

        for campaign in campaigns:
            stage = campaign.funnel_stage
            benchmark = self.BENCHMARKS.get(stage, {})
            recommended_strategies = self.RECOMMENDED_STRATEGIES.get(stage, [])

            # 현재 전략이 해당 퍼널에 적합한지 확인
            if campaign.bidding_strategy not in recommended_strategies and recommended_strategies:
                recommendations.append(BiddingRecommendation(
                    campaign_id=campaign.campaign_id,
                    campaign_name=campaign.campaign_name,
                    funnel_stage=stage,
                    current_strategy=campaign.bidding_strategy,
                    recommended_strategy=recommended_strategies[0],
                    reason=f"현재 전략이 {stage.value.upper()} 단계에 최적화되어 있지 않습니다",
                    expected_improvement=f"{stage.value.upper()} 단계 최적 전략 사용 시 성과 15-25% 개선 예상",
                    priority=2
                ))

            # TOFU 캠페인 - CPM 기반 최적화
            if stage == FunnelStage.TOFU:
                if campaign.cpm > benchmark.get('cpm', 3000) * 1.2:
                    recommendations.append(BiddingRecommendation(
                        campaign_id=campaign.campaign_id,
                        campaign_name=campaign.campaign_name,
                        funnel_stage=stage,
                        current_strategy=campaign.bidding_strategy,
                        recommended_strategy=BiddingStrategy.LOWEST_COST_REACH,
                        reason=f"CPM ₩{campaign.cpm:,.0f}이 벤치마크 대비 높음",
                        expected_improvement="CPM 20-30% 절감 예상",
                        priority=3,
                        recommended_bid=benchmark.get('cpm', 3000)
                    ))

            # MOFU 캠페인 - CPC/CTR 기반 최적화
            elif stage == FunnelStage.MOFU:
                if campaign.cpc > benchmark.get('cpc', 500) * 1.3:
                    recommendations.append(BiddingRecommendation(
                        campaign_id=campaign.campaign_id,
                        campaign_name=campaign.campaign_name,
                        funnel_stage=stage,
                        current_strategy=campaign.bidding_strategy,
                        recommended_strategy=BiddingStrategy.TARGET_CPC,
                        reason=f"CPC ₩{campaign.cpc:,.0f}이 벤치마크 대비 높음",
                        expected_improvement="CPC 15-25% 절감 예상",
                        priority=2,
                        recommended_bid=benchmark.get('cpc', 500)
                    ))
                if campaign.ctr < benchmark.get('ctr', 2.0) * 0.7:
                    recommendations.append(BiddingRecommendation(
                        campaign_id=campaign.campaign_id,
                        campaign_name=campaign.campaign_name,
                        funnel_stage=stage,
                        current_strategy=campaign.bidding_strategy,
                        recommended_strategy=BiddingStrategy.MAXIMIZE_CLICKS,
                        reason=f"CTR {campaign.ctr:.2f}%가 벤치마크 대비 낮음",
                        expected_improvement="타겟팅 조정으로 CTR 개선 가능",
                        priority=3
                    ))

            # BOFU 캠페인 - CPA/ROAS 기반 최적화
            elif stage == FunnelStage.BOFU:
                if campaign.cpa > benchmark.get('cpa', 20000) * 1.2 and campaign.conversions > 0:
                    recommendations.append(BiddingRecommendation(
                        campaign_id=campaign.campaign_id,
                        campaign_name=campaign.campaign_name,
                        funnel_stage=stage,
                        current_strategy=campaign.bidding_strategy,
                        recommended_strategy=BiddingStrategy.TARGET_CPA,
                        reason=f"CPA ₩{campaign.cpa:,.0f}이 목표 대비 높음",
                        expected_improvement="CPA 20-30% 절감 예상",
                        priority=1,
                        recommended_bid=benchmark.get('cpa', 20000)
                    ))
                if campaign.roas < benchmark.get('roas', 300) * 0.8 and campaign.revenue > 0:
                    recommendations.append(BiddingRecommendation(
                        campaign_id=campaign.campaign_id,
                        campaign_name=campaign.campaign_name,
                        funnel_stage=stage,
                        current_strategy=campaign.bidding_strategy,
                        recommended_strategy=BiddingStrategy.TARGET_ROAS,
                        reason=f"ROAS {campaign.roas:.0f}%가 목표 대비 낮음",
                        expected_improvement="ROAS 기반 입찰로 수익성 개선",
                        priority=1
                    ))

        # 우선순위로 정렬
        recommendations.sort(key=lambda x: x.priority)
        return recommendations

    def get_stage_recommendations(self, stage: FunnelStage) -> Dict[str, Any]:
        """퍼널 단계별 권장사항"""
        benchmark = self.BENCHMARKS.get(stage, {})
        strategies = self.RECOMMENDED_STRATEGIES.get(stage, [])

        if stage == FunnelStage.TOFU:
            return {
                "stage": stage.value,
                "name": "인지 단계 (Top of Funnel)",
                "description": "브랜드 인지도 향상 및 잠재 고객 도달",
                "objectives": ["브랜드 인지도", "도달", "동영상 조회"],
                "primary_kpi": "CPM / 도달률",
                "target_audience": "콜드 오디언스 (신규 잠재고객)",
                "recommended_strategies": [s.value for s in strategies],
                "benchmarks": benchmark,
                "tips": [
                    "넓은 타겟팅으로 최대 도달 확보",
                    "브랜드 스토리 중심 크리에이티브",
                    "동영상/이미지 광고 활용",
                    "빈도 캡 설정으로 피로도 방지"
                ]
            }
        elif stage == FunnelStage.MOFU:
            return {
                "stage": stage.value,
                "name": "고려 단계 (Middle of Funnel)",
                "description": "관심 유도 및 참여 촉진",
                "objectives": ["트래픽", "참여", "앱 설치", "리드 생성"],
                "primary_kpi": "CPC / CTR",
                "target_audience": "웜 오디언스 (관심 표명 사용자)",
                "recommended_strategies": [s.value for s in strategies],
                "benchmarks": benchmark,
                "tips": [
                    "TOFU 참여자 리타겟팅",
                    "제품/서비스 상세 정보 제공",
                    "행동 유도 CTA 포함",
                    "랜딩 페이지 최적화 필수"
                ]
            }
        else:  # BOFU
            return {
                "stage": stage.value,
                "name": "전환 단계 (Bottom of Funnel)",
                "description": "구매/전환 유도",
                "objectives": ["전환", "카탈로그 판매", "매장 방문"],
                "primary_kpi": "CPA / ROAS",
                "target_audience": "핫 오디언스 (구매 의향 높은 사용자)",
                "recommended_strategies": [s.value for s in strategies],
                "benchmarks": benchmark,
                "tips": [
                    "장바구니 이탈자 리타겟팅",
                    "프로모션/할인 오퍼 활용",
                    "긴급성 부여 메시지",
                    "간편한 전환 경로 제공"
                ]
            }

    def get_summary(self, campaigns: List[FunnelCampaign]) -> Dict[str, Any]:
        """전체 퍼널 요약"""
        stage_metrics = self.calculate_stage_metrics(campaigns)
        flow_analysis = self.analyze_funnel_flow(campaigns, stage_metrics)
        recommendations = self.generate_bidding_recommendations(campaigns, stage_metrics)

        total_budget = sum(c.daily_budget for c in campaigns)
        total_spend = sum(c.spend for c in campaigns)
        total_conversions = sum(c.conversions for c in campaigns)
        total_revenue = sum(c.revenue for c in campaigns)

        return {
            "total_campaigns": len(campaigns),
            "total_budget": total_budget,
            "total_spend": total_spend,
            "total_conversions": total_conversions,
            "total_revenue": total_revenue,
            "overall_roas": (total_revenue / total_spend * 100) if total_spend > 0 else 0,
            "stage_distribution": {
                stage.value: {
                    "count": metrics.campaign_count,
                    "budget": metrics.total_budget,
                    "budget_pct": (metrics.total_budget / total_budget * 100) if total_budget > 0 else 0,
                    "spend": metrics.total_spend,
                    "primary_kpi": self._get_primary_kpi(stage, metrics)
                }
                for stage, metrics in stage_metrics.items()
            },
            "funnel_flow": {
                "tofu_reach": flow_analysis.tofu_reach,
                "mofu_clicks": flow_analysis.mofu_clicks,
                "bofu_conversions": flow_analysis.bofu_conversions,
                "tofu_to_mofu_rate": flow_analysis.tofu_to_mofu_rate,
                "mofu_to_bofu_rate": flow_analysis.mofu_to_bofu_rate,
                "overall_conversion_rate": flow_analysis.overall_conversion_rate
            },
            "recommendations_count": len(recommendations),
            "high_priority_count": len([r for r in recommendations if r.priority == 1])
        }

    def _get_primary_kpi(self, stage: FunnelStage, metrics: FunnelStageMetrics) -> Dict[str, Any]:
        """단계별 주요 KPI 반환"""
        if stage == FunnelStage.TOFU:
            return {
                "name": "CPM",
                "value": metrics.avg_cpm,
                "formatted": f"₩{metrics.avg_cpm:,.0f}",
                "vs_benchmark": metrics.cpm_vs_benchmark
            }
        elif stage == FunnelStage.MOFU:
            return {
                "name": "CPC",
                "value": metrics.avg_cpc,
                "formatted": f"₩{metrics.avg_cpc:,.0f}",
                "vs_benchmark": metrics.cpc_vs_benchmark
            }
        else:
            return {
                "name": "CPA",
                "value": metrics.avg_cpa,
                "formatted": f"₩{metrics.avg_cpa:,.0f}",
                "vs_benchmark": metrics.cpa_vs_benchmark
            }


# 싱글톤 인스턴스
funnel_bidding_optimizer = FunnelBiddingOptimizer()
