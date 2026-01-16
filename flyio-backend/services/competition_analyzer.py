"""
경쟁도 정밀 분석 서비스 (Competition Analyzer)

기존 문제점:
- 블로그 점수만으로 경쟁도 판단
- 점수가 낮아도 키워드 특화 블로그면 이기기 어려움

개선 방향:
1. 콘텐츠 적합도 분석 (25%)
2. 최신성 분석 (15%)
3. 키워드 전문성 분석 (15%)
4. 블로그 점수 분석 (30%)
5. 참여도 분석 (15%)
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
import numpy as np

logger = logging.getLogger(__name__)


class CompetitionDifficulty(str, Enum):
    """경쟁 난이도"""
    VERY_EASY = "매우쉬움"      # 90%+ 진입 가능
    EASY = "쉬움"              # 70-89% 진입 가능
    MODERATE = "보통"          # 50-69% 진입 가능
    HARD = "어려움"            # 30-49% 진입 가능
    VERY_HARD = "매우어려움"    # 30% 미만


@dataclass
class ContentRelevanceScore:
    """콘텐츠 적합도 점수"""
    title_keyword_ratio: float = 0.0      # 제목에 키워드 포함 비율 (상위10 중)
    avg_keyword_density: float = 0.0      # 평균 키워드 밀도
    avg_keyword_count: float = 0.0        # 평균 키워드 등장 횟수
    high_relevance_count: int = 0         # 높은 적합도 블로그 수 (키워드 밀도 > 1%)
    score: float = 0.0                    # 종합 점수 (0-100)


@dataclass
class FreshnessScore:
    """최신성 점수"""
    avg_post_age_days: float = 0.0        # 평균 포스트 나이 (일)
    recent_7days_ratio: float = 0.0       # 최근 7일 내 글 비율
    recent_30days_ratio: float = 0.0      # 최근 30일 내 글 비율
    oldest_post_days: int = 0             # 가장 오래된 글 (일)
    newest_post_days: int = 0             # 가장 최신 글 (일)
    score: float = 0.0                    # 종합 점수 (0-100, 낮을수록 최신)


@dataclass
class EngagementScore:
    """참여도 점수 (공감, 댓글)"""
    avg_like_count: float = 0.0           # 평균 공감 수
    avg_comment_count: float = 0.0        # 평균 댓글 수
    high_engagement_count: int = 0        # 높은 참여도 글 수 (공감+댓글 > 50)
    score: float = 0.0                    # 종합 점수 (0-100)


@dataclass
class BlogScoreAnalysis:
    """블로그 점수 분석"""
    avg_score: float = 0.0
    min_score: float = 0.0
    max_score: float = 0.0
    std_score: float = 0.0                # 표준편차 (변동성)
    high_scorer_count: int = 0            # 70점 이상 블로그 수
    elite_scorer_count: int = 0           # 85점 이상 블로그 수
    score: float = 0.0                    # 종합 점수 (0-100, 높을수록 경쟁 치열)


@dataclass
class CompetitionAnalysisResult:
    """경쟁도 종합 분석 결과"""
    keyword: str

    # 개별 분석 결과
    content_relevance: ContentRelevanceScore
    freshness: FreshnessScore
    engagement: EngagementScore
    blog_score: BlogScoreAnalysis

    # 종합 점수
    total_competition_score: float = 0.0   # 종합 경쟁도 (0-100, 높을수록 경쟁 치열)
    difficulty: CompetitionDifficulty = CompetitionDifficulty.MODERATE
    entry_probability: int = 50            # 진입 확률 (%)

    # 상세 breakdown
    score_breakdown: Dict[str, float] = field(default_factory=dict)

    # 분석 인사이트
    insights: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)


class CompetitionAnalyzer:
    """경쟁도 정밀 분석기"""

    # 가중치 설정
    WEIGHTS = {
        'blog_score': 0.30,        # 블로그 점수 (30%)
        'content_relevance': 0.25,  # 콘텐츠 적합도 (25%)
        'freshness': 0.15,          # 최신성 (15%)
        'engagement': 0.15,         # 참여도 (15%)
        'keyword_expertise': 0.15   # 키워드 전문성 (15%) - 추후 구현
    }

    def analyze_content_relevance(
        self,
        keyword: str,
        posts_data: List[Dict]
    ) -> ContentRelevanceScore:
        """
        콘텐츠 적합도 분석

        - 제목에 키워드 포함 비율
        - 키워드 밀도
        - 키워드 등장 횟수
        """
        if not posts_data:
            return ContentRelevanceScore()

        title_has_keyword_count = 0
        keyword_densities = []
        keyword_counts = []
        high_relevance_count = 0

        for post in posts_data:
            # 제목 키워드 포함 여부
            if post.get('title_has_keyword', False):
                title_has_keyword_count += 1

            # 키워드 밀도
            density = post.get('keyword_density', 0)
            if density > 0:
                keyword_densities.append(density)
                if density > 1.0:  # 키워드 밀도 1% 이상이면 높은 적합도
                    high_relevance_count += 1

            # 키워드 등장 횟수
            kw_count = post.get('keyword_count', 0)
            if kw_count > 0:
                keyword_counts.append(kw_count)

        total = len(posts_data)
        title_keyword_ratio = title_has_keyword_count / total if total > 0 else 0
        avg_density = np.mean(keyword_densities) if keyword_densities else 0
        avg_count = np.mean(keyword_counts) if keyword_counts else 0

        # 적합도 점수 계산 (높을수록 경쟁이 최적화된 글이 많음 = 경쟁 치열)
        # 제목 키워드 비율이 높으면 경쟁 치열 (40%)
        # 키워드 밀도가 높으면 경쟁 치열 (30%)
        # 높은 적합도 블로그가 많으면 경쟁 치열 (30%)

        title_score = title_keyword_ratio * 100 * 0.4
        density_score = min(100, avg_density * 50) * 0.3  # 밀도 2% = 100점
        high_rel_score = (high_relevance_count / total * 100) * 0.3 if total > 0 else 0

        score = title_score + density_score + high_rel_score

        return ContentRelevanceScore(
            title_keyword_ratio=round(title_keyword_ratio, 2),
            avg_keyword_density=round(avg_density, 2),
            avg_keyword_count=round(avg_count, 1),
            high_relevance_count=high_relevance_count,
            score=round(score, 1)
        )

    def analyze_freshness(
        self,
        posts_data: List[Dict]
    ) -> FreshnessScore:
        """
        최신성 분석

        - 평균 포스트 나이
        - 최근 7일/30일 글 비율
        - 최신 글일수록 경쟁 치열
        """
        if not posts_data:
            return FreshnessScore()

        post_ages = []
        recent_7days = 0
        recent_30days = 0

        for post in posts_data:
            age = post.get('post_age_days')
            if age is not None and age >= 0:
                post_ages.append(age)
                if age <= 7:
                    recent_7days += 1
                if age <= 30:
                    recent_30days += 1

        if not post_ages:
            return FreshnessScore()

        total = len(posts_data)
        avg_age = np.mean(post_ages)
        oldest = max(post_ages)
        newest = min(post_ages)

        recent_7_ratio = recent_7days / total if total > 0 else 0
        recent_30_ratio = recent_30days / total if total > 0 else 0

        # 최신성 점수 계산 (높을수록 최신 글이 많음 = 경쟁 치열)
        # 최근 7일 글 비율 (50%)
        # 최근 30일 글 비율 (30%)
        # 평균 나이 역수 (20%) - 평균 나이가 짧을수록 점수 높음

        score_7days = recent_7_ratio * 100 * 0.5
        score_30days = recent_30_ratio * 100 * 0.3

        # 평균 나이 점수 (평균 7일이면 100점, 365일이면 0점)
        age_score = max(0, 100 - (avg_age / 365 * 100)) * 0.2

        score = score_7days + score_30days + age_score

        return FreshnessScore(
            avg_post_age_days=round(avg_age, 1),
            recent_7days_ratio=round(recent_7_ratio, 2),
            recent_30days_ratio=round(recent_30_ratio, 2),
            oldest_post_days=int(oldest),
            newest_post_days=int(newest),
            score=round(score, 1)
        )

    def analyze_engagement(
        self,
        posts_data: List[Dict]
    ) -> EngagementScore:
        """
        참여도 분석

        - 공감 수
        - 댓글 수
        - 높은 참여도 = 검증된 콘텐츠 = 경쟁 치열
        """
        if not posts_data:
            return EngagementScore()

        likes = []
        comments = []
        high_engagement_count = 0

        for post in posts_data:
            like = post.get('like_count', 0)
            comment = post.get('comment_count', 0)

            likes.append(like)
            comments.append(comment)

            if like + comment > 50:
                high_engagement_count += 1

        avg_like = np.mean(likes) if likes else 0
        avg_comment = np.mean(comments) if comments else 0

        # 참여도 점수 계산 (높을수록 참여 많음 = 경쟁 치열)
        # 평균 공감 (40%) - 공감 100개 = 100점
        # 평균 댓글 (30%) - 댓글 50개 = 100점
        # 높은 참여 비율 (30%)

        like_score = min(100, avg_like) * 0.4
        comment_score = min(100, avg_comment * 2) * 0.3
        high_eng_score = (high_engagement_count / len(posts_data) * 100) * 0.3 if posts_data else 0

        score = like_score + comment_score + high_eng_score

        return EngagementScore(
            avg_like_count=round(avg_like, 1),
            avg_comment_count=round(avg_comment, 1),
            high_engagement_count=high_engagement_count,
            score=round(score, 1)
        )

    def analyze_blog_scores(
        self,
        blog_scores: List[float]
    ) -> BlogScoreAnalysis:
        """
        블로그 점수 분석

        - 평균/최저/최고 점수
        - 표준편차 (변동성)
        - 고점자 비율
        """
        if not blog_scores:
            return BlogScoreAnalysis()

        avg = np.mean(blog_scores)
        min_score = min(blog_scores)
        max_score = max(blog_scores)
        std = np.std(blog_scores)

        high_scorer_count = sum(1 for s in blog_scores if s >= 70)
        elite_scorer_count = sum(1 for s in blog_scores if s >= 85)

        # 점수 계산 (높을수록 강한 경쟁자가 많음)
        # 평균 점수 (40%)
        # 고점자 비율 (35%)
        # 엘리트 비율 (25%)

        avg_score = (avg / 100) * 100 * 0.4
        high_score = (high_scorer_count / len(blog_scores) * 100) * 0.35 if blog_scores else 0
        elite_score = (elite_scorer_count / len(blog_scores) * 100) * 0.25 if blog_scores else 0

        score = avg_score + high_score + elite_score

        return BlogScoreAnalysis(
            avg_score=round(avg, 1),
            min_score=round(min_score, 1),
            max_score=round(max_score, 1),
            std_score=round(std, 1),
            high_scorer_count=high_scorer_count,
            elite_scorer_count=elite_scorer_count,
            score=round(score, 1)
        )

    def calculate_entry_probability(
        self,
        my_score: Optional[float],
        competition_score: float,
        blog_score_analysis: BlogScoreAnalysis,
        content_relevance: ContentRelevanceScore
    ) -> int:
        """
        진입 확률 계산

        Args:
            my_score: 내 블로그 점수
            competition_score: 종합 경쟁도 점수
            blog_score_analysis: 블로그 점수 분석
            content_relevance: 콘텐츠 적합도 분석

        Returns:
            진입 확률 (0-100%)
        """
        if my_score is None:
            # 내 점수 없으면 경쟁도 기반 일반 추정
            if competition_score < 30:
                return 75
            elif competition_score < 50:
                return 55
            elif competition_score < 70:
                return 35
            else:
                return 15

        # 기본 확률: 경쟁도에 반비례
        base_prob = max(10, 100 - competition_score)

        # 내 점수와 최저 점수 비교
        score_gap = my_score - blog_score_analysis.min_score

        if score_gap >= 15:
            # 최저보다 15점 이상 높으면 +20%
            score_bonus = 20
        elif score_gap >= 5:
            # 5-15점 높으면 +10%
            score_bonus = 10
        elif score_gap >= 0:
            # 비슷하면 0%
            score_bonus = 0
        elif score_gap >= -10:
            # 10점까지 낮으면 -15%
            score_bonus = -15
        else:
            # 10점 이상 낮으면 -30%
            score_bonus = -30

        # 콘텐츠 적합도 페널티
        # 상위 글들이 키워드 최적화가 잘 되어있으면 진입 어려움
        if content_relevance.title_keyword_ratio > 0.7:
            content_penalty = -10
        elif content_relevance.title_keyword_ratio > 0.5:
            content_penalty = -5
        else:
            content_penalty = 0

        # 고점자 페널티
        if blog_score_analysis.elite_scorer_count >= 3:
            elite_penalty = -15
        elif blog_score_analysis.high_scorer_count >= 5:
            elite_penalty = -10
        else:
            elite_penalty = 0

        final_prob = base_prob + score_bonus + content_penalty + elite_penalty
        return max(5, min(95, int(final_prob)))

    def generate_insights(
        self,
        content_relevance: ContentRelevanceScore,
        freshness: FreshnessScore,
        engagement: EngagementScore,
        blog_score: BlogScoreAnalysis,
        competition_score: float
    ) -> Tuple[List[str], List[str], List[str]]:
        """
        분석 인사이트, 경고, 추천 생성

        Returns:
            (insights, warnings, recommendations)
        """
        insights = []
        warnings = []
        recommendations = []

        # === 콘텐츠 적합도 관련 ===
        if content_relevance.title_keyword_ratio >= 0.8:
            warnings.append(f"⚠️ 상위 {int(content_relevance.title_keyword_ratio*100)}%가 제목에 키워드 포함 - SEO 최적화 필수")
        elif content_relevance.title_keyword_ratio >= 0.5:
            insights.append(f"📊 상위 {int(content_relevance.title_keyword_ratio*100)}%가 제목에 키워드 포함")
        else:
            insights.append("✅ 제목 키워드 최적화가 덜 된 키워드 - 기회 있음")
            recommendations.append("💡 제목에 키워드를 자연스럽게 포함하세요")

        if content_relevance.high_relevance_count >= 5:
            warnings.append(f"⚠️ 키워드 특화 블로그 {content_relevance.high_relevance_count}개 - 전문성 필요")

        # === 최신성 관련 ===
        if freshness.recent_7days_ratio >= 0.3:
            warnings.append(f"🔥 최근 7일 내 글이 {int(freshness.recent_7days_ratio*100)}% - 치열한 경쟁")
            recommendations.append("⏰ 빠르게 글을 작성해야 유리합니다")
        elif freshness.recent_30days_ratio >= 0.5:
            insights.append(f"📅 최근 30일 내 글이 {int(freshness.recent_30days_ratio*100)}%")
        else:
            insights.append("✅ 오래된 글이 많음 - 최신 글로 밀어낼 가능성")
            recommendations.append("💡 최신 정보를 담은 글로 상위 진입 가능성 높음")

        if freshness.avg_post_age_days < 30:
            warnings.append(f"📈 평균 글 나이 {freshness.avg_post_age_days:.0f}일 - 활발한 키워드")

        # === 참여도 관련 ===
        if engagement.avg_like_count >= 50:
            warnings.append(f"❤️ 평균 공감 {engagement.avg_like_count:.0f}개 - 검증된 콘텐츠 다수")
        elif engagement.avg_like_count >= 20:
            insights.append(f"👍 평균 공감 {engagement.avg_like_count:.0f}개")

        if engagement.high_engagement_count >= 3:
            insights.append(f"💬 높은 참여도 글 {engagement.high_engagement_count}개 존재")

        # === 블로그 점수 관련 ===
        if blog_score.elite_scorer_count >= 3:
            warnings.append(f"👑 85점+ 엘리트 블로거 {blog_score.elite_scorer_count}명 - 진입 매우 어려움")
        elif blog_score.high_scorer_count >= 5:
            warnings.append(f"💪 70점+ 고점자 {blog_score.high_scorer_count}명 - 진입 어려움")
        elif blog_score.avg_score < 50:
            insights.append(f"✅ 평균 점수 {blog_score.avg_score:.0f}점 - 진입 기회")
            recommendations.append("💡 블로그 점수가 낮은 경쟁자들 - 콘텐츠 품질로 승부 가능")

        if blog_score.std_score > 15:
            insights.append(f"📊 점수 편차가 큼 (표준편차 {blog_score.std_score:.1f}) - 순위 변동 가능성")

        # === 종합 경쟁도 관련 ===
        if competition_score >= 70:
            warnings.append("🔴 경쟁이 매우 치열한 키워드입니다")
        elif competition_score >= 50:
            insights.append("🟡 보통 수준의 경쟁 키워드")
        else:
            insights.append("🟢 경쟁이 낮은 키워드 - 기회!")
            recommendations.append("🎯 이 키워드로 빠르게 포스팅하세요")

        return insights, warnings, recommendations

    def analyze(
        self,
        keyword: str,
        blog_scores: List[float],
        posts_data: List[Dict],
        my_score: Optional[float] = None
    ) -> CompetitionAnalysisResult:
        """
        종합 경쟁도 분석

        Args:
            keyword: 분석 키워드
            blog_scores: 상위 블로그 점수 리스트
            posts_data: 상위 포스트 분석 데이터 리스트
                       [{'title_has_keyword': bool, 'keyword_density': float,
                         'keyword_count': int, 'post_age_days': int,
                         'like_count': int, 'comment_count': int, ...}, ...]
            my_score: 내 블로그 점수 (선택)

        Returns:
            CompetitionAnalysisResult
        """
        # 1. 개별 분석
        content_relevance = self.analyze_content_relevance(keyword, posts_data)
        freshness = self.analyze_freshness(posts_data)
        engagement = self.analyze_engagement(posts_data)
        blog_score_analysis = self.analyze_blog_scores(blog_scores)

        # 2. 종합 경쟁도 점수 계산
        total_score = (
            blog_score_analysis.score * self.WEIGHTS['blog_score'] +
            content_relevance.score * self.WEIGHTS['content_relevance'] +
            freshness.score * self.WEIGHTS['freshness'] +
            engagement.score * self.WEIGHTS['engagement']
            # keyword_expertise는 추후 구현
        )

        # 정규화 (키워드 전문성 가중치 빼고 계산)
        used_weight = sum(self.WEIGHTS.values()) - self.WEIGHTS['keyword_expertise']
        total_score = total_score / used_weight

        # 3. 난이도 결정
        if total_score >= 70:
            difficulty = CompetitionDifficulty.VERY_HARD
        elif total_score >= 55:
            difficulty = CompetitionDifficulty.HARD
        elif total_score >= 40:
            difficulty = CompetitionDifficulty.MODERATE
        elif total_score >= 25:
            difficulty = CompetitionDifficulty.EASY
        else:
            difficulty = CompetitionDifficulty.VERY_EASY

        # 4. 진입 확률 계산
        entry_prob = self.calculate_entry_probability(
            my_score, total_score, blog_score_analysis, content_relevance
        )

        # 5. 인사이트 생성
        insights, warnings, recommendations = self.generate_insights(
            content_relevance, freshness, engagement, blog_score_analysis, total_score
        )

        # 6. 점수 breakdown
        breakdown = {
            'blog_score': round(blog_score_analysis.score, 1),
            'content_relevance': round(content_relevance.score, 1),
            'freshness': round(freshness.score, 1),
            'engagement': round(engagement.score, 1),
        }

        return CompetitionAnalysisResult(
            keyword=keyword,
            content_relevance=content_relevance,
            freshness=freshness,
            engagement=engagement,
            blog_score=blog_score_analysis,
            total_competition_score=round(total_score, 1),
            difficulty=difficulty,
            entry_probability=entry_prob,
            score_breakdown=breakdown,
            insights=insights,
            warnings=warnings,
            recommendations=recommendations
        )


# 싱글톤 인스턴스
competition_analyzer = CompetitionAnalyzer()
