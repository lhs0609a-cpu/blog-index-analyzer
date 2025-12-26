"""
카카오모먼트 API 연동 서비스
https://moment.kakao.com/docs
"""
import httpx
import hmac
import hashlib
import time
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from .base import (
    AdPlatformBase, CampaignData, AdGroupData, KeywordData,
    PerformanceData, OptimizationResult, OptimizationStrategy
)


class KakaoMomentService(AdPlatformBase):
    """
    카카오모먼트 API 서비스
    카카오톡 채널, 다음, 카카오스토리 광고 지원
    """

    PLATFORM_ID = "kakao_moment"
    PLATFORM_NAME = "Kakao Moment"
    PLATFORM_NAME_KO = "카카오모먼트"

    # API 엔드포인트
    BASE_URL = "https://api.moment.kakao.com"
    API_VERSION = "v4"

    def __init__(self, credentials: Dict[str, str]):
        super().__init__(credentials)
        self.ad_account_id = credentials.get("ad_account_id", "")
        self.access_token = credentials.get("access_token", "")
        self.app_id = credentials.get("app_id", "")

    def _get_headers(self) -> Dict[str, str]:
        """API 요청 헤더 생성"""
        return {
            "Authorization": f"Bearer {self.access_token}",
            "adAccountId": self.ad_account_id,
            "Content-Type": "application/json",
        }

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict] = None,
        data: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """API 요청 실행"""
        url = f"{self.BASE_URL}/{self.API_VERSION}/{endpoint}"
        headers = self._get_headers()

        async with httpx.AsyncClient() as client:
            if method == "GET":
                response = await client.get(url, headers=headers, params=params)
            elif method == "POST":
                response = await client.post(url, headers=headers, json=data)
            elif method == "PUT":
                response = await client.put(url, headers=headers, json=data)
            else:
                raise ValueError(f"Unsupported method: {method}")

            if response.status_code == 200:
                return response.json()
            else:
                raise Exception(f"API request failed: {response.status_code} - {response.text}")

    # ============ 연결 관리 ============

    async def connect(self) -> bool:
        """API 연결"""
        try:
            result = await self._make_request("GET", "adAccounts")
            if result.get("content"):
                self._is_connected = True
                return True
            return False
        except Exception as e:
            self._is_connected = False
            raise e

    async def disconnect(self) -> bool:
        """연결 해제"""
        self._is_connected = False
        return True

    async def validate_credentials(self) -> bool:
        """자격 증명 검증"""
        try:
            await self.connect()
            return True
        except:
            return False

    # ============ 계정 정보 ============

    async def get_account_info(self) -> Dict[str, Any]:
        """계정 정보 조회"""
        result = await self._make_request("GET", f"adAccounts/{self.ad_account_id}")

        return {
            "account_id": result.get("id"),
            "name": result.get("name"),
            "status": result.get("config", "UNKNOWN"),
            "owner_type": result.get("ownerType"),
            "business_type": result.get("businessType"),
        }

    # ============ 캠페인 관리 ============

    async def get_campaigns(self) -> List[CampaignData]:
        """캠페인 목록 조회"""
        result = await self._make_request(
            "GET",
            "campaigns",
            params={"adAccountId": self.ad_account_id}
        )

        campaigns = []
        for camp in result.get("content", []):
            campaign_id = str(camp.get("id"))

            # 성과 데이터 조회
            end_date = datetime.now()
            start_date = end_date - timedelta(days=30)

            try:
                stats = await self._make_request(
                    "GET",
                    "reports/campaign",
                    params={
                        "campaignId": campaign_id,
                        "datePreset": "LAST_30_DAYS",
                        "metricsGroup": "BASIC"
                    }
                )
                metrics = stats.get("data", {})
            except:
                metrics = {}

            impressions = int(metrics.get("imp", 0))
            clicks = int(metrics.get("click", 0))
            cost = float(metrics.get("cost", 0))
            conversions = int(metrics.get("conversion", 0))
            revenue = float(metrics.get("conversionRevenue", 0))

            campaigns.append(CampaignData(
                campaign_id=campaign_id,
                name=camp.get("name", ""),
                status=camp.get("config", "UNKNOWN"),
                budget=float(camp.get("dailyBudgetAmount", 0)),
                budget_type="DAILY",
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

        return campaigns

    async def get_campaign(self, campaign_id: str) -> Optional[CampaignData]:
        """특정 캠페인 조회"""
        campaigns = await self.get_campaigns()
        for campaign in campaigns:
            if campaign.campaign_id == campaign_id:
                return campaign
        return None

    async def update_campaign_budget(self, campaign_id: str, budget: float) -> bool:
        """캠페인 예산 수정"""
        await self._make_request(
            "PUT",
            f"campaigns/{campaign_id}",
            data={"dailyBudgetAmount": int(budget)}
        )
        return True

    async def pause_campaign(self, campaign_id: str) -> bool:
        """캠페인 일시 중지"""
        await self._make_request(
            "PUT",
            f"campaigns/{campaign_id}",
            data={"config": "OFF"}
        )
        return True

    async def enable_campaign(self, campaign_id: str) -> bool:
        """캠페인 활성화"""
        await self._make_request(
            "PUT",
            f"campaigns/{campaign_id}",
            data={"config": "ON"}
        )
        return True

    # ============ 광고 그룹 관리 ============

    async def get_adgroups(self, campaign_id: Optional[str] = None) -> List[AdGroupData]:
        """광고 그룹 목록 조회"""
        params = {"adAccountId": self.ad_account_id}
        if campaign_id:
            params["campaignId"] = campaign_id

        result = await self._make_request("GET", "adGroups", params=params)

        adgroups = []
        for ag in result.get("content", []):
            adgroups.append(AdGroupData(
                adgroup_id=str(ag.get("id")),
                campaign_id=str(ag.get("campaignId")),
                name=ag.get("name", ""),
                status=ag.get("config", ""),
                bid_amount=float(ag.get("bidAmount", 0)),
            ))

        return adgroups

    async def update_adgroup_bid(self, adgroup_id: str, bid_amount: float) -> bool:
        """광고 그룹 입찰가 수정"""
        await self._make_request(
            "PUT",
            f"adGroups/{adgroup_id}",
            data={"bidAmount": int(bid_amount)}
        )
        return True

    # ============ 키워드 관리 (디스플레이 키워드 타겟팅) ============

    async def get_keywords(self, campaign_id: Optional[str] = None) -> List[KeywordData]:
        """키워드 타겟 조회"""
        adgroups = await self.get_adgroups(campaign_id)

        keywords = []
        for ag in adgroups:
            try:
                result = await self._make_request(
                    "GET",
                    f"adGroups/{ag.adgroup_id}/targets/keyword"
                )

                for kw in result.get("content", []):
                    keywords.append(KeywordData(
                        keyword_id=str(kw.get("id")),
                        keyword_text=kw.get("keyword", ""),
                        match_type="BROAD",  # 카카오모먼트는 주로 확장
                        status="ENABLED",
                        bid_amount=ag.bid_amount,
                    ))
            except:
                continue

        return keywords

    # ============ 성과 데이터 ============

    async def get_performance(
        self,
        start_date: datetime,
        end_date: datetime,
        granularity: str = "daily"
    ) -> List[PerformanceData]:
        """성과 데이터 조회"""
        result = await self._make_request(
            "GET",
            "reports/adAccount",
            params={
                "adAccountId": self.ad_account_id,
                "start": start_date.strftime("%Y-%m-%d"),
                "end": end_date.strftime("%Y-%m-%d"),
                "metricsGroup": "BASIC",
                "dimension": "DAY" if granularity == "daily" else "NONE"
            }
        )

        performance = []
        for row in result.get("data", []):
            impressions = int(row.get("imp", 0))
            clicks = int(row.get("click", 0))
            cost = float(row.get("cost", 0))
            conversions = int(row.get("conversion", 0))
            revenue = float(row.get("conversionRevenue", 0))

            performance.append(PerformanceData(
                date=row.get("dateStart", ""),
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

    async def get_campaign_performance(
        self,
        campaign_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> List[PerformanceData]:
        """캠페인별 성과 데이터 조회"""
        result = await self._make_request(
            "GET",
            "reports/campaign",
            params={
                "campaignId": campaign_id,
                "start": start_date.strftime("%Y-%m-%d"),
                "end": end_date.strftime("%Y-%m-%d"),
                "metricsGroup": "BASIC",
                "dimension": "DAY"
            }
        )

        performance = []
        for row in result.get("data", []):
            impressions = int(row.get("imp", 0))
            clicks = int(row.get("click", 0))
            cost = float(row.get("cost", 0))
            conversions = int(row.get("conversion", 0))
            revenue = float(row.get("conversionRevenue", 0))

            performance.append(PerformanceData(
                date=row.get("dateStart", ""),
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

    # ============ 타겟팅 ============

    async def get_targeting_options(self) -> Dict[str, Any]:
        """사용 가능한 타겟팅 옵션 조회"""
        demographics = await self._make_request("GET", "targets/demographics")
        locations = await self._make_request("GET", "targets/locations")
        interests = await self._make_request("GET", "targets/interests")

        return {
            "demographics": demographics.get("content", []),
            "locations": locations.get("content", []),
            "interests": interests.get("content", []),
        }

    # ============ 자동 최적화 ============

    async def optimize_adgroups(
        self,
        settings: Optional[Dict[str, Any]] = None
    ) -> OptimizationResult:
        """광고 그룹 자동 최적화"""
        settings = settings or {}
        changes = []

        campaigns = await self.get_campaigns()

        for campaign in campaigns:
            if campaign.status != "ON":
                continue

            adgroups = await self.get_adgroups(campaign.campaign_id)

            for ag in adgroups:
                if ag.status != "ON":
                    continue

                # CPA 기반 최적화
                target_cpa = settings.get("target_cpa", 10000)

                if campaign.cpa > 0:
                    if campaign.cpa > target_cpa * 1.3:
                        # 높은 CPA: 입찰가 감소
                        new_bid = max(ag.bid_amount * 0.85, settings.get("min_bid", 100))
                        changes.append({
                            "type": "bid_decrease",
                            "adgroup_id": ag.adgroup_id,
                            "campaign_name": campaign.name,
                            "old_bid": ag.bid_amount,
                            "new_bid": new_bid,
                            "reason": f"CPA {campaign.cpa:.0f}원 > 목표 {target_cpa}원"
                        })
                    elif campaign.cpa < target_cpa * 0.7 and campaign.conversions > 5:
                        # 낮은 CPA, 충분한 전환: 입찰가 증가
                        new_bid = min(ag.bid_amount * 1.15, settings.get("max_bid", 100000))
                        changes.append({
                            "type": "bid_increase",
                            "adgroup_id": ag.adgroup_id,
                            "campaign_name": campaign.name,
                            "old_bid": ag.bid_amount,
                            "new_bid": new_bid,
                            "reason": f"CPA {campaign.cpa:.0f}원 < 목표 70%"
                        })

        return OptimizationResult(
            success=True,
            platform_id=self.PLATFORM_ID,
            changes=changes,
            total_changes=len(changes),
            message=f"카카오모먼트 {len(changes)}개 광고 그룹 최적화"
        )

    # ============ 카카오톡 채널 연동 ============

    async def get_kakao_channels(self) -> List[Dict[str, Any]]:
        """연동된 카카오톡 채널 목록"""
        result = await self._make_request(
            "GET",
            "kakaochannels",
            params={"adAccountId": self.ad_account_id}
        )

        return [{
            "id": ch.get("id"),
            "name": ch.get("name"),
            "profile_image": ch.get("profileImageUrl"),
            "category": ch.get("category"),
        } for ch in result.get("content", [])]

    async def get_channel_message_stats(self, channel_id: str) -> Dict[str, Any]:
        """카카오톡 채널 메시지 통계"""
        result = await self._make_request(
            "GET",
            f"kakaochannels/{channel_id}/messageStats",
            params={"datePreset": "LAST_30_DAYS"}
        )

        return {
            "total_sent": result.get("totalSent", 0),
            "total_read": result.get("totalRead", 0),
            "read_rate": result.get("readRate", 0),
            "click_rate": result.get("clickRate", 0),
        }
