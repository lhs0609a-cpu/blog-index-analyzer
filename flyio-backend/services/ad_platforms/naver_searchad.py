"""
네이버 검색광고 - ad_platforms 통합 서비스
기존 naver_ad_service.py를 AdPlatformBase에 맞춰 래핑
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import logging

from .base import (
    AdPlatformBase, CampaignData, AdGroupData, KeywordData,
    PerformanceData, OptimizationResult, OptimizationStrategy
)
from services.naver_ad_service import (
    NaverAdApiClient, BidOptimizationEngine, KeywordExclusionEngine,
    BidStrategy
)

logger = logging.getLogger(__name__)


class NaverSearchAdService(AdPlatformBase):
    """네이버 검색광고 서비스 (AdPlatformBase 구현)"""

    def __init__(self, credentials: Dict[str, str] = None):
        """
        credentials가 None이면 config에서 자동으로 가져옴
        credentials = {
            "customer_id": "...",
            "api_key": "...",
            "secret_key": "..."
        }
        """
        super().__init__(credentials or {})
        self.api = NaverAdApiClient()
        self.bid_optimizer = BidOptimizationEngine(self.api)
        self.exclusion_engine = KeywordExclusionEngine(self.api)
        self._connected = False

    async def connect(self) -> bool:
        """연결 테스트"""
        try:
            # 간단한 API 호출로 연결 테스트
            campaigns = await self.api.get_campaigns()
            self._connected = True
            logger.info(f"네이버 검색광고 연결 성공: {len(campaigns)}개 캠페인")
            return True
        except Exception as e:
            logger.error(f"네이버 검색광고 연결 실패: {e}")
            self._connected = False
            return False

    async def disconnect(self):
        """연결 종료"""
        await self.api.close()
        self._connected = False

    async def validate_credentials(self) -> bool:
        """자격증명 유효성 검사"""
        return await self.connect()

    async def get_account_info(self) -> Dict[str, Any]:
        """계정 정보 조회"""
        try:
            campaigns = await self.api.get_campaigns()
            return {
                "platform": "naver_searchad",
                "name": f"네이버 검색광고 ({self.api.customer_id})",
                "customer_id": self.api.customer_id,
                "total_campaigns": len(campaigns),
                "active_campaigns": len([c for c in campaigns if c.get("status") == "ELIGIBLE"]),
            }
        except Exception as e:
            logger.error(f"계정 정보 조회 실패: {e}")
            return {"error": str(e)}

    async def get_campaigns(self) -> List[CampaignData]:
        """캠페인 목록 조회"""
        try:
            raw_campaigns = await self.api.get_campaigns()
            campaigns = []

            # 캠페인별 성과 조회 (최근 7일)
            campaign_ids = [c.get("nccCampaignId") for c in raw_campaigns if c.get("nccCampaignId")]

            stats_map = {}
            if campaign_ids:
                end_date = datetime.now().strftime("%Y-%m-%d")
                start_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
                stats = await self.api.get_stats("CAMPAIGN", campaign_ids, start_date, end_date)
                stats_map = {s.get("id"): s for s in stats}

            for c in raw_campaigns:
                campaign_id = c.get("nccCampaignId")
                stat = stats_map.get(campaign_id, {})

                cost = stat.get("salesAmt", 0)
                revenue = stat.get("convAmt", 0)

                campaigns.append(CampaignData(
                    campaign_id=campaign_id,
                    name=c.get("name", ""),
                    status="ENABLED" if c.get("status") == "ELIGIBLE" else "PAUSED",
                    budget=c.get("dailyBudget", 0),
                    budget_type="DAILY",
                    impressions=stat.get("impCnt", 0),
                    clicks=stat.get("clkCnt", 0),
                    cost=cost,
                    conversions=stat.get("convCnt", 0),
                    revenue=revenue,
                    roas=(revenue / cost * 100) if cost > 0 else 0,
                ))

            return campaigns

        except Exception as e:
            logger.error(f"캠페인 조회 실패: {e}")
            return []

    async def get_ad_groups(self, campaign_id: str = None) -> List[AdGroupData]:
        """광고그룹 목록 조회"""
        try:
            raw_groups = await self.api.get_ad_groups(campaign_id)
            groups = []

            group_ids = [g.get("nccAdgroupId") for g in raw_groups if g.get("nccAdgroupId")]

            stats_map = {}
            if group_ids:
                end_date = datetime.now().strftime("%Y-%m-%d")
                start_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
                stats = await self.api.get_stats("ADGROUP", group_ids, start_date, end_date)
                stats_map = {s.get("id"): s for s in stats}

            for g in raw_groups:
                group_id = g.get("nccAdgroupId")
                stat = stats_map.get(group_id, {})

                cost = stat.get("salesAmt", 0)
                revenue = stat.get("convAmt", 0)

                groups.append(AdGroupData(
                    adgroup_id=group_id,
                    campaign_id=g.get("nccCampaignId", ""),
                    name=g.get("name", ""),
                    status="ENABLED" if g.get("status") == "ELIGIBLE" else "PAUSED",
                    bid_amount=g.get("bidAmt", 0),
                    impressions=stat.get("impCnt", 0),
                    clicks=stat.get("clkCnt", 0),
                    cost=cost,
                    conversions=stat.get("convCnt", 0),
                ))

            return groups

        except Exception as e:
            logger.error(f"광고그룹 조회 실패: {e}")
            return []

    async def get_keywords(self, ad_group_id: str = None) -> List[KeywordData]:
        """키워드 목록 조회"""
        try:
            raw_keywords = await self.api.get_keywords(ad_group_id)
            keywords = []

            keyword_ids = [k.get("nccKeywordId") for k in raw_keywords if k.get("nccKeywordId")]

            stats_map = {}
            if keyword_ids:
                end_date = datetime.now().strftime("%Y-%m-%d")
                start_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
                stats = await self.api.get_stats("KEYWORD", keyword_ids, start_date, end_date)
                stats_map = {s.get("id"): s for s in stats}

            for k in raw_keywords:
                keyword_id = k.get("nccKeywordId")
                stat = stats_map.get(keyword_id, {})

                cost = stat.get("salesAmt", 0)
                revenue = stat.get("convAmt", 0)
                clicks = stat.get("clkCnt", 0)
                conversions = stat.get("convCnt", 0)

                keywords.append(KeywordData(
                    keyword_id=keyword_id,
                    ad_group_id=k.get("nccAdgroupId", ""),
                    keyword_text=k.get("keyword", ""),
                    match_type=k.get("matchType", "EXACT"),
                    status="ENABLED" if k.get("status") == "ELIGIBLE" and not k.get("userLock") else "PAUSED",
                    bid_amount=k.get("bidAmt", 0),
                    quality_score=k.get("qualityScore", 0),
                    impressions=stat.get("impCnt", 0),
                    clicks=clicks,
                    cost=cost,
                    conversions=conversions,
                    revenue=revenue,
                    ctr=(clicks / stat.get("impCnt", 1) * 100) if stat.get("impCnt", 0) > 0 else 0,
                    cpc=(cost / clicks) if clicks > 0 else 0,
                    roas=(revenue / cost * 100) if cost > 0 else 0,
                ))

            return keywords

        except Exception as e:
            logger.error(f"키워드 조회 실패: {e}")
            return []

    async def get_performance(
        self,
        start_date: datetime,
        end_date: datetime,
        granularity: str = "daily"
    ) -> List[PerformanceData]:
        """성과 데이터 조회"""
        try:
            campaigns = await self.api.get_campaigns()
            campaign_ids = [c.get("nccCampaignId") for c in campaigns if c.get("nccCampaignId")]

            if not campaign_ids:
                return []

            stats = await self.api.get_stats(
                "CAMPAIGN",
                campaign_ids,
                start_date.strftime("%Y-%m-%d"),
                end_date.strftime("%Y-%m-%d")
            )

            performance = []
            for stat in stats:
                cost = stat.get("salesAmt", 0)
                revenue = stat.get("convAmt", 0)
                clicks = stat.get("clkCnt", 0)
                impressions = stat.get("impCnt", 0)
                conversions = stat.get("convCnt", 0)

                performance.append(PerformanceData(
                    date=end_date.strftime("%Y-%m-%d"),
                    impressions=impressions,
                    clicks=clicks,
                    cost=cost,
                    conversions=conversions,
                    revenue=revenue,
                    ctr=(clicks / impressions * 100) if impressions > 0 else 0,
                    cpc=(cost / clicks) if clicks > 0 else 0,
                    cpa=(cost / conversions) if conversions > 0 else 0,
                    roas=(revenue / cost * 100) if cost > 0 else 0,
                ))

            return performance

        except Exception as e:
            logger.error(f"성과 조회 실패: {e}")
            return []

    async def update_keyword_bid(self, keyword_id: str, new_bid: float) -> bool:
        """키워드 입찰가 업데이트"""
        try:
            await self.api.update_keyword_bid(keyword_id, int(new_bid))
            logger.info(f"키워드 {keyword_id} 입찰가 변경: {new_bid}원")
            return True
        except Exception as e:
            logger.error(f"입찰가 변경 실패: {e}")
            return False

    async def update_campaign_budget(self, campaign_id: str, new_budget: float) -> bool:
        """캠페인 예산 업데이트"""
        try:
            # 네이버 API에서 캠페인 예산 변경
            await self.api._request("PUT", f"/ncc/campaigns/{campaign_id}", {
                "nccCampaignId": campaign_id,
                "dailyBudget": int(new_budget),
                "useDailyBudget": True
            })
            logger.info(f"캠페인 {campaign_id} 예산 변경: {new_budget}원")
            return True
        except Exception as e:
            logger.error(f"예산 변경 실패: {e}")
            return False

    async def pause_keyword(self, keyword_id: str) -> bool:
        """키워드 일시정지"""
        try:
            await self.api.pause_keyword(keyword_id)
            logger.info(f"키워드 {keyword_id} 일시정지")
            return True
        except Exception as e:
            logger.error(f"키워드 일시정지 실패: {e}")
            return False

    async def activate_keyword(self, keyword_id: str) -> bool:
        """키워드 활성화"""
        try:
            await self.api.activate_keyword(keyword_id)
            logger.info(f"키워드 {keyword_id} 활성화")
            return True
        except Exception as e:
            logger.error(f"키워드 활성화 실패: {e}")
            return False

    async def optimize(
        self,
        strategy: OptimizationStrategy,
        target_roas: float = 300,
        target_cpa: float = 20000,
        **kwargs
    ) -> OptimizationResult:
        """최적화 실행"""
        try:
            # 전략 매핑
            strategy_map = {
                OptimizationStrategy.TARGET_ROAS: BidStrategy.TARGET_ROAS,
                OptimizationStrategy.TARGET_CPA: BidStrategy.TARGET_CPA,
                OptimizationStrategy.MAXIMIZE_CONVERSIONS: BidStrategy.MAXIMIZE_CONVERSIONS,
                OptimizationStrategy.MINIMIZE_CPC: BidStrategy.MINIMIZE_CPC,
                OptimizationStrategy.BALANCED: BidStrategy.BALANCED,
            }

            naver_strategy = strategy_map.get(strategy, BidStrategy.BALANCED)

            # 옵티마이저 설정
            self.bid_optimizer.set_strategy(
                strategy=naver_strategy,
                target_roas=target_roas,
                target_cpa=target_cpa,
                **kwargs
            )

            # 최적화 실행
            changes = await self.bid_optimizer.optimize_all_keywords()

            # 결과 변환
            actions = []
            for change in changes:
                actions.append({
                    "type": "bid_change",
                    "entity_type": "keyword",
                    "entity_id": change.keyword_id,
                    "entity_name": change.keyword,
                    "old_value": change.old_bid,
                    "new_value": change.new_bid,
                    "reason": change.reason,
                })

            return OptimizationResult(
                success=True,
                platform_id="naver_searchad",
                changes=actions,
                total_changes=len(actions),
                message=f"{len(changes)}개 키워드 입찰가 조정 완료",
            )

        except Exception as e:
            logger.error(f"최적화 실행 실패: {e}")
            return OptimizationResult(
                success=False,
                platform_id="naver_searchad",
                message=str(e),
            )

    async def auto_exclude_inefficient(self) -> List[Dict[str, Any]]:
        """비효율 키워드 자동 제외"""
        try:
            excluded = await self.exclusion_engine.evaluate_and_exclude()
            return excluded
        except Exception as e:
            logger.error(f"비효율 키워드 제외 실패: {e}")
            return []

    async def get_campaign(self, campaign_id: str) -> Optional[CampaignData]:
        """특정 캠페인 조회"""
        try:
            campaigns = await self.get_campaigns()
            for campaign in campaigns:
                if campaign.campaign_id == campaign_id:
                    return campaign
            return None
        except Exception as e:
            logger.error(f"캠페인 조회 실패: {e}")
            return None

    async def pause_campaign(self, campaign_id: str) -> bool:
        """캠페인 일시정지"""
        try:
            await self.api._request("PUT", f"/ncc/campaigns/{campaign_id}", {
                "nccCampaignId": campaign_id,
                "status": "PAUSED"
            })
            logger.info(f"캠페인 {campaign_id} 일시정지")
            return True
        except Exception as e:
            logger.error(f"캠페인 일시정지 실패: {e}")
            return False

    async def enable_campaign(self, campaign_id: str) -> bool:
        """캠페인 활성화"""
        try:
            await self.api._request("PUT", f"/ncc/campaigns/{campaign_id}", {
                "nccCampaignId": campaign_id,
                "status": "ELIGIBLE"
            })
            logger.info(f"캠페인 {campaign_id} 활성화")
            return True
        except Exception as e:
            logger.error(f"캠페인 활성화 실패: {e}")
            return False

    async def get_campaign_performance(
        self,
        campaign_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> List[PerformanceData]:
        """캠페인별 성과 데이터 조회"""
        try:
            stats = await self.api.get_stats(
                "CAMPAIGN",
                [campaign_id],
                start_date.strftime("%Y-%m-%d"),
                end_date.strftime("%Y-%m-%d")
            )

            performance = []
            for stat in stats:
                cost = stat.get("salesAmt", 0)
                revenue = stat.get("convAmt", 0)
                clicks = stat.get("clkCnt", 0)
                impressions = stat.get("impCnt", 0)
                conversions = stat.get("convCnt", 0)

                performance.append(PerformanceData(
                    date=stat.get("statDt", end_date.strftime("%Y-%m-%d")),
                    impressions=impressions,
                    clicks=clicks,
                    cost=cost,
                    conversions=conversions,
                    revenue=revenue,
                    ctr=(clicks / impressions * 100) if impressions > 0 else 0,
                    cpc=(cost / clicks) if clicks > 0 else 0,
                    cpa=(cost / conversions) if conversions > 0 else 0,
                    roas=(revenue / cost * 100) if cost > 0 else 0,
                ))

            return performance

        except Exception as e:
            logger.error(f"캠페인 성과 조회 실패: {e}")
            return []
