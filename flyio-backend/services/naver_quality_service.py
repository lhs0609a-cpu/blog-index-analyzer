"""
네이버 품질지수 최적화 서비스

네이버 검색광고의 품질지수를 분석하고 개선 방안을 제시하는 서비스입니다.
품질지수가 높을수록 더 낮은 비용으로 상위 노출이 가능합니다.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, List, Dict, Any
import logging
import json
import re

logger = logging.getLogger(__name__)


class QualityLevel(str, Enum):
    """품질지수 레벨"""
    EXCELLENT = "excellent"   # 7-10점
    GOOD = "good"             # 5-6점
    AVERAGE = "average"       # 3-4점
    POOR = "poor"             # 1-2점


class QualityFactor(str, Enum):
    """품질지수 영향 요소"""
    AD_RELEVANCE = "ad_relevance"           # 광고 관련성
    LANDING_PAGE = "landing_page"           # 랜딩페이지 품질
    EXPECTED_CTR = "expected_ctr"           # 예상 클릭률
    KEYWORD_MATCH = "keyword_match"         # 키워드-광고문구 일치도
    AD_EXTENSIONS = "ad_extensions"         # 광고확장 사용
    HISTORICAL_CTR = "historical_ctr"       # 과거 CTR 실적
    ACCOUNT_HISTORY = "account_history"     # 계정 이력


class OptimizationType(str, Enum):
    """최적화 유형"""
    AD_TEXT = "ad_text"                     # 광고문구 개선
    KEYWORD_ADDITION = "keyword_addition"   # 키워드 추가
    LANDING_PAGE = "landing_page"           # 랜딩페이지 개선
    EXTENSION = "extension"                 # 광고확장 추가
    NEGATIVE_KEYWORD = "negative_keyword"   # 제외 키워드 추가
    BID_ADJUSTMENT = "bid_adjustment"       # 입찰가 조정


@dataclass
class KeywordQuality:
    """키워드 품질 데이터"""
    keyword_id: str
    keyword_text: str
    ad_group_id: str
    ad_group_name: str = ""
    campaign_id: str = ""
    campaign_name: str = ""

    # 품질지수 (1-10)
    quality_index: int = 5

    # 개별 요소 점수 (1-10)
    ad_relevance_score: int = 5
    landing_page_score: int = 5
    expected_ctr_score: int = 5

    # 성과 지표
    impressions: int = 0
    clicks: int = 0
    conversions: int = 0
    cost: float = 0.0
    ctr: float = 0.0
    cvr: float = 0.0
    cpc: float = 0.0

    # 광고문구 정보
    ad_title: str = ""
    ad_description: str = ""
    display_url: str = ""

    # 광고확장 사용 여부
    has_sitelinks: bool = False
    has_callouts: bool = False
    has_phone: bool = False

    # 메타 정보
    match_type: str = "exact"  # exact, phrase, broad
    status: str = "active"


@dataclass
class QualityAnalysis:
    """품질지수 분석 결과"""
    keyword_id: str
    keyword_text: str
    current_quality: int
    quality_level: QualityLevel

    # 요소별 분석
    factor_scores: Dict[QualityFactor, int] = field(default_factory=dict)
    factor_issues: Dict[QualityFactor, List[str]] = field(default_factory=dict)

    # 개선 가능 점수
    potential_quality: int = 0
    improvement_points: int = 0

    # 예상 효과
    estimated_cpc_reduction: float = 0.0
    estimated_rank_improvement: int = 0

    # 우선순위 (1-5, 5가 가장 높음)
    priority: int = 3

    analyzed_at: datetime = field(default_factory=datetime.now)


@dataclass
class QualityRecommendation:
    """품질지수 개선 추천"""
    keyword_id: str
    keyword_text: str
    recommendation_type: OptimizationType
    priority: int  # 1-5

    title: str = ""
    description: str = ""

    # 현재 상태
    current_value: str = ""

    # 추천 액션
    suggested_action: str = ""
    suggested_value: str = ""

    # 예상 효과
    expected_improvement: int = 0  # 품질지수 예상 상승폭
    expected_cpc_reduction: float = 0.0

    # 난이도 (easy, medium, hard)
    difficulty: str = "medium"

    # 적용 여부
    is_applied: bool = False
    applied_at: Optional[datetime] = None


class NaverQualityOptimizer:
    """네이버 품질지수 최적화기"""

    # 품질지수별 CPC 할인율 추정치
    QUALITY_CPC_DISCOUNT = {
        10: 0.30,  # 30% 할인
        9: 0.25,
        8: 0.20,
        7: 0.15,
        6: 0.10,
        5: 0.05,
        4: 0.00,
        3: -0.10,  # 10% 할증
        2: -0.20,
        1: -0.30,
    }

    # 품질 요소별 가중치
    FACTOR_WEIGHTS = {
        QualityFactor.AD_RELEVANCE: 0.25,
        QualityFactor.LANDING_PAGE: 0.20,
        QualityFactor.EXPECTED_CTR: 0.20,
        QualityFactor.KEYWORD_MATCH: 0.15,
        QualityFactor.AD_EXTENSIONS: 0.10,
        QualityFactor.HISTORICAL_CTR: 0.10,
    }

    def __init__(self):
        self._db = None

    def _get_db(self):
        """데이터베이스 연결"""
        if self._db is None:
            from database.ad_optimization_db import get_ad_db
            self._db = get_ad_db
        return self._db

    def analyze_keyword(self, keyword: KeywordQuality) -> QualityAnalysis:
        """개별 키워드 품질 분석"""
        factor_scores = {}
        factor_issues = {}

        # 1. 광고 관련성 분석
        relevance_score, relevance_issues = self._analyze_ad_relevance(keyword)
        factor_scores[QualityFactor.AD_RELEVANCE] = relevance_score
        if relevance_issues:
            factor_issues[QualityFactor.AD_RELEVANCE] = relevance_issues

        # 2. 랜딩페이지 품질 분석
        landing_score, landing_issues = self._analyze_landing_page(keyword)
        factor_scores[QualityFactor.LANDING_PAGE] = landing_score
        if landing_issues:
            factor_issues[QualityFactor.LANDING_PAGE] = landing_issues

        # 3. 예상 CTR 분석
        ctr_score, ctr_issues = self._analyze_expected_ctr(keyword)
        factor_scores[QualityFactor.EXPECTED_CTR] = ctr_score
        if ctr_issues:
            factor_issues[QualityFactor.EXPECTED_CTR] = ctr_issues

        # 4. 키워드-광고문구 일치도 분석
        match_score, match_issues = self._analyze_keyword_match(keyword)
        factor_scores[QualityFactor.KEYWORD_MATCH] = match_score
        if match_issues:
            factor_issues[QualityFactor.KEYWORD_MATCH] = match_issues

        # 5. 광고확장 사용 분석
        ext_score, ext_issues = self._analyze_extensions(keyword)
        factor_scores[QualityFactor.AD_EXTENSIONS] = ext_score
        if ext_issues:
            factor_issues[QualityFactor.AD_EXTENSIONS] = ext_issues

        # 6. 과거 CTR 실적 분석
        hist_score, hist_issues = self._analyze_historical_ctr(keyword)
        factor_scores[QualityFactor.HISTORICAL_CTR] = hist_score
        if hist_issues:
            factor_issues[QualityFactor.HISTORICAL_CTR] = hist_issues

        # 잠재적 품질지수 계산
        potential_quality = self._calculate_potential_quality(factor_scores)
        improvement_points = max(0, potential_quality - keyword.quality_index)

        # CPC 절감 효과 계산
        current_discount = self.QUALITY_CPC_DISCOUNT.get(keyword.quality_index, 0)
        potential_discount = self.QUALITY_CPC_DISCOUNT.get(potential_quality, 0)
        cpc_reduction = (potential_discount - current_discount) * keyword.cpc if keyword.cpc > 0 else 0

        # 순위 개선 예상
        rank_improvement = improvement_points  # 품질지수 1점 상승 = 약 1순위 상승

        # 우선순위 결정
        priority = self._calculate_priority(keyword, improvement_points)

        return QualityAnalysis(
            keyword_id=keyword.keyword_id,
            keyword_text=keyword.keyword_text,
            current_quality=keyword.quality_index,
            quality_level=self._get_quality_level(keyword.quality_index),
            factor_scores=factor_scores,
            factor_issues=factor_issues,
            potential_quality=potential_quality,
            improvement_points=improvement_points,
            estimated_cpc_reduction=cpc_reduction,
            estimated_rank_improvement=rank_improvement,
            priority=priority,
            analyzed_at=datetime.now()
        )

    def _analyze_ad_relevance(self, keyword: KeywordQuality) -> tuple[int, List[str]]:
        """광고 관련성 분석"""
        issues = []
        score = keyword.ad_relevance_score

        # 키워드가 광고 제목에 포함되어 있는지 확인
        keyword_lower = keyword.keyword_text.lower()
        title_lower = keyword.ad_title.lower() if keyword.ad_title else ""
        desc_lower = keyword.ad_description.lower() if keyword.ad_description else ""

        if keyword_lower not in title_lower:
            issues.append("광고 제목에 키워드가 포함되어 있지 않습니다")
            score = min(score, 6)

        if keyword_lower not in desc_lower:
            issues.append("광고 설명에 키워드가 포함되어 있지 않습니다")
            score = min(score, 7)

        # 광고문구가 너무 짧은 경우
        if len(keyword.ad_title) < 10:
            issues.append("광고 제목이 너무 짧습니다 (최소 15자 권장)")
            score = min(score, 5)

        if len(keyword.ad_description) < 30:
            issues.append("광고 설명이 너무 짧습니다 (최소 40자 권장)")
            score = min(score, 5)

        return score, issues

    def _analyze_landing_page(self, keyword: KeywordQuality) -> tuple[int, List[str]]:
        """랜딩페이지 품질 분석"""
        issues = []
        score = keyword.landing_page_score

        # 실제 랜딩페이지 분석은 별도 서비스 필요
        # 여기서는 기본적인 URL 검사만 수행

        if not keyword.display_url:
            issues.append("표시 URL이 설정되어 있지 않습니다")
            score = min(score, 4)

        # 낮은 전환율은 랜딩페이지 문제 시사
        if keyword.clicks > 50 and keyword.cvr < 0.01:
            issues.append("전환율이 낮아 랜딩페이지 개선이 필요할 수 있습니다")
            score = min(score, 5)

        return score, issues

    def _analyze_expected_ctr(self, keyword: KeywordQuality) -> tuple[int, List[str]]:
        """예상 CTR 분석"""
        issues = []
        score = keyword.expected_ctr_score

        # 실제 CTR 기반 분석
        if keyword.impressions > 100:
            if keyword.ctr < 0.5:
                issues.append(f"CTR이 매우 낮습니다 ({keyword.ctr:.2f}%). 광고문구 개선이 필요합니다")
                score = min(score, 3)
            elif keyword.ctr < 1.0:
                issues.append(f"CTR이 업계 평균 이하입니다 ({keyword.ctr:.2f}%)")
                score = min(score, 5)
            elif keyword.ctr < 2.0:
                issues.append(f"CTR 개선 여지가 있습니다 ({keyword.ctr:.2f}%)")
                score = min(score, 7)

        return score, issues

    def _analyze_keyword_match(self, keyword: KeywordQuality) -> tuple[int, List[str]]:
        """키워드-광고문구 일치도 분석"""
        issues = []
        score = 7  # 기본 점수

        keyword_words = set(keyword.keyword_text.lower().split())
        title_words = set(keyword.ad_title.lower().split()) if keyword.ad_title else set()

        # 키워드 단어가 제목에 얼마나 포함되어 있는지
        if keyword_words and title_words:
            match_ratio = len(keyword_words & title_words) / len(keyword_words)
            if match_ratio >= 0.8:
                score = 10
            elif match_ratio >= 0.5:
                score = 7
            else:
                score = 4
                issues.append("키워드의 주요 단어가 광고 제목에 포함되지 않았습니다")

        # 일치 유형에 따른 조정
        if keyword.match_type == "broad":
            issues.append("확장검색 키워드는 정확도가 낮을 수 있습니다")
            score = min(score, 6)

        return score, issues

    def _analyze_extensions(self, keyword: KeywordQuality) -> tuple[int, List[str]]:
        """광고확장 사용 분석"""
        issues = []
        extension_count = sum([
            keyword.has_sitelinks,
            keyword.has_callouts,
            keyword.has_phone,
        ])

        if extension_count == 0:
            score = 3
            issues.append("광고확장을 사용하고 있지 않습니다. 사이트링크, 콜아웃을 추가하세요")
        elif extension_count == 1:
            score = 5
            issues.append("광고확장을 더 추가하면 품질지수가 개선될 수 있습니다")
        elif extension_count == 2:
            score = 7
        else:
            score = 10

        if not keyword.has_sitelinks:
            issues.append("사이트링크 확장을 추가하세요")

        return score, issues

    def _analyze_historical_ctr(self, keyword: KeywordQuality) -> tuple[int, List[str]]:
        """과거 CTR 실적 분석"""
        issues = []

        # 충분한 데이터가 있는 경우에만 분석
        if keyword.impressions < 100:
            return 5, ["노출 데이터가 충분하지 않아 정확한 분석이 어렵습니다"]

        # CTR 기반 점수
        if keyword.ctr >= 5.0:
            score = 10
        elif keyword.ctr >= 3.0:
            score = 8
        elif keyword.ctr >= 2.0:
            score = 7
        elif keyword.ctr >= 1.0:
            score = 5
        elif keyword.ctr >= 0.5:
            score = 3
        else:
            score = 1
            issues.append("과거 CTR이 매우 낮습니다. 광고문구 전면 개선을 권장합니다")

        return score, issues

    def _calculate_potential_quality(self, factor_scores: Dict[QualityFactor, int]) -> int:
        """잠재적 품질지수 계산"""
        if not factor_scores:
            return 5

        # 가중 평균 계산
        weighted_sum = 0
        total_weight = 0

        for factor, score in factor_scores.items():
            weight = self.FACTOR_WEIGHTS.get(factor, 0.1)
            # 개선 가능한 최대 점수 (현재 점수 + 2, 최대 10)
            potential_score = min(10, score + 2)
            weighted_sum += potential_score * weight
            total_weight += weight

        return min(10, int(weighted_sum / total_weight)) if total_weight > 0 else 5

    def _get_quality_level(self, quality_index: int) -> QualityLevel:
        """품질지수를 레벨로 변환"""
        if quality_index >= 7:
            return QualityLevel.EXCELLENT
        elif quality_index >= 5:
            return QualityLevel.GOOD
        elif quality_index >= 3:
            return QualityLevel.AVERAGE
        else:
            return QualityLevel.POOR

    def _calculate_priority(self, keyword: KeywordQuality, improvement_points: int) -> int:
        """우선순위 계산"""
        priority = 3  # 기본

        # 개선 여지가 클수록 우선순위 상승
        if improvement_points >= 3:
            priority += 1

        # 지출이 많은 키워드 우선
        if keyword.cost > 100000:  # 10만원 이상
            priority += 1

        # 품질지수가 낮을수록 우선순위 상승
        if keyword.quality_index <= 3:
            priority += 1

        return min(5, priority)

    def generate_recommendations(self, analysis: QualityAnalysis, keyword: KeywordQuality) -> List[QualityRecommendation]:
        """품질 개선 추천 생성"""
        recommendations = []

        # 1. 광고문구 관련 추천
        if QualityFactor.AD_RELEVANCE in analysis.factor_issues:
            for issue in analysis.factor_issues[QualityFactor.AD_RELEVANCE]:
                if "제목" in issue and "키워드" in issue:
                    recommendations.append(QualityRecommendation(
                        keyword_id=keyword.keyword_id,
                        keyword_text=keyword.keyword_text,
                        recommendation_type=OptimizationType.AD_TEXT,
                        priority=5,
                        title="광고 제목에 키워드 포함",
                        description="광고 제목에 검색 키워드를 포함하면 관련성 점수가 크게 향상됩니다",
                        current_value=keyword.ad_title,
                        suggested_action="광고 제목에 키워드 추가",
                        suggested_value=self._suggest_title_with_keyword(keyword),
                        expected_improvement=2,
                        expected_cpc_reduction=keyword.cpc * 0.15 if keyword.cpc else 0,
                        difficulty="easy"
                    ))

        # 2. CTR 개선 추천
        if QualityFactor.EXPECTED_CTR in analysis.factor_issues:
            recommendations.append(QualityRecommendation(
                keyword_id=keyword.keyword_id,
                keyword_text=keyword.keyword_text,
                recommendation_type=OptimizationType.AD_TEXT,
                priority=4,
                title="CTR 개선을 위한 광고문구 최적화",
                description="클릭을 유도하는 액션 문구와 혜택을 강조하세요",
                current_value=f"현재 CTR: {keyword.ctr:.2f}%",
                suggested_action="CTA 문구 추가 및 혜택 강조",
                suggested_value="'지금 확인하세요', '무료 상담', '50% 할인' 등 활용",
                expected_improvement=1,
                expected_cpc_reduction=keyword.cpc * 0.10 if keyword.cpc else 0,
                difficulty="medium"
            ))

        # 3. 광고확장 추천
        if QualityFactor.AD_EXTENSIONS in analysis.factor_issues:
            if not keyword.has_sitelinks:
                recommendations.append(QualityRecommendation(
                    keyword_id=keyword.keyword_id,
                    keyword_text=keyword.keyword_text,
                    recommendation_type=OptimizationType.EXTENSION,
                    priority=4,
                    title="사이트링크 확장 추가",
                    description="사이트링크를 추가하면 광고 면적이 넓어지고 CTR이 향상됩니다",
                    current_value="사이트링크 없음",
                    suggested_action="4개 이상의 사이트링크 추가",
                    suggested_value="주요 페이지 링크 (제품소개, 가격안내, 고객후기, 문의하기 등)",
                    expected_improvement=1,
                    expected_cpc_reduction=keyword.cpc * 0.08 if keyword.cpc else 0,
                    difficulty="easy"
                ))

            if not keyword.has_callouts:
                recommendations.append(QualityRecommendation(
                    keyword_id=keyword.keyword_id,
                    keyword_text=keyword.keyword_text,
                    recommendation_type=OptimizationType.EXTENSION,
                    priority=3,
                    title="콜아웃 확장 추가",
                    description="콜아웃으로 주요 장점을 간결하게 어필하세요",
                    current_value="콜아웃 없음",
                    suggested_action="3-4개의 콜아웃 추가",
                    suggested_value="'무료배송', '24시간 고객센터', '100% 환불보장' 등",
                    expected_improvement=1,
                    expected_cpc_reduction=keyword.cpc * 0.05 if keyword.cpc else 0,
                    difficulty="easy"
                ))

        # 4. 랜딩페이지 추천
        if QualityFactor.LANDING_PAGE in analysis.factor_issues:
            recommendations.append(QualityRecommendation(
                keyword_id=keyword.keyword_id,
                keyword_text=keyword.keyword_text,
                recommendation_type=OptimizationType.LANDING_PAGE,
                priority=3,
                title="랜딩페이지 최적화",
                description="키워드와 관련된 콘텐츠가 랜딩페이지에 포함되어야 합니다",
                current_value=keyword.display_url or "URL 없음",
                suggested_action="키워드 관련 콘텐츠 및 CTA 추가",
                suggested_value="키워드를 페이지 제목, H1, 본문에 자연스럽게 포함",
                expected_improvement=1,
                expected_cpc_reduction=keyword.cpc * 0.10 if keyword.cpc else 0,
                difficulty="hard"
            ))

        # 5. 매치 타입 추천
        if keyword.match_type == "broad" and keyword.ctr < 1.0:
            recommendations.append(QualityRecommendation(
                keyword_id=keyword.keyword_id,
                keyword_text=keyword.keyword_text,
                recommendation_type=OptimizationType.KEYWORD_ADDITION,
                priority=3,
                title="확장검색을 구문검색으로 변경 검토",
                description="확장검색의 CTR이 낮은 경우 구문검색으로 변경하면 관련성이 높아집니다",
                current_value=f"매치타입: {keyword.match_type}",
                suggested_action="구문검색 또는 정확검색 추가",
                suggested_value=f'[{keyword.keyword_text}] 또는 "{keyword.keyword_text}"',
                expected_improvement=1,
                expected_cpc_reduction=keyword.cpc * 0.05 if keyword.cpc else 0,
                difficulty="easy"
            ))

        # 우선순위 순 정렬
        recommendations.sort(key=lambda x: x.priority, reverse=True)

        return recommendations

    def _suggest_title_with_keyword(self, keyword: KeywordQuality) -> str:
        """키워드를 포함한 제목 제안"""
        if keyword.keyword_text in (keyword.ad_title or ""):
            return keyword.ad_title

        kw = keyword.keyword_text
        suggestions = [
            f"{kw} 전문 | 최저가 보장",
            f"{kw} 추천 | 무료 상담",
            f"[공식] {kw} | 빠른 배송",
            f"{kw} | 신뢰할 수 있는 선택",
        ]
        return suggestions[0]

    def analyze_campaign(
        self, user_id: int, campaign_id: str, keywords: List[KeywordQuality]
    ) -> Dict[str, Any]:
        """캠페인 전체 품질 분석"""
        if not keywords:
            return {
                "status": "no_data",
                "message": "분석할 키워드가 없습니다",
                "analyses": [],
                "summary": {}
            }

        analyses = []
        all_recommendations = []

        for keyword in keywords:
            analysis = self.analyze_keyword(keyword)
            analyses.append(analysis)

            recs = self.generate_recommendations(analysis, keyword)
            all_recommendations.extend(recs)

        # 요약 통계
        summary = self._calculate_summary(analyses, keywords)

        return {
            "status": "success",
            "analyses": [self._analysis_to_dict(a) for a in analyses],
            "recommendations": [self._recommendation_to_dict(r) for r in all_recommendations[:20]],
            "summary": summary,
            "analyzed_at": datetime.now().isoformat()
        }

    def _calculate_summary(
        self, analyses: List[QualityAnalysis], keywords: List[KeywordQuality]
    ) -> Dict[str, Any]:
        """분석 결과 요약"""
        if not analyses:
            return {}

        # 품질 분포
        quality_dist = {level.value: 0 for level in QualityLevel}
        for analysis in analyses:
            quality_dist[analysis.quality_level.value] += 1

        # 평균 품질지수
        avg_quality = sum(a.current_quality for a in analyses) / len(analyses)

        # 총 개선 가능 점수
        total_improvement = sum(a.improvement_points for a in analyses)

        # 예상 CPC 절감액
        total_cpc_reduction = sum(a.estimated_cpc_reduction for a in analyses)

        # 총 비용 (개선 우선순위 판단용)
        total_cost = sum(k.cost for k in keywords)

        # 개선이 필요한 키워드 수
        needs_improvement = sum(1 for a in analyses if a.improvement_points > 0)

        return {
            "total_keywords": len(analyses),
            "average_quality_index": round(avg_quality, 1),
            "quality_distribution": quality_dist,
            "excellent_count": quality_dist.get("excellent", 0),
            "poor_count": quality_dist.get("poor", 0),
            "needs_improvement": needs_improvement,
            "total_improvement_potential": total_improvement,
            "estimated_total_cpc_reduction": round(total_cpc_reduction, 0),
            "total_cost": round(total_cost, 0),
            "health_status": self._get_health_status(quality_dist, len(analyses))
        }

    def _get_health_status(self, quality_dist: Dict, total: int) -> str:
        """전체 건강 상태 판단"""
        if total == 0:
            return "no_data"

        excellent_ratio = quality_dist.get("excellent", 0) / total
        poor_ratio = quality_dist.get("poor", 0) / total

        if excellent_ratio >= 0.5:
            return "excellent"
        elif poor_ratio >= 0.3:
            return "critical"
        elif poor_ratio >= 0.1:
            return "warning"
        else:
            return "good"

    def _analysis_to_dict(self, analysis: QualityAnalysis) -> Dict:
        """분석 결과를 딕셔너리로 변환"""
        return {
            "keyword_id": analysis.keyword_id,
            "keyword_text": analysis.keyword_text,
            "current_quality": analysis.current_quality,
            "quality_level": analysis.quality_level.value,
            "factor_scores": {k.value: v for k, v in analysis.factor_scores.items()},
            "factor_issues": {k.value: v for k, v in analysis.factor_issues.items()},
            "potential_quality": analysis.potential_quality,
            "improvement_points": analysis.improvement_points,
            "estimated_cpc_reduction": round(analysis.estimated_cpc_reduction, 0),
            "estimated_rank_improvement": analysis.estimated_rank_improvement,
            "priority": analysis.priority,
            "analyzed_at": analysis.analyzed_at.isoformat()
        }

    def _recommendation_to_dict(self, rec: QualityRecommendation) -> Dict:
        """추천을 딕셔너리로 변환"""
        return {
            "keyword_id": rec.keyword_id,
            "keyword_text": rec.keyword_text,
            "recommendation_type": rec.recommendation_type.value,
            "priority": rec.priority,
            "title": rec.title,
            "description": rec.description,
            "current_value": rec.current_value,
            "suggested_action": rec.suggested_action,
            "suggested_value": rec.suggested_value,
            "expected_improvement": rec.expected_improvement,
            "expected_cpc_reduction": round(rec.expected_cpc_reduction, 0),
            "difficulty": rec.difficulty,
            "is_applied": rec.is_applied
        }


# 싱글톤 인스턴스
_quality_optimizer: Optional[NaverQualityOptimizer] = None


def get_quality_optimizer() -> NaverQualityOptimizer:
    """NaverQualityOptimizer 싱글톤 인스턴스 반환"""
    global _quality_optimizer
    if _quality_optimizer is None:
        _quality_optimizer = NaverQualityOptimizer()
    return _quality_optimizer
