"""
쿠팡 광고 API 연동 서비스
https://developers.coupang.com/
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


class CoupangAdsService(AdPlatformBase):
    """
    쿠팡 광고 API 서비스
    쿠팡 내 검색/디스플레이 광고 지원
    """

    PLATFORM_ID = "coupang_ads"
    PLATFORM_NAME = "Coupang Ads"
    PLATFORM_NAME_KO = "쿠팡 광고"

    # API 엔드포인트
    BASE_URL = "https://api-gateway.coupang.com/v2/providers/openapi/apis/api/v1"

    def __init__(self, credentials: Dict[str, str]):
        super().__init__(credentials)
        self.access_key = credentials.get("access_key", "")
        self.secret_key = credentials.get("secret_key", "")
        self.vendor_id = credentials.get("vendor_id", "")

    def _generate_signature(self, method: str, path: str, timestamp: str) -> str:
        """API 요청 서명 생성"""
        message = f"{method}\n{path}\n{timestamp}"
        signature = hmac.new(
            self.secret_key.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        return signature

    def _get_headers(self, method: str, path: str) -> Dict[str, str]:
        """API 요청 헤더 생성"""
        timestamp = datetime.utcnow().strftime('%y%m%d') + 'T' + datetime.utcnow().strftime('%H%M%S') + 'Z'
        signature = self._generate_signature(method, path, timestamp)

        return {
            "Authorization": f"CEA algorithm=HmacSHA256, access-key={self.access_key}, signed-date={timestamp}, signature={signature}",
            "Content-Type": "application/json;charset=UTF-8",
            "X-Coupang-Accept-Language": "ko-KR",
        }

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict] = None,
        data: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """API 요청 실행"""
        path = f"/v2/providers/openapi/apis/api/v1/{endpoint}"
        url = f"https://api-gateway.coupang.com{path}"
        headers = self._get_headers(method, path)

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
            # 셀러 정보 조회로 연결 테스트
            result = await self._make_request("GET", f"vendors/{self.vendor_id}")
            if result.get("vendorId"):
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
        result = await self._make_request("GET", f"vendors/{self.vendor_id}")

        return {
            "vendor_id": result.get("vendorId"),
            "vendor_name": result.get("vendorName"),
            "status": result.get("status"),
            "vendor_type": result.get("vendorType"),
        }

    # ============ 캠페인 관리 ============

    async def get_campaigns(self) -> List[CampaignData]:
        """캠페인 목록 조회"""
        result = await self._make_request(
            "GET",
            f"ads/vendors/{self.vendor_id}/campaigns",
            params={"size": 100}
        )

        campaigns = []
        for camp in result.get("content", []):
            campaign_id = str(camp.get("campaignId"))

            # 성과 데이터 조회
            end_date = datetime.now()
            start_date = end_date - timedelta(days=30)

            try:
                stats = await self._make_request(
                    "GET",
                    f"ads/vendors/{self.vendor_id}/reports/campaigns/{campaign_id}",
                    params={
                        "startDate": start_date.strftime("%Y-%m-%d"),
                        "endDate": end_date.strftime("%Y-%m-%d"),
                    }
                )
                metrics = stats.get("summary", {})
            except:
                metrics = {}

            impressions = int(metrics.get("impressions", 0))
            clicks = int(metrics.get("clicks", 0))
            cost = float(metrics.get("adCost", 0))
            conversions = int(metrics.get("orders", 0))  # 주문수
            revenue = float(metrics.get("salesAmount", 0))  # 매출액

            campaigns.append(CampaignData(
                campaign_id=campaign_id,
                name=camp.get("campaignName", ""),
                status=camp.get("status", "UNKNOWN"),
                budget=float(camp.get("dailyBudget", 0)),
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
            f"ads/vendors/{self.vendor_id}/campaigns/{campaign_id}",
            data={"dailyBudget": int(budget)}
        )
        return True

    async def pause_campaign(self, campaign_id: str) -> bool:
        """캠페인 일시 중지"""
        await self._make_request(
            "PUT",
            f"ads/vendors/{self.vendor_id}/campaigns/{campaign_id}/status",
            data={"status": "PAUSED"}
        )
        return True

    async def enable_campaign(self, campaign_id: str) -> bool:
        """캠페인 활성화"""
        await self._make_request(
            "PUT",
            f"ads/vendors/{self.vendor_id}/campaigns/{campaign_id}/status",
            data={"status": "ACTIVE"}
        )
        return True

    # ============ 광고 그룹 관리 ============

    async def get_adgroups(self, campaign_id: Optional[str] = None) -> List[AdGroupData]:
        """광고 그룹 목록 조회"""
        endpoint = f"ads/vendors/{self.vendor_id}/campaigns/{campaign_id}/adgroups" if campaign_id else f"ads/vendors/{self.vendor_id}/adgroups"

        result = await self._make_request("GET", endpoint, params={"size": 100})

        adgroups = []
        for ag in result.get("content", []):
            adgroups.append(AdGroupData(
                adgroup_id=str(ag.get("adGroupId")),
                campaign_id=str(ag.get("campaignId")),
                name=ag.get("adGroupName", ""),
                status=ag.get("status", ""),
                bid_amount=float(ag.get("bidAmount", 0)),
            ))

        return adgroups

    async def update_adgroup_bid(self, adgroup_id: str, bid_amount: float) -> bool:
        """광고 그룹 입찰가 수정"""
        await self._make_request(
            "PUT",
            f"ads/vendors/{self.vendor_id}/adgroups/{adgroup_id}",
            data={"bidAmount": int(bid_amount)}
        )
        return True

    # ============ 키워드 관리 ============

    async def get_keywords(self, campaign_id: Optional[str] = None) -> List[KeywordData]:
        """키워드 목록 조회"""
        if not campaign_id:
            campaigns = await self.get_campaigns()
            keywords = []
            for camp in campaigns[:5]:  # 처음 5개 캠페인만
                try:
                    kws = await self._get_campaign_keywords(camp.campaign_id)
                    keywords.extend(kws)
                except:
                    continue
            return keywords

        return await self._get_campaign_keywords(campaign_id)

    async def _get_campaign_keywords(self, campaign_id: str) -> List[KeywordData]:
        """캠페인별 키워드 조회"""
        result = await self._make_request(
            "GET",
            f"ads/vendors/{self.vendor_id}/campaigns/{campaign_id}/keywords",
            params={"size": 100}
        )

        keywords = []
        for kw in result.get("content", []):
            # 키워드 성과 조회
            try:
                end_date = datetime.now()
                start_date = end_date - timedelta(days=30)

                stats = await self._make_request(
                    "GET",
                    f"ads/vendors/{self.vendor_id}/reports/keywords/{kw.get('keywordId')}",
                    params={
                        "startDate": start_date.strftime("%Y-%m-%d"),
                        "endDate": end_date.strftime("%Y-%m-%d"),
                    }
                )
                metrics = stats.get("summary", {})
            except:
                metrics = {}

            impressions = int(metrics.get("impressions", 0))
            clicks = int(metrics.get("clicks", 0))
            cost = float(metrics.get("adCost", 0))
            conversions = int(metrics.get("orders", 0))
            revenue = float(metrics.get("salesAmount", 0))

            keywords.append(KeywordData(
                keyword_id=str(kw.get("keywordId")),
                keyword_text=kw.get("keyword", ""),
                match_type=kw.get("matchType", "BROAD"),
                status=kw.get("status", ""),
                bid_amount=float(kw.get("bidAmount", 0)),
                quality_score=kw.get("qualityScore"),
                impressions=impressions,
                clicks=clicks,
                cost=cost,
                conversions=conversions,
                revenue=revenue,
                ctr=(clicks / impressions * 100) if impressions > 0 else 0,
                cpc=(cost / clicks) if clicks > 0 else 0,
            ))

        return keywords

    async def update_keyword_bid(self, keyword_id: str, bid_amount: float) -> bool:
        """키워드 입찰가 수정"""
        await self._make_request(
            "PUT",
            f"ads/vendors/{self.vendor_id}/keywords/{keyword_id}",
            data={"bidAmount": int(bid_amount)}
        )
        return True

    async def add_negative_keyword(self, campaign_id: str, keyword: str) -> bool:
        """부정 키워드 추가"""
        await self._make_request(
            "POST",
            f"ads/vendors/{self.vendor_id}/campaigns/{campaign_id}/negative-keywords",
            data={"keyword": keyword, "matchType": "EXACT"}
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
        result = await self._make_request(
            "GET",
            f"ads/vendors/{self.vendor_id}/reports",
            params={
                "startDate": start_date.strftime("%Y-%m-%d"),
                "endDate": end_date.strftime("%Y-%m-%d"),
                "granularity": "DAY" if granularity == "daily" else "SUMMARY"
            }
        )

        performance = []
        for row in result.get("data", []):
            impressions = int(row.get("impressions", 0))
            clicks = int(row.get("clicks", 0))
            cost = float(row.get("adCost", 0))
            conversions = int(row.get("orders", 0))
            revenue = float(row.get("salesAmount", 0))

            performance.append(PerformanceData(
                date=row.get("date", ""),
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
            f"ads/vendors/{self.vendor_id}/reports/campaigns/{campaign_id}",
            params={
                "startDate": start_date.strftime("%Y-%m-%d"),
                "endDate": end_date.strftime("%Y-%m-%d"),
                "granularity": "DAY"
            }
        )

        performance = []
        for row in result.get("data", []):
            impressions = int(row.get("impressions", 0))
            clicks = int(row.get("clicks", 0))
            cost = float(row.get("adCost", 0))
            conversions = int(row.get("orders", 0))
            revenue = float(row.get("salesAmount", 0))

            performance.append(PerformanceData(
                date=row.get("date", ""),
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

    # ============ 상품 관리 ============

    async def get_product_ads(self, campaign_id: str) -> List[Dict[str, Any]]:
        """상품 광고 목록"""
        result = await self._make_request(
            "GET",
            f"ads/vendors/{self.vendor_id}/campaigns/{campaign_id}/products",
            params={"size": 100}
        )

        return [{
            "product_id": prod.get("productId"),
            "product_name": prod.get("productName"),
            "status": prod.get("status"),
            "bid_amount": float(prod.get("bidAmount", 0)),
        } for prod in result.get("content", [])]

    async def get_product_performance(self, limit: int = 50) -> List[Dict[str, Any]]:
        """상품별 성과"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)

        result = await self._make_request(
            "GET",
            f"ads/vendors/{self.vendor_id}/reports/products",
            params={
                "startDate": start_date.strftime("%Y-%m-%d"),
                "endDate": end_date.strftime("%Y-%m-%d"),
                "size": limit,
                "sort": "salesAmount,desc"
            }
        )

        products = []
        for row in result.get("content", []):
            impressions = int(row.get("impressions", 0))
            clicks = int(row.get("clicks", 0))
            cost = float(row.get("adCost", 0))
            revenue = float(row.get("salesAmount", 0))

            products.append({
                "product_id": row.get("productId"),
                "product_name": row.get("productName"),
                "impressions": impressions,
                "clicks": clicks,
                "cost": cost,
                "orders": int(row.get("orders", 0)),
                "revenue": revenue,
                "roas": (revenue / cost * 100) if cost > 0 else 0,
            })

        return products

    # ============ 자동 최적화 ============

    async def optimize_keywords(
        self,
        settings: Optional[Dict[str, Any]] = None
    ) -> OptimizationResult:
        """키워드 자동 최적화"""
        settings = settings or {}
        changes = []

        keywords = await self.get_keywords()

        for kw in keywords:
            if kw.status != "ACTIVE":
                continue

            # ROAS 기반 최적화 (쿠팡은 ROAS 중심)
            target_roas = settings.get("target_roas", 200)

            if kw.cost > 0:
                current_roas = (kw.revenue / kw.cost * 100)

                if current_roas < target_roas * 0.5 and kw.clicks >= 30:
                    # 매우 낮은 ROAS + 충분한 클릭: 입찰가 감소 또는 중지
                    if kw.conversions == 0:
                        changes.append({
                            "type": "pause_keyword",
                            "keyword_id": kw.keyword_id,
                            "keyword_text": kw.keyword_text,
                            "reason": f"ROAS {current_roas:.0f}% (클릭 {kw.clicks}회, 전환 0)"
                        })
                    else:
                        new_bid = max(kw.bid_amount * 0.8, settings.get("min_bid", 100))
                        changes.append({
                            "type": "bid_decrease",
                            "keyword_id": kw.keyword_id,
                            "keyword_text": kw.keyword_text,
                            "old_bid": kw.bid_amount,
                            "new_bid": new_bid,
                            "reason": f"ROAS {current_roas:.0f}% < 목표의 50%"
                        })
                elif current_roas > target_roas * 1.5 and kw.conversions >= 3:
                    # 높은 ROAS + 전환 있음: 입찰가 증가
                    new_bid = min(kw.bid_amount * 1.2, settings.get("max_bid", 10000))
                    changes.append({
                        "type": "bid_increase",
                        "keyword_id": kw.keyword_id,
                        "keyword_text": kw.keyword_text,
                        "old_bid": kw.bid_amount,
                        "new_bid": new_bid,
                        "reason": f"ROAS {current_roas:.0f}% > 목표의 150%"
                    })

        return OptimizationResult(
            success=True,
            platform_id=self.PLATFORM_ID,
            changes=changes,
            total_changes=len(changes),
            message=f"쿠팡 광고 {len(changes)}개 키워드 최적화"
        )

    # ============ 경쟁 분석 ============

    async def get_keyword_competition(self, keyword: str) -> Dict[str, Any]:
        """키워드 경쟁 분석"""
        result = await self._make_request(
            "GET",
            f"ads/vendors/{self.vendor_id}/keywords/analyze",
            params={"keyword": keyword}
        )

        return {
            "keyword": keyword,
            "competition_level": result.get("competitionLevel"),  # HIGH, MEDIUM, LOW
            "suggested_bid": float(result.get("suggestedBid", 0)),
            "search_volume": result.get("searchVolume"),
            "avg_cpc": float(result.get("avgCpc", 0)),
        }

    async def get_category_trends(self, category_id: str) -> Dict[str, Any]:
        """카테고리 트렌드 분석"""
        result = await self._make_request(
            "GET",
            f"ads/vendors/{self.vendor_id}/categories/{category_id}/trends",
            params={"period": "LAST_30_DAYS"}
        )

        return {
            "category_id": category_id,
            "trending_keywords": result.get("trendingKeywords", []),
            "avg_conversion_rate": float(result.get("avgConversionRate", 0)),
            "avg_roas": float(result.get("avgRoas", 0)),
        }
