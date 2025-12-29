"""
안전 키워드 선별 시스템 (Safe Keyword Selector)

목표: "상위노출이 안전하게 될 키워드"만 선별

피드백 반영:
- 7위 이하 예측 키워드 → 실제 10위권 밖 (전국 키워드)
- 1위 예측 지역 키워드 → 실제 1-2위 (정확함)

해결책:
1. 전국 키워드에 안전 마진 +2~3 적용
2. 6위 이내 예측만 "진입 가능"으로 판정
3. 점수 여유도, 경쟁 안정성 등 종합 평가
"""

import re
import math
import logging
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass, field
from enum import Enum
import numpy as np

logger = logging.getLogger(__name__)


# ==============================================
# 상수 정의
# ==============================================

class KeywordScope(str, Enum):
    """키워드 범위"""
    LOCAL = "지역"      # 지역 키워드 (예: 강남역 한의원)
    REGIONAL = "광역"   # 광역 키워드 (예: 서울 한의원)
    NATIONAL = "전국"   # 전국 키워드 (예: 허리디스크 치료)


class SafetyGrade(str, Enum):
    """안전 등급"""
    VERY_SAFE = "매우안전"     # 90%+ 확률로 상위노출
    SAFE = "안전"              # 70-89% 확률
    MODERATE = "보통"          # 50-69% 확률
    RISKY = "위험"             # 30-49% 확률
    VERY_RISKY = "매우위험"    # 30% 미만


class RecommendationType(str, Enum):
    """추천 유형"""
    STRONGLY_RECOMMEND = "강력추천"    # 바로 작성해도 됨
    RECOMMEND = "추천"                  # 추천하지만 콘텐츠 퀄리티 필요
    CONDITIONAL = "조건부추천"          # 조건 충족시 가능
    NOT_RECOMMEND = "비추천"            # 현재 블로그로는 어려움
    AVOID = "회피권장"                  # 시간 낭비 가능성


# 지역 키워드 패턴
LOCAL_PATTERNS = {
    # 구/동/역 단위 + 시설
    'patterns': [
        r'^(강남|서초|송파|강동|강서|마포|영등포|용산|성북|노원|'
        r'분당|판교|일산|수원|안양|부천|인천|의정부|위례|'
        r'해운대|서면|동래|남포동|센텀).*(병원|의원|한의원|치과|피부과|클리닉)',

        r'.*역\s*(병원|의원|한의원|치과|피부과)',
        r'.*동\s*(병원|의원|한의원)',
        r'.*구\s*(병원|의원)',
    ],
    # 지역명 키워드
    'prefixes': [
        '강남', '서초', '송파', '강동', '강서', '마포', '영등포', '용산',
        '성북', '노원', '분당', '판교', '일산', '수원', '안양', '부천',
        '인천', '의정부', '위례', '해운대', '서면', '동래', '남포동', '센텀',
        '홍대', '신촌', '이대', '건대', '잠실', '삼성', '역삼', '선릉',
    ]
}

# 광역 키워드 패턴
REGIONAL_PATTERNS = {
    'prefixes': [
        '서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종',
        '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'
    ]
}


@dataclass
class SafetyAnalysis:
    """안전 분석 결과"""
    keyword: str
    scope: KeywordScope

    # 예측 정보
    raw_predicted_rank: int          # 원본 예측 순위
    safety_margin: int               # 적용된 안전 마진
    adjusted_rank: int               # 보정된 순위

    # 점수 분석
    my_score: float
    top10_scores: List[float]
    top10_avg: float
    top10_min: float
    top10_std: float                 # 표준편차 (경쟁 안정성)
    score_gap: float                 # 내 점수 - 최저 점수
    score_buffer: float              # 점수 여유도 (%)

    # 경쟁 분석
    influencer_count: int
    high_scorer_count: int           # 70점 이상 블로그 수

    # 안전 지수
    safety_score: float              # 0-100
    safety_grade: SafetyGrade
    confidence: float                # 예측 신뢰도 (%)

    # 추천
    recommendation: RecommendationType
    reasons: List[str]
    tips: List[str]

    # 검색량
    search_volume: int = 0

    # 경고
    warnings: List[str] = field(default_factory=list)

    # 5위 보장 여부
    is_guaranteed_top5: bool = False
    guaranteed_top5_reasons: List[str] = field(default_factory=list)


class SafeKeywordSelector:
    """안전 키워드 선별기"""

    def __init__(self):
        self._compile_patterns()

    def _compile_patterns(self):
        """정규식 패턴 컴파일"""
        self._local_patterns = [
            re.compile(p, re.IGNORECASE)
            for p in LOCAL_PATTERNS['patterns']
        ]

    # ==============================================
    # 키워드 범위 분류
    # ==============================================

    def classify_scope(self, keyword: str) -> KeywordScope:
        """
        키워드가 지역/광역/전국인지 분류

        지역 키워드: 특정 지역 + 시설 (예: 강남역 한의원)
        광역 키워드: 시/도 단위 (예: 서울 한의원)
        전국 키워드: 지역 없는 일반 (예: 허리디스크 치료)
        """
        keyword_lower = keyword.lower().strip()

        # 1. 지역 키워드 패턴 체크
        for pattern in self._local_patterns:
            if pattern.search(keyword_lower):
                return KeywordScope.LOCAL

        # 접두사 체크
        for prefix in LOCAL_PATTERNS['prefixes']:
            if keyword_lower.startswith(prefix):
                # 병원/의원 관련 키워드인지 확인
                if any(h in keyword_lower for h in ['병원', '의원', '한의원', '치과', '클리닉', '센터']):
                    return KeywordScope.LOCAL

        # 2. 광역 키워드 체크
        for prefix in REGIONAL_PATTERNS['prefixes']:
            if keyword_lower.startswith(prefix):
                return KeywordScope.REGIONAL

        # 3. 기본: 전국 키워드
        return KeywordScope.NATIONAL

    # ==============================================
    # 안전 마진 계산
    # ==============================================

    def calculate_safety_margin(
        self,
        scope: KeywordScope,
        top10_std: float,
        influencer_count: int
    ) -> int:
        """
        안전 마진 계산 (5위 보장 시스템용 강화 버전)

        전국 키워드일수록, 경쟁 변동성이 클수록 마진 증가

        피드백 반영:
        - 전국 키워드 7위 예측 → 실제 10위권 밖 (오차 +3~4)
        - 5위 보장을 위해 더 보수적인 마진 적용
        """
        margin = 0

        # 1. 키워드 범위별 기본 마진 (강화됨)
        if scope == KeywordScope.LOCAL:
            margin = 1  # 지역도 약간의 오차 존재
        elif scope == KeywordScope.REGIONAL:
            margin = 2  # 광역은 +2
        else:  # NATIONAL
            margin = 3  # 전국은 기본 +3 (7위→10위 오차 반영)

        # 2. 경쟁 변동성에 따른 추가 마진 (강화됨)
        # 표준편차가 크면 순위 변동이 심함
        if top10_std > 15:
            margin += 3
        elif top10_std > 10:
            margin += 2
        elif top10_std > 5:
            margin += 1

        # 3. 인플루언서 수에 따른 추가 마진 (강화됨)
        if influencer_count >= 3:
            margin += 3
        elif influencer_count >= 2:
            margin += 2
        elif influencer_count >= 1:
            margin += 1

        return min(margin, 8)  # 최대 8까지 (더 보수적)

    # ==============================================
    # 예측 순위 계산
    # ==============================================

    def calculate_predicted_rank(
        self,
        my_score: float,
        top10_scores: List[float]
    ) -> int:
        """
        내 점수 기준 예상 순위 계산

        상위 블로그 점수와 비교하여 내 예상 순위 산출
        """
        if not top10_scores:
            return 10

        # 점수 내림차순 정렬
        sorted_scores = sorted(top10_scores, reverse=True)

        predicted_rank = 1
        for score in sorted_scores:
            if my_score < score:
                predicted_rank += 1
            else:
                break

        return min(predicted_rank, len(sorted_scores) + 1)

    # ==============================================
    # 안전 지수 계산
    # ==============================================

    def calculate_safety_score(
        self,
        my_score: float,
        top10_scores: List[float],
        scope: KeywordScope,
        adjusted_rank: int,
        influencer_count: int
    ) -> Tuple[float, Dict]:
        """
        안전 지수 계산 (0-100)

        Safety Score =
            (점수여유도 × 0.30) +
            (순위안정성 × 0.25) +
            (경쟁약도 × 0.25) +
            (예측신뢰도 × 0.20)
        """
        if not top10_scores:
            return 0.0, {}

        top10_avg = np.mean(top10_scores)
        top10_min = min(top10_scores)
        top10_std = np.std(top10_scores)

        # 1. 점수 여유도 (30%) - 내 점수가 최저 점수보다 얼마나 높은가
        score_gap = my_score - top10_min
        if score_gap >= 20:
            score_buffer_score = 100
        elif score_gap >= 10:
            score_buffer_score = 80 + (score_gap - 10) * 2
        elif score_gap >= 0:
            score_buffer_score = 60 + score_gap * 2
        elif score_gap >= -10:
            score_buffer_score = 40 + (score_gap + 10) * 2
        elif score_gap >= -20:
            score_buffer_score = 20 + (score_gap + 20) * 1
        else:
            score_buffer_score = max(0, 10 + score_gap)

        # 2. 순위 안정성 (25%) - 표준편차가 낮을수록 안정적
        if top10_std <= 5:
            stability_score = 100
        elif top10_std <= 10:
            stability_score = 80 - (top10_std - 5) * 4
        elif top10_std <= 15:
            stability_score = 60 - (top10_std - 10) * 4
        else:
            stability_score = max(20, 40 - (top10_std - 15) * 2)

        # 3. 경쟁 약도 (25%) - 상위 평균 점수가 낮을수록, 인플루언서가 적을수록
        competition_score = 100

        # 상위 평균 점수 기반
        if top10_avg >= 70:
            competition_score -= 40
        elif top10_avg >= 60:
            competition_score -= 25
        elif top10_avg >= 50:
            competition_score -= 10

        # 인플루언서 패널티
        competition_score -= influencer_count * 15
        competition_score = max(0, competition_score)

        # 4. 예측 신뢰도 (20%) - 키워드 범위와 예측 순위 기반
        confidence_matrix = {
            KeywordScope.LOCAL: {
                1: 95, 2: 90, 3: 85, 4: 75, 5: 65, 6: 55, 7: 40, 8: 30
            },
            KeywordScope.REGIONAL: {
                1: 85, 2: 80, 3: 70, 4: 60, 5: 50, 6: 40, 7: 25, 8: 15
            },
            KeywordScope.NATIONAL: {
                1: 80, 2: 70, 3: 60, 4: 45, 5: 35, 6: 25, 7: 15, 8: 10
            }
        }

        confidence_score = confidence_matrix.get(scope, {}).get(
            min(adjusted_rank, 8), 10
        )

        # 종합 점수
        safety_score = (
            score_buffer_score * 0.30 +
            stability_score * 0.25 +
            competition_score * 0.25 +
            confidence_score * 0.20
        )

        breakdown = {
            'score_buffer': round(score_buffer_score, 1),
            'stability': round(stability_score, 1),
            'competition': round(competition_score, 1),
            'confidence': round(confidence_score, 1)
        }

        return round(safety_score, 1), breakdown

    def get_safety_grade(self, safety_score: float) -> SafetyGrade:
        """안전 점수에 따른 등급 반환"""
        if safety_score >= 80:
            return SafetyGrade.VERY_SAFE
        elif safety_score >= 65:
            return SafetyGrade.SAFE
        elif safety_score >= 50:
            return SafetyGrade.MODERATE
        elif safety_score >= 35:
            return SafetyGrade.RISKY
        else:
            return SafetyGrade.VERY_RISKY

    # ==============================================
    # 추천 유형 결정
    # ==============================================

    def determine_recommendation(
        self,
        safety_grade: SafetyGrade,
        adjusted_rank: int,
        scope: KeywordScope,
        score_gap: float
    ) -> Tuple[RecommendationType, List[str]]:
        """
        추천 유형 및 이유 결정

        핵심 규칙:
        - 전국 키워드 7위 이하 → 비추천/회피
        - 지역 키워드는 8위까지 허용
        - 점수 여유가 충분해야 안전
        """
        reasons = []

        # 1. 조정된 순위 기반 1차 필터
        if scope == KeywordScope.NATIONAL:
            # 전국 키워드: 6위 이내만 추천
            if adjusted_rank > 8:
                reasons.append(f"전국 키워드 {adjusted_rank}위 예측 - 상위노출 불가능")
                return RecommendationType.AVOID, reasons
            elif adjusted_rank > 6:
                reasons.append(f"전국 키워드 {adjusted_rank}위 예측 - 진입 어려움")
                return RecommendationType.NOT_RECOMMEND, reasons

        elif scope == KeywordScope.REGIONAL:
            # 광역 키워드: 7위 이내만 추천
            if adjusted_rank > 9:
                reasons.append(f"광역 키워드 {adjusted_rank}위 예측 - 상위노출 불가능")
                return RecommendationType.AVOID, reasons
            elif adjusted_rank > 7:
                reasons.append(f"광역 키워드 {adjusted_rank}위 예측 - 진입 어려움")
                return RecommendationType.NOT_RECOMMEND, reasons

        else:  # LOCAL
            # 지역 키워드: 8위 이내 추천
            if adjusted_rank > 10:
                reasons.append(f"지역 키워드지만 {adjusted_rank}위 예측 - 경쟁 치열")
                return RecommendationType.AVOID, reasons
            elif adjusted_rank > 8:
                reasons.append(f"지역 키워드 {adjusted_rank}위 예측 - 약간 어려움")
                return RecommendationType.CONDITIONAL, reasons

        # 2. 안전 등급 기반 2차 결정
        if safety_grade == SafetyGrade.VERY_SAFE:
            reasons.append("높은 안전 지수 - 상위노출 가능성 매우 높음")
            if score_gap >= 10:
                reasons.append(f"점수 여유 +{score_gap:.0f}점")
            return RecommendationType.STRONGLY_RECOMMEND, reasons

        elif safety_grade == SafetyGrade.SAFE:
            reasons.append("안전 지수 양호 - 상위노출 기대됨")
            return RecommendationType.RECOMMEND, reasons

        elif safety_grade == SafetyGrade.MODERATE:
            reasons.append("보통 수준 - 콘텐츠 품질에 따라 가능")
            return RecommendationType.CONDITIONAL, reasons

        elif safety_grade == SafetyGrade.RISKY:
            reasons.append("위험 수준 - 상위노출 불확실")
            return RecommendationType.NOT_RECOMMEND, reasons

        else:
            reasons.append("매우 위험 - 시간 낭비 가능성")
            return RecommendationType.AVOID, reasons

    # ==============================================
    # 팁 및 경고 생성
    # ==============================================

    def generate_tips(
        self,
        recommendation: RecommendationType,
        scope: KeywordScope,
        adjusted_rank: int,
        score_gap: float,
        top10_avg: float
    ) -> List[str]:
        """상황별 팁 생성"""
        tips = []

        if recommendation in [RecommendationType.STRONGLY_RECOMMEND, RecommendationType.RECOMMEND]:
            tips.append("✅ 이 키워드로 글을 작성하세요")
            if scope == KeywordScope.LOCAL:
                tips.append("📍 지역 정보를 상세히 포함하면 더 효과적입니다")
            if score_gap >= 15:
                tips.append("💪 점수 여유가 충분해 안정적인 상위노출이 기대됩니다")

        elif recommendation == RecommendationType.CONDITIONAL:
            tips.append("⚠️ 콘텐츠 품질을 높여야 상위노출 가능")
            tips.append("📝 상위 블로그보다 더 긴 글, 더 많은 이미지 필요")
            if score_gap < 0:
                tips.append(f"📈 블로그 지수를 {abs(score_gap):.0f}점 올리면 유리해집니다")

        elif recommendation == RecommendationType.NOT_RECOMMEND:
            tips.append("❌ 이 키워드는 추천하지 않습니다")
            tips.append("🔍 더 세부적인 키워드나 지역 키워드를 찾아보세요")
            if scope == KeywordScope.NATIONAL:
                tips.append("💡 전국 키워드보다 지역 키워드가 진입하기 쉽습니다")

        else:  # AVOID
            tips.append("🚫 이 키워드는 피하세요")
            tips.append("⏰ 시간 낭비 가능성이 높습니다")

        return tips

    def generate_warnings(
        self,
        scope: KeywordScope,
        raw_rank: int,
        adjusted_rank: int,
        influencer_count: int,
        top10_std: float
    ) -> List[str]:
        """경고 메시지 생성"""
        warnings = []

        # 안전 마진 적용 경고
        if adjusted_rank > raw_rank:
            margin = adjusted_rank - raw_rank
            warnings.append(
                f"⚠️ 안전마진 +{margin} 적용됨 (원래 예측: {raw_rank}위 → 보정: {adjusted_rank}위)"
            )

        # 전국 키워드 7위 이하 경고
        if scope == KeywordScope.NATIONAL and adjusted_rank >= 7:
            warnings.append(
                "🚨 전국 키워드 7위 이하는 실제 상위노출이 어렵습니다 (피드백 기반)"
            )

        # 인플루언서 경고
        if influencer_count >= 3:
            warnings.append(
                f"👑 인플루언서 {influencer_count}명 - 경쟁이 매우 치열합니다"
            )
        elif influencer_count >= 1:
            warnings.append(
                f"👑 인플루언서 {influencer_count}명 - 순위 변동 가능성"
            )

        # 변동성 경고
        if top10_std > 15:
            warnings.append(
                "📊 순위 변동이 심한 키워드입니다 - 예측 불확실"
            )

        return warnings

    # ==============================================
    # 메인 분석 함수
    # ==============================================

    def analyze_keyword_safety(
        self,
        keyword: str,
        my_score: float,
        top10_scores: List[float],
        search_volume: int = 0,
        influencer_count: int = 0
    ) -> SafetyAnalysis:
        """
        키워드 안전성 종합 분석

        Args:
            keyword: 분석할 키워드
            my_score: 내 블로그 점수
            top10_scores: 상위 10개 블로그 점수 리스트
            search_volume: 월간 검색량
            influencer_count: 상위 10개 중 인플루언서 수

        Returns:
            SafetyAnalysis: 종합 안전성 분석 결과
        """
        # 기본 통계
        if not top10_scores:
            top10_scores = [50] * 10  # 기본값

        top10_avg = float(np.mean(top10_scores))
        top10_min = float(min(top10_scores))
        top10_std = float(np.std(top10_scores))
        score_gap = my_score - top10_min
        score_buffer = (score_gap / top10_min * 100) if top10_min > 0 else 0

        # 1. 키워드 범위 분류
        scope = self.classify_scope(keyword)

        # 2. 원본 예측 순위
        raw_predicted_rank = self.calculate_predicted_rank(my_score, top10_scores)

        # 3. 안전 마진 계산
        safety_margin = self.calculate_safety_margin(scope, top10_std, influencer_count)

        # 4. 보정된 순위
        adjusted_rank = raw_predicted_rank + safety_margin

        # 5. 안전 지수 계산
        safety_score, breakdown = self.calculate_safety_score(
            my_score, top10_scores, scope, adjusted_rank, influencer_count
        )

        # 6. 안전 등급
        safety_grade = self.get_safety_grade(safety_score)

        # 7. 예측 신뢰도
        confidence = breakdown.get('confidence', 50)

        # 8. 추천 유형 결정
        recommendation, reasons = self.determine_recommendation(
            safety_grade, adjusted_rank, scope, score_gap
        )

        # 9. 팁 생성
        tips = self.generate_tips(
            recommendation, scope, adjusted_rank, score_gap, top10_avg
        )

        # 10. 경고 생성
        warnings = self.generate_warnings(
            scope, raw_predicted_rank, adjusted_rank, influencer_count, top10_std
        )

        # 고점자 수 계산
        high_scorer_count = sum(1 for s in top10_scores if s >= 70)

        # 11. 5위 보장 여부 판정
        is_guaranteed_top5, guaranteed_top5_reasons = self.check_guaranteed_top5(
            scope=scope,
            raw_predicted_rank=raw_predicted_rank,
            adjusted_rank=adjusted_rank,
            safety_score=safety_score,
            score_gap=score_gap,
            top10_std=top10_std,
            influencer_count=influencer_count,
            high_scorer_count=high_scorer_count
        )

        return SafetyAnalysis(
            keyword=keyword,
            scope=scope,
            raw_predicted_rank=raw_predicted_rank,
            safety_margin=safety_margin,
            adjusted_rank=adjusted_rank,
            my_score=my_score,
            top10_scores=top10_scores,
            top10_avg=round(top10_avg, 1),
            top10_min=round(top10_min, 1),
            top10_std=round(top10_std, 1),
            score_gap=round(score_gap, 1),
            score_buffer=round(score_buffer, 1),
            influencer_count=influencer_count,
            high_scorer_count=high_scorer_count,
            safety_score=safety_score,
            safety_grade=safety_grade,
            confidence=confidence,
            recommendation=recommendation,
            reasons=reasons,
            tips=tips,
            search_volume=search_volume,
            warnings=warnings,
            is_guaranteed_top5=is_guaranteed_top5,
            guaranteed_top5_reasons=guaranteed_top5_reasons
        )

    # ==============================================
    # 키워드 필터링 (안전한 것만)
    # ==============================================

    def filter_safe_keywords(
        self,
        keywords_data: List[Dict],
        my_score: float,
        min_safety_score: float = 50.0,
        min_search_volume: int = 100
    ) -> List[SafetyAnalysis]:
        """
        안전한 키워드만 필터링

        Args:
            keywords_data: 키워드 정보 리스트
                          [{'keyword': str, 'top10_scores': list, 'search_volume': int, ...}, ...]
            my_score: 내 블로그 점수
            min_safety_score: 최소 안전 점수 (기본 50)
            min_search_volume: 최소 검색량 (기본 100)

        Returns:
            안전 점수가 높은 순으로 정렬된 SafetyAnalysis 리스트
        """
        safe_keywords = []

        for kw_data in keywords_data:
            keyword = kw_data.get('keyword', '')
            top10_scores = kw_data.get('top10_scores', [])
            search_volume = kw_data.get('search_volume', 0)
            influencer_count = kw_data.get('influencer_count', 0)

            # 검색량 필터
            if search_volume < min_search_volume:
                continue

            # 안전성 분석
            analysis = self.analyze_keyword_safety(
                keyword=keyword,
                my_score=my_score,
                top10_scores=top10_scores,
                search_volume=search_volume,
                influencer_count=influencer_count
            )

            # 안전 점수 필터
            if analysis.safety_score >= min_safety_score:
                safe_keywords.append(analysis)

        # 안전 점수 높은 순 정렬
        safe_keywords.sort(key=lambda x: x.safety_score, reverse=True)

        return safe_keywords

    def get_top_safe_keywords(
        self,
        keywords_data: List[Dict],
        my_score: float,
        top_n: int = 10
    ) -> List[SafetyAnalysis]:
        """
        가장 안전한 상위 N개 키워드 반환

        추천 기준:
        1. 강력추천/추천 유형만
        2. 안전 점수 65 이상
        3. 검색량 100 이상
        """
        all_safe = self.filter_safe_keywords(
            keywords_data=keywords_data,
            my_score=my_score,
            min_safety_score=65.0,
            min_search_volume=100
        )

        # 강력추천/추천만 필터
        recommended = [
            kw for kw in all_safe
            if kw.recommendation in [
                RecommendationType.STRONGLY_RECOMMEND,
                RecommendationType.RECOMMEND
            ]
        ]

        return recommended[:top_n]

    # ==============================================
    # 5위 보장 판정
    # ==============================================

    def check_guaranteed_top5(
        self,
        scope: KeywordScope,
        raw_predicted_rank: int,
        adjusted_rank: int,
        safety_score: float,
        score_gap: float,
        top10_std: float,
        influencer_count: int,
        high_scorer_count: int
    ) -> Tuple[bool, List[str]]:
        """
        5위 이내 상위노출 보장 여부 판정

        매우 보수적인 조건으로 "확실히 5위 안에 들어갈" 키워드만 선별

        조건 (모두 만족해야 함):
        1. 지역 키워드: 보정 순위 3위 이내 또는 원본 순위 1-2위
        2. 광역 키워드: 보정 순위 2위 이내 또는 원본 순위 1위
        3. 전국 키워드: 보정 순위 1위 (원본 순위 1위 + 최소 마진)
        4. 안전 점수 75점 이상
        5. 점수 여유 +5점 이상
        6. 인플루언서 2명 이하
        7. 70점 이상 고점자 5명 이하

        Returns:
            (is_guaranteed, reasons)
        """
        reasons = []
        is_guaranteed = True

        # 1. 키워드 범위별 순위 조건
        if scope == KeywordScope.LOCAL:
            # 지역: 보정 3위 이내 또는 원본 1-2위
            if adjusted_rank <= 3:
                reasons.append(f"✅ 지역 키워드 보정 {adjusted_rank}위 (3위 이내)")
            elif raw_predicted_rank <= 2:
                reasons.append(f"✅ 지역 키워드 원본 {raw_predicted_rank}위 (2위 이내)")
            else:
                reasons.append(f"❌ 지역 키워드지만 순위 예측이 낮음 (보정 {adjusted_rank}위)")
                is_guaranteed = False

        elif scope == KeywordScope.REGIONAL:
            # 광역: 보정 2위 이내 또는 원본 1위
            if adjusted_rank <= 2:
                reasons.append(f"✅ 광역 키워드 보정 {adjusted_rank}위 (2위 이내)")
            elif raw_predicted_rank == 1:
                reasons.append(f"✅ 광역 키워드 원본 1위")
            else:
                reasons.append(f"❌ 광역 키워드 순위 예측이 낮음 (보정 {adjusted_rank}위)")
                is_guaranteed = False

        else:  # NATIONAL
            # 전국: 보정 1위만 (가장 보수적)
            if adjusted_rank == 1:
                reasons.append(f"✅ 전국 키워드 보정 1위")
            elif raw_predicted_rank == 1 and adjusted_rank <= 2:
                reasons.append(f"✅ 전국 키워드 원본 1위 (보정 {adjusted_rank}위)")
            else:
                reasons.append(f"❌ 전국 키워드는 1위 예측만 보장 (현재 보정 {adjusted_rank}위)")
                is_guaranteed = False

        # 2. 안전 점수 조건 (75점 이상)
        if safety_score >= 75:
            reasons.append(f"✅ 안전 점수 {safety_score}점 (75점 이상)")
        else:
            reasons.append(f"❌ 안전 점수 부족 ({safety_score}점 < 75점)")
            is_guaranteed = False

        # 3. 점수 여유 조건 (+5점 이상)
        if score_gap >= 5:
            reasons.append(f"✅ 점수 여유 +{score_gap:.1f}점 (5점 이상)")
        else:
            reasons.append(f"❌ 점수 여유 부족 ({score_gap:.1f}점 < 5점)")
            is_guaranteed = False

        # 4. 인플루언서 조건 (2명 이하)
        if influencer_count <= 2:
            reasons.append(f"✅ 인플루언서 {influencer_count}명 (2명 이하)")
        else:
            reasons.append(f"❌ 인플루언서 과다 ({influencer_count}명 > 2명)")
            is_guaranteed = False

        # 5. 고점자 조건 (70점 이상 5명 이하)
        if high_scorer_count <= 5:
            reasons.append(f"✅ 고점자(70+) {high_scorer_count}명 (5명 이하)")
        else:
            reasons.append(f"❌ 고점자 과다 ({high_scorer_count}명 > 5명)")
            is_guaranteed = False

        # 6. 경쟁 안정성 조건 (표준편차 12 이하)
        if top10_std <= 12:
            reasons.append(f"✅ 경쟁 안정적 (표준편차 {top10_std:.1f})")
        else:
            reasons.append(f"⚠️ 경쟁 변동성 있음 (표준편차 {top10_std:.1f})")
            # 변동성은 경고만, 보장 취소 안 함

        return is_guaranteed, reasons

    def get_guaranteed_top5_keywords(
        self,
        keywords_data: List[Dict],
        my_score: float,
        min_search_volume: int = 100
    ) -> List[SafetyAnalysis]:
        """
        5위 보장 키워드만 필터링

        Args:
            keywords_data: 키워드 정보 리스트
            my_score: 내 블로그 점수
            min_search_volume: 최소 검색량

        Returns:
            5위 보장 키워드 리스트 (안전 점수 순)
        """
        guaranteed_keywords = []

        for kw_data in keywords_data:
            keyword = kw_data.get('keyword', '')
            top10_scores = kw_data.get('top10_scores', [])
            search_volume = kw_data.get('search_volume', 0)
            influencer_count = kw_data.get('influencer_count', 0)

            # 검색량 필터
            if search_volume < min_search_volume:
                continue

            # 안전성 분석
            analysis = self.analyze_keyword_safety(
                keyword=keyword,
                my_score=my_score,
                top10_scores=top10_scores,
                search_volume=search_volume,
                influencer_count=influencer_count
            )

            # 5위 보장 키워드만 추가
            if analysis.is_guaranteed_top5:
                guaranteed_keywords.append(analysis)

        # 안전 점수 높은 순 정렬
        guaranteed_keywords.sort(key=lambda x: x.safety_score, reverse=True)

        return guaranteed_keywords


# 싱글톤 인스턴스
safe_keyword_selector = SafeKeywordSelector()


# ==============================================
# 유틸리티 함수
# ==============================================

def analyze_keyword_for_blog(
    keyword: str,
    blog_score: float,
    top10_scores: List[float],
    search_volume: int = 0,
    influencer_count: int = 0
) -> Dict:
    """
    블로그 기준 키워드 안전성 분석 (API용 헬퍼)

    Returns:
        분석 결과 딕셔너리
    """
    analysis = safe_keyword_selector.analyze_keyword_safety(
        keyword=keyword,
        my_score=blog_score,
        top10_scores=top10_scores,
        search_volume=search_volume,
        influencer_count=influencer_count
    )

    return {
        'keyword': analysis.keyword,
        'scope': analysis.scope.value,
        'predicted_rank': {
            'raw': analysis.raw_predicted_rank,
            'safety_margin': analysis.safety_margin,
            'adjusted': analysis.adjusted_rank
        },
        'scores': {
            'my_score': analysis.my_score,
            'top10_avg': analysis.top10_avg,
            'top10_min': analysis.top10_min,
            'score_gap': analysis.score_gap,
            'score_buffer_percent': analysis.score_buffer
        },
        'competition': {
            'top10_std': analysis.top10_std,
            'influencer_count': analysis.influencer_count,
            'high_scorer_count': analysis.high_scorer_count
        },
        'safety': {
            'score': analysis.safety_score,
            'grade': analysis.safety_grade.value,
            'confidence': analysis.confidence
        },
        'recommendation': {
            'type': analysis.recommendation.value,
            'reasons': analysis.reasons,
            'tips': analysis.tips
        },
        'search_volume': analysis.search_volume,
        'warnings': analysis.warnings,
        # 5위 보장 여부
        'guaranteed_top5': {
            'is_guaranteed': analysis.is_guaranteed_top5,
            'reasons': analysis.guaranteed_top5_reasons
        }
    }
