"""
광고 플랫폼 기본 추상 클래스
모든 광고 플랫폼 서비스는 이 클래스를 상속받아 구현
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from enum import Enum


class OptimizationStrategy(str, Enum):
    """최적화 전략"""
    BALANCED = "balanced"           # 균형 (ROAS + 노출)
    TARGET_ROAS = "target_roas"     # 목표 ROAS
    TARGET_CPA = "target_cpa"       # 목표 CPA
    MAXIMIZE_CONVERSIONS = "maximize_conversions"  # 전환 최대화
    MAXIMIZE_CLICKS = "maximize_clicks"  # 클릭 최대화
    MINIMIZE_CPC = "minimize_cpc"   # CPC 최소화
    TARGET_POSITION = "target_position"  # 목표 순위


@dataclass
class AdPlatformCredentials:
    """광고 플랫폼 자격 증명"""
    platform_id: str
    credentials: Dict[str, str]
    account_name: Optional[str] = None


@dataclass
class CampaignData:
    """캠페인 데이터"""
    campaign_id: str
    name: str
    status: str  # ENABLED, PAUSED, REMOVED
    budget: float
    budget_type: str  # DAILY, TOTAL
    impressions: int = 0
    clicks: int = 0
    cost: float = 0
    conversions: int = 0
    revenue: float = 0
    ctr: float = 0
    cpc: float = 0
    cpa: float = 0
    roas: float = 0


@dataclass
class AdGroupData:
    """광고 그룹 데이터"""
    adgroup_id: str
    campaign_id: str
    name: str
    status: str
    bid_amount: float = 0
    impressions: int = 0
    clicks: int = 0
    cost: float = 0
    conversions: int = 0


@dataclass
class KeywordData:
    """키워드 데이터 (검색 광고용)"""
    keyword_id: str
    keyword_text: str
    match_type: str  # EXACT, PHRASE, BROAD
    status: str
    bid_amount: float
    quality_score: Optional[int] = None
    impressions: int = 0
    clicks: int = 0
    cost: float = 0
    conversions: int = 0
    revenue: float = 0
    ctr: float = 0
    cpc: float = 0
    position: Optional[float] = None


@dataclass
class CreativeData:
    """크리에이티브(광고 소재) 데이터"""
    creative_id: str
    name: str
    creative_type: str  # IMAGE, VIDEO, CAROUSEL, TEXT
    status: str
    impressions: int = 0
    clicks: int = 0
    cost: float = 0
    conversions: int = 0
    ctr: float = 0


@dataclass
class OptimizationResult:
    """최적화 결과"""
    success: bool
    platform_id: str
    changes: List[Dict[str, Any]] = field(default_factory=list)
    total_changes: int = 0
    message: str = ""
    optimized_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class PerformanceData:
    """성과 데이터"""
    date: str
    impressions: int = 0
    clicks: int = 0
    cost: float = 0
    conversions: int = 0
    revenue: float = 0
    ctr: float = 0
    cpc: float = 0
    cpa: float = 0
    roas: float = 0


class AdPlatformBase(ABC):
    """
    광고 플랫폼 기본 추상 클래스
    모든 광고 플랫폼 서비스는 이 클래스를 상속받아 구현해야 함
    """

    PLATFORM_ID: str = ""
    PLATFORM_NAME: str = ""
    PLATFORM_NAME_KO: str = ""

    def __init__(self, credentials: Dict[str, str]):
        self.credentials = credentials
        self._client = None
        self._is_connected = False

    # ============ 연결 관리 ============

    @abstractmethod
    async def connect(self) -> bool:
        """
        플랫폼 API 연결
        Returns: 연결 성공 여부
        """
        pass

    @abstractmethod
    async def disconnect(self) -> bool:
        """
        플랫폼 API 연결 해제
        """
        pass

    @abstractmethod
    async def validate_credentials(self) -> bool:
        """
        자격 증명 유효성 검증
        Returns: 유효 여부
        """
        pass

    @property
    def is_connected(self) -> bool:
        return self._is_connected

    # ============ 계정 정보 ============

    @abstractmethod
    async def get_account_info(self) -> Dict[str, Any]:
        """
        계정 정보 조회
        Returns: 계정 정보 딕셔너리
        """
        pass

    # ============ 캠페인 관리 ============

    @abstractmethod
    async def get_campaigns(self) -> List[CampaignData]:
        """
        모든 캠페인 조회
        Returns: 캠페인 리스트
        """
        pass

    @abstractmethod
    async def get_campaign(self, campaign_id: str) -> Optional[CampaignData]:
        """
        특정 캠페인 조회
        """
        pass

    @abstractmethod
    async def update_campaign_budget(self, campaign_id: str, budget: float) -> bool:
        """
        캠페인 예산 수정
        """
        pass

    @abstractmethod
    async def pause_campaign(self, campaign_id: str) -> bool:
        """
        캠페인 일시 중지
        """
        pass

    @abstractmethod
    async def enable_campaign(self, campaign_id: str) -> bool:
        """
        캠페인 활성화
        """
        pass

    # ============ 키워드 관리 (검색 광고용) ============

    async def get_keywords(self, campaign_id: Optional[str] = None) -> List[KeywordData]:
        """
        키워드 조회 (검색 광고 플랫폼만 해당)
        """
        return []

    async def update_keyword_bid(self, keyword_id: str, bid_amount: float) -> bool:
        """
        키워드 입찰가 수정
        """
        return False

    async def pause_keyword(self, keyword_id: str) -> bool:
        """
        키워드 일시 중지
        """
        return False

    async def add_negative_keyword(self, campaign_id: str, keyword: str) -> bool:
        """
        부정 키워드 추가
        """
        return False

    # ============ 성과 데이터 ============

    @abstractmethod
    async def get_performance(
        self,
        start_date: datetime,
        end_date: datetime,
        granularity: str = "daily"  # daily, hourly, total
    ) -> List[PerformanceData]:
        """
        성과 데이터 조회
        """
        pass

    @abstractmethod
    async def get_campaign_performance(
        self,
        campaign_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> List[PerformanceData]:
        """
        캠페인별 성과 데이터 조회
        """
        pass

    # ============ 최적화 ============

    async def optimize(
        self,
        strategy: OptimizationStrategy = OptimizationStrategy.BALANCED,
        settings: Optional[Dict[str, Any]] = None
    ) -> OptimizationResult:
        """
        자동 최적화 실행
        전략에 따라 입찰가, 예산, 타겟팅 등을 자동 조정
        """
        settings = settings or {}
        changes = []

        try:
            # 1. 성과 데이터 조회
            end_date = datetime.now()
            start_date = end_date - timedelta(days=settings.get("evaluation_days", 7))

            campaigns = await self.get_campaigns()

            for campaign in campaigns:
                if campaign.status != "ENABLED":
                    continue

                # 2. 전략에 따른 최적화
                if strategy == OptimizationStrategy.TARGET_ROAS:
                    change = await self._optimize_for_roas(campaign, settings)
                elif strategy == OptimizationStrategy.TARGET_CPA:
                    change = await self._optimize_for_cpa(campaign, settings)
                elif strategy == OptimizationStrategy.MAXIMIZE_CONVERSIONS:
                    change = await self._optimize_for_conversions(campaign, settings)
                elif strategy == OptimizationStrategy.MINIMIZE_CPC:
                    change = await self._optimize_for_cpc(campaign, settings)
                else:
                    change = await self._optimize_balanced(campaign, settings)

                if change:
                    changes.append(change)

            return OptimizationResult(
                success=True,
                platform_id=self.PLATFORM_ID,
                changes=changes,
                total_changes=len(changes),
                message=f"{len(changes)}개 최적화 완료"
            )

        except Exception as e:
            return OptimizationResult(
                success=False,
                platform_id=self.PLATFORM_ID,
                message=f"최적화 실패: {str(e)}"
            )

    async def _optimize_for_roas(
        self,
        campaign: CampaignData,
        settings: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """ROAS 목표 기반 최적화"""
        target_roas = settings.get("target_roas", 300)

        if campaign.roas < target_roas * 0.8:
            # ROAS가 낮으면 예산 감소 또는 입찰가 조정
            return {
                "type": "budget_decrease",
                "campaign_id": campaign.campaign_id,
                "reason": f"ROAS {campaign.roas:.0f}% < 목표 {target_roas}%",
                "action": "예산 10% 감소 권장"
            }
        elif campaign.roas > target_roas * 1.5:
            # ROAS가 높으면 예산 증가 고려
            return {
                "type": "budget_increase",
                "campaign_id": campaign.campaign_id,
                "reason": f"ROAS {campaign.roas:.0f}% > 목표 {target_roas}%",
                "action": "예산 20% 증가 권장"
            }
        return None

    async def _optimize_for_cpa(
        self,
        campaign: CampaignData,
        settings: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """CPA 목표 기반 최적화"""
        target_cpa = settings.get("target_cpa", 20000)

        if campaign.cpa > target_cpa * 1.2:
            return {
                "type": "bid_decrease",
                "campaign_id": campaign.campaign_id,
                "reason": f"CPA {campaign.cpa:.0f}원 > 목표 {target_cpa}원",
                "action": "입찰가 10% 감소"
            }
        return None

    async def _optimize_for_conversions(
        self,
        campaign: CampaignData,
        settings: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """전환 최대화 최적화"""
        if campaign.conversions > 0 and campaign.roas > 100:
            return {
                "type": "budget_increase",
                "campaign_id": campaign.campaign_id,
                "reason": f"전환 발생 캠페인, ROAS {campaign.roas:.0f}%",
                "action": "예산 15% 증가"
            }
        return None

    async def _optimize_for_cpc(
        self,
        campaign: CampaignData,
        settings: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """CPC 최소화 최적화"""
        max_cpc = settings.get("max_cpc", 500)

        if campaign.cpc > max_cpc:
            return {
                "type": "bid_decrease",
                "campaign_id": campaign.campaign_id,
                "reason": f"CPC {campaign.cpc:.0f}원 > 최대 {max_cpc}원",
                "action": "입찰가 조정"
            }
        return None

    async def _optimize_balanced(
        self,
        campaign: CampaignData,
        settings: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """균형 최적화 (ROAS + CTR + 전환)"""
        # ROAS, CTR, 전환율 종합 고려
        if campaign.roas < 100 and campaign.cost > 50000:
            return {
                "type": "review_needed",
                "campaign_id": campaign.campaign_id,
                "reason": f"저효율 캠페인 (ROAS {campaign.roas:.0f}%, 비용 {campaign.cost:.0f}원)",
                "action": "캠페인 검토 필요"
            }
        return None

    # ============ 유틸리티 ============

    def calculate_metrics(self, data: Dict[str, Any]) -> Dict[str, float]:
        """성과 지표 계산"""
        impressions = data.get("impressions", 0)
        clicks = data.get("clicks", 0)
        cost = data.get("cost", 0)
        conversions = data.get("conversions", 0)
        revenue = data.get("revenue", 0)

        return {
            "ctr": (clicks / impressions * 100) if impressions > 0 else 0,
            "cpc": (cost / clicks) if clicks > 0 else 0,
            "cpa": (cost / conversions) if conversions > 0 else 0,
            "roas": (revenue / cost * 100) if cost > 0 else 0,
            "conversion_rate": (conversions / clicks * 100) if clicks > 0 else 0,
        }
