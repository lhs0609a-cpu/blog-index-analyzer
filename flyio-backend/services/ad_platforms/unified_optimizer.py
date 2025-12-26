"""
통합 광고 최적화 엔진
모든 광고 플랫폼을 통합 관리하고 크로스 플랫폼 최적화 수행
"""
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from enum import Enum

from .base import (
    AdPlatformBase, OptimizationStrategy, OptimizationResult,
    CampaignData, PerformanceData
)
from . import PLATFORM_SERVICES, get_platform_service


class AllocationStrategy(str, Enum):
    """예산 배분 전략"""
    EQUAL = "equal"              # 균등 배분
    PERFORMANCE = "performance"  # 성과 기반 (ROAS 높은 곳에 더 많이)
    VOLUME = "volume"            # 볼륨 기반 (전환 많은 곳에 더 많이)
    CUSTOM = "custom"            # 사용자 정의


@dataclass
class PlatformStatus:
    """플랫폼 상태"""
    platform_id: str
    platform_name: str
    is_connected: bool = False
    campaigns_count: int = 0
    total_spend: float = 0
    total_revenue: float = 0
    roas: float = 0
    last_synced: Optional[str] = None
    error_message: Optional[str] = None


@dataclass
class CrossPlatformReport:
    """크로스 플랫폼 리포트"""
    report_date: str
    total_platforms: int = 0
    connected_platforms: int = 0
    total_spend: float = 0
    total_revenue: float = 0
    total_conversions: int = 0
    overall_roas: float = 0
    overall_cpa: float = 0
    platform_breakdown: List[Dict[str, Any]] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)


@dataclass
class BudgetAllocation:
    """예산 배분 결과"""
    platform_id: str
    platform_name: str
    current_budget: float
    recommended_budget: float
    change_percent: float
    reason: str


class UnifiedAdOptimizer:
    """
    통합 광고 최적화 엔진
    여러 광고 플랫폼을 한 곳에서 관리하고 최적화
    """

    def __init__(self):
        self._platforms: Dict[str, AdPlatformBase] = {}
        self._platform_credentials: Dict[str, Dict[str, str]] = {}

    # ============ 플랫폼 관리 ============

    async def add_platform(
        self,
        platform_id: str,
        credentials: Dict[str, str]
    ) -> bool:
        """플랫폼 추가 및 연결"""
        if platform_id not in PLATFORM_SERVICES:
            raise ValueError(f"지원하지 않는 플랫폼: {platform_id}")

        try:
            service = get_platform_service(platform_id, credentials)
            await service.connect()

            if service.is_connected:
                self._platforms[platform_id] = service
                self._platform_credentials[platform_id] = credentials
                return True
            return False
        except Exception as e:
            raise Exception(f"플랫폼 연결 실패 ({platform_id}): {str(e)}")

    async def remove_platform(self, platform_id: str) -> bool:
        """플랫폼 제거"""
        if platform_id in self._platforms:
            await self._platforms[platform_id].disconnect()
            del self._platforms[platform_id]
            if platform_id in self._platform_credentials:
                del self._platform_credentials[platform_id]
            return True
        return False

    def get_connected_platforms(self) -> List[str]:
        """연결된 플랫폼 목록"""
        return list(self._platforms.keys())

    async def get_platform_status(self) -> List[PlatformStatus]:
        """모든 플랫폼 상태 조회"""
        statuses = []

        for platform_id, service in self._platforms.items():
            try:
                campaigns = await service.get_campaigns()

                total_spend = sum(c.cost for c in campaigns)
                total_revenue = sum(c.revenue for c in campaigns)

                statuses.append(PlatformStatus(
                    platform_id=platform_id,
                    platform_name=service.PLATFORM_NAME_KO,
                    is_connected=service.is_connected,
                    campaigns_count=len(campaigns),
                    total_spend=total_spend,
                    total_revenue=total_revenue,
                    roas=(total_revenue / total_spend * 100) if total_spend > 0 else 0,
                    last_synced=datetime.now().isoformat(),
                ))
            except Exception as e:
                statuses.append(PlatformStatus(
                    platform_id=platform_id,
                    platform_name=service.PLATFORM_NAME_KO,
                    is_connected=False,
                    error_message=str(e),
                ))

        return statuses

    # ============ 크로스 플랫폼 데이터 조회 ============

    async def get_all_campaigns(self) -> Dict[str, List[CampaignData]]:
        """모든 플랫폼의 캠페인 조회"""
        all_campaigns = {}

        async def fetch_campaigns(platform_id: str, service: AdPlatformBase):
            try:
                campaigns = await service.get_campaigns()
                return platform_id, campaigns
            except:
                return platform_id, []

        tasks = [
            fetch_campaigns(pid, svc)
            for pid, svc in self._platforms.items()
        ]

        results = await asyncio.gather(*tasks)

        for platform_id, campaigns in results:
            all_campaigns[platform_id] = campaigns

        return all_campaigns

    async def get_cross_platform_report(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> CrossPlatformReport:
        """크로스 플랫폼 종합 리포트"""
        if not end_date:
            end_date = datetime.now()
        if not start_date:
            start_date = end_date - timedelta(days=30)

        platform_data = []
        total_spend = 0
        total_revenue = 0
        total_conversions = 0

        for platform_id, service in self._platforms.items():
            try:
                performance = await service.get_performance(start_date, end_date)

                p_spend = sum(p.cost for p in performance)
                p_revenue = sum(p.revenue for p in performance)
                p_conversions = sum(p.conversions for p in performance)
                p_clicks = sum(p.clicks for p in performance)
                p_impressions = sum(p.impressions for p in performance)

                platform_data.append({
                    "platform_id": platform_id,
                    "platform_name": service.PLATFORM_NAME_KO,
                    "spend": p_spend,
                    "revenue": p_revenue,
                    "conversions": p_conversions,
                    "clicks": p_clicks,
                    "impressions": p_impressions,
                    "roas": (p_revenue / p_spend * 100) if p_spend > 0 else 0,
                    "cpa": (p_spend / p_conversions) if p_conversions > 0 else 0,
                    "ctr": (p_clicks / p_impressions * 100) if p_impressions > 0 else 0,
                })

                total_spend += p_spend
                total_revenue += p_revenue
                total_conversions += p_conversions

            except Exception as e:
                platform_data.append({
                    "platform_id": platform_id,
                    "platform_name": service.PLATFORM_NAME_KO,
                    "error": str(e),
                })

        # 추천 생성
        recommendations = self._generate_recommendations(platform_data)

        return CrossPlatformReport(
            report_date=datetime.now().isoformat(),
            total_platforms=len(PLATFORM_SERVICES),
            connected_platforms=len(self._platforms),
            total_spend=total_spend,
            total_revenue=total_revenue,
            total_conversions=total_conversions,
            overall_roas=(total_revenue / total_spend * 100) if total_spend > 0 else 0,
            overall_cpa=(total_spend / total_conversions) if total_conversions > 0 else 0,
            platform_breakdown=platform_data,
            recommendations=recommendations,
        )

    def _generate_recommendations(
        self,
        platform_data: List[Dict[str, Any]]
    ) -> List[str]:
        """AI 추천 생성"""
        recommendations = []

        # ROAS 기준 정렬
        valid_platforms = [p for p in platform_data if "error" not in p and p.get("spend", 0) > 0]

        if not valid_platforms:
            return ["연결된 플랫폼에서 광고 데이터를 수집 중입니다."]

        # ROAS 분석
        sorted_by_roas = sorted(valid_platforms, key=lambda x: x.get("roas", 0), reverse=True)

        if len(sorted_by_roas) >= 2:
            best = sorted_by_roas[0]
            worst = sorted_by_roas[-1]

            if best["roas"] > worst["roas"] * 2:
                recommendations.append(
                    f"💡 {best['platform_name']}의 ROAS({best['roas']:.0f}%)가 "
                    f"{worst['platform_name']}({worst['roas']:.0f}%)보다 2배 이상 높습니다. "
                    f"예산 재배분을 권장합니다."
                )

        # CPA 분석
        sorted_by_cpa = sorted(
            [p for p in valid_platforms if p.get("cpa", 0) > 0],
            key=lambda x: x.get("cpa", float("inf"))
        )

        if sorted_by_cpa:
            lowest_cpa = sorted_by_cpa[0]
            recommendations.append(
                f"🎯 {lowest_cpa['platform_name']}이(가) 가장 낮은 CPA "
                f"({lowest_cpa['cpa']:,.0f}원)를 보이고 있습니다."
            )

        # 전환 분석
        high_conversion = [p for p in valid_platforms if p.get("conversions", 0) >= 10]
        no_conversion = [p for p in valid_platforms if p.get("conversions", 0) == 0 and p.get("spend", 0) > 50000]

        if no_conversion:
            platforms_str = ", ".join([p["platform_name"] for p in no_conversion])
            recommendations.append(
                f"⚠️ {platforms_str}에서 비용이 발생했으나 전환이 없습니다. 타겟팅 검토가 필요합니다."
            )

        # 예산 효율성
        total_spend = sum(p.get("spend", 0) for p in valid_platforms)
        for p in valid_platforms:
            spend_share = (p.get("spend", 0) / total_spend * 100) if total_spend > 0 else 0
            roas = p.get("roas", 0)

            if spend_share > 30 and roas < 100:
                recommendations.append(
                    f"📉 {p['platform_name']}에 전체 예산의 {spend_share:.0f}%가 배분되었으나 "
                    f"ROAS가 {roas:.0f}%로 낮습니다. 예산 축소를 검토하세요."
                )

        if not recommendations:
            recommendations.append("✅ 모든 플랫폼이 안정적으로 운영되고 있습니다.")

        return recommendations

    # ============ 통합 최적화 ============

    async def run_optimization(
        self,
        strategy: OptimizationStrategy = OptimizationStrategy.BALANCED,
        settings: Optional[Dict[str, Any]] = None,
        platform_ids: Optional[List[str]] = None
    ) -> Dict[str, OptimizationResult]:
        """모든 플랫폼 최적화 실행"""
        settings = settings or {}
        results = {}

        target_platforms = platform_ids or list(self._platforms.keys())

        async def optimize_platform(platform_id: str):
            if platform_id not in self._platforms:
                return platform_id, OptimizationResult(
                    success=False,
                    platform_id=platform_id,
                    message="플랫폼이 연결되지 않음"
                )

            service = self._platforms[platform_id]

            try:
                result = await service.optimize(strategy, settings)
                return platform_id, result
            except Exception as e:
                return platform_id, OptimizationResult(
                    success=False,
                    platform_id=platform_id,
                    message=f"최적화 실패: {str(e)}"
                )

        tasks = [optimize_platform(pid) for pid in target_platforms]
        optimization_results = await asyncio.gather(*tasks)

        for platform_id, result in optimization_results:
            results[platform_id] = result

        return results

    # ============ 예산 배분 최적화 ============

    async def optimize_budget_allocation(
        self,
        total_budget: float,
        strategy: AllocationStrategy = AllocationStrategy.PERFORMANCE,
        min_budget_per_platform: float = 10000,
        max_budget_share: float = 0.5  # 최대 50%까지
    ) -> List[BudgetAllocation]:
        """크로스 플랫폼 예산 배분 최적화"""
        if not self._platforms:
            return []

        # 현재 성과 데이터 수집
        platform_performance = {}

        for platform_id, service in self._platforms.items():
            try:
                campaigns = await service.get_campaigns()
                total_spend = sum(c.cost for c in campaigns)
                total_revenue = sum(c.revenue for c in campaigns)
                total_conversions = sum(c.conversions for c in campaigns)

                platform_performance[platform_id] = {
                    "name": service.PLATFORM_NAME_KO,
                    "spend": total_spend,
                    "revenue": total_revenue,
                    "conversions": total_conversions,
                    "roas": (total_revenue / total_spend * 100) if total_spend > 0 else 0,
                    "cpa": (total_spend / total_conversions) if total_conversions > 0 else float("inf"),
                }
            except:
                platform_performance[platform_id] = {
                    "name": service.PLATFORM_NAME_KO,
                    "spend": 0,
                    "revenue": 0,
                    "conversions": 0,
                    "roas": 0,
                    "cpa": float("inf"),
                }

        # 배분 전략에 따른 가중치 계산
        allocations = []
        num_platforms = len(platform_performance)

        if strategy == AllocationStrategy.EQUAL:
            # 균등 배분
            equal_share = total_budget / num_platforms
            for pid, perf in platform_performance.items():
                allocations.append(BudgetAllocation(
                    platform_id=pid,
                    platform_name=perf["name"],
                    current_budget=perf["spend"],
                    recommended_budget=equal_share,
                    change_percent=((equal_share - perf["spend"]) / perf["spend"] * 100) if perf["spend"] > 0 else 0,
                    reason="균등 배분 전략"
                ))

        elif strategy == AllocationStrategy.PERFORMANCE:
            # ROAS 기반 배분
            total_roas = sum(p["roas"] for p in platform_performance.values())

            if total_roas == 0:
                # ROAS 데이터 없으면 균등
                equal_share = total_budget / num_platforms
                for pid, perf in platform_performance.items():
                    allocations.append(BudgetAllocation(
                        platform_id=pid,
                        platform_name=perf["name"],
                        current_budget=perf["spend"],
                        recommended_budget=equal_share,
                        change_percent=0,
                        reason="성과 데이터 부족으로 균등 배분"
                    ))
            else:
                for pid, perf in platform_performance.items():
                    weight = perf["roas"] / total_roas if total_roas > 0 else 1 / num_platforms

                    # 최대/최소 제한 적용
                    weight = max(min_budget_per_platform / total_budget, weight)
                    weight = min(max_budget_share, weight)

                    recommended = total_budget * weight

                    allocations.append(BudgetAllocation(
                        platform_id=pid,
                        platform_name=perf["name"],
                        current_budget=perf["spend"],
                        recommended_budget=recommended,
                        change_percent=((recommended - perf["spend"]) / perf["spend"] * 100) if perf["spend"] > 0 else 0,
                        reason=f"ROAS {perf['roas']:.0f}% 기반 배분"
                    ))

        elif strategy == AllocationStrategy.VOLUME:
            # 전환 기반 배분
            total_conversions = sum(p["conversions"] for p in platform_performance.values())

            if total_conversions == 0:
                equal_share = total_budget / num_platforms
                for pid, perf in platform_performance.items():
                    allocations.append(BudgetAllocation(
                        platform_id=pid,
                        platform_name=perf["name"],
                        current_budget=perf["spend"],
                        recommended_budget=equal_share,
                        change_percent=0,
                        reason="전환 데이터 부족으로 균등 배분"
                    ))
            else:
                for pid, perf in platform_performance.items():
                    weight = perf["conversions"] / total_conversions if total_conversions > 0 else 1 / num_platforms
                    weight = max(min_budget_per_platform / total_budget, weight)
                    weight = min(max_budget_share, weight)

                    recommended = total_budget * weight

                    allocations.append(BudgetAllocation(
                        platform_id=pid,
                        platform_name=perf["name"],
                        current_budget=perf["spend"],
                        recommended_budget=recommended,
                        change_percent=((recommended - perf["spend"]) / perf["spend"] * 100) if perf["spend"] > 0 else 0,
                        reason=f"전환 {perf['conversions']}건 기반 배분"
                    ))

        # 정규화 (총 예산에 맞게 조정)
        total_recommended = sum(a.recommended_budget for a in allocations)
        if total_recommended > 0:
            scale = total_budget / total_recommended
            for a in allocations:
                a.recommended_budget = a.recommended_budget * scale
                if a.current_budget > 0:
                    a.change_percent = (a.recommended_budget - a.current_budget) / a.current_budget * 100

        return allocations

    # ============ 성과 비교 분석 ============

    async def compare_platform_performance(
        self,
        metrics: List[str] = None
    ) -> Dict[str, Any]:
        """플랫폼간 성과 비교"""
        if not metrics:
            metrics = ["roas", "cpa", "ctr", "conversions"]

        comparison = {
            "metrics": metrics,
            "platforms": {},
            "rankings": {},
        }

        for platform_id, service in self._platforms.items():
            try:
                campaigns = await service.get_campaigns()

                total_impressions = sum(c.impressions for c in campaigns)
                total_clicks = sum(c.clicks for c in campaigns)
                total_cost = sum(c.cost for c in campaigns)
                total_conversions = sum(c.conversions for c in campaigns)
                total_revenue = sum(c.revenue for c in campaigns)

                comparison["platforms"][platform_id] = {
                    "name": service.PLATFORM_NAME_KO,
                    "roas": (total_revenue / total_cost * 100) if total_cost > 0 else 0,
                    "cpa": (total_cost / total_conversions) if total_conversions > 0 else 0,
                    "ctr": (total_clicks / total_impressions * 100) if total_impressions > 0 else 0,
                    "conversions": total_conversions,
                    "spend": total_cost,
                    "revenue": total_revenue,
                }
            except:
                comparison["platforms"][platform_id] = {
                    "name": service.PLATFORM_NAME_KO,
                    "error": "데이터 조회 실패"
                }

        # 각 지표별 순위
        for metric in metrics:
            valid_platforms = [
                (pid, data.get(metric, 0))
                for pid, data in comparison["platforms"].items()
                if "error" not in data
            ]

            # ROAS, CTR, conversions는 높을수록 좋음, CPA는 낮을수록 좋음
            reverse = metric != "cpa"
            sorted_platforms = sorted(valid_platforms, key=lambda x: x[1], reverse=reverse)

            comparison["rankings"][metric] = [
                {"platform_id": pid, "value": val, "rank": i + 1}
                for i, (pid, val) in enumerate(sorted_platforms)
            ]

        return comparison

    # ============ 알림 및 이상 감지 ============

    async def detect_anomalies(
        self,
        threshold_spend_change: float = 50,  # 50% 이상 변화
        threshold_roas_drop: float = 30,     # 30% 이상 ROAS 하락
    ) -> List[Dict[str, Any]]:
        """이상 징후 감지"""
        anomalies = []

        for platform_id, service in self._platforms.items():
            try:
                # 최근 7일 vs 이전 7일 비교
                end_date = datetime.now()
                mid_date = end_date - timedelta(days=7)
                start_date = end_date - timedelta(days=14)

                recent = await service.get_performance(mid_date, end_date)
                previous = await service.get_performance(start_date, mid_date)

                recent_spend = sum(p.cost for p in recent)
                previous_spend = sum(p.cost for p in previous)
                recent_revenue = sum(p.revenue for p in recent)
                previous_revenue = sum(p.revenue for p in previous)

                recent_roas = (recent_revenue / recent_spend * 100) if recent_spend > 0 else 0
                previous_roas = (previous_revenue / previous_spend * 100) if previous_spend > 0 else 0

                # 비용 급증
                if previous_spend > 0:
                    spend_change = (recent_spend - previous_spend) / previous_spend * 100
                    if abs(spend_change) > threshold_spend_change:
                        anomalies.append({
                            "platform_id": platform_id,
                            "platform_name": service.PLATFORM_NAME_KO,
                            "type": "spend_spike" if spend_change > 0 else "spend_drop",
                            "severity": "high" if abs(spend_change) > 100 else "medium",
                            "message": f"비용 {spend_change:+.0f}% 변화 (₩{previous_spend:,.0f} → ₩{recent_spend:,.0f})",
                            "detected_at": datetime.now().isoformat(),
                        })

                # ROAS 하락
                if previous_roas > 0:
                    roas_change = (recent_roas - previous_roas) / previous_roas * 100
                    if roas_change < -threshold_roas_drop:
                        anomalies.append({
                            "platform_id": platform_id,
                            "platform_name": service.PLATFORM_NAME_KO,
                            "type": "roas_drop",
                            "severity": "high" if roas_change < -50 else "medium",
                            "message": f"ROAS {roas_change:.0f}% 하락 ({previous_roas:.0f}% → {recent_roas:.0f}%)",
                            "detected_at": datetime.now().isoformat(),
                        })

            except Exception as e:
                anomalies.append({
                    "platform_id": platform_id,
                    "platform_name": service.PLATFORM_NAME_KO,
                    "type": "connection_error",
                    "severity": "high",
                    "message": f"데이터 조회 실패: {str(e)}",
                    "detected_at": datetime.now().isoformat(),
                })

        return anomalies


# 싱글톤 인스턴스
unified_optimizer = UnifiedAdOptimizer()
