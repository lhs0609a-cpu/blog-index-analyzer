"""
크로스 플랫폼 예산 재분배 서비스
- 여러 광고 플랫폼의 성과를 분석하여 예산 최적 배분
- ROAS, CPA, 전환율 기반 예산 이동
- 자동 재분배 및 수동 추천
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from enum import Enum
import logging
import statistics

logger = logging.getLogger(__name__)


class ReallocationStrategy(str, Enum):
    """예산 재분배 전략"""
    MAXIMIZE_ROAS = "maximize_roas"       # ROAS 최대화
    MINIMIZE_CPA = "minimize_cpa"         # CPA 최소화
    MAXIMIZE_CONVERSIONS = "maximize_conversions"  # 전환수 최대화
    BALANCED = "balanced"                 # 균형 (ROAS + CPA + 전환)
    CONSERVATIVE = "conservative"         # 보수적 (소폭 조정만)


class AllocationPriority(str, Enum):
    """플랫폼 우선순위"""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    EXCLUDE = "exclude"  # 재분배에서 제외


@dataclass
class PlatformPerformance:
    """플랫폼 성과 데이터"""
    platform_id: str
    platform_name: str
    current_budget: float
    spend: float
    impressions: int
    clicks: int
    conversions: int
    revenue: float

    # 계산된 지표
    @property
    def ctr(self) -> float:
        return (self.clicks / self.impressions * 100) if self.impressions > 0 else 0

    @property
    def cpc(self) -> float:
        return self.spend / self.clicks if self.clicks > 0 else 0

    @property
    def cpa(self) -> float:
        return self.spend / self.conversions if self.conversions > 0 else float('inf')

    @property
    def roas(self) -> float:
        return (self.revenue / self.spend * 100) if self.spend > 0 else 0

    @property
    def conversion_rate(self) -> float:
        return (self.conversions / self.clicks * 100) if self.clicks > 0 else 0

    @property
    def efficiency_score(self) -> float:
        """효율성 점수 (0-100)"""
        # ROAS 점수 (0-40점)
        roas_score = min(40, self.roas / 10)

        # CPA 점수 (0-30점) - 낮을수록 좋음
        if self.cpa == float('inf'):
            cpa_score = 0
        else:
            cpa_score = max(0, 30 - (self.cpa / 1000))

        # 전환율 점수 (0-20점)
        cvr_score = min(20, self.conversion_rate * 4)

        # CTR 점수 (0-10점)
        ctr_score = min(10, self.ctr * 2)

        return roas_score + cpa_score + cvr_score + ctr_score


@dataclass
class BudgetReallocation:
    """예산 재분배 제안"""
    platform_id: str
    platform_name: str
    current_budget: float
    suggested_budget: float
    change_amount: float
    change_percent: float
    reason: str
    priority: AllocationPriority
    expected_impact: Dict[str, float]  # 예상 영향


@dataclass
class ReallocationPlan:
    """전체 재분배 계획"""
    id: str
    user_id: int
    created_at: datetime
    strategy: ReallocationStrategy
    total_budget: float
    reallocations: List[BudgetReallocation]
    expected_roas_improvement: float
    expected_cpa_reduction: float
    expected_conversion_increase: int
    is_applied: bool = False
    applied_at: Optional[datetime] = None
    notes: Optional[str] = None


class CrossPlatformBudgetOptimizer:
    """크로스 플랫폼 예산 최적화기"""

    # 플랫폼별 최소 예산 (원)
    MIN_PLATFORM_BUDGET = {
        "naver": 10000,
        "google": 5000,
        "meta": 5000,
        "kakao": 10000,
        "coupang": 10000,
        "default": 10000
    }

    # 한 번에 이동 가능한 최대 예산 비율
    MAX_REALLOCATION_RATIO = 0.3  # 30%

    # 성과 점수 가중치
    SCORE_WEIGHTS = {
        ReallocationStrategy.MAXIMIZE_ROAS: {"roas": 0.6, "conversions": 0.2, "cpa": 0.2},
        ReallocationStrategy.MINIMIZE_CPA: {"cpa": 0.6, "conversions": 0.2, "roas": 0.2},
        ReallocationStrategy.MAXIMIZE_CONVERSIONS: {"conversions": 0.5, "roas": 0.3, "cpa": 0.2},
        ReallocationStrategy.BALANCED: {"roas": 0.35, "cpa": 0.35, "conversions": 0.3},
        ReallocationStrategy.CONSERVATIVE: {"roas": 0.4, "cpa": 0.3, "conversions": 0.3},
    }

    def __init__(self):
        self._plan_counter = 0
        self._active_plans: Dict[int, ReallocationPlan] = {}
        self._platform_priorities: Dict[str, Dict[str, AllocationPriority]] = {}

    def _get_min_budget(self, platform_id: str) -> float:
        """플랫폼별 최소 예산"""
        for key in self.MIN_PLATFORM_BUDGET:
            if key in platform_id.lower():
                return self.MIN_PLATFORM_BUDGET[key]
        return self.MIN_PLATFORM_BUDGET["default"]

    def calculate_platform_score(
        self,
        perf: PlatformPerformance,
        strategy: ReallocationStrategy,
        all_performances: List[PlatformPerformance]
    ) -> float:
        """전략에 따른 플랫폼 점수 계산 (0-100)"""
        weights = self.SCORE_WEIGHTS.get(strategy, self.SCORE_WEIGHTS[ReallocationStrategy.BALANCED])

        # 정규화를 위한 전체 통계
        all_roas = [p.roas for p in all_performances if p.roas > 0]
        all_cpa = [p.cpa for p in all_performances if p.cpa < float('inf')]
        all_conv = [p.conversions for p in all_performances]

        # ROAS 점수 (높을수록 좋음)
        if all_roas:
            max_roas = max(all_roas)
            roas_score = (perf.roas / max_roas * 100) if max_roas > 0 else 0
        else:
            roas_score = 0

        # CPA 점수 (낮을수록 좋음)
        if all_cpa and perf.cpa < float('inf'):
            min_cpa = min(all_cpa)
            max_cpa = max(all_cpa)
            if max_cpa > min_cpa:
                cpa_score = (1 - (perf.cpa - min_cpa) / (max_cpa - min_cpa)) * 100
            else:
                cpa_score = 100
        else:
            cpa_score = 0

        # 전환 점수
        if all_conv:
            max_conv = max(all_conv)
            conv_score = (perf.conversions / max_conv * 100) if max_conv > 0 else 0
        else:
            conv_score = 0

        # 가중 평균 점수
        total_score = (
            roas_score * weights.get("roas", 0.33) +
            cpa_score * weights.get("cpa", 0.33) +
            conv_score * weights.get("conversions", 0.34)
        )

        return min(100, max(0, total_score))

    def generate_reallocation_plan(
        self,
        user_id: int,
        performances: List[PlatformPerformance],
        total_budget: float,
        strategy: ReallocationStrategy = ReallocationStrategy.BALANCED,
        constraints: Optional[Dict[str, Any]] = None
    ) -> ReallocationPlan:
        """예산 재분배 계획 생성"""

        if not performances:
            raise ValueError("성과 데이터가 없습니다.")

        constraints = constraints or {}
        max_change_ratio = constraints.get("max_change_ratio", self.MAX_REALLOCATION_RATIO)
        excluded_platforms = constraints.get("excluded_platforms", [])
        locked_budgets = constraints.get("locked_budgets", {})  # {platform_id: budget}

        # 제외된 플랫폼 필터링
        active_performances = [
            p for p in performances
            if p.platform_id not in excluded_platforms
        ]

        if not active_performances:
            raise ValueError("활성 플랫폼이 없습니다.")

        # 각 플랫폼 점수 계산
        scored_platforms = []
        for perf in active_performances:
            score = self.calculate_platform_score(perf, strategy, active_performances)
            scored_platforms.append((perf, score))

        # 점수순 정렬 (높은 순)
        scored_platforms.sort(key=lambda x: x[1], reverse=True)

        # 점수 기반 예산 배분 계산
        total_score = sum(score for _, score in scored_platforms)
        if total_score == 0:
            total_score = len(scored_platforms)  # 균등 배분

        # 고정된 예산 제외한 가용 예산
        locked_total = sum(locked_budgets.values())
        available_budget = total_budget - locked_total

        reallocations = []

        for perf, score in scored_platforms:
            if perf.platform_id in locked_budgets:
                # 고정된 예산
                suggested = locked_budgets[perf.platform_id]
                change = 0
                reason = "예산 고정됨"
                priority = AllocationPriority.MEDIUM
            else:
                # 점수 비율에 따른 예산 배분
                score_ratio = score / total_score if total_score > 0 else 1 / len(scored_platforms)
                ideal_budget = available_budget * score_ratio

                # 최소 예산 보장
                min_budget = self._get_min_budget(perf.platform_id)
                ideal_budget = max(ideal_budget, min_budget)

                # 변경 제한 적용
                max_increase = perf.current_budget * (1 + max_change_ratio)
                max_decrease = perf.current_budget * (1 - max_change_ratio)
                max_decrease = max(max_decrease, min_budget)

                if strategy == ReallocationStrategy.CONSERVATIVE:
                    # 보수적: 더 작은 변경폭
                    max_increase = perf.current_budget * 1.15
                    max_decrease = perf.current_budget * 0.85

                suggested = max(max_decrease, min(max_increase, ideal_budget))
                change = suggested - perf.current_budget

                # 우선순위 및 이유 결정
                if score >= 70:
                    priority = AllocationPriority.HIGH
                    if change > 0:
                        reason = f"고효율 플랫폼 (점수: {score:.0f}점) - 예산 증액 권장"
                    else:
                        reason = f"고효율 유지 (점수: {score:.0f}점)"
                elif score >= 40:
                    priority = AllocationPriority.MEDIUM
                    reason = f"중간 효율 (점수: {score:.0f}점) - 모니터링 필요"
                else:
                    priority = AllocationPriority.LOW
                    if change < 0:
                        reason = f"저효율 플랫폼 (점수: {score:.0f}점) - 예산 감액 권장"
                    else:
                        reason = f"저효율 (점수: {score:.0f}점) - 개선 필요"

            change_percent = (change / perf.current_budget * 100) if perf.current_budget > 0 else 0

            # 예상 영향 계산
            expected_impact = self._calculate_expected_impact(perf, suggested)

            reallocations.append(BudgetReallocation(
                platform_id=perf.platform_id,
                platform_name=perf.platform_name,
                current_budget=perf.current_budget,
                suggested_budget=round(suggested, -2),  # 100원 단위
                change_amount=round(change, -2),
                change_percent=round(change_percent, 1),
                reason=reason,
                priority=priority,
                expected_impact=expected_impact
            ))

        # 전체 예상 개선 효과 계산
        expected_improvements = self._calculate_total_improvement(performances, reallocations)

        self._plan_counter += 1
        plan = ReallocationPlan(
            id=f"plan_{user_id}_{self._plan_counter}",
            user_id=user_id,
            created_at=datetime.now(),
            strategy=strategy,
            total_budget=total_budget,
            reallocations=reallocations,
            expected_roas_improvement=expected_improvements["roas_improvement"],
            expected_cpa_reduction=expected_improvements["cpa_reduction"],
            expected_conversion_increase=expected_improvements["conversion_increase"],
        )

        self._active_plans[user_id] = plan

        return plan

    def _calculate_expected_impact(
        self,
        perf: PlatformPerformance,
        new_budget: float
    ) -> Dict[str, float]:
        """예산 변경의 예상 영향 계산"""
        if perf.current_budget <= 0:
            return {"impressions": 0, "clicks": 0, "conversions": 0, "revenue": 0}

        budget_ratio = new_budget / perf.current_budget

        # 예산 증가 시 효율 감소 가정 (수확체감)
        if budget_ratio > 1:
            efficiency_factor = 0.9  # 10% 효율 감소
        else:
            efficiency_factor = 1.05  # 감소 시 오히려 효율 증가 가능

        return {
            "impressions": perf.impressions * budget_ratio * efficiency_factor,
            "clicks": perf.clicks * budget_ratio * efficiency_factor,
            "conversions": perf.conversions * budget_ratio * efficiency_factor,
            "revenue": perf.revenue * budget_ratio * efficiency_factor,
        }

    def _calculate_total_improvement(
        self,
        performances: List[PlatformPerformance],
        reallocations: List[BudgetReallocation]
    ) -> Dict[str, float]:
        """전체 예상 개선 효과"""
        current_revenue = sum(p.revenue for p in performances)
        current_spend = sum(p.spend for p in performances)
        current_conversions = sum(p.conversions for p in performances)

        expected_revenue = sum(r.expected_impact.get("revenue", 0) for r in reallocations)
        expected_conversions = sum(r.expected_impact.get("conversions", 0) for r in reallocations)
        new_total_budget = sum(r.suggested_budget for r in reallocations)

        current_roas = (current_revenue / current_spend * 100) if current_spend > 0 else 0
        expected_roas = (expected_revenue / new_total_budget * 100) if new_total_budget > 0 else 0

        current_cpa = (current_spend / current_conversions) if current_conversions > 0 else 0
        expected_cpa = (new_total_budget / expected_conversions) if expected_conversions > 0 else 0

        return {
            "roas_improvement": expected_roas - current_roas,
            "cpa_reduction": current_cpa - expected_cpa,
            "conversion_increase": int(expected_conversions - current_conversions),
        }

    def get_quick_recommendation(
        self,
        performances: List[PlatformPerformance]
    ) -> Dict[str, Any]:
        """빠른 재분배 추천"""
        if len(performances) < 2:
            return {
                "has_recommendation": False,
                "message": "2개 이상의 플랫폼이 필요합니다."
            }

        # 효율성 점수로 정렬
        sorted_perf = sorted(performances, key=lambda p: p.efficiency_score, reverse=True)

        best = sorted_perf[0]
        worst = sorted_perf[-1]

        # 성과 차이가 충분히 큰 경우만 추천
        score_diff = best.efficiency_score - worst.efficiency_score

        if score_diff < 20:
            return {
                "has_recommendation": False,
                "message": "플랫폼 간 성과 차이가 크지 않습니다.",
                "details": {
                    "best": {"platform": best.platform_name, "score": best.efficiency_score},
                    "worst": {"platform": worst.platform_name, "score": worst.efficiency_score},
                }
            }

        # 이동 추천 금액 (저효율에서 고효율로)
        move_amount = min(
            worst.current_budget * 0.2,  # 최대 20%
            best.current_budget * 0.3,   # 증액 30% 이내
        )
        move_amount = round(move_amount, -3)  # 1000원 단위

        if move_amount < 10000:
            return {
                "has_recommendation": False,
                "message": "이동할 예산이 너무 적습니다."
            }

        expected_roas_gain = (best.roas - worst.roas) * (move_amount / best.current_budget)

        return {
            "has_recommendation": True,
            "source_platform": worst.platform_name,
            "target_platform": best.platform_name,
            "move_amount": move_amount,
            "source_score": worst.efficiency_score,
            "target_score": best.efficiency_score,
            "expected_roas_gain": round(expected_roas_gain, 1),
            "message": f"{worst.platform_name}에서 {best.platform_name}으로 {move_amount:,.0f}원 이동 권장",
        }

    def analyze_platform_health(
        self,
        performances: List[PlatformPerformance]
    ) -> Dict[str, Any]:
        """플랫폼 건강도 분석"""
        if not performances:
            return {"status": "no_data"}

        total_budget = sum(p.current_budget for p in performances)
        total_spend = sum(p.spend for p in performances)
        total_revenue = sum(p.revenue for p in performances)
        total_conversions = sum(p.conversions for p in performances)

        # 플랫폼별 분석
        platform_analysis = []
        for perf in performances:
            budget_share = (perf.current_budget / total_budget * 100) if total_budget > 0 else 0
            revenue_share = (perf.revenue / total_revenue * 100) if total_revenue > 0 else 0

            # 예산 대비 매출 효율
            efficiency = revenue_share / budget_share if budget_share > 0 else 0

            if efficiency >= 1.2:
                status = "excellent"
                recommendation = "예산 증액 권장"
            elif efficiency >= 0.9:
                status = "good"
                recommendation = "현 상태 유지"
            elif efficiency >= 0.6:
                status = "fair"
                recommendation = "개선 필요"
            else:
                status = "poor"
                recommendation = "예산 감액 또는 전략 변경 필요"

            platform_analysis.append({
                "platform_id": perf.platform_id,
                "platform_name": perf.platform_name,
                "budget_share": round(budget_share, 1),
                "revenue_share": round(revenue_share, 1),
                "efficiency_ratio": round(efficiency, 2),
                "efficiency_score": round(perf.efficiency_score, 1),
                "status": status,
                "recommendation": recommendation,
                "metrics": {
                    "roas": round(perf.roas, 1),
                    "cpa": round(perf.cpa, 0) if perf.cpa < float('inf') else None,
                    "cvr": round(perf.conversion_rate, 2),
                    "ctr": round(perf.ctr, 2),
                }
            })

        # 전체 요약
        overall_roas = (total_revenue / total_spend * 100) if total_spend > 0 else 0
        overall_cpa = (total_spend / total_conversions) if total_conversions > 0 else 0

        # 불균형 감지
        efficiencies = [a["efficiency_ratio"] for a in platform_analysis]
        if efficiencies:
            efficiency_variance = statistics.variance(efficiencies) if len(efficiencies) > 1 else 0
            is_imbalanced = efficiency_variance > 0.3
        else:
            is_imbalanced = False

        return {
            "status": "analyzed",
            "overall": {
                "total_budget": total_budget,
                "total_spend": total_spend,
                "total_revenue": total_revenue,
                "total_conversions": total_conversions,
                "overall_roas": round(overall_roas, 1),
                "overall_cpa": round(overall_cpa, 0) if total_conversions > 0 else None,
            },
            "platforms": platform_analysis,
            "is_imbalanced": is_imbalanced,
            "rebalance_recommended": is_imbalanced and len(performances) >= 2,
        }

    def set_platform_priority(
        self,
        user_id: int,
        platform_id: str,
        priority: AllocationPriority
    ):
        """플랫폼 우선순위 설정"""
        if user_id not in self._platform_priorities:
            self._platform_priorities[user_id] = {}
        self._platform_priorities[user_id][platform_id] = priority

    def get_active_plan(self, user_id: int) -> Optional[ReallocationPlan]:
        """현재 활성 계획 조회"""
        return self._active_plans.get(user_id)


# 싱글톤 인스턴스
_budget_optimizer: Optional[CrossPlatformBudgetOptimizer] = None


def get_budget_optimizer() -> CrossPlatformBudgetOptimizer:
    """예산 최적화기 싱글톤 인스턴스"""
    global _budget_optimizer
    if _budget_optimizer is None:
        _budget_optimizer = CrossPlatformBudgetOptimizer()
    return _budget_optimizer
