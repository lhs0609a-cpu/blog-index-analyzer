"""
TikTok Ads API 연동 서비스
https://ads.tiktok.com/marketing_api/docs
"""
import httpx
import hashlib
import hmac
import time
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from .base import (
    AdPlatformBase, CampaignData, AdGroupData, CreativeData,
    PerformanceData, OptimizationResult, OptimizationStrategy
)


class TikTokAdsService(AdPlatformBase):
    """
    TikTok Ads API 서비스
    인피드, 탑뷰, 브랜드 테이크오버 광고 지원
    """

    PLATFORM_ID = "tiktok_ads"
    PLATFORM_NAME = "TikTok Ads"
    PLATFORM_NAME_KO = "틱톡 광고"

    # API 엔드포인트
    BASE_URL = "https://business-api.tiktok.com/open_api/v1.3"

    def __init__(self, credentials: Dict[str, str]):
        super().__init__(credentials)
        self.access_token = credentials.get("access_token", "")
        self.advertiser_id = credentials.get("advertiser_id", "")
        self.app_id = credentials.get("app_id", "")
        self.secret = credentials.get("secret", "")

    def _get_headers(self) -> Dict[str, str]:
        """API 요청 헤더 생성"""
        return {
            "Access-Token": self.access_token,
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
        url = f"{self.BASE_URL}/{endpoint}"
        headers = self._get_headers()

        # advertiser_id 자동 추가
        if params is None:
            params = {}
        if data is None:
            data = {}

        if method == "GET":
            params["advertiser_id"] = self.advertiser_id
        else:
            data["advertiser_id"] = self.advertiser_id

        async with httpx.AsyncClient() as client:
            if method == "GET":
                response = await client.get(url, headers=headers, params=params)
            elif method == "POST":
                response = await client.post(url, headers=headers, json=data)
            else:
                raise ValueError(f"Unsupported method: {method}")

            result = response.json()

            if result.get("code") == 0:
                return result.get("data", {})
            else:
                raise Exception(f"API error: {result.get('message')} (code: {result.get('code')})")

    # ============ 연결 관리 ============

    async def connect(self) -> bool:
        """API 연결"""
        try:
            result = await self._make_request(
                "GET",
                "advertiser/info",
                params={"advertiser_ids": f'["{self.advertiser_id}"]'}
            )
            if result.get("list"):
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
        result = await self._make_request(
            "GET",
            "advertiser/info",
            params={"advertiser_ids": f'["{self.advertiser_id}"]'}
        )

        if result.get("list"):
            advertiser = result["list"][0]
            return {
                "advertiser_id": advertiser.get("advertiser_id"),
                "name": advertiser.get("advertiser_name"),
                "status": advertiser.get("status"),
                "currency": advertiser.get("currency"),
                "timezone": advertiser.get("timezone"),
                "balance": float(advertiser.get("balance", 0)),
            }
        return {}

    # ============ 캠페인 관리 ============

    async def get_campaigns(self) -> List[CampaignData]:
        """캠페인 목록 조회"""
        result = await self._make_request(
            "GET",
            "campaign/get",
            params={
                "page_size": 100,
                "fields": '["campaign_id","campaign_name","operation_status","objective_type","budget","budget_mode"]'
            }
        )

        campaigns = []
        for camp in result.get("list", []):
            campaign_id = str(camp.get("campaign_id"))

            # 성과 데이터 조회
            end_date = datetime.now()
            start_date = end_date - timedelta(days=30)

            try:
                stats = await self._make_request(
                    "GET",
                    "report/integrated/get",
                    params={
                        "report_type": "BASIC",
                        "dimensions": '["campaign_id"]',
                        "metrics": '["spend","impressions","clicks","conversion","total_complete_payment_rate"]',
                        "data_level": "AUCTION_CAMPAIGN",
                        "start_date": start_date.strftime("%Y-%m-%d"),
                        "end_date": end_date.strftime("%Y-%m-%d"),
                        "filters": f'[{{"field_name":"campaign_id","filter_type":"IN","filter_value":"[\\"{campaign_id}\\"]"}}]'
                    }
                )
                metrics = stats.get("list", [{}])[0].get("metrics", {}) if stats.get("list") else {}
            except:
                metrics = {}

            impressions = int(float(metrics.get("impressions", 0)))
            clicks = int(float(metrics.get("clicks", 0)))
            cost = float(metrics.get("spend", 0))
            conversions = int(float(metrics.get("conversion", 0)))
            revenue = float(metrics.get("total_complete_payment_rate", 0)) * cost  # 추정

            campaigns.append(CampaignData(
                campaign_id=campaign_id,
                name=camp.get("campaign_name", ""),
                status=camp.get("operation_status", "UNKNOWN"),
                budget=float(camp.get("budget", 0)),
                budget_type=camp.get("budget_mode", "BUDGET_MODE_DAY"),
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
            "POST",
            "campaign/update",
            data={
                "campaign_id": campaign_id,
                "budget": budget
            }
        )
        return True

    async def pause_campaign(self, campaign_id: str) -> bool:
        """캠페인 일시 중지"""
        await self._make_request(
            "POST",
            "campaign/update/status",
            data={
                "campaign_ids": [campaign_id],
                "operation_status": "DISABLE"
            }
        )
        return True

    async def enable_campaign(self, campaign_id: str) -> bool:
        """캠페인 활성화"""
        await self._make_request(
            "POST",
            "campaign/update/status",
            data={
                "campaign_ids": [campaign_id],
                "operation_status": "ENABLE"
            }
        )
        return True

    # ============ 광고 그룹 관리 ============

    async def get_adgroups(self, campaign_id: Optional[str] = None) -> List[AdGroupData]:
        """광고 그룹 목록 조회"""
        params = {
            "page_size": 100,
            "fields": '["adgroup_id","campaign_id","adgroup_name","operation_status","bid_price"]'
        }

        if campaign_id:
            params["filtering"] = f'{{"campaign_ids":["{campaign_id}"]}}'

        result = await self._make_request("GET", "adgroup/get", params=params)

        adgroups = []
        for ag in result.get("list", []):
            adgroups.append(AdGroupData(
                adgroup_id=str(ag.get("adgroup_id")),
                campaign_id=str(ag.get("campaign_id")),
                name=ag.get("adgroup_name", ""),
                status=ag.get("operation_status", ""),
                bid_amount=float(ag.get("bid_price", 0)),
            ))

        return adgroups

    async def update_adgroup_bid(self, adgroup_id: str, bid_amount: float) -> bool:
        """광고 그룹 입찰가 수정"""
        await self._make_request(
            "POST",
            "adgroup/update",
            data={
                "adgroup_id": adgroup_id,
                "bid_price": bid_amount
            }
        )
        return True

    # ============ 광고 소재 관리 ============

    async def get_ads(self, adgroup_id: Optional[str] = None) -> List[CreativeData]:
        """광고 목록 조회"""
        params = {
            "page_size": 100,
            "fields": '["ad_id","adgroup_id","ad_name","operation_status","ad_format"]'
        }

        if adgroup_id:
            params["filtering"] = f'{{"adgroup_ids":["{adgroup_id}"]}}'

        result = await self._make_request("GET", "ad/get", params=params)

        ads = []
        for ad in result.get("list", []):
            ads.append(CreativeData(
                creative_id=str(ad.get("ad_id")),
                name=ad.get("ad_name", ""),
                creative_type=ad.get("ad_format", "UNKNOWN"),
                status=ad.get("operation_status", ""),
            ))

        return ads

    # ============ 성과 데이터 ============

    async def get_performance(
        self,
        start_date: datetime,
        end_date: datetime,
        granularity: str = "daily"
    ) -> List[PerformanceData]:
        """성과 데이터 조회"""
        dimensions = '["stat_time_day"]' if granularity == "daily" else '[]'

        result = await self._make_request(
            "GET",
            "report/integrated/get",
            params={
                "report_type": "BASIC",
                "dimensions": dimensions,
                "metrics": '["spend","impressions","clicks","conversion","ctr","cpc","cpm"]',
                "data_level": "AUCTION_ADVERTISER",
                "start_date": start_date.strftime("%Y-%m-%d"),
                "end_date": end_date.strftime("%Y-%m-%d"),
            }
        )

        performance = []
        for row in result.get("list", []):
            dims = row.get("dimensions", {})
            metrics = row.get("metrics", {})

            impressions = int(float(metrics.get("impressions", 0)))
            clicks = int(float(metrics.get("clicks", 0)))
            cost = float(metrics.get("spend", 0))
            conversions = int(float(metrics.get("conversion", 0)))

            performance.append(PerformanceData(
                date=dims.get("stat_time_day", ""),
                impressions=impressions,
                clicks=clicks,
                cost=cost,
                conversions=conversions,
                revenue=0,  # TikTok API에서는 별도 조회 필요
                ctr=float(metrics.get("ctr", 0)),
                cpc=float(metrics.get("cpc", 0)),
                cpa=(cost / conversions) if conversions > 0 else 0,
                roas=0,
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
            "report/integrated/get",
            params={
                "report_type": "BASIC",
                "dimensions": '["stat_time_day","campaign_id"]',
                "metrics": '["spend","impressions","clicks","conversion"]',
                "data_level": "AUCTION_CAMPAIGN",
                "start_date": start_date.strftime("%Y-%m-%d"),
                "end_date": end_date.strftime("%Y-%m-%d"),
                "filters": f'[{{"field_name":"campaign_id","filter_type":"IN","filter_value":"[\\"{campaign_id}\\"]"}}]'
            }
        )

        performance = []
        for row in result.get("list", []):
            dims = row.get("dimensions", {})
            metrics = row.get("metrics", {})

            impressions = int(float(metrics.get("impressions", 0)))
            clicks = int(float(metrics.get("clicks", 0)))
            cost = float(metrics.get("spend", 0))
            conversions = int(float(metrics.get("conversion", 0)))

            performance.append(PerformanceData(
                date=dims.get("stat_time_day", ""),
                impressions=impressions,
                clicks=clicks,
                cost=cost,
                conversions=conversions,
                revenue=0,
                ctr=(clicks / impressions * 100) if impressions > 0 else 0,
                cpc=(cost / clicks) if clicks > 0 else 0,
                cpa=(cost / conversions) if conversions > 0 else 0,
                roas=0,
            ))

        return performance

    # ============ 오디언스 관리 ============

    async def get_custom_audiences(self) -> List[Dict[str, Any]]:
        """맞춤 오디언스 목록"""
        result = await self._make_request(
            "GET",
            "dmp/custom_audience/list",
            params={"page_size": 100}
        )

        return [{
            "audience_id": aud.get("custom_audience_id"),
            "name": aud.get("name"),
            "audience_size": aud.get("audience_details", {}).get("audience_size", 0),
            "source": aud.get("source"),
        } for aud in result.get("list", [])]

    async def get_lookalike_audiences(self) -> List[Dict[str, Any]]:
        """유사 오디언스 목록"""
        result = await self._make_request(
            "GET",
            "dmp/lookalike_audience/list",
            params={"page_size": 100}
        )

        return [{
            "audience_id": aud.get("lookalike_audience_id"),
            "name": aud.get("name"),
            "audience_size": aud.get("audience_details", {}).get("audience_size", 0),
            "source_audience_id": aud.get("source_audience_id"),
        } for aud in result.get("list", [])]

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
            if campaign.status != "ENABLE":
                continue

            adgroups = await self.get_adgroups(campaign.campaign_id)

            for ag in adgroups:
                if ag.status != "ENABLE":
                    continue

                # 전환 기반 최적화
                target_cpa = settings.get("target_cpa", 5000)

                if campaign.conversions > 0:
                    current_cpa = campaign.cost / campaign.conversions

                    if current_cpa > target_cpa * 1.2:
                        # 높은 CPA: 입찰가 감소
                        new_bid = max(ag.bid_amount * 0.9, settings.get("min_bid", 500))
                        changes.append({
                            "type": "bid_decrease",
                            "adgroup_id": ag.adgroup_id,
                            "campaign_name": campaign.name,
                            "old_bid": ag.bid_amount,
                            "new_bid": new_bid,
                            "reason": f"CPA ${current_cpa:.2f} > 목표 ${target_cpa}"
                        })
                    elif current_cpa < target_cpa * 0.7:
                        # 낮은 CPA: 입찰가 증가로 볼륨 확대
                        new_bid = min(ag.bid_amount * 1.1, settings.get("max_bid", 50000))
                        changes.append({
                            "type": "bid_increase",
                            "adgroup_id": ag.adgroup_id,
                            "campaign_name": campaign.name,
                            "old_bid": ag.bid_amount,
                            "new_bid": new_bid,
                            "reason": f"CPA ${current_cpa:.2f} < 목표의 70%"
                        })

        return OptimizationResult(
            success=True,
            platform_id=self.PLATFORM_ID,
            changes=changes,
            total_changes=len(changes),
            message=f"TikTok Ads {len(changes)}개 광고 그룹 최적화"
        )

    # ============ 크리에이티브 인사이트 ============

    async def get_creative_insights(self, ad_id: str) -> Dict[str, Any]:
        """크리에이티브 성과 분석"""
        result = await self._make_request(
            "GET",
            "report/integrated/get",
            params={
                "report_type": "BASIC",
                "dimensions": '["ad_id"]',
                "metrics": '["spend","impressions","clicks","video_play_actions","video_watched_6s","video_watched_100p","engaged_view","engaged_view_15s"]',
                "data_level": "AUCTION_AD",
                "start_date": (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d"),
                "end_date": datetime.now().strftime("%Y-%m-%d"),
                "filters": f'[{{"field_name":"ad_id","filter_type":"IN","filter_value":"[\\"{ad_id}\\"]"}}]'
            }
        )

        if result.get("list"):
            metrics = result["list"][0].get("metrics", {})
            impressions = float(metrics.get("impressions", 1))

            return {
                "ad_id": ad_id,
                "video_play_rate": float(metrics.get("video_play_actions", 0)) / impressions * 100,
                "6s_view_rate": float(metrics.get("video_watched_6s", 0)) / impressions * 100,
                "completion_rate": float(metrics.get("video_watched_100p", 0)) / impressions * 100,
                "engaged_view": int(float(metrics.get("engaged_view", 0))),
                "engaged_view_15s": int(float(metrics.get("engaged_view_15s", 0))),
            }

        return {}
