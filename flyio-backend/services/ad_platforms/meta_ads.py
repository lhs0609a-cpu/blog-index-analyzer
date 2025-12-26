"""
Meta (Facebook/Instagram) Ads API 연동 서비스
https://developers.facebook.com/docs/marketing-apis
"""
import httpx
import time
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from .base import (
    AdPlatformBase, CampaignData, AdGroupData, CreativeData,
    PerformanceData, OptimizationResult, OptimizationStrategy
)


class MetaAdsService(AdPlatformBase):
    """
    Meta Ads (Facebook/Instagram) API 서비스
    피드, 스토리, 릴스, 메신저 광고 지원
    """

    PLATFORM_ID = "meta_ads"
    PLATFORM_NAME = "Meta Ads"
    PLATFORM_NAME_KO = "메타 광고"

    # API 엔드포인트
    API_VERSION = "v18.0"
    BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

    def __init__(self, credentials: Dict[str, str]):
        super().__init__(credentials)
        self.access_token = credentials.get("access_token", "")
        self.ad_account_id = credentials.get("ad_account_id", "")
        # ad_account_id는 act_ 접두사 필요
        if self.ad_account_id and not self.ad_account_id.startswith("act_"):
            self.ad_account_id = f"act_{self.ad_account_id}"

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict] = None,
        data: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """API 요청 실행"""
        params = params or {}
        params["access_token"] = self.access_token

        url = f"{self.BASE_URL}/{endpoint}"

        async with httpx.AsyncClient() as client:
            if method == "GET":
                response = await client.get(url, params=params)
            elif method == "POST":
                response = await client.post(url, params=params, json=data)
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
            # 토큰 유효성 확인
            result = await self._make_request("GET", "me", {"fields": "id,name"})
            if result.get("id"):
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
            # 광고 계정 접근 권한 확인
            result = await self._make_request(
                "GET",
                self.ad_account_id,
                {"fields": "id,name,account_status"}
            )
            return result.get("account_status") == 1  # 1 = ACTIVE
        except:
            return False

    # ============ 계정 정보 ============

    async def get_account_info(self) -> Dict[str, Any]:
        """계정 정보 조회"""
        result = await self._make_request(
            "GET",
            self.ad_account_id,
            {
                "fields": "id,name,account_status,currency,timezone_name,"
                          "amount_spent,balance,spend_cap"
            }
        )

        return {
            "account_id": result.get("id"),
            "name": result.get("name"),
            "status": "ACTIVE" if result.get("account_status") == 1 else "INACTIVE",
            "currency": result.get("currency"),
            "timezone": result.get("timezone_name"),
            "amount_spent": float(result.get("amount_spent", 0)) / 100,
            "balance": float(result.get("balance", 0)) / 100,
            "spend_cap": float(result.get("spend_cap", 0)) / 100 if result.get("spend_cap") else None,
        }

    # ============ 캠페인 관리 ============

    async def get_campaigns(self) -> List[CampaignData]:
        """캠페인 목록 조회"""
        # 캠페인 기본 정보
        campaigns_result = await self._make_request(
            "GET",
            f"{self.ad_account_id}/campaigns",
            {
                "fields": "id,name,status,objective,daily_budget,lifetime_budget,"
                          "budget_remaining,configured_status,effective_status",
                "limit": 100
            }
        )

        campaigns = []
        for camp in campaigns_result.get("data", []):
            campaign_id = camp.get("id")

            # 성과 데이터 조회
            end_date = datetime.now()
            start_date = end_date - timedelta(days=30)

            try:
                insights = await self._make_request(
                    "GET",
                    f"{campaign_id}/insights",
                    {
                        "fields": "impressions,clicks,spend,actions,action_values",
                        "time_range": f'{{"since":"{start_date.strftime("%Y-%m-%d")}","until":"{end_date.strftime("%Y-%m-%d")}"}}',
                        "level": "campaign"
                    }
                )
                metrics = insights.get("data", [{}])[0] if insights.get("data") else {}
            except:
                metrics = {}

            impressions = int(metrics.get("impressions", 0))
            clicks = int(metrics.get("clicks", 0))
            cost = float(metrics.get("spend", 0))

            # 전환 및 매출 계산
            conversions = 0
            revenue = 0
            for action in metrics.get("actions", []):
                if action.get("action_type") in ["purchase", "complete_registration", "lead"]:
                    conversions += int(action.get("value", 0))
            for action_value in metrics.get("action_values", []):
                if action_value.get("action_type") == "purchase":
                    revenue += float(action_value.get("value", 0))

            # 예산 설정
            daily_budget = float(camp.get("daily_budget", 0)) / 100
            lifetime_budget = float(camp.get("lifetime_budget", 0)) / 100

            campaigns.append(CampaignData(
                campaign_id=campaign_id,
                name=camp.get("name", ""),
                status=camp.get("effective_status", "UNKNOWN"),
                budget=daily_budget if daily_budget > 0 else lifetime_budget,
                budget_type="DAILY" if daily_budget > 0 else "LIFETIME",
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
            campaign_id,
            data={"daily_budget": int(budget * 100)}  # 센트 단위
        )
        return True

    async def pause_campaign(self, campaign_id: str) -> bool:
        """캠페인 일시 중지"""
        await self._make_request(
            "POST",
            campaign_id,
            data={"status": "PAUSED"}
        )
        return True

    async def enable_campaign(self, campaign_id: str) -> bool:
        """캠페인 활성화"""
        await self._make_request(
            "POST",
            campaign_id,
            data={"status": "ACTIVE"}
        )
        return True

    # ============ 광고 세트(Ad Set) 관리 ============

    async def get_adsets(self, campaign_id: Optional[str] = None) -> List[AdGroupData]:
        """광고 세트 목록 조회"""
        endpoint = f"{campaign_id}/adsets" if campaign_id else f"{self.ad_account_id}/adsets"

        result = await self._make_request(
            "GET",
            endpoint,
            {
                "fields": "id,campaign_id,name,status,daily_budget,lifetime_budget,"
                          "bid_amount,optimization_goal,billing_event",
                "limit": 100
            }
        )

        adsets = []
        for adset in result.get("data", []):
            adsets.append(AdGroupData(
                adgroup_id=adset.get("id"),
                campaign_id=adset.get("campaign_id"),
                name=adset.get("name", ""),
                status=adset.get("status", ""),
                bid_amount=float(adset.get("bid_amount", 0)) / 100,
            ))

        return adsets

    async def update_adset_bid(self, adset_id: str, bid_amount: float) -> bool:
        """광고 세트 입찰가 수정"""
        await self._make_request(
            "POST",
            adset_id,
            data={"bid_amount": int(bid_amount * 100)}
        )
        return True

    # ============ 광고 소재 관리 ============

    async def get_ads(self, adset_id: Optional[str] = None) -> List[CreativeData]:
        """광고 목록 조회"""
        endpoint = f"{adset_id}/ads" if adset_id else f"{self.ad_account_id}/ads"

        result = await self._make_request(
            "GET",
            endpoint,
            {
                "fields": "id,name,status,creative{id,name,object_type}",
                "limit": 100
            }
        )

        ads = []
        for ad in result.get("data", []):
            creative = ad.get("creative", {})
            ads.append(CreativeData(
                creative_id=ad.get("id"),
                name=ad.get("name", ""),
                creative_type=creative.get("object_type", "UNKNOWN"),
                status=ad.get("status", ""),
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
        time_increment = 1 if granularity == "daily" else "all_days"

        result = await self._make_request(
            "GET",
            f"{self.ad_account_id}/insights",
            {
                "fields": "date_start,impressions,clicks,spend,actions,action_values,cpm,cpp,ctr",
                "time_range": f'{{"since":"{start_date.strftime("%Y-%m-%d")}","until":"{end_date.strftime("%Y-%m-%d")}"}}',
                "time_increment": time_increment,
                "level": "account"
            }
        )

        performance = []
        for row in result.get("data", []):
            impressions = int(row.get("impressions", 0))
            clicks = int(row.get("clicks", 0))
            cost = float(row.get("spend", 0))

            conversions = 0
            revenue = 0
            for action in row.get("actions", []):
                if action.get("action_type") in ["purchase", "complete_registration", "lead"]:
                    conversions += int(action.get("value", 0))
            for action_value in row.get("action_values", []):
                if action_value.get("action_type") == "purchase":
                    revenue += float(action_value.get("value", 0))

            performance.append(PerformanceData(
                date=row.get("date_start", ""),
                impressions=impressions,
                clicks=clicks,
                cost=cost,
                conversions=conversions,
                revenue=revenue,
                ctr=float(row.get("ctr", 0)),
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
            f"{campaign_id}/insights",
            {
                "fields": "date_start,impressions,clicks,spend,actions,action_values",
                "time_range": f'{{"since":"{start_date.strftime("%Y-%m-%d")}","until":"{end_date.strftime("%Y-%m-%d")}"}}',
                "time_increment": 1,
                "level": "campaign"
            }
        )

        performance = []
        for row in result.get("data", []):
            impressions = int(row.get("impressions", 0))
            clicks = int(row.get("clicks", 0))
            cost = float(row.get("spend", 0))

            conversions = 0
            revenue = 0
            for action in row.get("actions", []):
                if action.get("action_type") in ["purchase", "complete_registration", "lead"]:
                    conversions += int(action.get("value", 0))
            for action_value in row.get("action_values", []):
                if action_value.get("action_type") == "purchase":
                    revenue += float(action_value.get("value", 0))

            performance.append(PerformanceData(
                date=row.get("date_start", ""),
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

    # ============ 오디언스 인사이트 ============

    async def get_audience_insights(self, campaign_id: str) -> Dict[str, Any]:
        """오디언스 인사이트 조회"""
        result = await self._make_request(
            "GET",
            f"{campaign_id}/insights",
            {
                "fields": "impressions,clicks,spend",
                "breakdowns": "age,gender",
                "time_range": '{"since":"2024-01-01","until":"2024-12-31"}',
                "level": "campaign"
            }
        )

        age_data = {}
        gender_data = {}

        for row in result.get("data", []):
            age = row.get("age", "Unknown")
            gender = row.get("gender", "Unknown")
            impressions = int(row.get("impressions", 0))

            if age not in age_data:
                age_data[age] = 0
            age_data[age] += impressions

            if gender not in gender_data:
                gender_data[gender] = 0
            gender_data[gender] += impressions

        return {
            "by_age": age_data,
            "by_gender": gender_data
        }

    # ============ 자동 최적화 ============

    async def optimize_adsets(
        self,
        settings: Optional[Dict[str, Any]] = None
    ) -> OptimizationResult:
        """광고 세트 자동 최적화"""
        settings = settings or {}
        changes = []

        campaigns = await self.get_campaigns()

        for campaign in campaigns:
            if campaign.status != "ACTIVE":
                continue

            adsets = await self.get_adsets(campaign.campaign_id)

            for adset in adsets:
                if adset.status != "ACTIVE":
                    continue

                # ROAS 기반 최적화
                target_roas = settings.get("target_roas", 300)

                if campaign.roas < target_roas * 0.7:
                    # 낮은 ROAS: 입찰가 감소
                    new_bid = max(adset.bid_amount * 0.85, settings.get("min_bid", 100))
                    changes.append({
                        "type": "bid_decrease",
                        "adset_id": adset.adgroup_id,
                        "campaign_name": campaign.name,
                        "old_bid": adset.bid_amount,
                        "new_bid": new_bid,
                        "reason": f"ROAS {campaign.roas:.0f}% < 목표 {target_roas}%"
                    })
                elif campaign.roas > target_roas * 1.5:
                    # 높은 ROAS: 입찰가/예산 증가
                    new_bid = min(adset.bid_amount * 1.15, settings.get("max_bid", 50000))
                    changes.append({
                        "type": "bid_increase",
                        "adset_id": adset.adgroup_id,
                        "campaign_name": campaign.name,
                        "old_bid": adset.bid_amount,
                        "new_bid": new_bid,
                        "reason": f"ROAS {campaign.roas:.0f}% > 목표의 150%"
                    })

        return OptimizationResult(
            success=True,
            platform_id=self.PLATFORM_ID,
            changes=changes,
            total_changes=len(changes),
            message=f"Meta Ads {len(changes)}개 광고 세트 최적화"
        )

    # ============ A/B 테스트 ============

    async def get_ab_test_results(self, campaign_id: str) -> List[Dict[str, Any]]:
        """A/B 테스트 결과 조회"""
        ads = await self.get_ads()

        # 광고별 성과 비교
        results = []
        for ad in ads:
            try:
                insights = await self._make_request(
                    "GET",
                    f"{ad.creative_id}/insights",
                    {
                        "fields": "impressions,clicks,spend,actions,ctr",
                        "date_preset": "last_30d"
                    }
                )

                metrics = insights.get("data", [{}])[0] if insights.get("data") else {}
                results.append({
                    "ad_id": ad.creative_id,
                    "ad_name": ad.name,
                    "impressions": int(metrics.get("impressions", 0)),
                    "clicks": int(metrics.get("clicks", 0)),
                    "ctr": float(metrics.get("ctr", 0)),
                    "spend": float(metrics.get("spend", 0)),
                })
            except:
                continue

        # CTR 기준 정렬
        results.sort(key=lambda x: x["ctr"], reverse=True)
        return results
