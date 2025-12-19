"""
키워드 분석 시스템 - 핵심 서비스
"""
import re
import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict

import httpx

from models.keyword_analysis import (
    KeywordType, CompetitionLevel, EntryDifficulty,
    KeywordData, TabRatio, Top10Stats, CompetitionAnalysis,
    KeywordHierarchy, SubKeyword, ClassifiedKeyword,
    KeywordAnalysisResponse
)
from database.keyword_analysis_db import (
    get_cached_analysis, cache_analysis,
    get_learned_type, save_keyword_type,
    get_sub_keywords, save_keyword_hierarchy,
    save_competition_history, get_cached_tab_ratio, cache_tab_ratio
)
from config import settings

logger = logging.getLogger(__name__)


class KeywordClassifier:
    """키워드 유형 분류기 (규칙 기반 + 학습)"""

    # 키워드 유형별 패턴
    TYPE_PATTERNS = {
        KeywordType.INFO: {
            'suffixes': ['란', '이란', '뜻', '의미', '정의'],
            'keywords': ['원인', '증상', '효과', '방법', '예방', '치료법', '관리', '개선',
                        '알아보기', '알아보', '정보', '설명', '이해', '특징'],
            'patterns': [r'.*이란\??$', r'.*란\??$', r'.*뜻$', r'어떻게.*']
        },
        KeywordType.SYMPTOM: {
            'keywords': ['아프', '통증', '쑤시', '저림', '어지러', '두통', '복통', '요통',
                        '붓기', '부종', '가려', '따가', '쓰라', '뻐근', '결림', '뻣뻣',
                        '피곤', '무기력', '식은땀', '열감', '오한'],
            'patterns': [r'.*아프.*', r'.*통증.*', r'.*증상.*']
        },
        KeywordType.HOSPITAL: {
            'keywords': ['병원', '의원', '클리닉', '센터', '한의원', '치과', '안과', '피부과',
                        '추천', '잘하는', '유명한', '좋은', '맛집', '명의', '전문'],
            'patterns': [r'.*병원\s*추천.*', r'.*잘\s*하는.*병원.*', r'.*어디.*']
        },
        KeywordType.COST: {
            'keywords': ['비용', '가격', '얼마', '검사비', '치료비', '수술비', '시술비',
                        '보험', '실비', '급여', '비급여', '무료', '할인', '이벤트'],
            'patterns': [r'.*얼마.*', r'.*비용.*', r'.*가격.*']
        },
        KeywordType.LOCAL: {
            'prefixes': ['강남', '서초', '송파', '강동', '강서', '마포', '영등포', '용산',
                        '성북', '노원', '분당', '판교', '일산', '수원', '안양', '부천',
                        '인천', '의정부', '대전', '대구', '부산', '광주', '울산'],
            'patterns': [r'^(강남|서초|분당|판교|일산).*병원.*',
                        r'.*역\s*(병원|의원|한의원).*',
                        r'.*동\s*(병원|의원).*',
                        r'.*구\s*(병원|의원).*']
        },
        KeywordType.BROAD: {
            'prefixes': ['서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종',
                        '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'],
            'patterns': [r'^(서울|부산|대구|인천|광주|대전|울산).*병원.*']
        }
    }

    def __init__(self):
        self._compile_patterns()

    def _compile_patterns(self):
        """정규식 패턴 사전 컴파일"""
        self._compiled_patterns = {}
        for kw_type, rules in self.TYPE_PATTERNS.items():
            if 'patterns' in rules:
                self._compiled_patterns[kw_type] = [
                    re.compile(p, re.IGNORECASE) for p in rules['patterns']
                ]

    def classify(self, keyword: str) -> Tuple[KeywordType, float]:
        """
        키워드 분류
        Returns: (키워드 유형, 신뢰도)
        """
        keyword_lower = keyword.lower().strip()

        # 1. 학습된 분류 확인
        learned = get_learned_type(keyword)
        if learned and learned.get('is_verified'):
            return (KeywordType(learned['classified_type']), learned['confidence'])

        # 2. 규칙 기반 분류 (우선순위: 지역 > 광역 > 비용 > 병원 > 증상 > 정보)
        # 지역형 먼저 체크 (가장 구체적)
        result = self._check_local_or_broad(keyword_lower)
        if result:
            return result

        # 비용/검사형
        result = self._check_type(keyword_lower, KeywordType.COST)
        if result:
            return result

        # 병원탐색형
        result = self._check_type(keyword_lower, KeywordType.HOSPITAL)
        if result:
            return result

        # 증상형
        result = self._check_type(keyword_lower, KeywordType.SYMPTOM)
        if result:
            return result

        # 정보형
        result = self._check_type(keyword_lower, KeywordType.INFO)
        if result:
            return result

        # 학습된 분류 (미검증도 사용)
        if learned:
            return (KeywordType(learned['classified_type']), learned['confidence'])

        # 기본값: 정보형
        return (KeywordType.INFO, 0.3)

    def _check_local_or_broad(self, keyword: str) -> Optional[Tuple[KeywordType, float]]:
        """지역형/광역형 체크"""
        local_rules = self.TYPE_PATTERNS[KeywordType.LOCAL]
        broad_rules = self.TYPE_PATTERNS[KeywordType.BROAD]

        # 지역형 체크 (더 구체적인 지역)
        for prefix in local_rules.get('prefixes', []):
            if keyword.startswith(prefix):
                # 병원/의원 관련 키워드인지 확인
                if any(h in keyword for h in ['병원', '의원', '클리닉', '센터', '한의원']):
                    return (KeywordType.LOCAL, 0.9)

        # 정규식 패턴 체크
        for pattern in self._compiled_patterns.get(KeywordType.LOCAL, []):
            if pattern.match(keyword):
                return (KeywordType.LOCAL, 0.85)

        # 광역형 체크
        for prefix in broad_rules.get('prefixes', []):
            if keyword.startswith(prefix):
                if any(h in keyword for h in ['병원', '의원', '클리닉', '센터']):
                    return (KeywordType.BROAD, 0.85)

        for pattern in self._compiled_patterns.get(KeywordType.BROAD, []):
            if pattern.match(keyword):
                return (KeywordType.BROAD, 0.8)

        return None

    def _check_type(self, keyword: str, kw_type: KeywordType) -> Optional[Tuple[KeywordType, float]]:
        """특정 유형 체크"""
        rules = self.TYPE_PATTERNS.get(kw_type, {})

        # 접미사 체크
        for suffix in rules.get('suffixes', []):
            if keyword.endswith(suffix):
                return (kw_type, 0.9)

        # 접두사 체크
        for prefix in rules.get('prefixes', []):
            if keyword.startswith(prefix):
                return (kw_type, 0.85)

        # 키워드 포함 체크
        for kw in rules.get('keywords', []):
            if kw in keyword:
                return (kw_type, 0.8)

        # 정규식 패턴 체크
        for pattern in self._compiled_patterns.get(kw_type, []):
            if pattern.match(keyword):
                return (kw_type, 0.75)

        return None

    def classify_batch(self, keywords: List[str]) -> List[ClassifiedKeyword]:
        """배치 분류"""
        results = []
        for kw in keywords:
            kw_type, confidence = self.classify(kw)
            results.append(ClassifiedKeyword(
                keyword=kw,
                keyword_type=kw_type,
                confidence=confidence
            ))
            # 학습 저장
            save_keyword_type(kw, kw_type.value, confidence)
        return results


class KeywordAnalysisService:
    """키워드 종합 분석 서비스"""

    def __init__(self):
        self.classifier = KeywordClassifier()
        self.http_client = None

    async def _get_client(self) -> httpx.AsyncClient:
        """HTTP 클라이언트 반환"""
        if self.http_client is None:
            self.http_client = httpx.AsyncClient(timeout=30.0)
        return self.http_client

    async def close(self):
        """리소스 정리"""
        if self.http_client:
            await self.http_client.aclose()
            self.http_client = None

    async def analyze_keyword(
        self,
        keyword: str,
        expand_related: bool = True,
        min_search_volume: int = 100,
        max_keywords: int = 50,
        my_blog_id: Optional[str] = None
    ) -> KeywordAnalysisResponse:
        """
        키워드 종합 분석

        1. 캐시 확인
        2. 네이버 광고 API로 연관 키워드 조회
        3. 키워드 확장 (expand_related=True일 때)
        4. 필터링 (검색량, 중복)
        5. 유형 분류
        6. 경쟁도 분석
        """
        try:
            # 1. 캐시 확인
            cached = get_cached_analysis(keyword)
            if cached:
                logger.info(f"Cache hit for keyword: {keyword}")
                response = KeywordAnalysisResponse(**cached)
                response.cached = True
                return response

            # 2. 연관 키워드 조회
            related_keywords = await self._fetch_related_keywords(keyword)

            # 3. 기존 DB에서 세부 키워드 조회 및 API 학습
            if expand_related:
                expanded = await self._expand_keywords(keyword, related_keywords)
                related_keywords.extend(expanded)

            # 4. 필터링
            filtered = self._filter_keywords(related_keywords, min_search_volume)

            # 5. 중복 제거
            unique_keywords = self._remove_duplicates(filtered)

            # 6. 유형 분류
            classified = []
            for kw in unique_keywords[:max_keywords]:
                kw_type, confidence = self.classifier.classify(kw.keyword)
                kw.keyword_type = kw_type
                kw.confidence = confidence
                classified.append(kw)

            # 7. 경쟁도 분석
            competition = await self._analyze_competition(keyword, my_blog_id)

            # 8. 유형별 분포 계산
            type_dist = self._calculate_type_distribution(classified)

            # 9. 추천 메시지 생성
            recommendations = self._generate_recommendations(competition, type_dist)

            response = KeywordAnalysisResponse(
                success=True,
                main_keyword=keyword,
                keywords=classified,
                total_count=len(related_keywords),
                filtered_count=len(classified),
                competition_summary=competition,
                type_distribution=type_dist,
                recommendations=recommendations
            )

            # 캐시 저장
            cache_analysis(keyword, response.model_dump())

            return response

        except Exception as e:
            logger.error(f"Error analyzing keyword '{keyword}': {e}")
            return KeywordAnalysisResponse(
                success=False,
                main_keyword=keyword,
                error=str(e)
            )

    async def _fetch_related_keywords(self, keyword: str) -> List[KeywordData]:
        """네이버 광고 API에서 연관 키워드 조회"""
        # 기존 blogs.py의 get_related_keywords_from_searchad 로직 활용
        from routers.blogs import get_related_keywords_from_searchad

        try:
            result = await get_related_keywords_from_searchad(keyword)

            keywords = []
            for kw in result.keywords:
                keywords.append(KeywordData(
                    keyword=kw.keyword,
                    monthly_pc_search=kw.monthly_pc_search or 0,
                    monthly_mobile_search=kw.monthly_mobile_search or 0,
                    monthly_total_search=kw.monthly_total_search or 0,
                    competition=kw.competition or "낮음",
                    competition_index=self._competition_to_index(kw.competition)
                ))

            return keywords

        except Exception as e:
            logger.error(f"Error fetching related keywords: {e}")
            return []

    def _competition_to_index(self, competition: str) -> float:
        """경쟁도 문자열을 숫자로 변환"""
        mapping = {
            "높음": 0.9,
            "중간": 0.5,
            "낮음": 0.2
        }
        return mapping.get(competition, 0.3)

    async def _expand_keywords(
        self,
        main_keyword: str,
        existing_keywords: List[KeywordData]
    ) -> List[KeywordData]:
        """
        키워드 확장 (API 학습 방식)
        - 기존 DB에서 저장된 세부 키워드 조회
        - 새로운 연관 키워드는 DB에 저장 (학습)
        """
        expanded = []
        existing_set = {kw.keyword for kw in existing_keywords}

        # DB에서 기존 세부 키워드 조회
        sub_keywords = get_sub_keywords(main_keyword)
        for sub in sub_keywords:
            if sub['sub_keyword'] not in existing_set:
                expanded.append(KeywordData(
                    keyword=sub['sub_keyword'],
                    monthly_total_search=sub.get('search_volume', 0),
                    keyword_type=KeywordType(sub.get('keyword_type', '미분류')) if sub.get('keyword_type') else KeywordType.UNKNOWN
                ))

        # 새로운 연관 키워드를 DB에 저장 (학습)
        for kw in existing_keywords:
            if kw.keyword != main_keyword:
                kw_type, _ = self.classifier.classify(kw.keyword)
                save_keyword_hierarchy(
                    main_keyword=main_keyword,
                    sub_keyword=kw.keyword,
                    search_volume=kw.monthly_total_search,
                    keyword_type=kw_type.value
                )

        return expanded

    def _filter_keywords(
        self,
        keywords: List[KeywordData],
        min_search_volume: int
    ) -> List[KeywordData]:
        """검색량 기준 필터링"""
        return [
            kw for kw in keywords
            if kw.monthly_total_search >= min_search_volume
        ]

    def _remove_duplicates(self, keywords: List[KeywordData]) -> List[KeywordData]:
        """중복 키워드 제거"""
        seen = set()
        unique = []
        for kw in keywords:
            # 공백 제거 후 비교
            normalized = kw.keyword.replace(" ", "").lower()
            if normalized not in seen:
                seen.add(normalized)
                unique.append(kw)
        return unique

    async def _analyze_competition(
        self,
        keyword: str,
        my_blog_id: Optional[str] = None
    ) -> CompetitionAnalysis:
        """경쟁도 분석"""
        # 상위 블로그 분석 (기존 search-keyword-with-tabs 활용)
        from routers.blogs import search_keyword_with_tabs

        try:
            search_result = await search_keyword_with_tabs(keyword, limit=10, analyze_content=True)

            # 상위 10개 블로그 통계
            top10_scores = []
            top10_c_ranks = []
            top10_dias = []
            top10_posts = []
            top10_visitors = []

            for blog in search_result.results[:10]:
                if blog.index:
                    top10_scores.append(blog.index.total_score)
                    if blog.index.score_breakdown:
                        top10_c_ranks.append(blog.index.score_breakdown.get('c_rank', 0))
                        top10_dias.append(blog.index.score_breakdown.get('dia', 0))
                if blog.stats:
                    top10_posts.append(blog.stats.total_posts)
                    top10_visitors.append(blog.stats.total_visitors)

            # 통계 계산
            top10_stats = Top10Stats(
                avg_total_score=sum(top10_scores) / len(top10_scores) if top10_scores else 0,
                avg_c_rank=sum(top10_c_ranks) / len(top10_c_ranks) if top10_c_ranks else 0,
                avg_dia=sum(top10_dias) / len(top10_dias) if top10_dias else 0,
                min_score=min(top10_scores) if top10_scores else 0,
                max_score=max(top10_scores) if top10_scores else 0,
                avg_posts=int(sum(top10_posts) / len(top10_posts)) if top10_posts else 0,
                avg_visitors=int(sum(top10_visitors) / len(top10_visitors)) if top10_visitors else 0
            )

            # 탭별 비율 조회
            tab_ratio = await self.get_tab_ratio(keyword)

            # 경쟁도 레벨 결정
            avg_score = top10_stats.avg_total_score
            if avg_score >= 75:
                competition_level = CompetitionLevel.HIGH
            elif avg_score >= 55:
                competition_level = CompetitionLevel.MEDIUM
            else:
                competition_level = CompetitionLevel.LOW

            # 진입 난이도 결정
            if avg_score < 45:
                entry_difficulty = EntryDifficulty.EASY
            elif avg_score < 60:
                entry_difficulty = EntryDifficulty.ACHIEVABLE
            elif avg_score < 75:
                entry_difficulty = EntryDifficulty.HARD
            else:
                entry_difficulty = EntryDifficulty.VERY_HARD

            # 권장 블로그 점수 (상위 진입을 위해)
            recommended_score = top10_stats.min_score * 0.9 if top10_stats.min_score else 50

            analysis = CompetitionAnalysis(
                keyword=keyword,
                search_volume=search_result.insights.get('total_search_volume', 0) if hasattr(search_result, 'insights') else 0,
                competition_level=competition_level,
                top10_stats=top10_stats,
                tab_ratio=tab_ratio,
                entry_difficulty=entry_difficulty,
                recommended_blog_score=recommended_score
            )

            # 이력 저장
            save_competition_history(keyword, analysis.model_dump())

            return analysis

        except Exception as e:
            logger.error(f"Error analyzing competition for '{keyword}': {e}")
            return CompetitionAnalysis(keyword=keyword)

    async def get_tab_ratio(self, keyword: str) -> TabRatio:
        """네이버 탭별 검색 비율 조회"""
        # 캐시 확인
        cached = get_cached_tab_ratio(keyword)
        if cached:
            total = cached['total_count'] or 1
            return TabRatio(
                blog=cached['blog_count'] / total,
                cafe=cached['cafe_count'] / total,
                kin=cached['kin_count'] / total,
                web=cached['web_count'] / total,
                blog_count=cached['blog_count'],
                cafe_count=cached['cafe_count'],
                kin_count=cached['kin_count'],
                web_count=cached['web_count']
            )

        # 네이버 Open API로 각 탭 검색
        try:
            counts = await self._fetch_tab_counts(keyword)

            total = sum(counts.values()) or 1
            tab_ratio = TabRatio(
                blog=counts['blog'] / total,
                cafe=counts['cafe'] / total,
                kin=counts['kin'] / total,
                web=counts['web'] / total,
                blog_count=counts['blog'],
                cafe_count=counts['cafe'],
                kin_count=counts['kin'],
                web_count=counts['web']
            )

            # 캐시 저장
            cache_tab_ratio(keyword, counts['blog'], counts['cafe'], counts['kin'], counts['web'])

            return tab_ratio

        except Exception as e:
            logger.error(f"Error fetching tab ratio: {e}")
            return TabRatio()

    async def _fetch_tab_counts(self, keyword: str) -> Dict[str, int]:
        """네이버 Open API로 탭별 검색 결과 수 조회"""
        client = await self._get_client()

        endpoints = {
            'blog': 'https://openapi.naver.com/v1/search/blog.json',
            'cafe': 'https://openapi.naver.com/v1/search/cafearticle.json',
            'kin': 'https://openapi.naver.com/v1/search/kin.json',
            'web': 'https://openapi.naver.com/v1/search/webkr.json'
        }

        headers = {
            "X-Naver-Client-Id": settings.NAVER_CLIENT_ID,
            "X-Naver-Client-Secret": settings.NAVER_CLIENT_SECRET
        }

        counts = {}

        async def fetch_one(tab: str, url: str):
            try:
                response = await client.get(
                    url,
                    headers=headers,
                    params={"query": keyword, "display": 1}
                )
                if response.status_code == 200:
                    data = response.json()
                    return (tab, data.get("total", 0))
                return (tab, 0)
            except Exception as e:
                logger.error(f"Error fetching {tab} count: {e}")
                return (tab, 0)

        # 병렬 조회
        tasks = [fetch_one(tab, url) for tab, url in endpoints.items()]
        results = await asyncio.gather(*tasks)

        for tab, count in results:
            counts[tab] = count

        return counts

    def _calculate_type_distribution(self, keywords: List[KeywordData]) -> Dict[str, int]:
        """유형별 분포 계산"""
        distribution = defaultdict(int)
        for kw in keywords:
            distribution[kw.keyword_type.value] += 1
        return dict(distribution)

    def _generate_recommendations(
        self,
        competition: CompetitionAnalysis,
        type_dist: Dict[str, int]
    ) -> List[str]:
        """추천 메시지 생성"""
        recommendations = []

        # 경쟁도 기반 추천
        if competition.entry_difficulty == EntryDifficulty.EASY:
            recommendations.append("경쟁이 낮은 키워드입니다. 초보 블로거도 상위 노출이 가능합니다.")
        elif competition.entry_difficulty == EntryDifficulty.ACHIEVABLE:
            recommendations.append(f"도전 가능한 키워드입니다. 블로그 점수 {competition.recommended_blog_score:.0f}점 이상이면 상위 진입 가능성이 있습니다.")
        elif competition.entry_difficulty == EntryDifficulty.HARD:
            recommendations.append(f"경쟁이 높은 키워드입니다. C-Rank 점수 {competition.top10_stats.avg_c_rank:.0f}점 이상 필요합니다.")
        else:
            recommendations.append("매우 경쟁이 높은 키워드입니다. 상위 블로거들의 평균 점수가 매우 높습니다.")

        # 유형별 추천
        total = sum(type_dist.values())
        if total > 0:
            info_ratio = type_dist.get("정보형", 0) / total
            if info_ratio > 0.4:
                recommendations.append("정보형 키워드가 많습니다. 상세한 정보 제공 콘텐츠가 효과적입니다.")

            hospital_ratio = type_dist.get("병원탐색형", 0) / total
            if hospital_ratio > 0.2:
                recommendations.append("병원 탐색 키워드가 포함되어 있습니다. 지역 기반 SEO를 고려하세요.")

        # 탭 비율 추천
        if competition.tab_ratio.blog > 0.4:
            recommendations.append("블로그 콘텐츠가 많이 노출되는 키워드입니다. 블로그 SEO에 집중하세요.")
        elif competition.tab_ratio.cafe > 0.3:
            recommendations.append("카페 콘텐츠가 많습니다. 네이버 카페 활동도 고려해보세요.")

        return recommendations


# 싱글톤 인스턴스
keyword_analysis_service = KeywordAnalysisService()
