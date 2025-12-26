"""
Criteo API 연동 서비스
https://developers.criteo.com/marketing-solutions/docs
"""
import httpx
import base64
import time
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from .base import (
    AdPlatformBase, CampaignData, AdGroupData, CreativeData,
    PerformanceData, OptimizationResult, OptimizationStrategy
)


class CriteoService(AdPlatformBase):
    """
    Criteo API 서비스
    리타겟팅, 프로스펙팅, 다이나믹 광고 지원
    """

    PLATFORM_ID = "criteo"
    PLATFORM_NAME = "Criteo"
    PLATFORM_NAME_KO = "크리테오"

    # API 엔드포인트
    AUTH_URL = "https://api.criteo.com/oauth2/token"
    BASE_URL = "https://api.criteo.com"
    API_VERSION = "2024-01"

    def __init__(self, credentials: Dict[str, str]):
        super().__init__(credentials)
        self.client_id = credentials.get("client_id", "")
        self.client_secret = credentials.get("client_secret", "")
        self.advertiser_id = credentials.get("advertiser_id", "")
        self._access_token = None
        self._token_expires_at = 0

    async def _get_access_token(self) -> str:
        """OAuth 액세스 토큰 획득/갱신"""
        if self._access_token and time.time() < self._token_expires_at - 60:
            return self._access_token

        # Basic Auth 헤더 생성
        credentials = base64.b64encode(
            f"{self.client_id}:{self.client_secret}".encode()
        ).decode()

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.AUTH_URL,
                headers={
                    "Authorization": f"Basic {credentials}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={"grant_type": "client_credentials"}
            )

            if response.status_code == 200:
                data = response.json()
                self._access_token = data["access_token"]
                self._token_expires_at = time.time() + data.get("expires_in", 900)
                return self._access_token
            else:
                raise Exception(f"Failed to get access token: {response.text}")

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict] = None,
        data: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """API 요청 실행"""
        access_token = await self._get_access_token()

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        url = f"{self.BASE_URL}/{self.API_VERSION}/{endpoint}"

        async with httpx.AsyncClient() as client:
            if method == "GET":
                response = await client.get(url, headers=headers, params=params)
            elif method == "POST":
                response = await client.post(url, headers=headers, json=data)
            elif method == "PATCH":
                response = await client.patch(url, headers=headers, json=data)
            else:
                raise ValueError(f"Unsupported method: {method}")

            if response.status_code in [200, 201]:
                return response.json()
            else:
                raise Exception(f"API request failed: {response.status_code} - {response.text}")

    # ============ 연결 관리 ============

    async def connect(self) -> bool:
        """API 연결"""
        try:
            await self._get_access_token()
            self._is_connected = True
            return True
        except Exception as e:
            self._is_connected = False
            raise e

    async def disconnect(self) -> bool:
        """연결 해제"""
        self._access_token = None
        self._is_connected = False
        return True

    async def validate_credentials(self) -> bool:
        """자격 증명 검증"""
        try:
            await self.connect()
            # 광고주 정보 조회로 권한 확인
            await self._make_request("GET", f"advertisers/{self.advertiser_id}")
            return True
        except:
            return False

    # ============ 계정 정보 ============

    async def get_account_info(self) -> Dict[str, Any]:
        """계정 정보 조회"""
        result = await self._make_request("GET", f"advertisers/{self.advertiser_id}")

        data = result.get("data", {}).get("attributes", {})
        return {
            "advertiser_id": self.advertiser_id,
            "name": data.get("name"),
            "status": data.get("status"),
            "industry": data.get("industry"),
        }

    # ============ 캠페인 관리 ============

    async def get_campaigns(self) -> List[CampaignData]:
        """캠페인 목록 조회"""
        result = await self._make_request(
            "GET",
            "marketing-campaigns",
            params={"advertiserIds": self.advertiser_id}
        )

        campaigns = []
        for camp in result.get("data", []):
            campaign_id = camp.get("id")
            attrs = camp.get("attributes", {})

            # 성과 데이터 조회
            end_date = datetime.now()
            start_date = end_date - timedelta(days=30)

            try:
                stats = await self._make_request(
                    "POST",
                    "statistics/report",
                    data={
                        "advertiserIds": [self.advertiser_id],
                        "campaignIds": [campaign_id],
                        "startDate": start_date.strftime("%Y-%m-%d"),
                        "endDate": end_date.strftime("%Y-%m-%d"),
                        "dimensions": ["campaignId"],
                        "metrics": ["impressions", "clicks", "cost", "conversions", "revenue"],
                    }
                )
                metrics = stats.get("data", [{}])[0] if stats.get("data") else {}
            except:
                metrics = {}

            impressions = int(metrics.get("impressions", 0))
            clicks = int(metrics.get("clicks", 0))
            cost = float(metrics.get("cost", 0))
            conversions = int(metrics.get("conversions", 0))
            revenue = float(metrics.get("revenue", 0))

            # 예산 정보
            budget_info = attrs.get("budget", {})
            budget = float(budget_info.get("budgetValue", 0))
            budget_type = budget_info.get("budgetType", "DAILY")

            campaigns.append(CampaignData(
                campaign_id=campaign_id,
                name=attrs.get("name", ""),
                status=attrs.get("status", "UNKNOWN"),
                budget=budget,
                budget_type=budget_type,
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
            "PATCH",
            f"marketing-campaigns/{campaign_id}",
            data={
                "data": {
                    "type": "Campaign",
                    "id": campaign_id,
                    "attributes": {
                        "budget": {
                            "budgetValue": budget,
                            "budgetType": "DAILY"
                        }
                    }
                }
            }
        )
        return True

    async def pause_campaign(self, campaign_id: str) -> bool:
        """캠페인 일시 중지"""
        await self._make_request(
            "PATCH",
            f"marketing-campaigns/{campaign_id}",
            data={
                "data": {
                    "type": "Campaign",
                    "id": campaign_id,
                    "attributes": {"status": "PAUSED"}
                }
            }
        )
        return True

    async def enable_campaign(self, campaign_id: str) -> bool:
        """캠페인 활성화"""
        await self._make_request(
            "PATCH",
            f"marketing-campaigns/{campaign_id}",
            data={
                "data": {
                    "type": "Campaign",
                    "id": campaign_id,
                    "attributes": {"status": "ACTIVE"}
                }
            }
        )
        return True

    # ============ 광고 라인 관리 ============

    async def get_ad_lines(self, campaign_id: Optional[str] = None) -> List[AdGroupData]:
        """광고 라인 목록 조회"""
        params = {"advertiserIds": self.advertiser_id}
        if campaign_id:
            params["campaignIds"] = campaign_id

        result = await self._make_request("GET", "ad-lines", params=params)

        ad_lines = []
        for line in result.get("data", []):
            attrs = line.get("attributes", {})
            ad_lines.append(AdGroupData(
                adgroup_id=line.get("id"),
                campaign_id=attrs.get("campaignId", ""),
                name=attrs.get("name", ""),
                status=attrs.get("status", ""),
                bid_amount=float(attrs.get("bidAmount", 0)),
            ))

        return ad_lines

    async def update_ad_line_bid(self, ad_line_id: str, bid_amount: float) -> bool:
        """광고 라인 입찰가 수정"""
        await self._make_request(
            "PATCH",
            f"ad-lines/{ad_line_id}",
            data={
                "data": {
                    "type": "AdLine",
                    "id": ad_line_id,
                    "attributes": {"bidAmount": bid_amount}
                }
            }
        )
        return True

    # ============ 성과 데이터 ============

    async def get_performance(
        self,
        start_date: datetime,
        end_date: datetime,
        granularity: str = "daily"
    ) -> List[PerformanceData]:
        """성과 데이터 조회"""
        dimensions = ["day"] if granularity == "daily" else []

        result = await self._make_request(
            "POST",
            "statistics/report",
            data={
                "advertiserIds": [self.advertiser_id],
                "startDate": start_date.strftime("%Y-%m-%d"),
                "endDate": end_date.strftime("%Y-%m-%d"),
                "dimensions": dimensions,
                "metrics": ["impressions", "clicks", "cost", "conversions", "revenue"],
            }
        )

        performance = []
        for row in result.get("data", []):
            impressions = int(row.get("impressions", 0))
            clicks = int(row.get("clicks", 0))
            cost = float(row.get("cost", 0))
            conversions = int(row.get("conversions", 0))
            revenue = float(row.get("revenue", 0))

            performance.append(PerformanceData(
                date=row.get("day", ""),
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
            "POST",
            "statistics/report",
            data={
                "advertiserIds": [self.advertiser_id],
                "campaignIds": [campaign_id],
                "startDate": start_date.strftime("%Y-%m-%d"),
                "endDate": end_date.strftime("%Y-%m-%d"),
                "dimensions": ["day"],
                "metrics": ["impressions", "clicks", "cost", "conversions", "revenue"],
            }
        )

        performance = []
        for row in result.get("data", []):
            impressions = int(row.get("impressions", 0))
            clicks = int(row.get("clicks", 0))
            cost = float(row.get("cost", 0))
            conversions = int(row.get("conversions", 0))
            revenue = float(row.get("revenue", 0))

            performance.append(PerformanceData(
                date=row.get("day", ""),
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

    # ============ 상품 피드 ============

    async def get_product_feeds(self) -> List[Dict[str, Any]]:
        """상품 피드 목록"""
        result = await self._make_request(
            "GET",
            "product-feeds",
            params={"advertiserIds": self.advertiser_id}
        )

        return [{
            "feed_id": feed.get("id"),
            "name": feed.get("attributes", {}).get("name"),
            "status": feed.get("attributes", {}).get("status"),
            "product_count": feed.get("attributes", {}).get("productCount", 0),
            "last_update": feed.get("attributes", {}).get("lastUpdate"),
        } for feed in result.get("data", [])]

    async def get_product_performance(self, limit: int = 50) -> List[Dict[str, Any]]:
        """상품별 성과"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)

        result = await self._make_request(
            "POST",
            "statistics/report",
            data={
                "advertiserIds": [self.advertiser_id],
                "startDate": start_date.strftime("%Y-%m-%d"),
                "endDate": end_date.strftime("%Y-%m-%d"),
                "dimensions": ["productId", "productName"],
                "metrics": ["impressions", "clicks", "cost", "conversions", "revenue"],
                "limit": limit,
                "orderBy": [{"metric": "revenue", "order": "DESC"}]
            }
        )

        products = []
        for row in result.get("data", []):
            impressions = int(row.get("impressions", 0))
            clicks = int(row.get("clicks", 0))
            cost = float(row.get("cost", 0))
            revenue = float(row.get("revenue", 0))

            products.append({
                "product_id": row.get("productId"),
                "product_name": row.get("productName"),
                "impressions": impressions,
                "clicks": clicks,
                "cost": cost,
                "conversions": int(row.get("conversions", 0)),
                "revenue": revenue,
                "roas": (revenue / cost * 100) if cost > 0 else 0,
            })

        return products

    # ============ 자동 최적화 ============

    async def optimize_campaigns(
        self,
        settings: Optional[Dict[str, Any]] = None
    ) -> OptimizationResult:
        """캠페인 자동 최적화"""
        settings = settings or {}
        changes = []

        campaigns = await self.get_campaigns()

        for campaign in campaigns:
            if campaign.status != "ACTIVE":
                continue

            target_roas = settings.get("target_roas", 400)

            # ROAS 기반 예산 조정
            if campaign.roas < target_roas * 0.7:
                # 낮은 ROAS: 예산 감소
                new_budget = max(campaign.budget * 0.85, settings.get("min_budget", 10000))
                changes.append({
                    "type": "budget_decrease",
                    "campaign_id": campaign.campaign_id,
                    "campaign_name": campaign.name,
                    "old_budget": campaign.budget,
                    "new_budget": new_budget,
                    "reason": f"ROAS {campaign.roas:.0f}% < 목표 {target_roas}%의 70%"
                })
            elif campaign.roas > target_roas * 1.5 and campaign.conversions > 10:
                # 높은 ROAS + 충분한 전환: 예산 증가
                new_budget = min(campaign.budget * 1.2, settings.get("max_budget", 10000000))
                changes.append({
                    "type": "budget_increase",
                    "campaign_id": campaign.campaign_id,
                    "campaign_name": campaign.name,
                    "old_budget": campaign.budget,
                    "new_budget": new_budget,
                    "reason": f"ROAS {campaign.roas:.0f}% > 목표의 150%, 전환 {campaign.conversions}건"
                })

        return OptimizationResult(
            success=True,
            platform_id=self.PLATFORM_ID,
            changes=changes,
            total_changes=len(changes),
            message=f"Criteo {len(changes)}개 캠페인 최적화"
        )

    # ============ 리타겟팅 오디언스 ============

    async def get_audiences(self) -> List[Dict[str, Any]]:
        """리타겟팅 오디언스 목록"""
        result = await self._make_request(
            "GET",
            "audiences",
            params={"advertiserIds": self.advertiser_id}
        )

        return [{
            "audience_id": aud.get("id"),
            "name": aud.get("attributes", {}).get("name"),
            "type": aud.get("attributes", {}).get("type"),
            "user_count": aud.get("attributes", {}).get("userCount", 0),
        } for aud in result.get("data", [])]

    async def get_retargeting_segments(self) -> List[Dict[str, Any]]:
        """리타겟팅 세그먼트 분석"""
        audiences = await self.get_audiences()
        segments = []

        for aud in audiences:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=30)

            try:
                stats = await self._make_request(
                    "POST",
                    "statistics/report",
                    data={
                        "advertiserIds": [self.advertiser_id],
                        "audienceIds": [aud["audience_id"]],
                        "startDate": start_date.strftime("%Y-%m-%d"),
                        "endDate": end_date.strftime("%Y-%m-%d"),
                        "dimensions": ["audienceId"],
                        "metrics": ["impressions", "clicks", "conversions", "revenue"],
                    }
                )
                metrics = stats.get("data", [{}])[0] if stats.get("data") else {}
            except:
                metrics = {}

            segments.append({
                "audience_id": aud["audience_id"],
                "name": aud["name"],
                "user_count": aud["user_count"],
                "impressions": int(metrics.get("impressions", 0)),
                "conversions": int(metrics.get("conversions", 0)),
                "revenue": float(metrics.get("revenue", 0)),
            })

        return segments
