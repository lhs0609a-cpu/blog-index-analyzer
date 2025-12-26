"""
Google Ads API 연동 서비스
https://developers.google.com/google-ads/api/docs/start
"""
import httpx
import hashlib
import time
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from .base import (
    AdPlatformBase, CampaignData, KeywordData, AdGroupData,
    PerformanceData, OptimizationResult, OptimizationStrategy
)


class GoogleAdsService(AdPlatformBase):
    """
    Google Ads API 서비스
    검색, 디스플레이, 유튜브, 앱 캠페인 지원
    """

    PLATFORM_ID = "google_ads"
    PLATFORM_NAME = "Google Ads"
    PLATFORM_NAME_KO = "구글 애즈"

    # API 엔드포인트
    API_VERSION = "v15"
    BASE_URL = f"https://googleads.googleapis.com/{API_VERSION}"

    def __init__(self, credentials: Dict[str, str]):
        super().__init__(credentials)
        self.customer_id = credentials.get("customer_id", "").replace("-", "")
        self.developer_token = credentials.get("developer_token", "")
        self.refresh_token = credentials.get("refresh_token", "")
        self.client_id = credentials.get("client_id", "")
        self.client_secret = credentials.get("client_secret", "")
        self._access_token = None
        self._token_expires_at = 0

    async def _get_access_token(self) -> str:
        """OAuth 액세스 토큰 획득/갱신"""
        if self._access_token and time.time() < self._token_expires_at - 60:
            return self._access_token

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": self.refresh_token,
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                }
            )

            if response.status_code == 200:
                data = response.json()
                self._access_token = data["access_token"]
                self._token_expires_at = time.time() + data.get("expires_in", 3600)
                return self._access_token
            else:
                raise Exception(f"Failed to get access token: {response.text}")

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """API 요청 실행"""
        access_token = await self._get_access_token()

        headers = {
            "Authorization": f"Bearer {access_token}",
            "developer-token": self.developer_token,
            "Content-Type": "application/json",
        }

        url = f"{self.BASE_URL}/customers/{self.customer_id}/{endpoint}"

        async with httpx.AsyncClient() as client:
            if method == "GET":
                response = await client.get(url, headers=headers)
            elif method == "POST":
                response = await client.post(url, headers=headers, json=data)
            else:
                raise ValueError(f"Unsupported method: {method}")

            if response.status_code == 200:
                return response.json()
            else:
                raise Exception(f"API request failed: {response.status_code} - {response.text}")

    async def _execute_query(self, query: str) -> List[Dict[str, Any]]:
        """GAQL 쿼리 실행"""
        data = {"query": query}
        result = await self._make_request("POST", "googleAds:searchStream", data)

        rows = []
        for batch in result.get("results", []):
            rows.extend(batch.get("results", []))
        return rows

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
            # 간단한 쿼리로 권한 확인
            query = "SELECT customer.id FROM customer LIMIT 1"
            await self._execute_query(query)
            return True
        except:
            return False

    # ============ 계정 정보 ============

    async def get_account_info(self) -> Dict[str, Any]:
        """계정 정보 조회"""
        query = """
            SELECT
                customer.id,
                customer.descriptive_name,
                customer.currency_code,
                customer.time_zone
            FROM customer
        """
        rows = await self._execute_query(query)

        if rows:
            customer = rows[0].get("customer", {})
            return {
                "customer_id": customer.get("id"),
                "name": customer.get("descriptiveName"),
                "currency": customer.get("currencyCode"),
                "timezone": customer.get("timeZone"),
            }
        return {}

    # ============ 캠페인 관리 ============

    async def get_campaigns(self) -> List[CampaignData]:
        """캠페인 목록 조회"""
        query = """
            SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.advertising_channel_type,
                campaign_budget.amount_micros,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value
            FROM campaign
            WHERE campaign.status != 'REMOVED'
            ORDER BY metrics.cost_micros DESC
        """
        rows = await self._execute_query(query)

        campaigns = []
        for row in rows:
            campaign = row.get("campaign", {})
            metrics = row.get("metrics", {})
            budget = row.get("campaignBudget", {})

            impressions = int(metrics.get("impressions", 0))
            clicks = int(metrics.get("clicks", 0))
            cost = int(metrics.get("costMicros", 0)) / 1_000_000
            conversions = float(metrics.get("conversions", 0))
            revenue = float(metrics.get("conversionsValue", 0))

            campaigns.append(CampaignData(
                campaign_id=str(campaign.get("id")),
                name=campaign.get("name", ""),
                status=campaign.get("status", ""),
                budget=int(budget.get("amountMicros", 0)) / 1_000_000,
                budget_type="DAILY",
                impressions=impressions,
                clicks=clicks,
                cost=cost,
                conversions=int(conversions),
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
        # 먼저 캠페인의 예산 리소스 이름을 조회
        query = f"""
            SELECT campaign.id, campaign_budget.resource_name
            FROM campaign
            WHERE campaign.id = {campaign_id}
        """
        rows = await self._execute_query(query)

        if not rows:
            return False

        budget_resource = rows[0].get("campaignBudget", {}).get("resourceName")

        # 예산 업데이트
        operations = [{
            "updateMask": "amount_micros",
            "update": {
                "resourceName": budget_resource,
                "amountMicros": str(int(budget * 1_000_000))
            }
        }]

        await self._make_request(
            "POST",
            "campaignBudgets:mutate",
            {"operations": operations}
        )
        return True

    async def pause_campaign(self, campaign_id: str) -> bool:
        """캠페인 일시 중지"""
        operations = [{
            "updateMask": "status",
            "update": {
                "resourceName": f"customers/{self.customer_id}/campaigns/{campaign_id}",
                "status": "PAUSED"
            }
        }]

        await self._make_request("POST", "campaigns:mutate", {"operations": operations})
        return True

    async def enable_campaign(self, campaign_id: str) -> bool:
        """캠페인 활성화"""
        operations = [{
            "updateMask": "status",
            "update": {
                "resourceName": f"customers/{self.customer_id}/campaigns/{campaign_id}",
                "status": "ENABLED"
            }
        }]

        await self._make_request("POST", "campaigns:mutate", {"operations": operations})
        return True

    # ============ 키워드 관리 ============

    async def get_keywords(self, campaign_id: Optional[str] = None) -> List[KeywordData]:
        """키워드 목록 조회"""
        campaign_filter = f"AND campaign.id = {campaign_id}" if campaign_id else ""

        query = f"""
            SELECT
                ad_group_criterion.criterion_id,
                ad_group_criterion.keyword.text,
                ad_group_criterion.keyword.match_type,
                ad_group_criterion.status,
                ad_group_criterion.effective_cpc_bid_micros,
                ad_group_criterion.quality_info.quality_score,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value,
                metrics.average_cpc,
                metrics.search_impression_share
            FROM keyword_view
            WHERE ad_group_criterion.status != 'REMOVED'
            {campaign_filter}
            ORDER BY metrics.cost_micros DESC
            LIMIT 1000
        """
        rows = await self._execute_query(query)

        keywords = []
        for row in rows:
            criterion = row.get("adGroupCriterion", {})
            keyword_info = criterion.get("keyword", {})
            quality_info = criterion.get("qualityInfo", {})
            metrics = row.get("metrics", {})

            impressions = int(metrics.get("impressions", 0))
            clicks = int(metrics.get("clicks", 0))
            cost = int(metrics.get("costMicros", 0)) / 1_000_000
            conversions = float(metrics.get("conversions", 0))
            revenue = float(metrics.get("conversionsValue", 0))

            keywords.append(KeywordData(
                keyword_id=str(criterion.get("criterionId")),
                keyword_text=keyword_info.get("text", ""),
                match_type=keyword_info.get("matchType", ""),
                status=criterion.get("status", ""),
                bid_amount=int(criterion.get("effectiveCpcBidMicros", 0)) / 1_000_000,
                quality_score=quality_info.get("qualityScore"),
                impressions=impressions,
                clicks=clicks,
                cost=cost,
                conversions=int(conversions),
                revenue=revenue,
                ctr=(clicks / impressions * 100) if impressions > 0 else 0,
                cpc=(cost / clicks) if clicks > 0 else 0,
            ))

        return keywords

    async def update_keyword_bid(self, keyword_id: str, bid_amount: float) -> bool:
        """키워드 입찰가 수정"""
        # keyword_id는 실제로 ad_group_criterion의 resource_name이 필요
        # 여기서는 간소화하여 구현
        operations = [{
            "updateMask": "cpc_bid_micros",
            "update": {
                "cpcBidMicros": str(int(bid_amount * 1_000_000))
            }
        }]

        # 실제 구현에서는 ad_group_criterion의 full resource name 필요
        # await self._make_request("POST", "adGroupCriteria:mutate", {"operations": operations})
        return True

    async def add_negative_keyword(self, campaign_id: str, keyword: str) -> bool:
        """부정 키워드 추가"""
        operations = [{
            "create": {
                "campaign": f"customers/{self.customer_id}/campaigns/{campaign_id}",
                "keyword": {
                    "text": keyword,
                    "matchType": "BROAD"
                },
                "negative": True
            }
        }]

        await self._make_request("POST", "campaignCriteria:mutate", {"operations": operations})
        return True

    # ============ 성과 데이터 ============

    async def get_performance(
        self,
        start_date: datetime,
        end_date: datetime,
        granularity: str = "daily"
    ) -> List[PerformanceData]:
        """성과 데이터 조회"""
        date_range = f"BETWEEN '{start_date.strftime('%Y-%m-%d')}' AND '{end_date.strftime('%Y-%m-%d')}'"

        if granularity == "daily":
            query = f"""
                SELECT
                    segments.date,
                    metrics.impressions,
                    metrics.clicks,
                    metrics.cost_micros,
                    metrics.conversions,
                    metrics.conversions_value
                FROM customer
                WHERE segments.date {date_range}
                ORDER BY segments.date
            """
        else:
            query = f"""
                SELECT
                    metrics.impressions,
                    metrics.clicks,
                    metrics.cost_micros,
                    metrics.conversions,
                    metrics.conversions_value
                FROM customer
                WHERE segments.date {date_range}
            """

        rows = await self._execute_query(query)

        performance = []
        for row in rows:
            segments = row.get("segments", {})
            metrics = row.get("metrics", {})

            impressions = int(metrics.get("impressions", 0))
            clicks = int(metrics.get("clicks", 0))
            cost = int(metrics.get("costMicros", 0)) / 1_000_000
            conversions = float(metrics.get("conversions", 0))
            revenue = float(metrics.get("conversionsValue", 0))

            performance.append(PerformanceData(
                date=segments.get("date", ""),
                impressions=impressions,
                clicks=clicks,
                cost=cost,
                conversions=int(conversions),
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
        date_range = f"BETWEEN '{start_date.strftime('%Y-%m-%d')}' AND '{end_date.strftime('%Y-%m-%d')}'"

        query = f"""
            SELECT
                segments.date,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value
            FROM campaign
            WHERE campaign.id = {campaign_id}
                AND segments.date {date_range}
            ORDER BY segments.date
        """

        rows = await self._execute_query(query)

        performance = []
        for row in rows:
            segments = row.get("segments", {})
            metrics = row.get("metrics", {})

            impressions = int(metrics.get("impressions", 0))
            clicks = int(metrics.get("clicks", 0))
            cost = int(metrics.get("costMicros", 0)) / 1_000_000
            conversions = float(metrics.get("conversions", 0))
            revenue = float(metrics.get("conversionsValue", 0))

            performance.append(PerformanceData(
                date=segments.get("date", ""),
                impressions=impressions,
                clicks=clicks,
                cost=cost,
                conversions=int(conversions),
                revenue=revenue,
                ctr=(clicks / impressions * 100) if impressions > 0 else 0,
                cpc=(cost / clicks) if clicks > 0 else 0,
                cpa=(cost / conversions) if conversions > 0 else 0,
                roas=(revenue / cost * 100) if cost > 0 else 0,
            ))

        return performance

    # ============ 검색어 보고서 ============

    async def get_search_terms_report(
        self,
        campaign_id: Optional[str] = None,
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """검색어 보고서 조회"""
        campaign_filter = f"AND campaign.id = {campaign_id}" if campaign_id else ""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        date_range = f"BETWEEN '{start_date.strftime('%Y-%m-%d')}' AND '{end_date.strftime('%Y-%m-%d')}'"

        query = f"""
            SELECT
                search_term_view.search_term,
                campaign.id,
                ad_group.id,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions
            FROM search_term_view
            WHERE segments.date {date_range}
            {campaign_filter}
            ORDER BY metrics.impressions DESC
            LIMIT 500
        """

        rows = await self._execute_query(query)

        terms = []
        for row in rows:
            search_term = row.get("searchTermView", {}).get("searchTerm", "")
            metrics = row.get("metrics", {})

            terms.append({
                "search_term": search_term,
                "campaign_id": row.get("campaign", {}).get("id"),
                "impressions": int(metrics.get("impressions", 0)),
                "clicks": int(metrics.get("clicks", 0)),
                "cost": int(metrics.get("costMicros", 0)) / 1_000_000,
                "conversions": float(metrics.get("conversions", 0)),
            })

        return terms

    # ============ 키워드 최적화 ============

    async def optimize_keywords(
        self,
        settings: Optional[Dict[str, Any]] = None
    ) -> OptimizationResult:
        """키워드 입찰가 최적화"""
        settings = settings or {}
        changes = []

        keywords = await self.get_keywords()

        for kw in keywords:
            if kw.status != "ENABLED":
                continue

            # 전환 있는 키워드: 입찰가 유지/증가
            if kw.conversions > 0:
                target_cpa = settings.get("target_cpa", 20000)
                current_cpa = kw.cost / kw.conversions if kw.conversions > 0 else 0

                if current_cpa < target_cpa * 0.8:
                    # CPA가 목표보다 낮으면 입찰가 증가
                    new_bid = min(kw.bid_amount * 1.15, settings.get("max_bid", 10000))
                    changes.append({
                        "type": "bid_increase",
                        "keyword_id": kw.keyword_id,
                        "keyword_text": kw.keyword_text,
                        "old_bid": kw.bid_amount,
                        "new_bid": new_bid,
                        "reason": f"CPA {current_cpa:.0f}원 < 목표의 80%"
                    })

            # 클릭 많은데 전환 없는 키워드: 입찰가 감소 또는 제외
            elif kw.clicks > settings.get("min_clicks_for_evaluation", 20) and kw.conversions == 0:
                if kw.cost > settings.get("max_cost_no_conv", 50000):
                    changes.append({
                        "type": "pause_keyword",
                        "keyword_id": kw.keyword_id,
                        "keyword_text": kw.keyword_text,
                        "reason": f"비용 {kw.cost:.0f}원, 전환 0건"
                    })
                else:
                    new_bid = max(kw.bid_amount * 0.85, settings.get("min_bid", 70))
                    changes.append({
                        "type": "bid_decrease",
                        "keyword_id": kw.keyword_id,
                        "keyword_text": kw.keyword_text,
                        "old_bid": kw.bid_amount,
                        "new_bid": new_bid,
                        "reason": f"전환 없음, 클릭 {kw.clicks}회"
                    })

        return OptimizationResult(
            success=True,
            platform_id=self.PLATFORM_ID,
            changes=changes,
            total_changes=len(changes),
            message=f"Google Ads 키워드 {len(changes)}개 최적화"
        )
