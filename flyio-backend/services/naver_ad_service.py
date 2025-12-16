"""
네이버 검색광고 API 연동 및 자동 최적화 서비스
"""
import asyncio
import hashlib
import hmac
import base64
import time
import json
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from enum import Enum
import httpx

from config import settings

logger = logging.getLogger(__name__)


class BidStrategy(Enum):
    """입찰 전략"""
    MAXIMIZE_CLICKS = "maximize_clicks"      # 클릭수 최대화
    TARGET_ROAS = "target_roas"              # 목표 ROAS
    TARGET_POSITION = "target_position"      # 목표 순위
    MINIMIZE_CPC = "minimize_cpc"            # CPC 최소화
    BALANCED = "balanced"                    # 균형 (기본)


@dataclass
class KeywordData:
    """키워드 데이터"""
    keyword_id: str = ""
    keyword: str = ""
    ad_group_id: str = ""
    bid_amt: int = 0
    use_group_bid: bool = False
    status: str = "ELIGIBLE"
    quality_score: int = 0

    # 성과 데이터
    impressions: int = 0
    clicks: int = 0
    cost: int = 0
    conversions: int = 0
    revenue: int = 0
    avg_position: float = 0.0
    ctr: float = 0.0
    cpc: int = 0
    cvr: float = 0.0
    roas: float = 0.0


@dataclass
class KeywordSuggestion:
    """연관 키워드 제안"""
    keyword: str = ""
    monthly_search_count: int = 0
    monthly_pc_search_count: int = 0
    monthly_mobile_search_count: int = 0
    competition_level: str = ""  # LOW, MEDIUM, HIGH
    competition_index: float = 0.0
    suggested_bid: int = 0
    relevance_score: float = 0.0
    potential_score: float = 0.0


@dataclass
class BidChange:
    """입찰 변경 기록"""
    keyword_id: str
    keyword: str
    old_bid: int
    new_bid: int
    reason: str
    changed_at: datetime = field(default_factory=datetime.now)


class NaverAdApiClient:
    """네이버 검색광고 API 클라이언트"""

    BASE_URL = "https://api.searchad.naver.com"

    def __init__(self):
        self.customer_id = settings.NAVER_AD_CUSTOMER_ID
        self.api_key = settings.NAVER_AD_API_KEY
        self.secret_key = settings.NAVER_AD_SECRET_KEY
        self.client = httpx.AsyncClient(timeout=30.0)

    def _generate_signature(self, timestamp: str, method: str, uri: str) -> str:
        """API 서명 생성"""
        message = f"{timestamp}.{method}.{uri}"
        signature = hmac.new(
            self.secret_key.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).digest()
        return base64.b64encode(signature).decode('utf-8')

    def _get_headers(self, method: str, uri: str) -> dict:
        """API 헤더 생성"""
        timestamp = str(int(time.time() * 1000))
        signature = self._generate_signature(timestamp, method, uri)

        return {
            "Content-Type": "application/json; charset=UTF-8",
            "X-Timestamp": timestamp,
            "X-API-KEY": self.api_key,
            "X-Customer": self.customer_id,
            "X-Signature": signature
        }

    async def _request(self, method: str, endpoint: str, data: dict = None) -> dict:
        """API 요청"""
        uri = endpoint
        url = f"{self.BASE_URL}{endpoint}"
        headers = self._get_headers(method, uri)

        try:
            if method == "GET":
                response = await self.client.get(url, headers=headers, params=data)
            elif method == "POST":
                response = await self.client.post(url, headers=headers, json=data)
            elif method == "PUT":
                response = await self.client.put(url, headers=headers, json=data)
            elif method == "DELETE":
                response = await self.client.delete(url, headers=headers)
            else:
                raise ValueError(f"Unsupported method: {method}")

            response.raise_for_status()
            return response.json() if response.text else {}

        except httpx.HTTPStatusError as e:
            logger.error(f"API Error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Request Error: {e}")
            raise

    # ============ 캠페인 관리 ============

    async def get_campaigns(self) -> List[dict]:
        """캠페인 목록 조회"""
        return await self._request("GET", "/ncc/campaigns")

    async def get_campaign(self, campaign_id: str) -> dict:
        """캠페인 상세 조회"""
        return await self._request("GET", f"/ncc/campaigns/{campaign_id}")

    # ============ 광고그룹 관리 ============

    async def get_ad_groups(self, campaign_id: str = None) -> List[dict]:
        """광고그룹 목록 조회"""
        params = {}
        if campaign_id:
            params["nccCampaignId"] = campaign_id
        return await self._request("GET", "/ncc/adgroups", params)

    async def get_ad_group(self, ad_group_id: str) -> dict:
        """광고그룹 상세 조회"""
        return await self._request("GET", f"/ncc/adgroups/{ad_group_id}")

    async def create_ad_group(self, campaign_id: str, name: str, bid_amt: int = 70) -> dict:
        """광고그룹 생성"""
        data = {
            "nccCampaignId": campaign_id,
            "name": name,
            "bidAmt": bid_amt,
            "contentsNetworkBidAmt": bid_amt,
            "useCntsNetworkBidAmt": False,
            "mobileNetworkBidWeight": 100,
            "pcNetworkBidWeight": 100,
            "dailyBudget": 0,
            "useDailyBudget": False
        }
        return await self._request("POST", "/ncc/adgroups", data)

    # ============ 키워드 관리 ============

    async def get_keywords(self, ad_group_id: str = None) -> List[dict]:
        """키워드 목록 조회"""
        params = {}
        if ad_group_id:
            params["nccAdgroupId"] = ad_group_id
        return await self._request("GET", "/ncc/keywords", params)

    async def get_keyword(self, keyword_id: str) -> dict:
        """키워드 상세 조회"""
        return await self._request("GET", f"/ncc/keywords/{keyword_id}")

    async def create_keywords(self, keywords: List[dict]) -> List[dict]:
        """키워드 대량 추가 (최대 100개)"""
        return await self._request("POST", "/ncc/keywords", keywords)

    async def update_keyword(self, keyword_id: str, data: dict) -> dict:
        """키워드 수정 (입찰가 등)"""
        return await self._request("PUT", f"/ncc/keywords/{keyword_id}", data)

    async def update_keyword_bid(self, keyword_id: str, bid_amt: int) -> dict:
        """키워드 입찰가 변경"""
        return await self.update_keyword(keyword_id, {
            "nccKeywordId": keyword_id,
            "bidAmt": bid_amt,
            "useGroupBidAmt": False
        })

    async def pause_keyword(self, keyword_id: str) -> dict:
        """키워드 일시정지"""
        return await self.update_keyword(keyword_id, {
            "nccKeywordId": keyword_id,
            "userLock": True
        })

    async def activate_keyword(self, keyword_id: str) -> dict:
        """키워드 활성화"""
        return await self.update_keyword(keyword_id, {
            "nccKeywordId": keyword_id,
            "userLock": False
        })

    async def delete_keyword(self, keyword_id: str) -> dict:
        """키워드 삭제"""
        return await self._request("DELETE", f"/ncc/keywords/{keyword_id}")

    # ============ 제외 키워드 관리 ============

    async def get_negative_keywords(self, ad_group_id: str = None, campaign_id: str = None) -> List[dict]:
        """제외 키워드 목록 조회"""
        params = {}
        if ad_group_id:
            params["nccAdgroupId"] = ad_group_id
        if campaign_id:
            params["nccCampaignId"] = campaign_id
        return await self._request("GET", "/ncc/negativekeywords", params)

    async def add_negative_keywords(self, keywords: List[dict]) -> List[dict]:
        """제외 키워드 추가"""
        return await self._request("POST", "/ncc/negativekeywords", keywords)

    # ============ 키워드 도구 ============

    async def get_related_keywords(self, keyword: str, show_detail: bool = True) -> List[dict]:
        """연관 키워드 조회 (키워드 도구)"""
        params = {
            "hintKeywords": keyword,
            "showDetail": "1" if show_detail else "0"
        }
        return await self._request("GET", "/keywordstool", params)

    async def get_keyword_estimate(self, keywords: List[str]) -> List[dict]:
        """키워드 예상 성과 조회"""
        data = {
            "device": "PC",
            "keywordplus": False,
            "key": keywords[0] if keywords else "",
            "bids": 1000
        }
        return await self._request("POST", "/estimate/exposure/keyword", data)

    # ============ 통계/보고서 ============

    async def get_stats(
        self,
        stat_type: str,  # AD, ADGROUP, KEYWORD, CAMPAIGN
        ids: List[str],
        start_date: str,  # YYYY-MM-DD
        end_date: str,
        fields: List[str] = None
    ) -> List[dict]:
        """성과 통계 조회"""
        if fields is None:
            fields = [
                "impCnt", "clkCnt", "salesAmt", "convCnt", "convAmt",
                "viewCnt", "avgRnk", "ctr", "cpc", "ccnt"
            ]

        data = {
            "ids": ids,
            "fields": fields,
            "timeRange": {
                "since": start_date,
                "until": end_date
            }
        }
        return await self._request("POST", f"/stats/{stat_type.lower()}", data)

    async def close(self):
        """클라이언트 종료"""
        await self.client.aclose()


class KeywordDiscoveryEngine:
    """키워드 자동 발굴 엔진"""

    def __init__(self, api_client: NaverAdApiClient):
        self.api = api_client
        self.relevance_threshold = 0.5      # 관련성 임계값
        self.min_search_volume = 100         # 최소 월간 검색량
        self.max_competition = 0.85          # 최대 경쟁도
        self.blacklist: List[str] = []       # 제외할 키워드 패턴
        self.core_terms: List[str] = []      # 핵심 키워드

    def set_filters(
        self,
        relevance_threshold: float = 0.5,
        min_search_volume: int = 100,
        max_competition: float = 0.85,
        blacklist: List[str] = None,
        core_terms: List[str] = None
    ):
        """필터 설정"""
        self.relevance_threshold = relevance_threshold
        self.min_search_volume = min_search_volume
        self.max_competition = max_competition
        self.blacklist = blacklist or []
        self.core_terms = core_terms or []

    async def discover_keywords(
        self,
        seed_keywords: List[str],
        max_results: int = 100
    ) -> List[KeywordSuggestion]:
        """시드 키워드로부터 연관 키워드 발굴"""
        all_suggestions = []
        seen_keywords = set()

        for seed in seed_keywords:
            try:
                # 네이버 키워드 도구 API 호출
                response = await self.api.get_related_keywords(seed)
                related = response.get("keywordList", [])

                for item in related:
                    keyword = item.get("relKeyword", "")

                    # 중복 제거
                    if keyword in seen_keywords:
                        continue
                    seen_keywords.add(keyword)

                    # KeywordSuggestion 생성
                    suggestion = KeywordSuggestion(
                        keyword=keyword,
                        monthly_search_count=item.get("monthlyPcQcCnt", 0) + item.get("monthlyMobileQcCnt", 0),
                        monthly_pc_search_count=item.get("monthlyPcQcCnt", 0),
                        monthly_mobile_search_count=item.get("monthlyMobileQcCnt", 0),
                        competition_level=item.get("compIdx", ""),
                        competition_index=self._parse_competition(item.get("compIdx", "")),
                        suggested_bid=item.get("plAvgDepth", 0)
                    )

                    # 관련성 점수 계산
                    suggestion.relevance_score = self._calculate_relevance(keyword, seed)

                    # 필터링
                    if self._should_include(suggestion, seed):
                        # 잠재력 점수 계산
                        suggestion.potential_score = self._calculate_potential(suggestion)
                        all_suggestions.append(suggestion)

            except Exception as e:
                logger.error(f"Error discovering keywords for '{seed}': {e}")
                continue

            # Rate limiting
            await asyncio.sleep(0.3)

        # 잠재력 점수로 정렬
        all_suggestions.sort(key=lambda x: x.potential_score, reverse=True)

        return all_suggestions[:max_results]

    def _parse_competition(self, comp_str: str) -> float:
        """경쟁도 문자열을 숫자로 변환"""
        comp_map = {
            "LOW": 0.3,
            "MEDIUM": 0.6,
            "HIGH": 0.9,
            "낮음": 0.3,
            "보통": 0.6,
            "높음": 0.9
        }
        return comp_map.get(comp_str.upper() if comp_str else "", 0.5)

    def _calculate_relevance(self, keyword: str, seed: str) -> float:
        """키워드 관련성 점수 계산"""
        score = 0.0
        keyword_lower = keyword.lower()
        seed_lower = seed.lower()

        # 시드 키워드 포함 여부
        if seed_lower in keyword_lower:
            score += 0.5

        # 핵심 키워드 포함 여부
        for term in self.core_terms:
            if term.lower() in keyword_lower:
                score += 0.3
                break

        # 단어 유사도
        seed_words = set(seed_lower.split())
        keyword_words = set(keyword_lower.split())
        common_words = seed_words & keyword_words
        if seed_words:
            score += 0.2 * (len(common_words) / len(seed_words))

        return min(score, 1.0)

    def _should_include(self, suggestion: KeywordSuggestion, seed: str) -> bool:
        """키워드 포함 여부 결정"""
        # 검색량 체크
        if suggestion.monthly_search_count < self.min_search_volume:
            return False

        # 경쟁도 체크
        if suggestion.competition_index > self.max_competition:
            return False

        # 관련성 체크
        if suggestion.relevance_score < self.relevance_threshold:
            return False

        # 블랙리스트 체크
        keyword_lower = suggestion.keyword.lower()
        for blacklisted in self.blacklist:
            if blacklisted.lower() in keyword_lower:
                return False

        return True

    def _calculate_potential(self, suggestion: KeywordSuggestion) -> float:
        """키워드 잠재력 점수 계산"""
        # 잠재력 = (검색량 * 관련성) / (경쟁도 * 예상CPC + 1)
        search_score = min(suggestion.monthly_search_count / 10000, 1.0)

        potential = (
            search_score * suggestion.relevance_score * 100
        ) / (suggestion.competition_index * (suggestion.suggested_bid / 1000 + 1) + 0.1)

        return potential


class BidOptimizationEngine:
    """실시간 입찰가 최적화 엔진"""

    def __init__(self, api_client: NaverAdApiClient):
        self.api = api_client
        self.strategy = BidStrategy.BALANCED
        self.target_roas = 300              # 목표 ROAS (%)
        self.target_position = 3            # 목표 순위
        self.max_bid_change_ratio = 0.2     # 최대 변경폭 (20%)
        self.min_bid = 70                   # 네이버 최소 입찰가
        self.max_bid = 100000               # 최대 입찰가
        self.bid_changes: List[BidChange] = []

    def set_strategy(
        self,
        strategy: BidStrategy,
        target_roas: float = 300,
        target_position: int = 3,
        max_bid_change_ratio: float = 0.2,
        min_bid: int = 70,
        max_bid: int = 100000
    ):
        """최적화 전략 설정"""
        self.strategy = strategy
        self.target_roas = target_roas
        self.target_position = target_position
        self.max_bid_change_ratio = max_bid_change_ratio
        self.min_bid = min_bid
        self.max_bid = max_bid

    async def optimize_all_keywords(self, ad_group_ids: List[str] = None) -> List[BidChange]:
        """모든 키워드 입찰가 최적화"""
        changes = []

        try:
            # 키워드 목록 조회
            if ad_group_ids:
                keywords = []
                for ag_id in ad_group_ids:
                    kws = await self.api.get_keywords(ag_id)
                    keywords.extend(kws)
            else:
                keywords = await self.api.get_keywords()

            # 성과 통계 조회 (최근 7일)
            keyword_ids = [kw.get("nccKeywordId") for kw in keywords if kw.get("nccKeywordId")]

            if not keyword_ids:
                return changes

            end_date = datetime.now().strftime("%Y-%m-%d")
            start_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

            stats = await self.api.get_stats("KEYWORD", keyword_ids, start_date, end_date)
            stats_map = {s.get("id"): s for s in stats}

            # 각 키워드 최적화
            for kw in keywords:
                keyword_id = kw.get("nccKeywordId")
                if not keyword_id:
                    continue

                current_bid = kw.get("bidAmt", 0)
                if current_bid == 0 or kw.get("useGroupBidAmt", True):
                    continue

                stat = stats_map.get(keyword_id, {})

                # 최적 입찰가 계산
                new_bid, reason = self._calculate_optimal_bid(
                    current_bid=current_bid,
                    impressions=stat.get("impCnt", 0),
                    clicks=stat.get("clkCnt", 0),
                    cost=stat.get("salesAmt", 0),
                    conversions=stat.get("convCnt", 0),
                    revenue=stat.get("convAmt", 0),
                    avg_position=stat.get("avgRnk", 0)
                )

                # 입찰가 변경이 필요한 경우
                if new_bid != current_bid:
                    try:
                        await self.api.update_keyword_bid(keyword_id, new_bid)

                        change = BidChange(
                            keyword_id=keyword_id,
                            keyword=kw.get("keyword", ""),
                            old_bid=current_bid,
                            new_bid=new_bid,
                            reason=reason
                        )
                        changes.append(change)
                        self.bid_changes.append(change)

                        logger.info(f"Bid changed: {kw.get('keyword')} {current_bid} -> {new_bid} ({reason})")

                    except Exception as e:
                        logger.error(f"Failed to update bid for {keyword_id}: {e}")

                # Rate limiting
                await asyncio.sleep(0.1)

        except Exception as e:
            logger.error(f"Error optimizing bids: {e}")

        return changes

    def _calculate_optimal_bid(
        self,
        current_bid: int,
        impressions: int,
        clicks: int,
        cost: int,
        conversions: int,
        revenue: int,
        avg_position: float
    ) -> tuple[int, str]:
        """최적 입찰가 계산"""

        # CTR 계산
        ctr = clicks / impressions if impressions > 0 else 0
        # CVR 계산
        cvr = conversions / clicks if clicks > 0 else 0
        # ROAS 계산
        roas = (revenue / cost * 100) if cost > 0 else 0
        # CPA 계산
        cpa = cost / conversions if conversions > 0 else 0

        new_bid = current_bid
        reason = ""

        if self.strategy == BidStrategy.TARGET_ROAS:
            # ROAS 기반 입찰 조정
            if conversions > 0 and cost > 0:
                if roas > self.target_roas * 1.2:
                    # ROAS 초과 → 입찰가 상향 (더 많은 노출)
                    adjustment = min(1.15, roas / self.target_roas)
                    new_bid = int(current_bid * adjustment)
                    reason = f"ROAS {roas:.0f}% > 목표 {self.target_roas}%, 입찰 상향"
                elif roas < self.target_roas * 0.8:
                    # ROAS 미달 → 입찰가 하향
                    adjustment = max(0.85, roas / self.target_roas)
                    new_bid = int(current_bid * adjustment)
                    reason = f"ROAS {roas:.0f}% < 목표 {self.target_roas}%, 입찰 하향"
            else:
                # 전환 데이터 없음 → CTR 기반
                if impressions > 500 and ctr < 0.01:
                    new_bid = int(current_bid * 0.9)
                    reason = f"CTR {ctr:.2%} 저조, 입찰 하향"

        elif self.strategy == BidStrategy.TARGET_POSITION:
            # 순위 기반 입찰 조정
            if avg_position > 0:
                if avg_position > self.target_position + 1:
                    new_bid = int(current_bid * 1.1)
                    reason = f"순위 {avg_position:.1f} > 목표 {self.target_position}, 입찰 상향"
                elif avg_position < self.target_position - 1:
                    new_bid = int(current_bid * 0.95)
                    reason = f"순위 {avg_position:.1f} < 목표 {self.target_position}, 입찰 하향"

        elif self.strategy == BidStrategy.MAXIMIZE_CLICKS:
            # 클릭 최대화
            if impressions > 500 and ctr > 0.03:
                new_bid = int(current_bid * 1.1)
                reason = f"CTR {ctr:.2%} 양호, 클릭 최대화"
            elif impressions > 500 and ctr < 0.01:
                new_bid = int(current_bid * 0.85)
                reason = f"CTR {ctr:.2%} 저조, 효율 조정"

        elif self.strategy == BidStrategy.MINIMIZE_CPC:
            # CPC 최소화
            if clicks > 10:
                actual_cpc = cost / clicks
                if actual_cpc > current_bid * 0.9:
                    new_bid = int(current_bid * 0.95)
                    reason = f"CPC {actual_cpc:.0f}원 절감 시도"

        else:  # BALANCED
            # 균형 전략
            if conversions > 0:
                if roas > self.target_roas:
                    new_bid = int(current_bid * 1.05)
                    reason = f"ROAS {roas:.0f}% 양호"
                elif roas < self.target_roas * 0.7:
                    new_bid = int(current_bid * 0.9)
                    reason = f"ROAS {roas:.0f}% 미달"
            elif clicks > 20 and conversions == 0:
                new_bid = int(current_bid * 0.85)
                reason = "전환 없음, 효율 조정"
            elif impressions > 1000 and ctr > 0.03:
                new_bid = int(current_bid * 1.05)
                reason = f"CTR {ctr:.2%} 양호"

        # 입찰가 제한 적용
        new_bid = self._clamp_bid(new_bid, current_bid)

        return new_bid, reason

    def _clamp_bid(self, new_bid: int, current_bid: int) -> int:
        """입찰가 범위 제한"""
        # 최소/최대 입찰가
        new_bid = max(self.min_bid, min(self.max_bid, new_bid))

        # 최대 변경폭 제한
        max_change = int(current_bid * self.max_bid_change_ratio)
        new_bid = max(current_bid - max_change, min(current_bid + max_change, new_bid))

        return new_bid

    def get_recent_changes(self, limit: int = 50) -> List[BidChange]:
        """최근 입찰 변경 이력"""
        return self.bid_changes[-limit:]


class KeywordExclusionEngine:
    """비효율 키워드 자동 제외 엔진"""

    def __init__(self, api_client: NaverAdApiClient):
        self.api = api_client
        self.min_ctr = 0.01                 # 최소 CTR (1%)
        self.max_cost_no_conv = 50000       # 전환 없이 최대 지출
        self.min_quality_score = 4          # 최소 품질지수
        self.evaluation_days = 7            # 평가 기간 (일)
        self.min_impressions = 500          # 최소 노출수 (평가 기준)
        self.excluded_keywords: List[dict] = []

    def set_thresholds(
        self,
        min_ctr: float = 0.01,
        max_cost_no_conv: int = 50000,
        min_quality_score: int = 4,
        evaluation_days: int = 7,
        min_impressions: int = 500
    ):
        """임계값 설정"""
        self.min_ctr = min_ctr
        self.max_cost_no_conv = max_cost_no_conv
        self.min_quality_score = min_quality_score
        self.evaluation_days = evaluation_days
        self.min_impressions = min_impressions

    async def evaluate_and_exclude(self, ad_group_ids: List[str] = None) -> List[dict]:
        """키워드 평가 및 제외"""
        excluded = []

        try:
            # 키워드 목록 조회
            if ad_group_ids:
                keywords = []
                for ag_id in ad_group_ids:
                    kws = await self.api.get_keywords(ag_id)
                    keywords.extend(kws)
            else:
                keywords = await self.api.get_keywords()

            # 성과 통계 조회
            keyword_ids = [kw.get("nccKeywordId") for kw in keywords if kw.get("nccKeywordId")]

            if not keyword_ids:
                return excluded

            end_date = datetime.now().strftime("%Y-%m-%d")
            start_date = (datetime.now() - timedelta(days=self.evaluation_days)).strftime("%Y-%m-%d")

            stats = await self.api.get_stats("KEYWORD", keyword_ids, start_date, end_date)
            stats_map = {s.get("id"): s for s in stats}

            # 각 키워드 평가
            for kw in keywords:
                keyword_id = kw.get("nccKeywordId")
                if not keyword_id:
                    continue

                stat = stats_map.get(keyword_id, {})

                # 제외 여부 판단
                reason = self._should_exclude(kw, stat)

                if reason:
                    try:
                        # 키워드 일시정지
                        await self.api.pause_keyword(keyword_id)

                        # 제외 키워드로 추가
                        await self.api.add_negative_keywords([{
                            "nccAdgroupId": kw.get("nccAdgroupId"),
                            "keyword": kw.get("keyword"),
                            "type": "KEYWORD"
                        }])

                        excluded_info = {
                            "keyword_id": keyword_id,
                            "keyword": kw.get("keyword"),
                            "reason": reason,
                            "excluded_at": datetime.now().isoformat()
                        }
                        excluded.append(excluded_info)
                        self.excluded_keywords.append(excluded_info)

                        logger.info(f"Keyword excluded: {kw.get('keyword')} - {reason}")

                    except Exception as e:
                        logger.error(f"Failed to exclude keyword {keyword_id}: {e}")

                await asyncio.sleep(0.1)

        except Exception as e:
            logger.error(f"Error evaluating keywords: {e}")

        return excluded

    def _should_exclude(self, keyword: dict, stats: dict) -> Optional[str]:
        """제외 여부 판단"""
        impressions = stats.get("impCnt", 0)
        clicks = stats.get("clkCnt", 0)
        cost = stats.get("salesAmt", 0)
        conversions = stats.get("convCnt", 0)
        quality_score = keyword.get("qualityScore", 10)

        # 평가 기준 미달 (노출수 부족)
        if impressions < self.min_impressions:
            return None

        # CTR 계산
        ctr = clicks / impressions if impressions > 0 else 0

        # 1. CTR이 너무 낮음
        if ctr < self.min_ctr:
            return f"CTR {ctr:.2%} < {self.min_ctr:.0%} (노출 {impressions:,}회)"

        # 2. 전환 없이 비용만 소진
        if conversions == 0 and cost > self.max_cost_no_conv:
            return f"전환 0, 비용 {cost:,}원 > {self.max_cost_no_conv:,}원"

        # 3. 품질지수 낮음
        if quality_score < self.min_quality_score:
            return f"품질지수 {quality_score} < {self.min_quality_score}"

        return None

    def get_excluded_keywords(self) -> List[dict]:
        """제외된 키워드 목록"""
        return self.excluded_keywords


class BulkKeywordManager:
    """대량 키워드 관리"""

    def __init__(self, api_client: NaverAdApiClient):
        self.api = api_client
        self.batch_size = 100  # 네이버 API 제한

    async def bulk_add_keywords(
        self,
        ad_group_id: str,
        keywords: List[KeywordSuggestion],
        default_bid: int = 100
    ) -> List[dict]:
        """대량 키워드 추가"""
        results = []

        # 배치 처리
        for i in range(0, len(keywords), self.batch_size):
            batch = keywords[i:i + self.batch_size]

            keyword_data = [
                {
                    "nccAdgroupId": ad_group_id,
                    "keyword": kw.keyword,
                    "bidAmt": kw.suggested_bid if kw.suggested_bid > 70 else default_bid,
                    "useGroupBidAmt": False
                }
                for kw in batch
            ]

            try:
                response = await self.api.create_keywords(keyword_data)
                results.extend(response)
                logger.info(f"Added {len(batch)} keywords to ad group {ad_group_id}")
            except Exception as e:
                logger.error(f"Failed to add keywords batch: {e}")

            # Rate limiting
            await asyncio.sleep(0.5)

        return results

    async def create_structured_campaign(
        self,
        campaign_id: str,
        keyword_groups: Dict[str, List[KeywordSuggestion]],
        default_bid: int = 100
    ) -> Dict[str, Any]:
        """구조화된 캠페인 생성 (키워드 그룹별 광고그룹)"""
        results = {
            "ad_groups_created": 0,
            "keywords_added": 0,
            "errors": []
        }

        for group_name, keywords in keyword_groups.items():
            try:
                # 광고그룹 생성
                ad_group = await self.api.create_ad_group(
                    campaign_id=campaign_id,
                    name=group_name,
                    bid_amt=default_bid
                )
                results["ad_groups_created"] += 1

                # 키워드 추가
                added = await self.bulk_add_keywords(
                    ad_group_id=ad_group.get("nccAdgroupId"),
                    keywords=keywords,
                    default_bid=default_bid
                )
                results["keywords_added"] += len(added)

            except Exception as e:
                results["errors"].append({
                    "group": group_name,
                    "error": str(e)
                })

        return results


class NaverAdOptimizer:
    """네이버 광고 자동 최적화 통합 시스템"""

    def __init__(self):
        self.api = NaverAdApiClient()
        self.discovery = KeywordDiscoveryEngine(self.api)
        self.bid_optimizer = BidOptimizationEngine(self.api)
        self.exclusion = KeywordExclusionEngine(self.api)
        self.bulk_manager = BulkKeywordManager(self.api)
        self.is_running = False
        self.optimization_interval = 60  # 초

    async def start_auto_optimization(self, ad_group_ids: List[str] = None):
        """자동 최적화 시작"""
        self.is_running = True
        logger.info("Auto optimization started")

        while self.is_running:
            try:
                # 입찰가 최적화
                changes = await self.bid_optimizer.optimize_all_keywords(ad_group_ids)
                logger.info(f"Optimized {len(changes)} keywords")

            except Exception as e:
                logger.error(f"Optimization error: {e}")

            await asyncio.sleep(self.optimization_interval)

    def stop_auto_optimization(self):
        """자동 최적화 중지"""
        self.is_running = False
        logger.info("Auto optimization stopped")

    async def run_daily_tasks(self, ad_group_ids: List[str] = None):
        """일일 작업 실행"""
        results = {
            "excluded_keywords": [],
            "timestamp": datetime.now().isoformat()
        }

        # 비효율 키워드 제외
        excluded = await self.exclusion.evaluate_and_exclude(ad_group_ids)
        results["excluded_keywords"] = excluded

        return results

    async def discover_and_add_keywords(
        self,
        seed_keywords: List[str],
        ad_group_id: str,
        max_keywords: int = 50,
        filters: dict = None
    ) -> dict:
        """키워드 발굴 및 자동 추가"""
        # 필터 설정
        if filters:
            self.discovery.set_filters(**filters)

        # 키워드 발굴
        suggestions = await self.discovery.discover_keywords(seed_keywords, max_keywords)

        # 키워드 추가
        added = await self.bulk_manager.bulk_add_keywords(ad_group_id, suggestions)

        return {
            "discovered": len(suggestions),
            "added": len(added),
            "keywords": [s.keyword for s in suggestions]
        }

    async def get_optimization_status(self) -> dict:
        """최적화 상태 조회"""
        return {
            "is_running": self.is_running,
            "interval_seconds": self.optimization_interval,
            "recent_bid_changes": len(self.bid_optimizer.get_recent_changes()),
            "excluded_keywords": len(self.exclusion.get_excluded_keywords()),
            "strategy": self.bid_optimizer.strategy.value,
            "settings": {
                "target_roas": self.bid_optimizer.target_roas,
                "target_position": self.bid_optimizer.target_position,
                "min_ctr": self.exclusion.min_ctr,
                "max_cost_no_conv": self.exclusion.max_cost_no_conv
            }
        }

    async def close(self):
        """리소스 정리"""
        self.stop_auto_optimization()
        await self.api.close()


# 전역 인스턴스
_optimizer_instance: Optional[NaverAdOptimizer] = None


def get_optimizer() -> NaverAdOptimizer:
    """옵티마이저 인스턴스 반환"""
    global _optimizer_instance
    if _optimizer_instance is None:
        _optimizer_instance = NaverAdOptimizer()
    return _optimizer_instance
