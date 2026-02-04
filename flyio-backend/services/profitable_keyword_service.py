"""
Profitable Keyword Service - 수익성 키워드 매칭 서비스

내 블로그 레벨 기준으로 1위 가능하고 돈이 되는 키워드 찾기
"""
import logging
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from enum import Enum

from database.profitable_keywords_db import (
    initialize_profitable_keywords_tables,
    get_winnable_keywords,
    get_winnable_keywords_count,
    get_total_potential_revenue,
    get_category_summary,
    get_opportunity_keywords,
    get_plan_keyword_limit,
    get_user_keyword_view_count,
    log_keyword_view,
    add_keyword_to_pool,
    update_keyword_competition,
    calculate_win_probability,
    bulk_add_keywords
)
from database.subscription_db import get_user_subscription

logger = logging.getLogger(__name__)


@dataclass
class ProfitableKeyword:
    """수익성 키워드 데이터"""
    id: int
    keyword: str
    category: str

    # 검색 데이터
    monthly_search_volume: int
    search_trend: float

    # 경쟁 데이터
    rank1_blog_level: int
    rank1_blog_score: float
    rank1_inactive_hours: int
    top10_avg_level: float
    competition_score: int

    # 내 블로그 기준
    my_level: int
    level_gap: int
    win_probability: int

    # 수익 데이터
    estimated_cpc: int
    sponsorship_potential: float
    sponsorship_value: int
    estimated_monthly_revenue: int

    # 수익 분해
    ad_revenue: int = 0
    sponsorship_revenue: int = 0

    # 기회
    opportunity_score: float = 0
    opportunity_tags: List[str] = field(default_factory=list)

    # 골든타임
    golden_time: Optional[str] = None

    # 메타
    last_updated: Optional[str] = None


@dataclass
class WinnableKeywordsResponse:
    """1위 가능 키워드 응답"""
    blog_id: str
    blog_level: int

    # 요약
    total_winnable: int
    total_potential_revenue: int
    showing: int
    plan_limit: int
    upgrade_to_see: int

    # 키워드 목록
    keywords: List[ProfitableKeyword]

    # 카테고리 요약
    categories: List[Dict]


class ProfitableKeywordService:
    """수익성 키워드 서비스"""

    def __init__(self):
        # 테이블 초기화
        initialize_profitable_keywords_tables()

    async def get_winnable_keywords_for_user(
        self,
        blog_id: str,
        blog_level: int,
        user_id: Optional[int] = None,
        user_plan: str = 'free',
        category: str = None,
        sort_by: str = 'revenue',
        min_search_volume: int = 500,
        min_win_probability: int = 70,
        offset: int = 0
    ) -> WinnableKeywordsResponse:
        """사용자 맞춤 1위 가능 키워드 조회

        Args:
            blog_id: 블로그 ID
            blog_level: 블로그 레벨
            user_id: 사용자 ID (플랜 확인용)
            user_plan: 구독 플랜
            category: 카테고리 필터
            sort_by: 정렬 기준 (revenue, probability, search_volume, opportunity)
            min_search_volume: 최소 검색량
            min_win_probability: 최소 1위 확률
            offset: 페이지 오프셋

        Returns:
            WinnableKeywordsResponse
        """
        # 플랜별 제한
        plan_limit = get_plan_keyword_limit(user_plan)

        # 이미 본 키워드 수 확인 (무료 플랜)
        if user_id and user_plan == 'free':
            viewed_count = get_user_keyword_view_count(user_id, period_days=30)
            if viewed_count >= plan_limit:
                # 이미 한도 도달
                return WinnableKeywordsResponse(
                    blog_id=blog_id,
                    blog_level=blog_level,
                    total_winnable=get_winnable_keywords_count(blog_level, category),
                    total_potential_revenue=get_total_potential_revenue(blog_level, category),
                    showing=0,
                    plan_limit=plan_limit,
                    upgrade_to_see=get_winnable_keywords_count(blog_level, category),
                    keywords=[],
                    categories=get_category_summary(blog_level)
                )

        # 키워드 조회
        raw_keywords = get_winnable_keywords(
            blog_level=blog_level,
            category=category,
            sort_by=sort_by,
            min_search_volume=min_search_volume,
            min_win_probability=min_win_probability,
            limit=plan_limit,
            offset=offset
        )

        # 응답 변환
        keywords = []
        for kw in raw_keywords:
            # 수익 분해
            ctr = 0.28
            ad_revenue = int(kw['monthly_search_volume'] * ctr * kw['estimated_cpc'])
            sponsorship_revenue = int(kw['sponsorship_potential'] * kw['sponsorship_value'] * 2)

            # 기회 태그
            opportunity_tags = self._get_opportunity_tags(kw, blog_level)

            # 골든타임 계산
            golden_time = self._calculate_golden_time(kw['category'])

            keywords.append(ProfitableKeyword(
                id=kw['id'],
                keyword=kw['keyword'],
                category=kw['category'] or '기타',
                monthly_search_volume=kw['monthly_search_volume'],
                search_trend=kw.get('search_trend', 1.0),
                rank1_blog_level=kw['rank1_blog_level'],
                rank1_blog_score=kw.get('rank1_blog_score', 0),
                rank1_inactive_hours=kw.get('rank1_inactive_hours', 0),
                top10_avg_level=kw.get('top10_avg_level', 0),
                competition_score=kw['competition_score'],
                my_level=blog_level,
                level_gap=kw['level_gap'],
                win_probability=kw['win_probability'],
                estimated_cpc=kw['estimated_cpc'],
                sponsorship_potential=kw['sponsorship_potential'],
                sponsorship_value=kw['sponsorship_value'],
                estimated_monthly_revenue=kw['estimated_monthly_revenue'],
                ad_revenue=ad_revenue,
                sponsorship_revenue=sponsorship_revenue,
                opportunity_score=kw['opportunity_score'],
                opportunity_tags=opportunity_tags,
                golden_time=golden_time,
                last_updated=kw.get('last_updated')
            ))

            # 조회 기록 (무료 플랜)
            if user_id and user_plan == 'free':
                log_keyword_view(user_id, kw['id'])

        # 전체 통계
        total_winnable = get_winnable_keywords_count(blog_level, category)
        total_revenue = get_total_potential_revenue(blog_level, category)
        categories = get_category_summary(blog_level)

        return WinnableKeywordsResponse(
            blog_id=blog_id,
            blog_level=blog_level,
            total_winnable=total_winnable,
            total_potential_revenue=total_revenue,
            showing=len(keywords),
            plan_limit=plan_limit,
            upgrade_to_see=max(0, total_winnable - plan_limit),
            keywords=keywords,
            categories=categories
        )

    def _get_opportunity_tags(self, kw: Dict, blog_level: int) -> List[str]:
        """기회 태그 생성"""
        tags = []

        # 레벨 차이
        level_gap = blog_level - kw['rank1_blog_level']
        if level_gap >= 3:
            tags.append('압도적우위')
        elif level_gap >= 2:
            tags.append('매우유리')
        elif level_gap >= 1:
            tags.append('유리')

        # 경쟁 강도
        if kw['competition_score'] <= 30:
            tags.append('경쟁약함')
        elif kw['competition_score'] <= 50:
            tags.append('경쟁보통')

        # 1위 비활성
        inactive_hours = kw.get('rank1_inactive_hours', 0)
        if inactive_hours >= 72:
            tags.append('1위장기비활성')
        elif inactive_hours >= 48:
            tags.append('1위비활성')

        # 트렌드
        trend = kw.get('search_trend', 1.0)
        if trend >= 1.5:
            tags.append('급상승트렌드')
        elif trend >= 1.2:
            tags.append('상승트렌드')

        # 체험단
        if kw.get('sponsorship_potential', 0) >= 0.5:
            tags.append('체험단활발')

        return tags

    def _calculate_golden_time(self, category: str) -> str:
        """카테고리별 골든타임 계산"""
        golden_times = {
            '맛집': '11:00-13:00',
            '카페': '14:00-16:00',
            '여행': '20:00-22:00',
            '숙소': '20:00-22:00',
            '뷰티': '19:00-21:00',
            '화장품': '19:00-21:00',
            '육아': '10:00-12:00',
            '교육': '21:00-23:00',
            'IT': '09:00-11:00',
            '가전': '19:00-21:00',
            '패션': '12:00-14:00',
            '운동': '06:00-08:00',
            '다이어트': '07:00-09:00',
        }
        return golden_times.get(category, '10:00-12:00')

    async def get_opportunity_keywords(
        self,
        blog_id: str,
        blog_level: int,
        limit: int = 10
    ) -> List[Dict]:
        """실시간 기회 키워드 조회"""
        opportunities = get_opportunity_keywords(blog_level, limit)

        result = []
        for kw in opportunities:
            result.append({
                'keyword': kw['keyword'],
                'category': kw.get('category', '기타'),
                'opportunity_type': kw.get('opportunity_type'),
                'opportunity_reason': kw.get('opportunity_reason'),
                'win_probability': kw.get('win_probability', 0),
                'estimated_monthly_revenue': kw.get('estimated_monthly_revenue', 0),
                'urgency': 'high' if kw.get('rank1_inactive_hours', 0) >= 72 else 'medium'
            })

        return result

    async def get_category_opportunities(
        self,
        blog_level: int
    ) -> List[Dict]:
        """카테고리별 기회 요약"""
        return get_category_summary(blog_level)

    async def sync_keyword_from_search(
        self,
        keyword: str,
        category: str,
        search_volume: int,
        rank1_level: int,
        rank1_score: float,
        top10_data: List[Dict] = None
    ):
        """검색 결과에서 키워드 데이터 동기화

        사용자가 키워드 검색할 때 자동으로 키워드 풀 업데이트
        """
        # 경쟁 점수 계산
        competition_score = self._calculate_competition_score(
            rank1_level, rank1_score, top10_data
        )

        # 키워드 추가/업데이트
        add_keyword_to_pool(
            keyword=keyword,
            category=category,
            monthly_search_volume=search_volume,
            rank1_blog_level=rank1_level,
            rank1_blog_score=rank1_score,
            competition_score=competition_score,
            source='user_search'
        )

        # top10 데이터가 있으면 추가 업데이트
        if top10_data:
            levels = [b.get('level', 0) for b in top10_data if b.get('level')]
            if levels:
                update_keyword_competition(
                    keyword=keyword,
                    rank1_blog_level=rank1_level,
                    rank1_blog_score=rank1_score,
                    top10_avg_level=sum(levels) / len(levels),
                    top10_min_level=min(levels)
                )

    def _calculate_competition_score(
        self,
        rank1_level: int,
        rank1_score: float,
        top10_data: List[Dict] = None
    ) -> int:
        """경쟁 점수 계산 (0~100, 낮을수록 좋음)"""
        score = 50  # 기본값

        # 1위 레벨 기반 (레벨 높을수록 경쟁 치열)
        score += (rank1_level - 5) * 5  # 레벨 5 기준

        # 1위 점수 기반
        if rank1_score > 80:
            score += 15
        elif rank1_score > 60:
            score += 10
        elif rank1_score > 40:
            score += 5

        # top10 분포
        if top10_data:
            high_level_count = sum(1 for b in top10_data if b.get('level', 0) >= 8)
            score += high_level_count * 3

        return max(0, min(100, score))

    async def import_keywords_batch(
        self,
        keywords: List[Dict]
    ) -> Dict:
        """키워드 대량 임포트

        Args:
            keywords: [{'keyword': '...', 'category': '...', 'search_volume': 1000}, ...]

        Returns:
            {'imported': 100, 'failed': 5}
        """
        imported = bulk_add_keywords(keywords)

        return {
            'imported': imported,
            'total': len(keywords),
            'failed': len(keywords) - imported
        }


# 싱글톤 인스턴스
_service: Optional[ProfitableKeywordService] = None


def get_profitable_keyword_service() -> ProfitableKeywordService:
    """서비스 싱글톤 조회"""
    global _service
    if _service is None:
        _service = ProfitableKeywordService()
    return _service
