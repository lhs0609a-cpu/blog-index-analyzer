"""
블루오션 키워드 발굴 서비스

블루오션 스코어(BOS) = 검색량이 높고 경쟁이 낮은 키워드를 발굴

공식:
BOS = (검색량 점수 × 블로그탭 비율 × 100) / (경쟁 점수 + 1)

Where:
- 검색량 점수: log10(검색량) / log10(1,000,000) normalized
- 블로그탭 비율: 블로그 노출 비중 (0~1)
- 경쟁 점수: 상위10 평균점수 / 100 + 인플루언서 비율 × 0.5

2024-12 피드백 반영:
- 전국 키워드 7위 이하 예측 → 실제 10위권 밖 문제 해결
- 안전 마진 시스템 도입
- 지역/전국 키워드 차별화
"""
import math
import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum

import httpx

from services.keyword_analysis_service import keyword_analysis_service
from services.safe_keyword_selector import (
    safe_keyword_selector, SafetyAnalysis, SafetyGrade,
    RecommendationType, KeywordScope, SearchIntent
)
from config import settings

logger = logging.getLogger(__name__)


class BOSRating(str, Enum):
    """블루오션 등급"""
    GOLD = "gold"        # BOS 80+ (황금 키워드)
    SILVER = "silver"    # BOS 60-79 (좋은 기회)
    BRONZE = "bronze"    # BOS 40-59 (도전 가능)
    IRON = "iron"        # BOS 20-39 (경쟁 있음)
    BLOCKED = "blocked"  # BOS 0-19 (레드오션)


class EntryChance(str, Enum):
    """진입 가능성"""
    HIGH = "높음"         # 80%+ 가능성
    MEDIUM = "보통"       # 50-79% 가능성
    LOW = "낮음"          # 20-49% 가능성
    VERY_LOW = "매우낮음"  # 0-19% 가능성


@dataclass
class BlueOceanKeyword:
    """블루오션 키워드 결과"""
    keyword: str
    search_volume: int              # 월간 검색량
    blog_ratio: float               # 블로그탭 비율 (0-1)
    top10_avg_score: float          # 상위10 평균 점수
    top10_min_score: float          # 상위10 최저 점수
    influencer_count: int           # 인플루언서 수 (상위10 중)
    bos_score: float                # 블루오션 스코어 (0-100)
    bos_rating: BOSRating           # 블루오션 등급
    entry_chance: EntryChance       # 진입 가능성
    entry_percentage: int           # 진입 확률 (%)
    my_score_gap: Optional[float]   # 내 블로그와의 점수 차이
    recommended_content_length: int  # 권장 글자수
    recommended_image_count: int     # 권장 사진수
    tips: List[str]                 # 공략 팁

    # 2024-12 추가: 안전 분석 결과
    keyword_scope: str = "전국"             # 키워드 범위 (지역/광역/전국/브랜드)
    raw_predicted_rank: int = 10            # 원본 예측 순위
    safety_margin: int = 0                  # 적용된 안전 마진
    adjusted_rank: int = 10                 # 보정된 순위
    safety_score: float = 0.0               # 안전 지수 (0-100)
    safety_grade: str = "보통"              # 안전 등급
    recommendation_type: str = "조건부추천"  # 추천 유형
    warnings: List[str] = field(default_factory=list)  # 경고 메시지

    # 2025-01 추가: 브랜드/검색의도 분석
    is_brand_keyword: bool = False          # 브랜드/병원명 키워드 여부
    search_intent: str = "정보형"           # 검색 의도 (네비게이션/정보형/거래형/지역탐색)
    has_official_blog: bool = False         # 공식 블로그 존재 여부
    official_blog_rank: Optional[int] = None  # 공식 블로그 순위

    # 2025-01 추가: 정밀 경쟁도 분석
    content_relevance_score: float = 0.0    # 콘텐츠 적합도 점수 (0-100)
    freshness_score: float = 0.0            # 최신성 점수 (0-100, 높을수록 최신 글 많음)
    engagement_score: float = 0.0           # 참여도 점수 (0-100)
    total_competition_score: float = 0.0    # 종합 경쟁도 점수 (0-100, 높을수록 경쟁 치열)
    competition_difficulty: str = "보통"     # 경쟁 난이도 (매우쉬움/쉬움/보통/어려움/매우어려움)
    competition_insights: List[str] = field(default_factory=list)  # 경쟁도 인사이트


@dataclass
class BlueOceanAnalysis:
    """블루오션 분석 결과"""
    main_keyword: str
    my_blog_score: Optional[float]
    my_blog_level: Optional[int]
    keywords: List[BlueOceanKeyword]
    gold_keywords: List[BlueOceanKeyword]   # BOS 80+
    silver_keywords: List[BlueOceanKeyword]  # BOS 60-79
    total_analyzed: int
    analysis_summary: Dict[str, Any]


class BlueOceanService:
    """블루오션 키워드 발굴 서비스"""

    def __init__(self):
        self.http_client = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self.http_client is None:
            self.http_client = httpx.AsyncClient(timeout=60.0)
        return self.http_client

    async def close(self):
        if self.http_client:
            await self.http_client.aclose()
            self.http_client = None

    def calculate_bos(
        self,
        search_volume: int,
        blog_ratio: float,
        top10_avg_score: float,
        influencer_ratio: float = 0.0
    ) -> float:
        """
        블루오션 스코어 계산

        BOS = (검색량 점수 × 블로그비율 × 100) / (경쟁 점수 + 0.5)

        - 검색량 점수: log10(검색량) 정규화 (0~1)
        - 블로그비율: 검색결과에서 블로그 비중 (0~1)
        - 경쟁 점수: (상위10 평균점수/100) + (인플루언서비율 × 0.3)
        """
        # 검색량 점수 (로그 스케일, 최소 10 이상)
        if search_volume < 10:
            volume_score = 0.0
        else:
            # log10(1,000,000) = 6
            volume_score = min(1.0, math.log10(max(search_volume, 10)) / 6)

        # 블로그 비율 (0~1, 최소 0.1 보장)
        blog_score = max(0.1, min(1.0, blog_ratio))

        # 경쟁 점수 (낮을수록 좋음)
        competition_score = (top10_avg_score / 100) + (influencer_ratio * 0.3)
        competition_score = max(0.1, min(2.0, competition_score))

        # BOS 계산
        bos = (volume_score * blog_score * 100) / (competition_score + 0.3)

        # 0-100 범위로 정규화
        bos = max(0, min(100, bos))

        return round(bos, 1)

    def get_bos_rating(self, bos_score: float) -> BOSRating:
        """BOS 점수에 따른 등급 반환"""
        if bos_score >= 80:
            return BOSRating.GOLD
        elif bos_score >= 60:
            return BOSRating.SILVER
        elif bos_score >= 40:
            return BOSRating.BRONZE
        elif bos_score >= 20:
            return BOSRating.IRON
        else:
            return BOSRating.BLOCKED

    def calculate_entry_chance(
        self,
        my_score: Optional[float],
        top10_avg_score: float,
        top10_min_score: float,
        influencer_count: int
    ) -> Tuple[EntryChance, int]:
        """
        진입 가능성 계산

        Returns: (진입 가능성, 진입 확률 %)
        """
        if my_score is None:
            # 내 블로그 정보 없으면 상위10 평균 기준으로 일반 추정
            if top10_avg_score < 45:
                return EntryChance.HIGH, 75
            elif top10_avg_score < 55:
                return EntryChance.MEDIUM, 55
            elif top10_avg_score < 70:
                return EntryChance.LOW, 30
            else:
                return EntryChance.VERY_LOW, 10

        # 인플루언서 패널티 (인플루언서 많으면 진입 어려움)
        influencer_penalty = influencer_count * 5

        # 점수 갭 기반 계산
        score_gap = my_score - top10_min_score

        # 기본 확률 계산
        if score_gap >= 10:
            # 최저 점수보다 10점 이상 높으면 높은 확률
            base_percentage = 90
        elif score_gap >= 0:
            # 최저 점수와 비슷하면 중간 확률
            base_percentage = 70 + (score_gap * 2)
        elif score_gap >= -10:
            # 최저 점수보다 10점까지 낮으면 도전 가능
            base_percentage = 50 + (score_gap * 2)
        elif score_gap >= -20:
            # 최저 점수보다 20점까지 낮으면 낮은 확률
            base_percentage = 30 + (score_gap + 10) * 2
        else:
            # 20점 이상 차이나면 매우 낮음
            base_percentage = max(5, 20 + score_gap)

        # 인플루언서 패널티 적용
        final_percentage = max(0, min(100, int(base_percentage - influencer_penalty)))

        # 등급 결정
        if final_percentage >= 70:
            chance = EntryChance.HIGH
        elif final_percentage >= 50:
            chance = EntryChance.MEDIUM
        elif final_percentage >= 20:
            chance = EntryChance.LOW
        else:
            chance = EntryChance.VERY_LOW

        return chance, final_percentage

    def generate_tips(
        self,
        keyword: str,
        bos_score: float,
        my_score: Optional[float],
        top10_avg_score: float,
        top10_min_score: float,
        avg_content_length: int,
        avg_image_count: int
    ) -> List[str]:
        """키워드 공략 팁 생성"""
        tips = []

        if bos_score >= 70:
            tips.append("🎯 블루오션 키워드! 빠르게 선점하세요.")

        if my_score:
            gap = top10_min_score - my_score
            if gap > 0:
                tips.append(f"📈 상위 진입까지 약 {gap:.0f}점 필요합니다.")
            else:
                tips.append(f"✅ 현재 점수로 상위 진입 가능성이 높습니다.")

        if avg_content_length > 0:
            tips.append(f"📝 권장 글자수: {avg_content_length:,}자 이상")

        if avg_image_count > 0:
            tips.append(f"📷 권장 사진수: {avg_image_count}장 이상")

        if top10_avg_score < 50:
            tips.append("💡 경쟁이 낮아 신규 블로거도 도전 가능합니다.")
        elif top10_avg_score > 70:
            tips.append("⚠️ 상위 진입이 어려운 경쟁 키워드입니다.")

        return tips

    async def analyze_blue_ocean(
        self,
        main_keyword: str,
        my_blog_id: Optional[str] = None,
        expand: bool = True,
        min_search_volume: int = 100,
        max_keywords: int = 30
    ) -> BlueOceanAnalysis:
        """
        블루오션 키워드 종합 분석

        1. 메인 키워드 분석
        2. 연관 키워드 확장
        3. 각 키워드별 BOS 계산
        4. 내 블로그 맞춤 추천
        """
        from routers.blogs import search_keyword_with_tabs, analyze_blog

        try:
            # 1. 내 블로그 정보 조회
            my_blog_score = None
            my_blog_level = None

            if my_blog_id:
                try:
                    my_blog_data = await analyze_blog(my_blog_id)
                    if my_blog_data and my_blog_data.index:
                        my_blog_score = my_blog_data.index.total_score
                        my_blog_level = my_blog_data.index.level
                except Exception as e:
                    logger.warning(f"Failed to get my blog info: {e}")

            # 2. 키워드 분석 (기존 서비스 활용)
            analysis_result = await keyword_analysis_service.analyze_keyword(
                keyword=main_keyword,
                expand_related=expand,
                min_search_volume=min_search_volume,
                max_keywords=max_keywords,
                my_blog_id=my_blog_id
            )

            # 3. 각 키워드에 대해 BOS 계산
            blue_ocean_keywords = []

            # 메인 키워드 먼저 분석
            keywords_to_analyze = [kw for kw in analysis_result.keywords]

            # 세마포어로 동시 요청 제한
            semaphore = asyncio.Semaphore(3)

            async def analyze_single_keyword(kw_data) -> Optional[BlueOceanKeyword]:
                async with semaphore:
                    try:
                        # 상위 블로그 분석
                        search_result = await search_keyword_with_tabs(
                            kw_data.keyword,
                            limit=10,
                            analyze_content=True
                        )

                        if not search_result or not search_result.results:
                            return None

                        # 상위 10개 통계 계산
                        scores = []
                        influencer_count = 0
                        content_lengths = []
                        image_counts = []
                        blog_names = []  # 공식 블로그 감지용
                        posts_data = []  # 경쟁도 정밀 분석용

                        for blog in search_result.results[:10]:
                            if blog.index:
                                scores.append(blog.index.total_score)
                            # ⚠️ BlogResult 에는 is_influencer 가 없다(그 필드는 BlogStatsResponse 쪽).
                            # 이 한 줄이 AttributeError 를 던져 **모든 키워드 분석이 죽었고**,
                            # 블루오션/1위키워드가 항상 빈 결과를 돌려주고 있었다 (2026-08-05 발견).
                            # 검색 결과에는 인플루언서 표식이 없으므로 여기서는 셀 수 없다.
                            # 셀 수 없는 값을 0으로 두고 '인플루언서 없음'이라 말하면 안 된다
                            # → 아래 경쟁 강도 판단은 실측되는 고점자 수(70점 이상)로 한다.
                            if getattr(blog, "is_influencer", False):
                                influencer_count += 1

                            # 포스트 분석 데이터 수집
                            post_data = {}
                            if blog.post_analysis:
                                if blog.post_analysis.content_length:
                                    content_lengths.append(blog.post_analysis.content_length)
                                if blog.post_analysis.image_count:
                                    image_counts.append(blog.post_analysis.image_count)

                                # 경쟁도 분석용 데이터
                                post_data = {
                                    'title_has_keyword': blog.post_analysis.title_has_keyword,
                                    'keyword_density': blog.post_analysis.keyword_density,
                                    'keyword_count': blog.post_analysis.keyword_count,
                                    'post_age_days': blog.post_analysis.post_age_days,
                                    'like_count': blog.post_analysis.like_count,
                                    'comment_count': blog.post_analysis.comment_count,
                                    'content_length': blog.post_analysis.content_length,
                                    'image_count': blog.post_analysis.image_count,
                                }
                            posts_data.append(post_data)

                            # 블로그 이름 수집 (공식 블로그 감지용)
                            if hasattr(blog, 'blog_name') and blog.blog_name:
                                blog_names.append(blog.blog_name)
                            elif hasattr(blog, 'title') and blog.title:
                                blog_names.append(blog.title)
                            else:
                                blog_names.append("")

                        if not scores:
                            return None

                        top10_avg = sum(scores) / len(scores)
                        top10_min = min(scores)
                        influencer_ratio = influencer_count / 10

                        # 블로그 탭 비율 계산
                        blog_ratio = 0.5  # 기본값
                        if hasattr(search_result, 'insights') and search_result.insights:
                            # insights에서 블로그 비율 가져오기 (구현 필요시)
                            pass

                        # BOS 계산
                        bos_score = self.calculate_bos(
                            search_volume=kw_data.monthly_total_search,
                            blog_ratio=blog_ratio,
                            top10_avg_score=top10_avg,
                            influencer_ratio=influencer_ratio
                        )

                        bos_rating = self.get_bos_rating(bos_score)

                        # 진입 가능성 계산
                        entry_chance, entry_percentage = self.calculate_entry_chance(
                            my_score=my_blog_score,
                            top10_avg_score=top10_avg,
                            top10_min_score=top10_min,
                            influencer_count=influencer_count
                        )

                        # 권장 콘텐츠 스펙
                        avg_content_length = int(sum(content_lengths) / len(content_lengths)) if content_lengths else 2500
                        avg_image_count = int(sum(image_counts) / len(image_counts)) if image_counts else 20

                        # 2024-12: 안전 분석 추가 (2025-01: 브랜드/공식블로그/정밀경쟁도 감지 추가)
                        safety_analysis = None
                        if my_blog_score:
                            safety_analysis = safe_keyword_selector.analyze_keyword_safety(
                                keyword=kw_data.keyword,
                                my_score=my_blog_score,
                                top10_scores=scores,
                                search_volume=kw_data.monthly_total_search,
                                influencer_count=influencer_count,
                                top10_blog_names=blog_names,  # 공식 블로그 감지용
                                posts_data=posts_data  # 정밀 경쟁도 분석용
                            )

                            # 안전 분석 기반으로 진입 가능성 재계산
                            # 피드백 반영: 7위 이하는 진입 어려움으로 표시

                            # 2025-01: 브랜드 키워드는 무조건 진입 매우 어려움
                            if safety_analysis.is_brand_keyword or safety_analysis.scope == KeywordScope.BRAND:
                                entry_chance = EntryChance.VERY_LOW
                                entry_percentage = 5  # 사실상 불가능
                            elif safety_analysis.adjusted_rank <= 3:
                                entry_chance = EntryChance.HIGH
                                entry_percentage = min(90, entry_percentage + 10)
                            elif safety_analysis.adjusted_rank <= 6:
                                entry_chance = EntryChance.MEDIUM
                                entry_percentage = min(70, entry_percentage)
                            elif safety_analysis.adjusted_rank <= 8:
                                entry_chance = EntryChance.LOW
                                entry_percentage = min(40, entry_percentage - 20)
                            else:
                                entry_chance = EntryChance.VERY_LOW
                                entry_percentage = min(15, entry_percentage - 40)

                        # 팁 생성 (안전 분석 결과 포함)
                        tips = self.generate_tips(
                            keyword=kw_data.keyword,
                            bos_score=bos_score,
                            my_score=my_blog_score,
                            top10_avg_score=top10_avg,
                            top10_min_score=top10_min,
                            avg_content_length=avg_content_length,
                            avg_image_count=avg_image_count
                        )

                        # 안전 분석 팁 추가
                        if safety_analysis:
                            tips = safety_analysis.tips + tips
                            if safety_analysis.warnings:
                                tips = safety_analysis.warnings + tips

                        return BlueOceanKeyword(
                            keyword=kw_data.keyword,
                            search_volume=kw_data.monthly_total_search,
                            blog_ratio=blog_ratio,
                            top10_avg_score=round(top10_avg, 1),
                            top10_min_score=round(top10_min, 1),
                            influencer_count=influencer_count,
                            bos_score=bos_score,
                            bos_rating=bos_rating,
                            entry_chance=entry_chance,
                            entry_percentage=entry_percentage,
                            my_score_gap=round(my_blog_score - top10_min, 1) if my_blog_score else None,
                            recommended_content_length=avg_content_length,
                            recommended_image_count=avg_image_count,
                            tips=tips,
                            # 안전 분석 결과
                            keyword_scope=safety_analysis.scope.value if safety_analysis else "전국",
                            raw_predicted_rank=safety_analysis.raw_predicted_rank if safety_analysis else 10,
                            safety_margin=safety_analysis.safety_margin if safety_analysis else 0,
                            adjusted_rank=safety_analysis.adjusted_rank if safety_analysis else 10,
                            safety_score=safety_analysis.safety_score if safety_analysis else 0.0,
                            safety_grade=safety_analysis.safety_grade.value if safety_analysis else "보통",
                            recommendation_type=safety_analysis.recommendation.value if safety_analysis else "조건부추천",
                            warnings=safety_analysis.warnings if safety_analysis else [],
                            # 2025-01 추가: 브랜드/검색의도 분석
                            is_brand_keyword=safety_analysis.is_brand_keyword if safety_analysis else False,
                            search_intent=safety_analysis.search_intent.value if safety_analysis else "정보형",
                            has_official_blog=safety_analysis.has_official_blog if safety_analysis else False,
                            official_blog_rank=safety_analysis.official_blog_rank if safety_analysis else None,
                            # 2025-01 추가: 정밀 경쟁도 분석
                            content_relevance_score=safety_analysis.content_relevance_score if safety_analysis else 0.0,
                            freshness_score=safety_analysis.freshness_score if safety_analysis else 0.0,
                            engagement_score=safety_analysis.engagement_score if safety_analysis else 0.0,
                            total_competition_score=safety_analysis.total_competition_score if safety_analysis else 0.0,
                            competition_difficulty=safety_analysis.competition_difficulty if safety_analysis else "보통",
                            competition_insights=safety_analysis.competition_analysis.insights if (safety_analysis and safety_analysis.competition_analysis) else []
                        )

                    except Exception as e:
                        logger.error(f"Error analyzing keyword '{kw_data.keyword}': {e}")
                        return None

            # 병렬 분석 실행
            tasks = [analyze_single_keyword(kw) for kw in keywords_to_analyze[:max_keywords]]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for result in results:
                if isinstance(result, BlueOceanKeyword):
                    blue_ocean_keywords.append(result)

            # BOS 점수순 정렬
            blue_ocean_keywords.sort(key=lambda x: x.bos_score, reverse=True)

            # 등급별 분류
            gold_keywords = [k for k in blue_ocean_keywords if k.bos_rating == BOSRating.GOLD]
            silver_keywords = [k for k in blue_ocean_keywords if k.bos_rating == BOSRating.SILVER]

            # 분석 요약
            summary = {
                "total_keywords": len(blue_ocean_keywords),
                "gold_count": len(gold_keywords),
                "silver_count": len(silver_keywords),
                "avg_bos_score": round(sum(k.bos_score for k in blue_ocean_keywords) / len(blue_ocean_keywords), 1) if blue_ocean_keywords else 0,
                "best_keyword": gold_keywords[0].keyword if gold_keywords else (silver_keywords[0].keyword if silver_keywords else None),
                "recommendation": self._generate_summary_recommendation(
                    gold_keywords, silver_keywords, my_blog_score
                )
            }

            return BlueOceanAnalysis(
                main_keyword=main_keyword,
                my_blog_score=my_blog_score,
                my_blog_level=my_blog_level,
                keywords=blue_ocean_keywords,
                gold_keywords=gold_keywords,
                silver_keywords=silver_keywords,
                total_analyzed=len(blue_ocean_keywords),
                analysis_summary=summary
            )

        except Exception as e:
            logger.error(f"Error in blue ocean analysis: {e}")
            return BlueOceanAnalysis(
                main_keyword=main_keyword,
                my_blog_score=None,
                my_blog_level=None,
                keywords=[],
                gold_keywords=[],
                silver_keywords=[],
                total_analyzed=0,
                analysis_summary={"error": str(e)}
            )

    def _generate_summary_recommendation(
        self,
        gold_keywords: List[BlueOceanKeyword],
        silver_keywords: List[BlueOceanKeyword],
        my_blog_score: Optional[float]
    ) -> str:
        """분석 요약 추천 메시지 생성"""
        if gold_keywords:
            top_gold = gold_keywords[0]
            msg = f"🏆 '{top_gold.keyword}' 키워드가 블루오션입니다! (BOS: {top_gold.bos_score}점)"
            if my_blog_score:
                if top_gold.entry_percentage >= 70:
                    msg += " 현재 블로그 점수로 상위 진입 가능성이 높습니다."
                else:
                    msg += f" 상위 진입까지 약 {abs(top_gold.my_score_gap or 0):.0f}점 필요합니다."
            return msg

        if silver_keywords:
            top_silver = silver_keywords[0]
            return f"💎 '{top_silver.keyword}' 키워드를 추천합니다. (BOS: {top_silver.bos_score}점)"

        return "이 카테고리는 경쟁이 높습니다. 더 세부적인 키워드를 찾아보세요."


# Singleton instance
blue_ocean_service = BlueOceanService()
