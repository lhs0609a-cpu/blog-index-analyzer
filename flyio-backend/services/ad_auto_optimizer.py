"""
광고 자동 최적화 서비스
1분마다 자동으로 모든 연결된 광고 플랫폼을 최적화
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from database.ad_optimization_db import (
    get_auto_optimization_accounts,
    save_optimization_history,
    save_bid_change,
    save_performance_snapshot,
    create_notification,
    get_optimization_settings,
    get_performance_history,
    save_roi_tracking,
)
from services.ad_platforms import (
    get_platform_service,
    PLATFORM_SERVICES,
    OptimizationStrategy,
)

logger = logging.getLogger(__name__)


class AdAutoOptimizer:
    """
    광고 자동 최적화 엔진
    - 1분마다 모든 활성 계정 최적화
    - 실제 입찰가/예산 변경
    - 성과 추적 및 ROI 계산
    """

    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self._is_running = False
        self._optimization_lock = asyncio.Lock()
        self._last_run_results: Dict[str, Any] = {}

    def start(self, interval_seconds: int = 60):
        """스케줄러 시작"""
        if self._is_running:
            logger.warning("Ad optimizer scheduler is already running")
            return

        # 1분마다 실행
        self.scheduler.add_job(
            self._run_optimization_cycle,
            IntervalTrigger(seconds=interval_seconds),
            id="ad_auto_optimizer",
            name="광고 자동 최적화",
            replace_existing=True,
            max_instances=1,
        )

        # 성과 스냅샷 저장 (1시간마다)
        self.scheduler.add_job(
            self._save_performance_snapshots,
            IntervalTrigger(hours=1),
            id="performance_snapshot",
            name="성과 스냅샷 저장",
            replace_existing=True,
        )

        # ROI 계산 (매일 자정)
        self.scheduler.add_job(
            self._calculate_daily_roi,
            IntervalTrigger(days=1),
            id="daily_roi_calculation",
            name="일간 ROI 계산",
            replace_existing=True,
        )

        self.scheduler.start()
        self._is_running = True
        logger.info(f"✅ Ad auto optimizer started (interval: {interval_seconds}s)")

    def stop(self):
        """스케줄러 중지"""
        if self._is_running:
            self.scheduler.shutdown(wait=False)
            self._is_running = False
            logger.info("🛑 Ad auto optimizer stopped")

    @property
    def is_running(self) -> bool:
        return self._is_running

    async def _run_optimization_cycle(self):
        """최적화 사이클 실행"""
        async with self._optimization_lock:
            logger.info("🔄 Starting ad optimization cycle...")
            start_time = datetime.now()

            # 자동 최적화가 활성화된 모든 계정 조회
            accounts = get_auto_optimization_accounts()

            if not accounts:
                logger.info("No accounts with auto-optimization enabled")
                return

            logger.info(f"Found {len(accounts)} accounts to optimize")

            results = {}
            total_changes = 0

            for account in accounts:
                try:
                    result = await self._optimize_account(account)
                    results[f"{account['user_id']}_{account['platform_id']}"] = result
                    total_changes += result.get("total_changes", 0)

                except Exception as e:
                    logger.error(f"Optimization failed for {account['platform_id']}: {str(e)}")
                    results[f"{account['user_id']}_{account['platform_id']}"] = {
                        "success": False,
                        "error": str(e)
                    }

            elapsed = (datetime.now() - start_time).total_seconds()
            self._last_run_results = {
                "timestamp": datetime.now().isoformat(),
                "accounts_processed": len(accounts),
                "total_changes": total_changes,
                "elapsed_seconds": elapsed,
                "results": results,
            }

            logger.info(f"✅ Optimization cycle completed: {total_changes} changes in {elapsed:.2f}s")

    async def _optimize_account(self, account: Dict[str, Any]) -> Dict[str, Any]:
        """개별 계정 최적화"""
        user_id = account["user_id"]
        platform_id = account["platform_id"]
        credentials = account["credentials"]
        settings = account["settings"]

        logger.info(f"Optimizing {platform_id} for user {user_id}")

        # 플랫폼 서비스 연결
        if platform_id not in PLATFORM_SERVICES:
            return {"success": False, "error": "Unsupported platform"}

        service = get_platform_service(platform_id, credentials)

        try:
            await service.connect()
        except Exception as e:
            # 연결 실패 알림
            create_notification(
                user_id=user_id,
                notification_type="connection_error",
                title=f"{platform_id} 연결 실패",
                message=f"광고 플랫폼 연결에 실패했습니다: {str(e)}",
                platform_id=platform_id,
                severity="high",
            )
            raise

        # 현재 캠페인/키워드 성과 조회
        campaigns = await service.get_campaigns()
        keywords = await service.get_keywords() if hasattr(service, 'get_keywords') else []

        # 전략에 따른 최적화 실행
        strategy = OptimizationStrategy(settings.get("strategy", "balanced"))
        changes = await self._apply_optimization_strategy(
            service, campaigns, keywords, settings, strategy
        )

        # 실제 변경 적용
        applied_changes = []
        for change in changes:
            try:
                applied = await self._apply_change(service, change, settings)
                if applied:
                    # 변경 이력 저장
                    save_bid_change(
                        user_id=user_id,
                        platform_id=platform_id,
                        entity_type=change.get("entity_type", "keyword"),
                        entity_id=change.get("entity_id", ""),
                        entity_name=change.get("entity_name", ""),
                        old_bid=change.get("old_bid", 0),
                        new_bid=change.get("new_bid", 0),
                        reason=change.get("reason", ""),
                        applied=True,
                    )
                    applied_changes.append(change)

            except Exception as e:
                logger.error(f"Failed to apply change: {str(e)}")
                change["error"] = str(e)

        # 최적화 이력 저장
        save_optimization_history(
            user_id=user_id,
            platform_id=platform_id,
            execution_type="auto",
            strategy=strategy.value,
            changes=applied_changes,
            status="success" if applied_changes else "no_changes",
        )

        # 변경 알림
        if applied_changes:
            create_notification(
                user_id=user_id,
                notification_type="optimization_complete",
                title=f"{platform_id} 최적화 완료",
                message=f"{len(applied_changes)}건의 입찰가가 조정되었습니다.",
                platform_id=platform_id,
                severity="info",
                data={"changes_count": len(applied_changes)},
            )

        await service.disconnect()

        return {
            "success": True,
            "total_changes": len(applied_changes),
            "changes": applied_changes,
        }

    async def _apply_optimization_strategy(
        self,
        service,
        campaigns,
        keywords,
        settings: Dict[str, Any],
        strategy: OptimizationStrategy
    ) -> List[Dict[str, Any]]:
        """최적화 전략 적용하여 변경 목록 생성"""
        changes = []

        target_roas = settings.get("target_roas", 300)
        target_cpa = settings.get("target_cpa", 20000)
        min_bid = settings.get("min_bid", 70)
        max_bid = settings.get("max_bid", 100000)
        max_change_ratio = settings.get("max_bid_change_ratio", 0.2)

        # 키워드 기반 최적화 (검색 광고)
        for kw in keywords:
            if kw.status != "ENABLED":
                continue

            change = None

            if strategy == OptimizationStrategy.TARGET_ROAS:
                change = self._optimize_keyword_for_roas(kw, target_roas, min_bid, max_bid, max_change_ratio)
            elif strategy == OptimizationStrategy.TARGET_CPA:
                change = self._optimize_keyword_for_cpa(kw, target_cpa, min_bid, max_bid, max_change_ratio)
            elif strategy == OptimizationStrategy.MAXIMIZE_CONVERSIONS:
                change = self._optimize_keyword_for_conversions(kw, min_bid, max_bid, max_change_ratio)
            elif strategy == OptimizationStrategy.MINIMIZE_CPC:
                change = self._optimize_keyword_for_cpc(kw, min_bid, max_bid, max_change_ratio)
            else:  # BALANCED
                change = self._optimize_keyword_balanced(kw, target_roas, target_cpa, min_bid, max_bid, max_change_ratio)

            if change:
                changes.append(change)

        # 캠페인 예산 최적화
        for campaign in campaigns:
            if campaign.status != "ENABLED":
                continue

            budget_change = self._optimize_campaign_budget(campaign, target_roas, max_change_ratio)
            if budget_change:
                changes.append(budget_change)

        return changes

    def _optimize_keyword_for_roas(self, kw, target_roas, min_bid, max_bid, max_change_ratio) -> Optional[Dict]:
        """ROAS 목표 기반 키워드 최적화"""
        if kw.cost == 0:
            return None

        current_roas = (kw.revenue / kw.cost * 100) if kw.cost > 0 else 0

        if current_roas < target_roas * 0.7 and kw.clicks >= 20:
            # ROAS 낮음 → 입찰가 감소
            new_bid = max(kw.bid_amount * (1 - max_change_ratio), min_bid)
            return {
                "type": "bid_decrease",
                "entity_type": "keyword",
                "entity_id": kw.keyword_id,
                "entity_name": kw.keyword_text,
                "old_bid": kw.bid_amount,
                "new_bid": new_bid,
                "reason": f"ROAS {current_roas:.0f}% < 목표 {target_roas}%의 70%",
            }

        elif current_roas > target_roas * 1.5 and kw.conversions >= 2:
            # ROAS 높음 + 전환 있음 → 입찰가 증가
            new_bid = min(kw.bid_amount * (1 + max_change_ratio), max_bid)
            return {
                "type": "bid_increase",
                "entity_type": "keyword",
                "entity_id": kw.keyword_id,
                "entity_name": kw.keyword_text,
                "old_bid": kw.bid_amount,
                "new_bid": new_bid,
                "reason": f"ROAS {current_roas:.0f}% > 목표의 150%, 전환 {kw.conversions}건",
            }

        return None

    def _optimize_keyword_for_cpa(self, kw, target_cpa, min_bid, max_bid, max_change_ratio) -> Optional[Dict]:
        """CPA 목표 기반 키워드 최적화"""
        if kw.conversions == 0:
            # 전환 없음 + 비용 많음 → 입찰가 감소 또는 중지
            if kw.cost > target_cpa * 2 and kw.clicks >= 30:
                return {
                    "type": "pause_keyword",
                    "entity_type": "keyword",
                    "entity_id": kw.keyword_id,
                    "entity_name": kw.keyword_text,
                    "old_bid": kw.bid_amount,
                    "new_bid": 0,
                    "reason": f"비용 {kw.cost:,.0f}원, 클릭 {kw.clicks}회, 전환 0",
                }
            elif kw.cost > target_cpa and kw.clicks >= 20:
                new_bid = max(kw.bid_amount * (1 - max_change_ratio), min_bid)
                return {
                    "type": "bid_decrease",
                    "entity_type": "keyword",
                    "entity_id": kw.keyword_id,
                    "entity_name": kw.keyword_text,
                    "old_bid": kw.bid_amount,
                    "new_bid": new_bid,
                    "reason": f"전환 없음, 비용 {kw.cost:,.0f}원",
                }
            return None

        current_cpa = kw.cost / kw.conversions

        if current_cpa > target_cpa * 1.3:
            new_bid = max(kw.bid_amount * (1 - max_change_ratio), min_bid)
            return {
                "type": "bid_decrease",
                "entity_type": "keyword",
                "entity_id": kw.keyword_id,
                "entity_name": kw.keyword_text,
                "old_bid": kw.bid_amount,
                "new_bid": new_bid,
                "reason": f"CPA {current_cpa:,.0f}원 > 목표 {target_cpa:,.0f}원",
            }

        elif current_cpa < target_cpa * 0.7 and kw.conversions >= 3:
            new_bid = min(kw.bid_amount * (1 + max_change_ratio), max_bid)
            return {
                "type": "bid_increase",
                "entity_type": "keyword",
                "entity_id": kw.keyword_id,
                "entity_name": kw.keyword_text,
                "old_bid": kw.bid_amount,
                "new_bid": new_bid,
                "reason": f"CPA {current_cpa:,.0f}원 < 목표의 70%",
            }

        return None

    def _optimize_keyword_for_conversions(self, kw, min_bid, max_bid, max_change_ratio) -> Optional[Dict]:
        """전환 최대화 최적화"""
        if kw.conversions >= 3 and kw.cost > 0:
            # 전환 있음 → 입찰가 증가
            roas = kw.revenue / kw.cost * 100 if kw.cost > 0 else 0
            if roas > 100:  # 최소 손익분기
                new_bid = min(kw.bid_amount * (1 + max_change_ratio), max_bid)
                return {
                    "type": "bid_increase",
                    "entity_type": "keyword",
                    "entity_id": kw.keyword_id,
                    "entity_name": kw.keyword_text,
                    "old_bid": kw.bid_amount,
                    "new_bid": new_bid,
                    "reason": f"전환 {kw.conversions}건, ROAS {roas:.0f}%",
                }
        return None

    def _optimize_keyword_for_cpc(self, kw, min_bid, max_bid, max_change_ratio) -> Optional[Dict]:
        """CPC 최소화 최적화"""
        if kw.clicks > 0:
            current_cpc = kw.cost / kw.clicks
            avg_cpc = 500  # 평균 CPC 기준

            if current_cpc > avg_cpc * 1.5:
                new_bid = max(kw.bid_amount * (1 - max_change_ratio), min_bid)
                return {
                    "type": "bid_decrease",
                    "entity_type": "keyword",
                    "entity_id": kw.keyword_id,
                    "entity_name": kw.keyword_text,
                    "old_bid": kw.bid_amount,
                    "new_bid": new_bid,
                    "reason": f"CPC {current_cpc:,.0f}원 > 평균의 150%",
                }
        return None

    def _optimize_keyword_balanced(self, kw, target_roas, target_cpa, min_bid, max_bid, max_change_ratio) -> Optional[Dict]:
        """균형 최적화 (ROAS + CPA + 전환 종합)"""
        # 1순위: 전환 없고 비용 많음 → 감소/중지
        if kw.conversions == 0 and kw.clicks >= 30:
            if kw.cost > target_cpa * 2:
                return {
                    "type": "pause_keyword",
                    "entity_type": "keyword",
                    "entity_id": kw.keyword_id,
                    "entity_name": kw.keyword_text,
                    "old_bid": kw.bid_amount,
                    "new_bid": 0,
                    "reason": f"저효율: 비용 {kw.cost:,.0f}원, 전환 0",
                }
            else:
                new_bid = max(kw.bid_amount * (1 - max_change_ratio), min_bid)
                return {
                    "type": "bid_decrease",
                    "entity_type": "keyword",
                    "entity_id": kw.keyword_id,
                    "entity_name": kw.keyword_text,
                    "old_bid": kw.bid_amount,
                    "new_bid": new_bid,
                    "reason": f"전환 대기: 클릭 {kw.clicks}회, 전환 0",
                }

        # 2순위: 전환 있음
        if kw.conversions > 0 and kw.cost > 0:
            current_roas = kw.revenue / kw.cost * 100
            current_cpa = kw.cost / kw.conversions

            # 고효율: ROAS 높고 CPA 낮음 → 증가
            if current_roas > target_roas * 1.3 and current_cpa < target_cpa:
                new_bid = min(kw.bid_amount * (1 + max_change_ratio), max_bid)
                return {
                    "type": "bid_increase",
                    "entity_type": "keyword",
                    "entity_id": kw.keyword_id,
                    "entity_name": kw.keyword_text,
                    "old_bid": kw.bid_amount,
                    "new_bid": new_bid,
                    "reason": f"고효율: ROAS {current_roas:.0f}%, CPA {current_cpa:,.0f}원",
                }

            # 저효율: ROAS 낮거나 CPA 높음 → 감소
            if current_roas < target_roas * 0.7 or current_cpa > target_cpa * 1.3:
                new_bid = max(kw.bid_amount * (1 - max_change_ratio), min_bid)
                return {
                    "type": "bid_decrease",
                    "entity_type": "keyword",
                    "entity_id": kw.keyword_id,
                    "entity_name": kw.keyword_text,
                    "old_bid": kw.bid_amount,
                    "new_bid": new_bid,
                    "reason": f"개선필요: ROAS {current_roas:.0f}%, CPA {current_cpa:,.0f}원",
                }

        return None

    def _optimize_campaign_budget(self, campaign, target_roas, max_change_ratio) -> Optional[Dict]:
        """캠페인 예산 최적화"""
        if campaign.cost == 0:
            return None

        current_roas = (campaign.revenue / campaign.cost * 100) if campaign.cost > 0 else 0

        # 고효율 캠페인: 예산 증가
        if current_roas > target_roas * 1.5 and campaign.conversions >= 5:
            new_budget = campaign.budget * (1 + max_change_ratio)
            return {
                "type": "budget_increase",
                "entity_type": "campaign",
                "entity_id": campaign.campaign_id,
                "entity_name": campaign.name,
                "old_bid": campaign.budget,
                "new_bid": new_budget,
                "reason": f"고효율 캠페인: ROAS {current_roas:.0f}%, 전환 {campaign.conversions}건",
            }

        # 저효율 캠페인: 예산 감소
        if current_roas < target_roas * 0.5 and campaign.cost > 100000:
            new_budget = campaign.budget * (1 - max_change_ratio)
            return {
                "type": "budget_decrease",
                "entity_type": "campaign",
                "entity_id": campaign.campaign_id,
                "entity_name": campaign.name,
                "old_bid": campaign.budget,
                "new_bid": new_budget,
                "reason": f"저효율 캠페인: ROAS {current_roas:.0f}%, 비용 {campaign.cost:,.0f}원",
            }

        return None

    async def _apply_change(self, service, change: Dict[str, Any], settings: Dict[str, Any]) -> bool:
        """실제 변경 적용"""
        change_type = change.get("type")
        entity_type = change.get("entity_type")
        entity_id = change.get("entity_id")
        new_bid = change.get("new_bid")

        try:
            if entity_type == "keyword":
                if change_type == "pause_keyword":
                    return await service.pause_keyword(entity_id)
                else:
                    return await service.update_keyword_bid(entity_id, new_bid)

            elif entity_type == "campaign":
                if change_type in ["budget_increase", "budget_decrease"]:
                    return await service.update_campaign_budget(entity_id, new_bid)

            elif entity_type == "adgroup":
                if hasattr(service, 'update_adgroup_bid'):
                    return await service.update_adgroup_bid(entity_id, new_bid)

        except Exception as e:
            logger.error(f"Failed to apply {change_type} to {entity_type} {entity_id}: {str(e)}")
            return False

        return False

    async def _save_performance_snapshots(self):
        """성과 스냅샷 저장 (1시간마다)"""
        accounts = get_auto_optimization_accounts()
        today = datetime.now().strftime("%Y-%m-%d")

        for account in accounts:
            try:
                service = get_platform_service(account["platform_id"], account["credentials"])
                await service.connect()

                # 오늘 성과 조회
                end_date = datetime.now()
                start_date = end_date.replace(hour=0, minute=0, second=0, microsecond=0)
                performance = await service.get_performance(start_date, end_date, granularity="total")

                if performance:
                    metrics = {
                        "impressions": sum(p.impressions for p in performance),
                        "clicks": sum(p.clicks for p in performance),
                        "cost": sum(p.cost for p in performance),
                        "conversions": sum(p.conversions for p in performance),
                        "revenue": sum(p.revenue for p in performance),
                    }

                    # 파생 지표 계산
                    if metrics["impressions"] > 0:
                        metrics["ctr"] = metrics["clicks"] / metrics["impressions"] * 100
                    if metrics["clicks"] > 0:
                        metrics["cpc"] = metrics["cost"] / metrics["clicks"]
                    if metrics["conversions"] > 0:
                        metrics["cpa"] = metrics["cost"] / metrics["conversions"]
                    if metrics["cost"] > 0:
                        metrics["roas"] = metrics["revenue"] / metrics["cost"] * 100

                    save_performance_snapshot(
                        user_id=account["user_id"],
                        platform_id=account["platform_id"],
                        snapshot_date=today,
                        metrics=metrics,
                    )

                await service.disconnect()

            except Exception as e:
                logger.error(f"Failed to save snapshot for {account['platform_id']}: {str(e)}")

        logger.info("✅ Performance snapshots saved")

    async def _calculate_daily_roi(self):
        """일간 ROI 계산 (매일 자정)"""
        accounts = get_auto_optimization_accounts()
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        week_ago = (datetime.now() - timedelta(days=8)).strftime("%Y-%m-%d")

        for account in accounts:
            try:
                # 최근 7일 성과
                recent_history = get_performance_history(
                    user_id=account["user_id"],
                    platform_id=account["platform_id"],
                    days=7
                )

                # 이전 7일 성과
                before_history = get_performance_history(
                    user_id=account["user_id"],
                    platform_id=account["platform_id"],
                    days=14
                )

                if recent_history and len(before_history) > 7:
                    recent = recent_history[:7]
                    before = before_history[7:14]

                    recent_metrics = {
                        "roas": sum(r["roas"] for r in recent) / len(recent),
                        "cpa": sum(r["cpa"] for r in recent) / len(recent),
                        "conversions": sum(r["conversions"] for r in recent),
                        "revenue": sum(r["revenue"] for r in recent),
                    }

                    before_metrics = {
                        "roas": sum(r["roas"] for r in before) / len(before),
                        "cpa": sum(r["cpa"] for r in before) / len(before),
                        "conversions": sum(r["conversions"] for r in before),
                        "revenue": sum(r["revenue"] for r in before),
                    }

                    # 최적화 횟수 조회
                    from database.ad_optimization_db import get_optimization_history
                    optimizations = get_optimization_history(
                        user_id=account["user_id"],
                        platform_id=account["platform_id"],
                        days=7
                    )

                    save_roi_tracking(
                        user_id=account["user_id"],
                        platform_id=account["platform_id"],
                        period_start=week_ago,
                        period_end=yesterday,
                        before_metrics=before_metrics,
                        after_metrics=recent_metrics,
                        total_optimizations=len(optimizations),
                    )

            except Exception as e:
                logger.error(f"Failed to calculate ROI for {account['platform_id']}: {str(e)}")

        logger.info("✅ Daily ROI calculation completed")

    def get_status(self) -> Dict[str, Any]:
        """스케줄러 상태 조회"""
        return {
            "is_running": self._is_running,
            "last_run": self._last_run_results,
            "jobs": [
                {
                    "id": job.id,
                    "name": job.name,
                    "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
                }
                for job in self.scheduler.get_jobs()
            ] if self._is_running else []
        }


# 싱글톤 인스턴스
ad_auto_optimizer = AdAutoOptimizer()
