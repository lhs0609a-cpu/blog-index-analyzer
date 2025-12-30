"""
크리에이티브 피로도 감지 서비스

Meta(Facebook/Instagram) 광고의 크리에이티브 피로도를 감지하고
교체 시점을 추천하는 서비스입니다.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, List, Dict, Any
import logging
import json

logger = logging.getLogger(__name__)


class FatigueLevel(str, Enum):
    """피로도 수준"""
    FRESH = "fresh"           # 신선함 (0-20%)
    GOOD = "good"             # 양호 (20-40%)
    MODERATE = "moderate"     # 보통 (40-60%)
    TIRED = "tired"           # 피로 (60-80%)
    EXHAUSTED = "exhausted"   # 고갈 (80-100%)


class CreativeType(str, Enum):
    """크리에이티브 유형"""
    IMAGE = "image"
    VIDEO = "video"
    CAROUSEL = "carousel"
    COLLECTION = "collection"
    INSTANT_EXPERIENCE = "instant_experience"


class FatigueIndicator(str, Enum):
    """피로도 지표"""
    CTR_DECLINE = "ctr_decline"           # CTR 하락
    FREQUENCY_HIGH = "frequency_high"     # 빈도 과다
    CPM_INCREASE = "cpm_increase"         # CPM 상승
    ENGAGEMENT_DROP = "engagement_drop"   # 참여도 하락
    CONVERSION_DROP = "conversion_drop"   # 전환율 하락
    REACH_SATURATION = "reach_saturation" # 도달 포화


@dataclass
class CreativePerformance:
    """크리에이티브 성과 데이터"""
    creative_id: str
    creative_name: str
    creative_type: CreativeType
    platform: str = "meta"

    # 기본 지표
    impressions: int = 0
    reach: int = 0
    clicks: int = 0
    conversions: int = 0
    spend: float = 0.0

    # 계산 지표
    ctr: float = 0.0
    cpm: float = 0.0
    cpc: float = 0.0
    cvr: float = 0.0
    frequency: float = 0.0

    # 참여 지표
    likes: int = 0
    comments: int = 0
    shares: int = 0
    saves: int = 0
    engagement_rate: float = 0.0

    # 기간 정보
    start_date: Optional[datetime] = None
    days_running: int = 0

    # 과거 성과 (일별)
    historical_ctr: List[float] = field(default_factory=list)
    historical_cpm: List[float] = field(default_factory=list)
    historical_frequency: List[float] = field(default_factory=list)


@dataclass
class FatigueAnalysis:
    """피로도 분석 결과"""
    creative_id: str
    creative_name: str
    fatigue_level: FatigueLevel
    fatigue_score: float  # 0-100

    # 개별 지표 점수
    indicator_scores: Dict[FatigueIndicator, float] = field(default_factory=dict)

    # 감지된 문제점
    issues: List[str] = field(default_factory=list)

    # 추천 사항
    recommendations: List[str] = field(default_factory=list)

    # 예상 수명
    estimated_days_remaining: int = 0

    # 교체 우선순위 (1-5, 5가 가장 급함)
    replacement_priority: int = 1

    # 분석 시간
    analyzed_at: datetime = field(default_factory=datetime.now)


@dataclass
class RefreshRecommendation:
    """크리에이티브 교체 추천"""
    creative_id: str
    creative_name: str
    current_type: CreativeType
    fatigue_level: FatigueLevel

    # 추천 액션
    recommended_action: str  # "refresh", "pause", "replace", "a/b_test"
    urgency: str  # "immediate", "within_week", "monitor"

    # 교체 제안
    suggested_variations: List[str] = field(default_factory=list)

    # 예상 효과
    expected_improvement: Dict[str, float] = field(default_factory=dict)

    # 예산 영향
    budget_impact: str = ""


class CreativeFatigueDetector:
    """크리에이티브 피로도 감지기"""

    # 피로도 임계값 설정
    THRESHOLDS = {
        "ctr_decline_threshold": 0.20,      # 20% CTR 하락시 경고
        "frequency_warning": 2.0,           # 빈도 2.0 이상 경고
        "frequency_critical": 4.0,          # 빈도 4.0 이상 위험
        "cpm_increase_threshold": 0.30,     # 30% CPM 상승시 경고
        "engagement_decline_threshold": 0.25,  # 25% 참여도 하락시 경고
        "conversion_decline_threshold": 0.20,  # 20% 전환율 하락시 경고
        "reach_saturation_threshold": 0.80,    # 도달/잠재도달 80% 이상시 포화
        "min_days_for_analysis": 3,         # 최소 3일 데이터 필요
        "lookback_days": 14,                # 14일 데이터 분석
    }

    # 크리에이티브 유형별 평균 수명 (일)
    CREATIVE_LIFESPAN = {
        CreativeType.IMAGE: 14,
        CreativeType.VIDEO: 21,
        CreativeType.CAROUSEL: 18,
        CreativeType.COLLECTION: 21,
        CreativeType.INSTANT_EXPERIENCE: 28,
    }

    def __init__(self):
        self._db = None

    def _get_db(self):
        """데이터베이스 연결"""
        if self._db is None:
            from database.ad_optimization_db import get_ad_optimization_db
            self._db = get_ad_optimization_db()
        return self._db

    def analyze_creative(self, performance: CreativePerformance) -> FatigueAnalysis:
        """개별 크리에이티브 피로도 분석"""
        indicator_scores = {}
        issues = []
        recommendations = []

        # 1. CTR 하락 분석
        ctr_score = self._analyze_ctr_decline(performance)
        indicator_scores[FatigueIndicator.CTR_DECLINE] = ctr_score
        if ctr_score > 50:
            issues.append(f"CTR이 초기 대비 {int(ctr_score)}% 하락했습니다")
            recommendations.append("새로운 광고 카피 또는 CTA 테스트를 권장합니다")

        # 2. 빈도 분석
        frequency_score = self._analyze_frequency(performance)
        indicator_scores[FatigueIndicator.FREQUENCY_HIGH] = frequency_score
        if frequency_score > 50:
            issues.append(f"광고 빈도({performance.frequency:.1f})가 권장 수준을 초과했습니다")
            recommendations.append("타겟 오디언스 확장 또는 새 크리에이티브 추가를 권장합니다")

        # 3. CPM 상승 분석
        cpm_score = self._analyze_cpm_increase(performance)
        indicator_scores[FatigueIndicator.CPM_INCREASE] = cpm_score
        if cpm_score > 50:
            issues.append("CPM이 지속적으로 상승하고 있습니다")
            recommendations.append("입찰 전략 검토 또는 타겟팅 조정을 권장합니다")

        # 4. 참여도 하락 분석
        engagement_score = self._analyze_engagement_drop(performance)
        indicator_scores[FatigueIndicator.ENGAGEMENT_DROP] = engagement_score
        if engagement_score > 50:
            issues.append("사용자 참여도(좋아요, 댓글, 공유)가 감소하고 있습니다")
            recommendations.append("크리에이티브 비주얼 또는 메시지 변경을 권장합니다")

        # 5. 전환율 하락 분석
        conversion_score = self._analyze_conversion_drop(performance)
        indicator_scores[FatigueIndicator.CONVERSION_DROP] = conversion_score
        if conversion_score > 50:
            issues.append("전환율이 하락하고 있습니다")
            recommendations.append("랜딩 페이지 검토 또는 오퍼 변경을 권장합니다")

        # 6. 도달 포화 분석
        saturation_score = self._analyze_reach_saturation(performance)
        indicator_scores[FatigueIndicator.REACH_SATURATION] = saturation_score
        if saturation_score > 50:
            issues.append("타겟 오디언스 도달이 포화 상태에 가까워지고 있습니다")
            recommendations.append("유사 타겟 확장 또는 새 오디언스 테스트를 권장합니다")

        # 종합 피로도 점수 계산
        fatigue_score = self._calculate_fatigue_score(indicator_scores, performance)
        fatigue_level = self._get_fatigue_level(fatigue_score)

        # 예상 남은 수명 계산
        estimated_days = self._estimate_remaining_days(
            performance, fatigue_score, fatigue_level
        )

        # 교체 우선순위 결정
        priority = self._calculate_replacement_priority(
            fatigue_level, performance.spend, indicator_scores
        )

        return FatigueAnalysis(
            creative_id=performance.creative_id,
            creative_name=performance.creative_name,
            fatigue_level=fatigue_level,
            fatigue_score=fatigue_score,
            indicator_scores=indicator_scores,
            issues=issues,
            recommendations=recommendations,
            estimated_days_remaining=estimated_days,
            replacement_priority=priority,
            analyzed_at=datetime.now()
        )

    def _analyze_ctr_decline(self, perf: CreativePerformance) -> float:
        """CTR 하락 분석 (0-100 점수)"""
        if not perf.historical_ctr or len(perf.historical_ctr) < 3:
            return 0.0

        # 초기 CTR vs 최근 CTR 비교
        initial_avg = sum(perf.historical_ctr[:3]) / 3
        recent_avg = sum(perf.historical_ctr[-3:]) / 3

        if initial_avg <= 0:
            return 0.0

        decline_rate = (initial_avg - recent_avg) / initial_avg

        # 하락률을 0-100 점수로 변환
        threshold = self.THRESHOLDS["ctr_decline_threshold"]
        score = min(100, (decline_rate / threshold) * 50)

        return max(0, score)

    def _analyze_frequency(self, perf: CreativePerformance) -> float:
        """빈도 분석 (0-100 점수)"""
        if perf.frequency <= 0:
            return 0.0

        warning = self.THRESHOLDS["frequency_warning"]
        critical = self.THRESHOLDS["frequency_critical"]

        if perf.frequency >= critical:
            return 100.0
        elif perf.frequency >= warning:
            # warning과 critical 사이에서 50-100 점수
            ratio = (perf.frequency - warning) / (critical - warning)
            return 50 + (ratio * 50)
        else:
            # 0과 warning 사이에서 0-50 점수
            return (perf.frequency / warning) * 50

    def _analyze_cpm_increase(self, perf: CreativePerformance) -> float:
        """CPM 상승 분석 (0-100 점수)"""
        if not perf.historical_cpm or len(perf.historical_cpm) < 3:
            return 0.0

        initial_avg = sum(perf.historical_cpm[:3]) / 3
        recent_avg = sum(perf.historical_cpm[-3:]) / 3

        if initial_avg <= 0:
            return 0.0

        increase_rate = (recent_avg - initial_avg) / initial_avg

        threshold = self.THRESHOLDS["cpm_increase_threshold"]
        score = min(100, (increase_rate / threshold) * 50)

        return max(0, score)

    def _analyze_engagement_drop(self, perf: CreativePerformance) -> float:
        """참여도 하락 분석 (0-100 점수)"""
        # 참여율 기반 분석 (단순화)
        if perf.engagement_rate <= 0 or perf.days_running < 7:
            return 0.0

        # 기본적으로 시간에 따른 피로도 증가 모델
        days_factor = min(1.0, perf.days_running / 30)

        # 참여율이 업계 평균(약 1-3%) 대비 낮으면 피로도 증가
        industry_avg = 0.02  # 2%
        if perf.engagement_rate < industry_avg:
            engagement_factor = 1 - (perf.engagement_rate / industry_avg)
        else:
            engagement_factor = 0

        score = (days_factor * 50) + (engagement_factor * 50)
        return min(100, score)

    def _analyze_conversion_drop(self, perf: CreativePerformance) -> float:
        """전환율 하락 분석 (0-100 점수)"""
        if perf.clicks <= 0 or perf.conversions <= 0:
            return 0.0

        # 전환율 계산
        cvr = perf.conversions / perf.clicks

        # 시간에 따른 피로도 (전환 광고의 경우)
        days_factor = min(1.0, perf.days_running / 21)

        # 전환율이 낮을수록 피로도 증가 (1% 기준)
        if cvr < 0.01:
            cvr_factor = 1 - (cvr / 0.01)
        else:
            cvr_factor = 0

        score = (days_factor * 40) + (cvr_factor * 60)
        return min(100, score)

    def _analyze_reach_saturation(self, perf: CreativePerformance) -> float:
        """도달 포화 분석 (0-100 점수)"""
        if perf.reach <= 0 or perf.impressions <= 0:
            return 0.0

        # 빈도가 높을수록 포화 상태
        frequency_factor = min(1.0, perf.frequency / 5.0)

        # 운영 기간이 길수록 포화 가능성 증가
        days_factor = min(1.0, perf.days_running / 28)

        score = (frequency_factor * 70) + (days_factor * 30)
        return min(100, score)

    def _calculate_fatigue_score(
        self,
        indicator_scores: Dict[FatigueIndicator, float],
        perf: CreativePerformance
    ) -> float:
        """종합 피로도 점수 계산"""
        if not indicator_scores:
            return 0.0

        # 가중치 설정
        weights = {
            FatigueIndicator.CTR_DECLINE: 0.25,
            FatigueIndicator.FREQUENCY_HIGH: 0.20,
            FatigueIndicator.CPM_INCREASE: 0.15,
            FatigueIndicator.ENGAGEMENT_DROP: 0.15,
            FatigueIndicator.CONVERSION_DROP: 0.15,
            FatigueIndicator.REACH_SATURATION: 0.10,
        }

        weighted_sum = 0.0
        total_weight = 0.0

        for indicator, score in indicator_scores.items():
            weight = weights.get(indicator, 0.1)
            weighted_sum += score * weight
            total_weight += weight

        base_score = weighted_sum / total_weight if total_weight > 0 else 0

        # 운영 기간 보정 (오래된 크리에이티브일수록 약간 상향)
        lifespan = self.CREATIVE_LIFESPAN.get(perf.creative_type, 14)
        days_factor = min(0.2, (perf.days_running / lifespan) * 0.2)

        final_score = min(100, base_score + (base_score * days_factor))

        return round(final_score, 1)

    def _get_fatigue_level(self, score: float) -> FatigueLevel:
        """점수를 피로도 레벨로 변환"""
        if score < 20:
            return FatigueLevel.FRESH
        elif score < 40:
            return FatigueLevel.GOOD
        elif score < 60:
            return FatigueLevel.MODERATE
        elif score < 80:
            return FatigueLevel.TIRED
        else:
            return FatigueLevel.EXHAUSTED

    def _estimate_remaining_days(
        self,
        perf: CreativePerformance,
        fatigue_score: float,
        fatigue_level: FatigueLevel
    ) -> int:
        """예상 남은 수명 계산"""
        base_lifespan = self.CREATIVE_LIFESPAN.get(perf.creative_type, 14)

        # 이미 소비된 수명
        used_ratio = fatigue_score / 100
        remaining_ratio = 1 - used_ratio

        # 예상 남은 일수
        remaining_days = int(base_lifespan * remaining_ratio)

        # 최소 0일
        return max(0, remaining_days)

    def _calculate_replacement_priority(
        self,
        fatigue_level: FatigueLevel,
        spend: float,
        indicator_scores: Dict[FatigueIndicator, float]
    ) -> int:
        """교체 우선순위 계산 (1-5, 5가 가장 급함)"""
        base_priority = {
            FatigueLevel.FRESH: 1,
            FatigueLevel.GOOD: 1,
            FatigueLevel.MODERATE: 2,
            FatigueLevel.TIRED: 4,
            FatigueLevel.EXHAUSTED: 5,
        }.get(fatigue_level, 3)

        # 지출이 높은 크리에이티브는 우선순위 상향
        if spend > 100000:  # 10만원 이상
            base_priority = min(5, base_priority + 1)

        # CTR 하락이 심하면 우선순위 상향
        ctr_score = indicator_scores.get(FatigueIndicator.CTR_DECLINE, 0)
        if ctr_score > 70:
            base_priority = min(5, base_priority + 1)

        return base_priority

    def generate_refresh_recommendation(
        self, analysis: FatigueAnalysis, creative_type: CreativeType
    ) -> RefreshRecommendation:
        """크리에이티브 교체 추천 생성"""
        # 추천 액션 결정
        if analysis.fatigue_level == FatigueLevel.EXHAUSTED:
            action = "replace"
            urgency = "immediate"
        elif analysis.fatigue_level == FatigueLevel.TIRED:
            action = "refresh"
            urgency = "within_week"
        elif analysis.fatigue_level == FatigueLevel.MODERATE:
            action = "a/b_test"
            urgency = "within_week"
        else:
            action = "monitor"
            urgency = "monitor"

        # 변형 제안
        variations = self._suggest_variations(creative_type, analysis.issues)

        # 예상 효과
        expected_improvement = {
            "ctr": 0.15 if analysis.fatigue_score > 50 else 0.05,
            "cpm": -0.10 if analysis.fatigue_score > 50 else -0.03,
            "conversions": 0.20 if analysis.fatigue_score > 60 else 0.08,
        }

        # 예산 영향 메시지
        if analysis.fatigue_level in [FatigueLevel.TIRED, FatigueLevel.EXHAUSTED]:
            budget_impact = "현재 예산 대비 15-25% 효율 개선 예상"
        elif analysis.fatigue_level == FatigueLevel.MODERATE:
            budget_impact = "현재 예산 대비 5-15% 효율 개선 예상"
        else:
            budget_impact = "현재 성과 유지 예상"

        return RefreshRecommendation(
            creative_id=analysis.creative_id,
            creative_name=analysis.creative_name,
            current_type=creative_type,
            fatigue_level=analysis.fatigue_level,
            recommended_action=action,
            urgency=urgency,
            suggested_variations=variations,
            expected_improvement=expected_improvement,
            budget_impact=budget_impact
        )

    def _suggest_variations(
        self, creative_type: CreativeType, issues: List[str]
    ) -> List[str]:
        """크리에이티브 변형 제안"""
        suggestions = []

        if creative_type == CreativeType.IMAGE:
            suggestions = [
                "다른 배경색/스타일의 이미지",
                "새로운 제품 샷 또는 라이프스타일 이미지",
                "다른 CTA 버튼 디자인",
                "사용자 생성 콘텐츠(UGC) 활용",
            ]
        elif creative_type == CreativeType.VIDEO:
            suggestions = [
                "다른 도입부(처음 3초) 테스트",
                "세로형 또는 정사각형 버전",
                "다른 BGM 또는 음성",
                "짧은 버전(15초 이하) 제작",
            ]
        elif creative_type == CreativeType.CAROUSEL:
            suggestions = [
                "카드 순서 변경",
                "첫 번째 카드 이미지 교체",
                "카드 수 조정(3-5개 권장)",
                "각 카드별 개별 CTA 추가",
            ]
        else:
            suggestions = [
                "새로운 비주얼 에셋",
                "다른 메시지/카피",
                "다른 CTA",
            ]

        # 이슈 기반 추가 제안
        for issue in issues:
            if "CTR" in issue:
                suggestions.append("더 강렬한 헤드라인 또는 CTA")
            if "참여도" in issue:
                suggestions.append("질문형 카피 또는 인터랙티브 요소")
            if "전환율" in issue:
                suggestions.append("명확한 가치 제안(USP) 강조")

        return suggestions[:5]  # 최대 5개

    def analyze_account_creatives(
        self, user_id: int, ad_account_id: str
    ) -> Dict[str, Any]:
        """계정 전체 크리에이티브 피로도 분석"""
        try:
            db = self._get_db()

            # 저장된 크리에이티브 데이터 조회
            creatives_data = db.get_creative_performance(user_id, ad_account_id)

            if not creatives_data:
                return {
                    "status": "no_data",
                    "message": "분석할 크리에이티브 데이터가 없습니다",
                    "analyses": [],
                    "summary": {}
                }

            analyses = []
            for creative_data in creatives_data:
                performance = self._dict_to_performance(creative_data)
                analysis = self.analyze_creative(performance)
                analyses.append(analysis)

            # 요약 통계
            summary = self._calculate_summary(analyses)

            # 분석 결과 저장
            self._save_analysis_results(user_id, ad_account_id, analyses)

            return {
                "status": "success",
                "analyses": [self._analysis_to_dict(a) for a in analyses],
                "summary": summary,
                "analyzed_at": datetime.now().isoformat()
            }

        except Exception as e:
            logger.error(f"Account creative analysis failed: {e}")
            return {
                "status": "error",
                "message": str(e),
                "analyses": [],
                "summary": {}
            }

    def _dict_to_performance(self, data: Dict) -> CreativePerformance:
        """딕셔너리를 CreativePerformance로 변환"""
        return CreativePerformance(
            creative_id=data.get("creative_id", ""),
            creative_name=data.get("creative_name", ""),
            creative_type=CreativeType(data.get("creative_type", "image")),
            platform=data.get("platform", "meta"),
            impressions=data.get("impressions", 0),
            reach=data.get("reach", 0),
            clicks=data.get("clicks", 0),
            conversions=data.get("conversions", 0),
            spend=data.get("spend", 0.0),
            ctr=data.get("ctr", 0.0),
            cpm=data.get("cpm", 0.0),
            cpc=data.get("cpc", 0.0),
            cvr=data.get("cvr", 0.0),
            frequency=data.get("frequency", 0.0),
            likes=data.get("likes", 0),
            comments=data.get("comments", 0),
            shares=data.get("shares", 0),
            saves=data.get("saves", 0),
            engagement_rate=data.get("engagement_rate", 0.0),
            start_date=datetime.fromisoformat(data["start_date"]) if data.get("start_date") else None,
            days_running=data.get("days_running", 0),
            historical_ctr=data.get("historical_ctr", []),
            historical_cpm=data.get("historical_cpm", []),
            historical_frequency=data.get("historical_frequency", []),
        )

    def _analysis_to_dict(self, analysis: FatigueAnalysis) -> Dict:
        """FatigueAnalysis를 딕셔너리로 변환"""
        return {
            "creative_id": analysis.creative_id,
            "creative_name": analysis.creative_name,
            "fatigue_level": analysis.fatigue_level.value,
            "fatigue_score": analysis.fatigue_score,
            "indicator_scores": {
                k.value: v for k, v in analysis.indicator_scores.items()
            },
            "issues": analysis.issues,
            "recommendations": analysis.recommendations,
            "estimated_days_remaining": analysis.estimated_days_remaining,
            "replacement_priority": analysis.replacement_priority,
            "analyzed_at": analysis.analyzed_at.isoformat()
        }

    def _calculate_summary(self, analyses: List[FatigueAnalysis]) -> Dict:
        """분석 결과 요약"""
        if not analyses:
            return {}

        level_counts = {level.value: 0 for level in FatigueLevel}
        total_score = 0
        urgent_count = 0

        for analysis in analyses:
            level_counts[analysis.fatigue_level.value] += 1
            total_score += analysis.fatigue_score
            if analysis.replacement_priority >= 4:
                urgent_count += 1

        return {
            "total_creatives": len(analyses),
            "average_fatigue_score": round(total_score / len(analyses), 1),
            "level_distribution": level_counts,
            "urgent_replacement_needed": urgent_count,
            "health_status": self._get_health_status(level_counts, len(analyses))
        }

    def _get_health_status(self, level_counts: Dict, total: int) -> str:
        """계정 크리에이티브 건강 상태"""
        exhausted = level_counts.get("exhausted", 0)
        tired = level_counts.get("tired", 0)

        critical_ratio = (exhausted + tired) / total if total > 0 else 0

        if critical_ratio > 0.5:
            return "critical"  # 50% 이상 피로
        elif critical_ratio > 0.3:
            return "warning"   # 30% 이상 피로
        elif critical_ratio > 0.1:
            return "moderate"  # 10% 이상 피로
        else:
            return "healthy"   # 양호

    def _save_analysis_results(
        self, user_id: int, ad_account_id: str, analyses: List[FatigueAnalysis]
    ):
        """분석 결과 저장"""
        try:
            db = self._get_db()

            for analysis in analyses:
                db.save_fatigue_analysis(
                    user_id=user_id,
                    ad_account_id=ad_account_id,
                    creative_id=analysis.creative_id,
                    fatigue_level=analysis.fatigue_level.value,
                    fatigue_score=analysis.fatigue_score,
                    indicator_scores=json.dumps({
                        k.value: v for k, v in analysis.indicator_scores.items()
                    }),
                    issues=json.dumps(analysis.issues),
                    recommendations=json.dumps(analysis.recommendations),
                    estimated_days_remaining=analysis.estimated_days_remaining,
                    replacement_priority=analysis.replacement_priority
                )

        except Exception as e:
            logger.error(f"Failed to save analysis results: {e}")


# 싱글톤 인스턴스
_fatigue_detector: Optional[CreativeFatigueDetector] = None


def get_fatigue_detector() -> CreativeFatigueDetector:
    """CreativeFatigueDetector 싱글톤 인스턴스 반환"""
    global _fatigue_detector
    if _fatigue_detector is None:
        _fatigue_detector = CreativeFatigueDetector()
    return _fatigue_detector
