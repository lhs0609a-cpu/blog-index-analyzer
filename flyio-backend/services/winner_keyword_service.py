"""
Winner Keyword Service - 1위 보장 키워드 자동 발굴

핵심 가치: "내 블로그 레벨로 지금 당장 1위 할 수 있는 키워드"를 자동으로 찾아준다.

기존 서비스 활용:
- BlueOceanService: BOS 점수 계산, 진입 가능성 분석
- SafeKeywordSelector: 안전 키워드 선별, 5위 보장 판정
- CompetitionAnalyzer: 정밀 경쟁도 분석
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Tuple
from dataclasses import dataclass, field
from enum import Enum

from services.blue_ocean_service import BlueOceanService, BlueOceanKeyword
from services.safe_keyword_selector import SafeKeywordSelector, SafetyGrade, RecommendationType
from services.keyword_analysis_service import KeywordAnalysisService
from database.sqlite_db import get_blog_by_id

logger = logging.getLogger(__name__)


class WinProbability(str, Enum):
    """1위 확률 등급"""
    GUARANTEED = "guaranteed"      # 95%+ : 거의 확실
    VERY_HIGH = "very_high"        # 85-94%: 매우 높음
    HIGH = "high"                  # 70-84%: 높음
    MODERATE = "moderate"          # 50-69%: 보통
    LOW = "low"                    # 50% 미만: 낮음


class GoldenTimeSlot(str, Enum):
    """골든타임 슬롯"""
    MORNING = "morning"            # 오전 9-11시
    LUNCH = "lunch"                # 오후 12-14시
    AFTERNOON = "afternoon"        # 오후 15-17시
    EVENING = "evening"            # 저녁 18-21시
    NIGHT = "night"                # 밤 22-24시


@dataclass
class GoldenTime:
    """골든타임 정보"""
    slot: GoldenTimeSlot
    start_hour: int
    end_hour: int
    day_of_week: Optional[str] = None  # 요일 (None이면 오늘)
    reason: str = ""
    confidence: float = 0.7


@dataclass
class WinnerKeyword:
    """1위 가능 키워드 정보"""
    keyword: str

    # 1위 확률
    win_probability: int  # 0-100%
    win_grade: WinProbability

    # 기본 정보
    search_volume: int  # 월간 검색량
    current_rank1_level: int  # 현재 1위 블로그 레벨
    my_level: int  # 내 블로그 레벨
    level_gap: int  # 레벨 차이 (양수면 내가 높음)

    # 경쟁 정보
    top10_avg_score: float
    top10_min_score: float
    influencer_count: int
    high_scorer_count: int  # 70점 이상 블로그 수

    # 골든타임
    golden_time: Optional[GoldenTime] = None

    # 추가 정보
    bos_score: float = 0.0
    safety_score: float = 0.0

    # 공략 팁
    tips: List[str] = field(default_factory=list)
    why_winnable: List[str] = field(default_factory=list)


@dataclass
class DailyWinnerAnalysis:
    """일일 1위 가능 키워드 분석 결과"""
    my_blog_id: str
    my_level: int
    my_score: float

    analysis_date: datetime

    # 키워드 목록
    guaranteed_keywords: List[WinnerKeyword]  # 95%+ 확률
    high_chance_keywords: List[WinnerKeyword]  # 70-94% 확률
    moderate_keywords: List[WinnerKeyword]  # 50-69% 확률

    # 요약
    total_analyzed: int
    total_winnable: int
    best_keyword: Optional[WinnerKeyword] = None


class WinnerKeywordService:
    """1위 보장 키워드 발굴 서비스"""

    def __init__(self):
        self.blue_ocean_service = BlueOceanService()
        self.safe_selector = SafeKeywordSelector()
        self.keyword_service = KeywordAnalysisService()

        # 카테고리별 골든타임 패턴 (경험적 데이터 기반)
        self.golden_time_patterns: Dict[str, GoldenTime] = {
            "맛집": GoldenTime(GoldenTimeSlot.EVENING, 18, 21, "토요일", "주말 저녁 맛집 검색 피크", 0.85),
            "카페": GoldenTime(GoldenTimeSlot.AFTERNOON, 14, 17, "토요일", "주말 오후 카페 검색 증가", 0.8),
            "여행": GoldenTime(GoldenTimeSlot.NIGHT, 21, 24, "수요일", "주중 밤 여행 계획 검색", 0.75),
            "육아": GoldenTime(GoldenTimeSlot.MORNING, 9, 11, None, "아이 등원 후 검색 증가", 0.8),
            "다이어트": GoldenTime(GoldenTimeSlot.MORNING, 6, 9, "월요일", "새벽/아침 다이어트 동기부여", 0.7),
            "요리": GoldenTime(GoldenTimeSlot.AFTERNOON, 15, 18, None, "저녁 메뉴 고민 시간", 0.75),
            "IT": GoldenTime(GoldenTimeSlot.EVENING, 19, 22, "화요일", "퇴근 후 정보 검색", 0.7),
            "뷰티": GoldenTime(GoldenTimeSlot.NIGHT, 21, 24, None, "저녁 스킨케어 루틴 전", 0.75),
            "패션": GoldenTime(GoldenTimeSlot.LUNCH, 12, 14, None, "점심시간 쇼핑 검색", 0.7),
            "리뷰": GoldenTime(GoldenTimeSlot.EVENING, 20, 23, None, "저녁 구매 결정 전", 0.75),
        }

        # 기본 골든타임 (카테고리 매칭 안될 때)
        self.default_golden_time = GoldenTime(
            GoldenTimeSlot.EVENING, 19, 21, None,
            "저녁 시간대 전반적 검색량 증가", 0.6
        )

    def _calculate_win_probability(
        self,
        my_level: int,
        my_score: float,
        current_rank1_level: int,
        top10_avg_score: float,
        top10_min_score: float,
        influencer_count: int,
        high_scorer_count: int,
        safety_score: float
    ) -> Tuple[int, WinProbability]:
        """
        1위 확률 계산

        핵심 로직:
        1. 내 레벨이 현재 1위보다 높으면 기본 확률 상승
        2. 점수 갭이 클수록 확률 상승
        3. 인플루언서/고점자가 많으면 확률 하락
        4. 안전 점수 반영
        """
        base_probability = 50  # 기본 50%

        # 1. 레벨 갭 보너스 (최대 +30%)
        level_gap = my_level - current_rank1_level
        if level_gap >= 3:
            base_probability += 30
        elif level_gap >= 2:
            base_probability += 25
        elif level_gap >= 1:
            base_probability += 20
        elif level_gap == 0:
            base_probability += 10
        else:
            # 내 레벨이 더 낮으면 페널티
            base_probability += max(-30, level_gap * 10)

        # 2. 점수 갭 보너스 (최대 +20%)
        score_gap = my_score - top10_min_score
        if score_gap >= 15:
            base_probability += 20
        elif score_gap >= 10:
            base_probability += 15
        elif score_gap >= 5:
            base_probability += 10
        elif score_gap >= 0:
            base_probability += 5
        else:
            base_probability += max(-20, int(score_gap))

        # 3. 인플루언서 페널티 (최대 -20%)
        influencer_penalty = min(20, influencer_count * 7)
        base_probability -= influencer_penalty

        # 4. 고점자 페널티 (최대 -15%)
        if high_scorer_count >= 7:
            base_probability -= 15
        elif high_scorer_count >= 5:
            base_probability -= 10
        elif high_scorer_count >= 3:
            base_probability -= 5

        # 5. 안전 점수 가중치 (±10%)
        if safety_score >= 80:
            base_probability += 10
        elif safety_score >= 60:
            base_probability += 5
        elif safety_score < 40:
            base_probability -= 10

        # 확률 범위 제한
        probability = max(5, min(98, base_probability))

        # 등급 결정
        if probability >= 95:
            grade = WinProbability.GUARANTEED
        elif probability >= 85:
            grade = WinProbability.VERY_HIGH
        elif probability >= 70:
            grade = WinProbability.HIGH
        elif probability >= 50:
            grade = WinProbability.MODERATE
        else:
            grade = WinProbability.LOW

        return probability, grade

    def _detect_category(self, keyword: str) -> Optional[str]:
        """키워드에서 카테고리 감지"""
        category_keywords = {
            "맛집": ["맛집", "맛있는", "음식점", "레스토랑", "식당", "먹방"],
            "카페": ["카페", "커피", "디저트", "베이커리", "브런치"],
            "여행": ["여행", "관광", "숙소", "호텔", "펜션", "명소", "투어"],
            "육아": ["육아", "아기", "유아", "아이", "키즈", "출산", "임신"],
            "다이어트": ["다이어트", "헬스", "운동", "피트니스", "살빼기", "체중"],
            "요리": ["요리", "레시피", "음식", "만들기", "요리법", "반찬"],
            "IT": ["아이폰", "갤럭시", "노트북", "컴퓨터", "앱", "프로그램", "IT"],
            "뷰티": ["화장품", "스킨케어", "메이크업", "뷰티", "피부", "미용"],
            "패션": ["패션", "코디", "옷", "스타일", "의류", "쇼핑"],
            "리뷰": ["리뷰", "후기", "솔직", "사용기", "비교", "추천"],
        }

        keyword_lower = keyword.lower()
        for category, keywords in category_keywords.items():
            for kw in keywords:
                if kw in keyword_lower:
                    return category
        return None

    def _get_golden_time(self, keyword: str) -> GoldenTime:
        """키워드에 맞는 골든타임 반환"""
        category = self._detect_category(keyword)
        if category and category in self.golden_time_patterns:
            return self.golden_time_patterns[category]
        return self.default_golden_time

    def _generate_why_winnable(
        self,
        my_level: int,
        current_rank1_level: int,
        score_gap: float,
        influencer_count: int,
        high_scorer_count: int
    ) -> List[str]:
        """왜 1위 가능한지 이유 생성"""
        reasons = []

        level_gap = my_level - current_rank1_level
        if level_gap >= 2:
            reasons.append(f"내 레벨({my_level})이 현재 1위({current_rank1_level})보다 {level_gap}단계 높음")
        elif level_gap == 1:
            reasons.append(f"내 레벨({my_level})이 현재 1위({current_rank1_level})보다 1단계 높음")
        elif level_gap == 0:
            reasons.append(f"현재 1위와 같은 레벨 - 콘텐츠 품질로 승부 가능")

        if score_gap >= 10:
            reasons.append(f"상위 10위 최저 점수보다 +{int(score_gap)}점 여유")
        elif score_gap >= 5:
            reasons.append(f"상위 10위 진입 점수 충분")

        if influencer_count == 0:
            reasons.append("상위권에 인플루언서 없음")
        elif influencer_count == 1:
            reasons.append("상위권 인플루언서 1명뿐")

        if high_scorer_count <= 2:
            reasons.append("고점자(70+) 블로그가 적어 진입 용이")

        return reasons

    def _generate_tips(
        self,
        keyword: str,
        win_probability: int,
        golden_time: GoldenTime
    ) -> List[str]:
        """공략 팁 생성"""
        tips = []

        # 골든타임 팁
        time_str = f"{golden_time.start_hour}~{golden_time.end_hour}시"
        if golden_time.day_of_week:
            tips.append(f"{golden_time.day_of_week} {time_str}에 발행하면 최적")
        else:
            tips.append(f"오늘 {time_str}에 발행 추천")

        # 확률별 팁
        if win_probability >= 90:
            tips.append("지금 바로 작성해도 1위 가능성 높음")
        elif win_probability >= 70:
            tips.append("제목에 키워드 정확히 포함하면 1위 가능")
            tips.append("이미지 10장 이상 권장")
        else:
            tips.append("글자 수 2,500자 이상 권장")
            tips.append("소제목 3개 이상 구성 권장")

        return tips

    async def find_winner_keywords(
        self,
        my_blog_id: str,
        category_keywords: List[str],
        min_search_volume: int = 500,
        max_keywords: int = 20,
        min_win_probability: int = 50
    ) -> DailyWinnerAnalysis:
        """
        1위 가능 키워드 발굴

        Args:
            my_blog_id: 내 블로그 ID
            category_keywords: 분석할 카테고리 키워드 목록
            min_search_volume: 최소 월간 검색량
            max_keywords: 최대 반환 키워드 수
            min_win_probability: 최소 1위 확률 (%)
        """
        # 1. 내 블로그 정보 조회
        my_blog = await get_blog_by_id(my_blog_id)
        if not my_blog:
            raise ValueError(f"블로그를 찾을 수 없습니다: {my_blog_id}")

        my_level = my_blog.get("level", 0)
        my_score = my_blog.get("total_score", 0)

        logger.info(f"1위 가능 키워드 분석 시작: blog_id={my_blog_id}, level={my_level}, score={my_score}")

        # 2. 각 카테고리 키워드로 블루오션 분석
        all_candidates: List[WinnerKeyword] = []
        total_analyzed = 0

        for main_keyword in category_keywords:
            try:
                # 블루오션 분석 수행
                blue_ocean_result = await self.blue_ocean_service.analyze_blue_ocean(
                    main_keyword=main_keyword,
                    my_blog_id=my_blog_id,
                    expand=True,
                    min_search_volume=min_search_volume,
                    max_keywords=30
                )

                total_analyzed += len(blue_ocean_result.keywords)

                # 각 키워드에 대해 1위 가능성 분석
                for bo_keyword in blue_ocean_result.keywords:
                    # 현재 1위 블로그 레벨 추정 (상위 10위 평균의 0.8 = 대략 1위 레벨)
                    current_rank1_level = self._estimate_rank1_level(bo_keyword.top10_avg_score)

                    # 고점자 수 계산 (70점 이상)
                    high_scorer_count = sum(1 for s in getattr(bo_keyword, 'top10_scores', []) if s >= 70)

                    # 안전 점수 가져오기
                    safety_score = getattr(bo_keyword, 'safety_score', 50)

                    # 1위 확률 계산
                    win_prob, win_grade = self._calculate_win_probability(
                        my_level=my_level,
                        my_score=my_score,
                        current_rank1_level=current_rank1_level,
                        top10_avg_score=bo_keyword.top10_avg_score,
                        top10_min_score=bo_keyword.top10_min_score,
                        influencer_count=bo_keyword.influencer_count,
                        high_scorer_count=high_scorer_count,
                        safety_score=safety_score
                    )

                    # 최소 확률 미만은 제외
                    if win_prob < min_win_probability:
                        continue

                    # 레벨 갭 계산
                    level_gap = my_level - current_rank1_level

                    # 골든타임 계산
                    golden_time = self._get_golden_time(bo_keyword.keyword)

                    # 왜 1위 가능한지 이유
                    why_winnable = self._generate_why_winnable(
                        my_level=my_level,
                        current_rank1_level=current_rank1_level,
                        score_gap=my_score - bo_keyword.top10_min_score,
                        influencer_count=bo_keyword.influencer_count,
                        high_scorer_count=high_scorer_count
                    )

                    # 팁 생성
                    tips = self._generate_tips(
                        keyword=bo_keyword.keyword,
                        win_probability=win_prob,
                        golden_time=golden_time
                    )

                    # WinnerKeyword 생성
                    winner = WinnerKeyword(
                        keyword=bo_keyword.keyword,
                        win_probability=win_prob,
                        win_grade=win_grade,
                        search_volume=bo_keyword.search_volume,
                        current_rank1_level=current_rank1_level,
                        my_level=my_level,
                        level_gap=level_gap,
                        top10_avg_score=bo_keyword.top10_avg_score,
                        top10_min_score=bo_keyword.top10_min_score,
                        influencer_count=bo_keyword.influencer_count,
                        high_scorer_count=high_scorer_count,
                        golden_time=golden_time,
                        bos_score=bo_keyword.bos_score,
                        safety_score=safety_score,
                        tips=tips,
                        why_winnable=why_winnable
                    )

                    all_candidates.append(winner)

            except Exception as e:
                logger.error(f"키워드 분석 실패: {main_keyword}, error={e}")
                continue

        # 3. 확률 순으로 정렬
        all_candidates.sort(key=lambda x: x.win_probability, reverse=True)

        # 4. 등급별 분류
        guaranteed = [k for k in all_candidates if k.win_grade == WinProbability.GUARANTEED][:max_keywords]
        high_chance = [k for k in all_candidates if k.win_grade in (WinProbability.VERY_HIGH, WinProbability.HIGH)][:max_keywords]
        moderate = [k for k in all_candidates if k.win_grade == WinProbability.MODERATE][:max_keywords]

        # 5. 최고 키워드 선정
        best_keyword = all_candidates[0] if all_candidates else None

        return DailyWinnerAnalysis(
            my_blog_id=my_blog_id,
            my_level=my_level,
            my_score=my_score,
            analysis_date=datetime.now(),
            guaranteed_keywords=guaranteed,
            high_chance_keywords=high_chance,
            moderate_keywords=moderate,
            total_analyzed=total_analyzed,
            total_winnable=len(all_candidates),
            best_keyword=best_keyword
        )

    def _estimate_rank1_level(self, top10_avg_score: float) -> int:
        """상위 10위 평균 점수로 1위 블로그 레벨 추정"""
        # 대략적인 매핑: 점수 = 레벨 * 8 + 기본
        estimated_score = top10_avg_score * 1.15  # 1위는 평균보다 약 15% 높음

        if estimated_score >= 88:
            return 11
        elif estimated_score >= 80:
            return 10
        elif estimated_score >= 72:
            return 9
        elif estimated_score >= 64:
            return 8
        elif estimated_score >= 56:
            return 7
        elif estimated_score >= 48:
            return 6
        elif estimated_score >= 40:
            return 5
        elif estimated_score >= 32:
            return 4
        elif estimated_score >= 24:
            return 3
        elif estimated_score >= 16:
            return 2
        elif estimated_score >= 8:
            return 1
        else:
            return 0

    async def get_quick_winners(
        self,
        my_blog_id: str,
        limit: int = 5
    ) -> List[WinnerKeyword]:
        """
        빠른 1위 가능 키워드 조회 (캐시된 결과 또는 기본 카테고리)

        대시보드 위젯용 - 빠른 응답 필요
        """
        # 기본 인기 카테고리
        default_categories = ["맛집", "카페", "여행", "리뷰", "뷰티"]

        result = await self.find_winner_keywords(
            my_blog_id=my_blog_id,
            category_keywords=default_categories,
            min_search_volume=500,
            max_keywords=limit,
            min_win_probability=70  # 높은 확률만
        )

        # 확률 순으로 상위 N개 반환
        all_winners = (
            result.guaranteed_keywords +
            result.high_chance_keywords
        )[:limit]

        return all_winners


# 싱글톤 인스턴스
_winner_service: Optional[WinnerKeywordService] = None


def get_winner_keyword_service() -> WinnerKeywordService:
    """WinnerKeywordService 싱글톤 인스턴스 반환"""
    global _winner_service
    if _winner_service is None:
        _winner_service = WinnerKeywordService()
    return _winner_service
