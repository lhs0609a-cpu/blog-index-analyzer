"""
블로그 점수 계산 로직 (네이버 공식 알고리즘 기반)

네이버 검색 알고리즘:
1. C-Rank (Creator Rank) - 출처의 신뢰도 50%
   - Context: 주제별 관심사 집중도
   - Content: 정보의 품질
   - Chain: 소통과 연쇄반응
   - Creator: 블로그 신뢰도/인기도

2. D.I.A. (Deep Intent Analysis) - 문서 품질 50%
   - 주제 적합도
   - 경험 정보
   - 정보의 충실성
   - 독창성
   - 적시성
   - 어뷰징 척도 (감점)
"""
import logging
from typing import Dict, Any, List
from datetime import datetime, timedelta
import re

logger = logging.getLogger(__name__)


class BlogScorer:
    """블로그 점수 계산기 (네이버 C-Rank + D.I.A. 기반)"""

    def __init__(self):
        # 네이버 알고리즘 가중치
        self.weights = {
            "c_rank": 0.50,      # C-Rank (출처 신뢰도)
            "dia": 0.50          # D.I.A. (문서 품질)
        }

    def calculate_scores(self, blog_data: Dict[str, Any]) -> Dict[str, float]:
        """
        네이버 알고리즘 기반 점수 계산

        Args:
            blog_data: 크롤링된 블로그 데이터

        Returns:
            각 카테고리별 점수
        """
        posts = blog_data.get("posts", [])
        stats = blog_data.get("stats", {})
        neighbor_count = blog_data.get("neighbor_count", 0)
        blog_age_days = blog_data.get("blog_age_days", 0)
        total_posts = len(posts)

        # C-Rank 계산 (출처의 신뢰도)
        c_rank_score = self._calculate_c_rank(posts, stats, neighbor_count, blog_age_days, total_posts)

        # D.I.A. 계산 (문서 품질)
        dia_score = self._calculate_dia(posts, stats)

        logger.info(f"네이버 알고리즘 점수 - C-Rank: {c_rank_score}, D.I.A.: {dia_score}")

        return {
            "c_rank": c_rank_score,
            "dia": dia_score,
            # 하위 호환성을 위한 필드들
            "document_quality": dia_score,
            "blog_authority": c_rank_score,
            "engagement": stats.get("avg_comments", 0) * 5,  # 간단한 참여도 점수
            "freshness": self._calculate_freshness_simple(posts),
            "traffic": min(100, stats.get("total_visitors", 0) / 1000)
        }

    def calculate_scores_with_breakdown(self, blog_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        네이버 알고리즘 기반 점수 계산 (상세 breakdown 포함)

        Args:
            blog_data: 크롤링된 블로그 데이터

        Returns:
            점수와 상세 계산 과정
        """
        posts = blog_data.get("posts", [])
        stats = blog_data.get("stats", {})
        neighbor_count = blog_data.get("neighbor_count", 0)
        blog_age_days = blog_data.get("blog_age_days", 0)
        total_posts = len(posts)

        # C-Rank 계산 with breakdown
        c_rank_result = self._calculate_c_rank_with_breakdown(posts, stats, neighbor_count, blog_age_days, total_posts)

        # D.I.A. 계산 with breakdown
        dia_result = self._calculate_dia_with_breakdown(posts, stats)

        logger.info(f"네이버 알고리즘 점수 (상세) - C-Rank: {c_rank_result['score']}, D.I.A.: {dia_result['score']}")

        # 최종 블로그 점수 계산 (C-Rank 50% + D.I.A. 50%)
        final_score = c_rank_result['score'] * 0.5 + dia_result['score'] * 0.5

        # 점수 구성 설명
        score_composition = {
            'final_score': round(final_score, 2),
            'calculation_method': 'C-Rank 50% + D.I.A. 50%',
            'components': [
                {
                    'name': 'C-Rank (출처 신뢰도)',
                    'score': c_rank_result['score'],
                    'weight': 50,
                    'contribution': round(c_rank_result['score'] * 0.5, 2),
                    'sub_components': [
                        {
                            'name': 'Context (주제 집중도)',
                            'score': c_rank_result['breakdown']['context']['score'],
                            'weight': 50,
                            'contribution': round(c_rank_result['breakdown']['context']['score'] * 0.25, 2)
                        },
                        {
                            'name': 'Content (콘텐츠 품질)',
                            'score': c_rank_result['breakdown']['content']['score'],
                            'weight': 50,
                            'contribution': round(c_rank_result['breakdown']['content']['score'] * 0.25, 2)
                        }
                    ]
                },
                {
                    'name': 'D.I.A. (문서 품질)',
                    'score': dia_result['score'],
                    'weight': 50,
                    'contribution': round(dia_result['score'] * 0.5, 2),
                    'sub_components': [
                        {
                            'name': '주제 적합도',
                            'score': dia_result['breakdown']['topic_relevance']['score'],
                            'weight': 20,
                            'contribution': round(dia_result['breakdown']['topic_relevance']['score'] * 0.1, 2)
                        },
                        {
                            'name': '경험 정보',
                            'score': dia_result['breakdown']['experience']['score'],
                            'weight': 20,
                            'contribution': round(dia_result['breakdown']['experience']['score'] * 0.1, 2)
                        },
                        {
                            'name': '정보 충실성',
                            'score': dia_result['breakdown']['information_richness']['score'],
                            'weight': 20,
                            'contribution': round(dia_result['breakdown']['information_richness']['score'] * 0.1, 2)
                        },
                        {
                            'name': '독창성',
                            'score': dia_result['breakdown']['originality']['score'],
                            'weight': 15,
                            'contribution': round(dia_result['breakdown']['originality']['score'] * 0.075, 2)
                        },
                        {
                            'name': '적시성',
                            'score': dia_result['breakdown']['timeliness']['score'],
                            'weight': 15,
                            'contribution': round(dia_result['breakdown']['timeliness']['score'] * 0.075, 2)
                        },
                        {
                            'name': '어뷰징 감점',
                            'score': -dia_result['breakdown']['abuse_penalty']['score'],
                            'weight': -10,
                            'contribution': round(-dia_result['breakdown']['abuse_penalty']['score'] * 0.05, 2)
                        }
                    ]
                }
            ],
            'explanation': f"네이버 검색 알고리즘은 C-Rank(출처 신뢰도) 50%와 D.I.A.(문서 품질) 50%를 종합하여 평가합니다. 현재 블로그는 C-Rank {c_rank_result['score']}점, D.I.A. {dia_result['score']}점으로 최종 {final_score:.1f}점입니다."
        }

        return {
            "scores": {
                "c_rank": c_rank_result['score'],
                "dia": dia_result['score'],
                "document_quality": dia_result['score'],
                "blog_authority": c_rank_result['score'],
                "engagement": stats.get("avg_comments", 0) * 5,
                "freshness": self._calculate_freshness_simple(posts),
                "traffic": min(100, stats.get("total_visitors", 0) / 1000)
            },
            "breakdown": {
                "c_rank": {
                    "score": c_rank_result['score'],
                    "weight": 50,
                    "breakdown": c_rank_result['breakdown']
                },
                "dia": {
                    "score": dia_result['score'],
                    "weight": 50,
                    "breakdown": dia_result['breakdown']
                },
                "score_composition": score_composition
            }
        }

    def _calculate_c_rank(self, posts: List[Dict], stats: Dict, neighbor_count: int,
                         blog_age_days: int, total_posts: int) -> float:
        """
        C-Rank (Creator Rank) 계산 - 출처의 신뢰도 (50%)

        네이버 공식 구성요소:
        - Context (주제 집중도): 25점
        - Content (콘텐츠 품질): 25점
        - Chain (소통/댓글/이웃): 25점
        - Creator (운영기간): 25점
        """
        score = 0.0

        # 1. Context - 주제 집중도 (25점)
        context_score = self._calculate_context(posts, total_posts)
        score += context_score * 0.25

        # 2. Content - 콘텐츠 품질 (25점)
        content_quality = self._calculate_content_quality(posts, stats)
        score += content_quality * 0.25

        # 3. Chain - 소통과 연쇄반응 (25점)
        chain_score = self._calculate_chain(stats, neighbor_count)
        score += chain_score * 0.25

        # 4. Creator - 블로그 신뢰도/운영기간 (25점)
        creator_score = self._calculate_creator(blog_age_days, total_posts, posts)
        score += creator_score * 0.25

        return min(100, round(score, 2))

    def _calculate_context(self, posts: List[Dict], total_posts: int) -> float:
        """
        Context: 주제별 관심사 집중도 (100점 만점)

        네이버: "특정 주제에 대한 집중도가 얼마나 되는지"
        - 특정 주제에 집중한 블로그가 검색에 유리
        - 다양한 일상 글보다 전문성 있는 글이 중요
        """
        if not posts:
            return 20.0

        score = 0.0

        # 1. 포스트 개수 (30점)
        # 꾸준히 작성한 양
        if total_posts >= 300:
            score += 30
        elif total_posts >= 100:
            score += 20 + (total_posts - 100) / 200 * 10
        elif total_posts >= 50:
            score += 15 + (total_posts - 50) / 50 * 5
        elif total_posts >= 20:
            score += 10 + (total_posts - 20) / 30 * 5
        else:
            score += total_posts / 20 * 10

        # 2. 제목의 일관성 (35점)
        # 제목에서 특정 키워드가 반복되면 주제 집중도가 높음
        if len(posts) >= 5:
            titles = [p.get("title", "") for p in posts]
            # 제목 단어 빈도 분석
            word_freq = {}
            for title in titles:
                words = title.split()
                for word in words:
                    if len(word) >= 2:  # 2글자 이상만
                        word_freq[word] = word_freq.get(word, 0) + 1

            # 가장 많이 등장하는 단어의 빈도
            if word_freq:
                max_freq = max(word_freq.values())
                consistency_ratio = max_freq / len(posts)

                if consistency_ratio >= 0.5:  # 50% 이상 일관성
                    score += 35
                elif consistency_ratio >= 0.3:  # 30% 이상
                    score += 25 + (consistency_ratio - 0.3) / 0.2 * 10
                elif consistency_ratio >= 0.15:  # 15% 이상
                    score += 15 + (consistency_ratio - 0.15) / 0.15 * 10
                else:
                    score += consistency_ratio / 0.15 * 15
            else:
                score += 10
        else:
            score += 15

        # 3. 포스팅 간격의 일관성 (35점)
        # 꾸준히 작성하는 패턴
        if len(posts) >= 5:
            dates = []
            for p in posts:
                try:
                    date = datetime.fromisoformat(p["date"].replace('Z', '+00:00'))
                    dates.append(date)
                except (ValueError, KeyError, AttributeError) as e:
                    logger.debug(f"Failed to parse date: {e}")
                    continue

            if len(dates) >= 5:
                dates.sort()
                intervals = [(dates[i+1] - dates[i]).days for i in range(len(dates)-1)]
                avg_interval = sum(intervals) / len(intervals)

                # 일관된 간격이 중요
                interval_variance = sum((x - avg_interval) ** 2 for x in intervals) / len(intervals)
                std_dev = interval_variance ** 0.5

                # 표준편차가 작을수록 일관성 있음
                if std_dev <= 3:  # 매우 일관적
                    score += 35
                elif std_dev <= 7:
                    score += 28 + (7 - std_dev) / 4 * 7
                elif std_dev <= 14:
                    score += 20 + (14 - std_dev) / 7 * 8
                elif std_dev <= 30:
                    score += 10 + (30 - std_dev) / 16 * 10
                else:
                    score += max(5, 10 - (std_dev - 30) / 30 * 5)
            else:
                score += 15
        else:
            score += 15

        return min(100, round(score, 2))

    def _calculate_content_quality(self, posts: List[Dict], stats: Dict) -> float:
        """
        Content: 콘텐츠 품질 (100점 만점)

        네이버: "생산되는 정보의 품질"
        - 양질의 글
        - 상세한 정보
        - 깊이 있는 의견
        """
        if not posts:
            return 20.0

        score = 0.0

        # 1. 평균 글 길이 (50점)
        # RSS description으로 추정
        total_length = sum(len(p.get("description", "")) for p in posts)
        avg_length = total_length / len(posts) if posts else 0

        if avg_length >= 200:  # 매우 상세
            score += 50
        elif avg_length >= 150:
            score += 42 + (avg_length - 150) / 50 * 8
        elif avg_length >= 100:
            score += 32 + (avg_length - 100) / 50 * 10
        elif avg_length >= 70:
            score += 22 + (avg_length - 70) / 30 * 10
        elif avg_length >= 50:
            score += 15 + (avg_length - 50) / 20 * 7
        else:
            score += avg_length / 50 * 15

        # 2. 제목 품질 (30점)
        # 구체적이고 명확한 제목
        good_titles = 0
        for p in posts:
            title = p.get("title", "")
            title_length = len(title)

            # 15-50자가 최적
            if 15 <= title_length <= 50:
                good_titles += 1
            elif 10 <= title_length < 15 or 50 < title_length <= 70:
                good_titles += 0.7
            elif 5 <= title_length < 10:
                good_titles += 0.3

        title_ratio = good_titles / len(posts) if posts else 0
        score += title_ratio * 30

        # 3. 콘텐츠 다양성 (20점)
        # 다양한 길이의 글 (획일적이지 않음)
        if len(posts) >= 3:
            lengths = [len(p.get("description", "")) for p in posts]
            avg = sum(lengths) / len(lengths)
            variance = sum((x - avg) ** 2 for x in lengths) / len(lengths)
            std_dev = variance ** 0.5

            # 적절한 다양성
            if 30 <= std_dev <= 100:
                score += 20
            elif 20 <= std_dev < 30 or 100 < std_dev <= 150:
                score += 15
            elif 10 <= std_dev < 20:
                score += 10
            else:
                score += 5
        else:
            score += 10

        return min(100, round(score, 2))

    def _calculate_chain(self, stats: Dict, neighbor_count: int) -> float:
        """
        Chain: 소통과 연쇄반응 (100점 만점)

        네이버: "콘텐츠가 어떤 연쇄반응을 보이며 소비/생산되는지"
        - 다른 사람들과 소통
        - 댓글, 공감
        - 이웃 수
        """
        score = 0.0

        avg_comments = stats.get("avg_comments", 0)
        avg_likes = stats.get("avg_likes", 0)

        # 1. 평균 댓글 수 (50점) - 가장 중요
        if avg_comments >= 20:
            score += 50
        elif avg_comments >= 10:
            score += 40 + (avg_comments - 10) / 10 * 10
        elif avg_comments >= 5:
            score += 28 + (avg_comments - 5) / 5 * 12
        elif avg_comments >= 2:
            score += 18 + (avg_comments - 2) / 3 * 10
        elif avg_comments >= 1:
            score += 12 + (avg_comments - 1) * 6
        else:
            score += avg_comments * 12

        # 2. 평균 공감/좋아요 (30점)
        if avg_likes >= 30:
            score += 30
        elif avg_likes >= 15:
            score += 23 + (avg_likes - 15) / 15 * 7
        elif avg_likes >= 7:
            score += 16 + (avg_likes - 7) / 8 * 7
        elif avg_likes >= 3:
            score += 10 + (avg_likes - 3) / 4 * 6
        else:
            score += avg_likes * 3

        # 3. 이웃 수 (20점)
        # 네이버: "다른 사람들과 소통하는 정도"
        if neighbor_count >= 500:
            score += 20
        elif neighbor_count >= 200:
            score += 16 + (neighbor_count - 200) / 300 * 4
        elif neighbor_count >= 100:
            score += 12 + (neighbor_count - 100) / 100 * 4
        elif neighbor_count >= 50:
            score += 8 + (neighbor_count - 50) / 50 * 4
        elif neighbor_count >= 20:
            score += 5 + (neighbor_count - 20) / 30 * 3
        else:
            score += neighbor_count / 20 * 5

        return min(100, round(score, 2))

    def _calculate_creator(self, blog_age_days: int, total_posts: int, posts: List[Dict]) -> float:
        """
        Creator: 블로그 신뢰도/인기도 (100점 만점)

        네이버: "지속적으로 운영된 블로그일수록 유리"
        - 블로그 운영 기간
        - 꾸준한 포스팅
        """
        score = 0.0

        # 1. 블로그 운영 기간 (60점)
        # 네이버: "지속적으로 좋은 컨텐츠를 생산하며 운영해 온 블로그일수록"
        years = blog_age_days / 365.0 if blog_age_days > 0 else 0

        if years >= 5:
            score += 60
        elif years >= 3:
            score += 50 + (years - 3) / 2 * 10
        elif years >= 2:
            score += 40 + (years - 2) * 10
        elif years >= 1:
            score += 28 + (years - 1) * 12
        elif years >= 0.5:
            score += 18 + (years - 0.5) / 0.5 * 10
        else:
            score += years / 0.5 * 18

        # 2. 포스팅 빈도 (40점)
        # 꾸준히 작성
        if len(posts) >= 2:
            now = datetime.utcnow()
            recent_30days = 0
            recent_90days = 0

            for p in posts:
                try:
                    date = datetime.fromisoformat(p["date"].replace('Z', '+00:00'))
                    days_ago = (now - date).days

                    if days_ago <= 30:
                        recent_30days += 1
                    if days_ago <= 90:
                        recent_90days += 1
                except (ValueError, KeyError, AttributeError, TypeError) as e:
                    logger.debug(f"Failed to parse post data: {e}")
                    continue

            # 최근 활동
            if recent_30days >= 8:  # 주 2회 이상
                activity = 25
            elif recent_30days >= 4:  # 주 1회
                activity = 20 + (recent_30days - 4) / 4 * 5
            elif recent_30days >= 2:
                activity = 13 + (recent_30days - 2) / 2 * 7
            elif recent_30days >= 1:
                activity = 8
            else:
                activity = 3

            # 3개월 활동
            if recent_90days >= 20:
                long_activity = 15
            elif recent_90days >= 12:
                long_activity = 12 + (recent_90days - 12) / 8 * 3
            elif recent_90days >= 6:
                long_activity = 8 + (recent_90days - 6) / 6 * 4
            elif recent_90days >= 3:
                long_activity = 5 + (recent_90days - 3) / 3 * 3
            else:
                long_activity = recent_90days / 3 * 5

            score += activity + long_activity
        else:
            score += 15

        return min(100, round(score, 2))

    def _calculate_dia(self, posts: List[Dict], stats: Dict) -> float:
        """
        D.I.A. (Deep Intent Analysis) 계산 - 문서 품질 (50%)

        네이버 공식 구성요소:
        - 주제 적합도: 20점
        - 경험 정보: 20점
        - 정보의 충실성: 20점
        - 독창성: 15점
        - 적시성: 15점
        - 어뷰징 척도: -10점 (감점)
        """
        if not posts:
            return 25.0

        score = 0.0

        # 1. 주제 적합도 (20점)
        # 검색어와 문서 내용의 일치도
        topic_score = self._calculate_topic_relevance(posts)
        score += topic_score * 0.2

        # 2. 경험 정보 (20점)
        # 네이버: "작성자의 실제 경험 후기"
        experience_score = self._calculate_experience(posts)
        score += experience_score * 0.2

        # 3. 정보의 충실성 (20점)
        # 네이버: "상세한 정보가 많은 문서"
        richness_score = self._calculate_information_richness(posts, stats)
        score += richness_score * 0.2

        # 4. 독창성 (15점)
        # 네이버: "본인만의 정보를 담은 글"
        originality_score = self._calculate_originality(posts)
        score += originality_score * 0.15

        # 5. 적시성 (15점)
        # 네이버: "검색 시점, 문서가 쓰여진 날짜"
        timeliness_score = self._calculate_timeliness(posts)
        score += timeliness_score * 0.15

        # 6. 어뷰징 척도 감점 (최대 -10점)
        abuse_penalty = self._calculate_abuse_score(posts)
        score -= abuse_penalty * 0.1

        return min(100, max(0, round(score, 2)))

    def _calculate_topic_relevance(self, posts: List[Dict]) -> float:
        """주제 적합도 (100점 만점)"""
        if not posts:
            return 30.0

        score = 0.0

        # 제목과 내용의 일관성
        consistent_posts = 0
        for p in posts:
            title = p.get("title", "")
            desc = p.get("description", "")

            if title and desc:
                # 제목의 주요 단어가 본문에도 있는지
                title_words = set(title.split())
                desc_words = set(desc.split())

                overlap = len(title_words & desc_words)
                if overlap >= 2:  # 2개 이상 단어 일치
                    consistent_posts += 1

        consistency_ratio = consistent_posts / len(posts) if posts else 0
        score = consistency_ratio * 100

        return min(100, round(score, 2))

    def _calculate_experience(self, posts: List[Dict]) -> float:
        """
        경험 정보 (100점 만점)

        네이버: "본인이 실제 경험한 체험기"
        """
        if not posts:
            return 25.0

        score = 0.0

        # 경험을 나타내는 패턴
        experience_keywords = [
            "다녀왔", "방문했", "체험", "후기", "리뷰", "직접", "경험",
            "느낌", "생각", "추천", "솔직", "써보", "먹어봤", "가봤"
        ]

        experience_posts = 0
        for p in posts:
            title = p.get("title", "")
            desc = p.get("description", "")
            text = title + " " + desc

            # 경험 키워드 포함 여부
            if any(keyword in text for keyword in experience_keywords):
                experience_posts += 1

        experience_ratio = experience_posts / len(posts) if posts else 0

        # 경험 기반 글이 많을수록 높은 점수
        if experience_ratio >= 0.7:
            score = 100
        elif experience_ratio >= 0.5:
            score = 80 + (experience_ratio - 0.5) / 0.2 * 20
        elif experience_ratio >= 0.3:
            score = 60 + (experience_ratio - 0.3) / 0.2 * 20
        elif experience_ratio >= 0.1:
            score = 35 + (experience_ratio - 0.1) / 0.2 * 25
        else:
            score = experience_ratio / 0.1 * 35

        return min(100, round(score, 2))

    def _calculate_information_richness(self, posts: List[Dict], stats: Dict) -> float:
        """
        정보의 충실성 (100점 만점)

        네이버: "좋은 정보가 많은 문서"

        ※ RSS description 길이 기준 완화 (실제 글은 더 김)
        """
        if not posts:
            return 25.0

        score = 0.0

        # 1. 평균 글 길이 (70점) - RSS 기준 완화
        total_length = sum(len(p.get("description", "")) for p in posts)
        avg_length = total_length / len(posts) if posts else 0

        # RSS description은 보통 100-200자, 실제 글은 훨씬 김
        # 기준을 낮춰서 RSS 기준으로도 좋은 점수 받도록
        if avg_length >= 100:
            score += 70
        elif avg_length >= 70:
            score += 55 + (avg_length - 70) / 30 * 15
        elif avg_length >= 50:
            score += 40 + (avg_length - 50) / 20 * 15
        elif avg_length >= 30:
            score += 25 + (avg_length - 30) / 20 * 15
        else:
            score += avg_length / 30 * 25

        # 2. 콘텐츠 깊이 (30점) - 최대 길이 기준
        if len(posts) >= 3:
            lengths = [len(p.get("description", "")) for p in posts]
            max_length = max(lengths) if lengths else 0

            # RSS description 기준 완화
            if max_length >= 150:
                score += 30
            elif max_length >= 100:
                score += 22 + (max_length - 100) / 50 * 8
            elif max_length >= 70:
                score += 15 + (max_length - 70) / 30 * 7
            else:
                score += max_length / 70 * 15
        else:
            score += 15

        return min(100, round(score, 2))

    def _calculate_originality(self, posts: List[Dict]) -> float:
        """
        독창성 (100점 만점)

        네이버: "본인만의 정보를 담은 글"
        """
        if not posts:
            return 30.0

        score = 0.0

        # 제목의 다양성
        if len(posts) >= 3:
            titles = [p.get("title", "") for p in posts]
            unique_words = set()
            total_words = 0

            for title in titles:
                words = title.split()
                total_words += len(words)
                unique_words.update(words)

            # 고유 단어 비율
            uniqueness_ratio = len(unique_words) / total_words if total_words > 0 else 0

            # 다양한 단어 사용 = 독창적
            if uniqueness_ratio >= 0.7:
                score = 100
            elif uniqueness_ratio >= 0.5:
                score = 75 + (uniqueness_ratio - 0.5) / 0.2 * 25
            elif uniqueness_ratio >= 0.3:
                score = 50 + (uniqueness_ratio - 0.3) / 0.2 * 25
            else:
                score = uniqueness_ratio / 0.3 * 50
        else:
            score = 50

        return min(100, round(score, 2))

    def _calculate_timeliness(self, posts: List[Dict]) -> float:
        """
        적시성 (100점 만점)

        네이버: "검색 시점, 문서가 쓰여진 날짜에 랭킹이 더 민감"
        """
        if not posts:
            return 20.0

        now = datetime.utcnow()
        most_recent_days = 999

        for p in posts:
            try:
                date = datetime.fromisoformat(p["date"].replace('Z', '+00:00'))
                days_ago = (now - date).days
                most_recent_days = min(most_recent_days, days_ago)
            except (ValueError, KeyError, AttributeError, TypeError) as e:
                logger.debug(f"Failed to parse post date for recency: {e}")
                continue

        # 최신성 점수
        if most_recent_days <= 3:
            score = 100
        elif most_recent_days <= 7:
            score = 88 + (7 - most_recent_days) / 4 * 12
        elif most_recent_days <= 14:
            score = 73 + (14 - most_recent_days) / 7 * 15
        elif most_recent_days <= 30:
            score = 55 + (30 - most_recent_days) / 16 * 18
        elif most_recent_days <= 90:
            score = 32 + (90 - most_recent_days) / 60 * 23
        elif most_recent_days <= 180:
            score = 15 + (180 - most_recent_days) / 90 * 17
        else:
            score = max(5, 15 - (most_recent_days - 180) / 180 * 10)

        return min(100, round(score, 2))

    def _calculate_abuse_score(self, posts: List[Dict]) -> float:
        """
        어뷰징 척도 (100점 만점, 감점용) - 강화된 저품질 감지

        네이버: "상대적인 어뷰징 척도"
        - 비체험 후기
        - 광고성 도배글
        - 제목/내용 중복
        - 매우 짧은 저품질 콘텐츠
        """
        if not posts:
            return 0.0

        penalty = 0.0

        # 1. 제목 중복 패턴 체크 (더 엄격하게)
        titles = [p.get("title", "") for p in posts]
        unique_ratio = len(set(titles)) / len(titles) if titles else 1.0

        if unique_ratio < 0.5:  # 50% 이상 중복 (심각)
            penalty += 50
        elif unique_ratio < 0.7:  # 30% 이상 중복
            penalty += 30
        elif unique_ratio < 0.8:  # 20% 이상 중복
            penalty += 15

        # 2. 짧은 글 비율 (더 엄격하게)
        very_short = sum(1 for p in posts if len(p.get("description", "")) < 20)
        short_posts = sum(1 for p in posts if len(p.get("description", "")) < 50)

        very_short_ratio = very_short / len(posts) if posts else 0
        short_ratio = short_posts / len(posts) if posts else 0

        if very_short_ratio >= 0.7:  # 70% 이상이 매우 짧음 (심각)
            penalty += 50
        elif very_short_ratio >= 0.5:  # 50% 이상
            penalty += 30
        elif short_ratio >= 0.7:  # 70% 이상이 짧음
            penalty += 25
        elif short_ratio >= 0.5:  # 50% 이상
            penalty += 15

        # 3. 광고성 키워드 (확장된 리스트)
        ad_keywords = [
            "광고", "협찬", "제공", "홍보", "이벤트",
            "체험단", "원고료", "서포터즈", "PPL",
            "무료제공", "소정의", "리워드"
        ]
        ad_posts = 0

        for p in posts:
            text = p.get("title", "") + " " + p.get("description", "")
            ad_count = sum(1 for keyword in ad_keywords if keyword in text)
            if ad_count >= 2:  # 2개 이상 광고 키워드
                ad_posts += 1

        ad_ratio = ad_posts / len(posts) if posts else 0
        if ad_ratio >= 0.8:  # 80% 이상 광고성 (심각)
            penalty += 40
        elif ad_ratio >= 0.6:  # 60% 이상
            penalty += 25
        elif ad_ratio >= 0.4:  # 40% 이상
            penalty += 10

        # 4. 제목 길이 체크 (매우 짧은 제목)
        very_short_titles = sum(1 for t in titles if len(t) < 5)
        short_title_ratio = very_short_titles / len(titles) if titles else 0

        if short_title_ratio >= 0.5:  # 50% 이상이 매우 짧은 제목
            penalty += 20
        elif short_title_ratio >= 0.3:
            penalty += 10

        # 5. 동일 문구 반복 체크
        descriptions = [p.get("description", "") for p in posts]
        if len(descriptions) >= 5:
            # 가장 자주 등장하는 문구 찾기
            desc_freq = {}
            for desc in descriptions:
                if desc and len(desc) > 10:
                    desc_freq[desc] = desc_freq.get(desc, 0) + 1

            if desc_freq:
                max_freq = max(desc_freq.values())
                if max_freq / len(descriptions) >= 0.3:  # 30% 이상 동일 문구
                    penalty += 25

        return min(100, round(penalty, 2))

    def _calculate_freshness_simple(self, posts: List[Dict]) -> float:
        """간단한 최신성 계산 (하위 호환)"""
        if not posts:
            return 20.0

        now = datetime.utcnow()
        most_recent_days = 999

        for p in posts:
            try:
                date = datetime.fromisoformat(p["date"].replace('Z', '+00:00'))
                days_ago = (now - date).days
                most_recent_days = min(most_recent_days, days_ago)
            except (ValueError, KeyError, AttributeError, TypeError) as e:
                logger.debug(f"Failed to parse post date for recency: {e}")
                continue

        if most_recent_days <= 7:
            return 100
        elif most_recent_days <= 30:
            return 70 + (30 - most_recent_days) / 23 * 30
        elif most_recent_days <= 90:
            return 40 + (90 - most_recent_days) / 60 * 30
        else:
            return max(10, 40 - (most_recent_days - 90) / 90 * 30)

    def _calculate_c_rank_with_breakdown(self, posts: List[Dict], stats: Dict, neighbor_count: int,
                                         blog_age_days: int, total_posts: int) -> Dict[str, Any]:
        """C-Rank 계산 with breakdown"""
        # Context 계산
        context_score = self._calculate_context(posts, total_posts)
        context_breakdown = self._get_context_breakdown(posts, total_posts)

        # Content 계산
        content_quality = self._calculate_content_quality(posts, stats)
        content_breakdown = self._get_content_quality_breakdown(posts, stats)

        # Chain 계산
        chain_score = self._calculate_chain(stats, neighbor_count)
        chain_breakdown = self._get_chain_breakdown(stats, neighbor_count)

        # Creator 계산
        creator_score = self._calculate_creator(blog_age_days, total_posts, posts)
        creator_breakdown = self._get_creator_breakdown(blog_age_days, total_posts, posts)

        # C-Rank 총점 (4개 요소 각각 25%)
        score = (context_score * 0.25 + content_quality * 0.25 +
                chain_score * 0.25 + creator_score * 0.25)

        return {
            'score': min(100, round(score, 2)),
            'breakdown': {
                'context': {
                    'score': round(context_score, 2),
                    'weight': 25,
                    'details': context_breakdown
                },
                'content': {
                    'score': round(content_quality, 2),
                    'weight': 25,
                    'details': content_breakdown
                },
                'chain': {
                    'score': round(chain_score, 2),
                    'weight': 25,
                    'details': chain_breakdown
                },
                'creator': {
                    'score': round(creator_score, 2),
                    'weight': 25,
                    'details': creator_breakdown
                }
            }
        }

    def _get_context_breakdown(self, posts: List[Dict], total_posts: int) -> Dict[str, Any]:
        """Context 상세 계산 과정"""
        breakdown = {}

        # 1. 포스트 개수 분석
        if total_posts >= 300:
            post_score = 30
            post_desc = f"매우 많은 포스트 ({total_posts}개)"
            post_reasoning = "300개 이상의 포스트로 만점 달성. 네이버는 꾸준히 작성한 블로그를 선호합니다."
        elif total_posts >= 100:
            post_score = 20 + (total_posts - 100) / 200 * 10
            post_desc = f"충분한 포스트 ({total_posts}개)"
            post_reasoning = f"100개 이상 포스트로 기본 점수 확보. 300개까지 추가 {300-total_posts}개 작성 시 만점 가능."
        elif total_posts >= 50:
            post_score = 15 + (total_posts - 50) / 50 * 5
            post_desc = f"적절한 포스트 ({total_posts}개)"
            post_reasoning = f"50개 이상으로 기본 수준. 100개 이상 작성 시 점수가 크게 향상됩니다."
        else:
            post_score = total_posts / 20 * 10
            post_desc = f"포스트 부족 ({total_posts}개, 권장: 50개 이상)"
            post_reasoning = f"포스트가 부족합니다. 최소 50개 이상 작성을 권장합니다. (현재: {total_posts}개)"

        breakdown['post_count'] = {
            'score': round(post_score, 2),
            'max_score': 30,
            'value': total_posts,
            'description': post_desc,
            'reasoning': post_reasoning,
            'how_to_improve': '포스트를 꾸준히 작성하여 100개 이상 유지하세요.' if total_posts < 100 else '현재 수준 유지'
        }

        # 2. 제목 일관성 분석
        if len(posts) >= 5:
            titles = [p.get("title", "") for p in posts]
            word_freq = {}
            for title in titles:
                words = title.split()
                for word in words:
                    if len(word) >= 2:
                        word_freq[word] = word_freq.get(word, 0) + 1

            if word_freq:
                max_word = max(word_freq.items(), key=lambda x: x[1])
                max_freq = max_word[1]
                consistency_ratio = max_freq / len(posts)

                # 상위 5개 키워드 추출
                top_keywords = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:5]

                # 주요 키워드를 포함하는 포스트 예시
                keyword_examples = []
                for keyword, freq in top_keywords[:3]:  # 상위 3개 키워드만
                    example_posts = []
                    for p in posts:
                        if keyword in p.get("title", ""):
                            example_posts.append({
                                'title': p.get("title", "")[:60],
                                'date': p.get("date", "")[:10]
                            })
                            if len(example_posts) >= 3:  # 최대 3개 예시
                                break

                    keyword_examples.append({
                        'keyword': keyword,
                        'frequency': freq,
                        'ratio': f"{freq/len(posts)*100:.1f}%",
                        'examples': example_posts
                    })

                if consistency_ratio >= 0.5:
                    consistency_score = 35
                    consistency_desc = f"주제 집중도 높음 ('{max_word[0]}' 키워드가 {max_freq}/{len(posts)}개 포스트에 등장)"
                    reasoning = f"특정 주제('{max_word[0]}')에 50% 이상 집중하여 네이버 알고리즘에 매우 유리합니다."
                elif consistency_ratio >= 0.3:
                    consistency_score = 25 + (consistency_ratio - 0.3) / 0.2 * 10
                    consistency_desc = f"주제 집중도 양호 ('{max_word[0]}' 키워드가 {max_freq}/{len(posts)}개 포스트에 등장)"
                    reasoning = f"주제 집중도가 양호하나, '{max_word[0]}' 키워드를 더 많은 포스트에 활용하면 점수가 향상됩니다."
                else:
                    consistency_score = consistency_ratio / 0.15 * 15
                    consistency_desc = f"주제 분산됨 (가장 많은 키워드 '{max_word[0]}': {max_freq}/{len(posts)}개)"
                    reasoning = f"주제가 분산되어 있습니다. 특정 주제에 집중한 포스트를 늘리면 검색 노출이 개선됩니다."

                breakdown['title_consistency'] = {
                    'score': round(consistency_score, 2),
                    'max_score': 35,
                    'value': f"{consistency_ratio*100:.1f}%",
                    'top_keyword': max_word[0],
                    'keyword_count': max_freq,
                    'description': consistency_desc,
                    'reasoning': reasoning,
                    'top_keywords': top_keywords[:5],
                    'keyword_examples': keyword_examples,
                    'how_to_improve': f"'{max_word[0]}' 또는 관련 키워드를 포함한 포스트를 더 작성하세요."
                }
            else:
                breakdown['title_consistency'] = {
                    'score': 10,
                    'max_score': 35,
                    'description': "제목 분석 불가"
                }
        else:
            breakdown['title_consistency'] = {
                'score': 15,
                'max_score': 35,
                'description': f"포스트 부족 ({len(posts)}개, 분석 최소: 5개)"
            }

        # 3. 포스팅 간격 분석
        if len(posts) >= 5:
            dates = []
            for p in posts:
                try:
                    date = datetime.fromisoformat(p["date"].replace('Z', '+00:00'))
                    dates.append(date)
                except (ValueError, KeyError, AttributeError, TypeError) as e:
                    logger.debug(f"Failed to parse post data: {e}")
                    continue

            if len(dates) >= 5:
                dates.sort()
                intervals = [(dates[i+1] - dates[i]).days for i in range(len(dates)-1)]
                avg_interval = sum(intervals) / len(intervals)
                interval_variance = sum((x - avg_interval) ** 2 for x in intervals) / len(intervals)
                std_dev = interval_variance ** 0.5

                if std_dev <= 3:
                    interval_score = 35
                    interval_desc = f"매우 규칙적 (평균 {avg_interval:.1f}일 간격, 편차 {std_dev:.1f}일)"
                    reasoning = f"포스팅 간격이 매우 규칙적입니다. 네이버는 꾸준한 활동을 선호합니다."
                elif std_dev <= 7:
                    interval_score = 28 + (7 - std_dev) / 4 * 7
                    interval_desc = f"규칙적 (평균 {avg_interval:.1f}일 간격, 편차 {std_dev:.1f}일)"
                    reasoning = f"규칙적인 포스팅 패턴을 유지하고 있습니다. 현재 수준을 유지하세요."
                elif std_dev <= 14:
                    interval_score = 20 + (14 - std_dev) / 7 * 8
                    interval_desc = f"다소 불규칙 (평균 {avg_interval:.1f}일 간격, 편차 {std_dev:.1f}일)"
                    reasoning = f"포스팅 간격이 다소 불규칙합니다. 일정한 간격으로 작성하면 점수가 향상됩니다."
                else:
                    interval_score = max(5, 10 - (std_dev - 30) / 30 * 5)
                    interval_desc = f"불규칙 (평균 {avg_interval:.1f}일 간격, 편차 {std_dev:.1f}일)"
                    reasoning = f"포스팅이 매우 불규칙합니다. 주 1-2회 등 일정한 패턴으로 작성하세요."

                breakdown['posting_consistency'] = {
                    'score': round(interval_score, 2),
                    'max_score': 35,
                    'avg_interval': round(avg_interval, 1),
                    'std_deviation': round(std_dev, 1),
                    'description': interval_desc,
                    'reasoning': reasoning,
                    'how_to_improve': '주 1-2회 등 일정한 패턴으로 포스팅하세요.' if std_dev > 7 else '현재 수준 유지'
                }
            else:
                breakdown['posting_consistency'] = {
                    'score': 15,
                    'max_score': 35,
                    'description': "날짜 정보 부족"
                }
        else:
            breakdown['posting_consistency'] = {
                'score': 15,
                'max_score': 35,
                'description': f"포스트 부족 ({len(posts)}개)"
            }

        return breakdown

    def _get_content_quality_breakdown(self, posts: List[Dict], stats: Dict) -> Dict[str, Any]:
        """Content Quality 상세 계산 과정"""
        breakdown = {}

        # 1. 평균 글 길이
        total_length = sum(len(p.get("description", "")) for p in posts)
        avg_length = total_length / len(posts) if posts else 0

        # 개별 포스트 길이 분석 및 예시
        post_length_examples = []
        for p in posts[:5]:  # 최대 5개 예시
            desc_length = len(p.get("description", ""))
            title = p.get("title", "")[:50]

            # 개별 포스트 점수 계산 (50점 만점)
            if desc_length >= 200:
                post_score = 50
                quality_label = "매우 상세"
            elif desc_length >= 150:
                post_score = 42 + (desc_length - 150) / 50 * 8
                quality_label = "상세"
            elif desc_length >= 100:
                post_score = 32 + (desc_length - 100) / 50 * 10
                quality_label = "적절"
            elif desc_length >= 70:
                post_score = 22 + (desc_length - 70) / 30 * 10
                quality_label = "다소 짧음"
            else:
                post_score = desc_length / 50 * 15
                quality_label = "짧음"

            post_length_examples.append({
                'title': title,
                'length': desc_length,
                'score': round(post_score, 1),
                'quality': quality_label,
                'preview': p.get("description", "")[:100]
            })

        if avg_length >= 200:
            length_score = 50
            length_desc = f"매우 상세함 (평균 {avg_length:.0f}자)"
            reasoning = "평균 글 길이가 200자 이상으로 매우 상세합니다. 네이버는 깊이 있는 정보를 선호합니다."
        elif avg_length >= 150:
            length_score = 42 + (avg_length - 150) / 50 * 8
            length_desc = f"상세함 (평균 {avg_length:.0f}자)"
            reasoning = f"평균 글 길이가 양호합니다. 200자 이상으로 작성하면 만점을 받을 수 있습니다."
        elif avg_length >= 100:
            length_score = 32 + (avg_length - 100) / 50 * 10
            length_desc = f"적절함 (평균 {avg_length:.0f}자)"
            reasoning = f"평균 글 길이가 적절합니다. 150자 이상으로 늘리면 점수가 향상됩니다."
        elif avg_length >= 70:
            length_score = 22 + (avg_length - 70) / 30 * 10
            length_desc = f"다소 짧음 (평균 {avg_length:.0f}자, 권장: 100자 이상)"
            reasoning = f"글이 다소 짧습니다. 최소 100자 이상의 상세한 내용을 작성하세요."
        else:
            length_score = avg_length / 50 * 15
            length_desc = f"너무 짧음 (평균 {avg_length:.0f}자, 권장: 100자 이상)"
            reasoning = f"글이 너무 짧습니다. 상세한 정보를 담아 100자 이상 작성하세요."

        breakdown['average_length'] = {
            'score': round(length_score, 2),
            'max_score': 50,
            'value': round(avg_length, 0),
            'description': length_desc,
            'reasoning': reasoning,
            'note': '※ RSS 요약 기준 (실제 글은 더 김)',
            'post_examples': post_length_examples,
            'how_to_improve': '평균 150자 이상의 상세한 내용을 작성하세요.' if avg_length < 150 else '현재 수준 유지'
        }

        # 2. 제목 품질
        good_titles = 0
        title_examples = []

        for p in posts[:5]:  # 최대 5개 예시
            title = p.get("title", "")
            title_length = len(title)

            # 개별 제목 점수 계산 (30점 만점)
            if 15 <= title_length <= 50:
                title_quality_score = 30
                quality_label = "우수"
                good_titles += 1
            elif 10 <= title_length < 15 or 50 < title_length <= 70:
                title_quality_score = 21
                quality_label = "양호"
            elif 5 <= title_length < 10:
                title_quality_score = 9
                quality_label = "짧음"
            else:
                title_quality_score = 0
                quality_label = "매우 짧거나 너무 김"

            title_examples.append({
                'title': title[:60],
                'length': title_length,
                'score': title_quality_score,
                'quality': quality_label
            })

        # 전체 포스트 중 good_titles 계산
        for p in posts[5:]:
            title_length = len(p.get("title", ""))
            if 15 <= title_length <= 50:
                good_titles += 1

        title_ratio = good_titles / len(posts) if posts else 0
        title_score = title_ratio * 30

        breakdown['title_quality'] = {
            'score': round(title_score, 2),
            'max_score': 30,
            'good_titles': good_titles,
            'total_titles': len(posts),
            'ratio': f"{title_ratio*100:.1f}%",
            'description': f"적절한 제목 {good_titles}/{len(posts)}개 (15-50자 권장)",
            'reasoning': f"제목 길이가 적절한 포스트가 {title_ratio*100:.1f}%입니다. 15-50자 범위가 최적입니다.",
            'title_examples': title_examples,
            'how_to_improve': '제목을 15-50자로 작성하여 구체적이면서도 간결하게 만드세요.' if title_ratio < 0.7 else '현재 수준 유지'
        }

        # 3. 콘텐츠 다양성
        if len(posts) >= 3:
            lengths = [len(p.get("description", "")) for p in posts]
            avg = sum(lengths) / len(lengths)
            variance = sum((x - avg) ** 2 for x in lengths) / len(lengths)
            std_dev = variance ** 0.5

            if 30 <= std_dev <= 100:
                diversity_score = 20
                diversity_desc = f"다양한 길이 (표준편차 {std_dev:.0f})"
                reasoning = "포스트 길이가 다양하여 획일적이지 않습니다. 다양한 형식의 콘텐츠가 있는 것은 긍정적입니다."
            elif 20 <= std_dev < 30 or 100 < std_dev <= 150:
                diversity_score = 15
                diversity_desc = f"적절한 다양성 (표준편차 {std_dev:.0f})"
                reasoning = "포스트 길이에 적절한 다양성이 있습니다."
            else:
                diversity_score = 10
                diversity_desc = f"단조로움 (표준편차 {std_dev:.0f})"
                reasoning = "포스트 길이가 너무 일정하거나 너무 다양합니다. 적절한 다양성을 유지하세요."

            breakdown['content_diversity'] = {
                'score': round(diversity_score, 2),
                'max_score': 20,
                'std_deviation': round(std_dev, 1),
                'description': diversity_desc,
                'reasoning': reasoning,
                'how_to_improve': '짧은 글과 긴 글을 적절히 섞어 다양성을 유지하세요.' if diversity_score < 15 else '현재 수준 유지'
            }
        else:
            breakdown['content_diversity'] = {
                'score': 10,
                'max_score': 20,
                'description': "포스트 부족 (3개 이상 필요)"
            }

        return breakdown

    def _calculate_dia_with_breakdown(self, posts: List[Dict], stats: Dict) -> Dict[str, Any]:
        """D.I.A. 계산 with breakdown"""
        if not posts:
            return {
                'score': 25.0,
                'breakdown': {}
            }

        # 각 요소별 계산
        topic_score = self._calculate_topic_relevance(posts)
        topic_breakdown = self._get_topic_relevance_breakdown(posts)

        experience_score = self._calculate_experience(posts)
        experience_breakdown = self._get_experience_breakdown(posts)

        richness_score = self._calculate_information_richness(posts, stats)
        richness_breakdown = self._get_information_richness_breakdown(posts, stats)

        originality_score = self._calculate_originality(posts)
        originality_breakdown = self._get_originality_breakdown(posts)

        timeliness_score = self._calculate_timeliness(posts)
        timeliness_breakdown = self._get_timeliness_breakdown(posts)

        abuse_penalty = self._calculate_abuse_score(posts)
        abuse_breakdown = self._get_abuse_breakdown(posts)

        # D.I.A. 총점
        score = (
            topic_score * 0.2 +
            experience_score * 0.2 +
            richness_score * 0.2 +
            originality_score * 0.15 +
            timeliness_score * 0.15 -
            abuse_penalty * 0.1
        )

        return {
            'score': min(100, max(0, round(score, 2))),
            'breakdown': {
                'topic_relevance': {
                    'score': round(topic_score, 2),
                    'weight': 20,
                    'details': topic_breakdown
                },
                'experience': {
                    'score': round(experience_score, 2),
                    'weight': 20,
                    'details': experience_breakdown
                },
                'information_richness': {
                    'score': round(richness_score, 2),
                    'weight': 20,
                    'details': richness_breakdown
                },
                'originality': {
                    'score': round(originality_score, 2),
                    'weight': 15,
                    'details': originality_breakdown
                },
                'timeliness': {
                    'score': round(timeliness_score, 2),
                    'weight': 15,
                    'details': timeliness_breakdown
                },
                'abuse_penalty': {
                    'score': round(abuse_penalty, 2),
                    'weight': -10,
                    'details': abuse_breakdown
                }
            }
        }

    def _get_topic_relevance_breakdown(self, posts: List[Dict]) -> Dict[str, Any]:
        """주제 적합도 상세"""
        consistent_posts = 0
        examples = []

        for p in posts[:5]:  # 최대 5개 예시
            title = p.get("title", "")
            desc = p.get("description", "")

            if title and desc:
                title_words = set(title.split())
                desc_words = set(desc.split())
                overlap = title_words & desc_words

                if len(overlap) >= 2:
                    consistent_posts += 1
                    examples.append({
                        'title': title[:50],
                        'matching_words': list(overlap)[:5]
                    })

        consistency_ratio = consistent_posts / len(posts) if posts else 0

        if consistency_ratio >= 0.7:
            reasoning = "제목과 본문의 일치도가 높아 검색 의도에 부합하는 콘텐츠입니다."
        elif consistency_ratio >= 0.5:
            reasoning = "제목과 본문이 적절히 일치합니다. 더 높은 일관성을 유지하면 좋습니다."
        else:
            reasoning = "제목과 본문의 일치도가 낮습니다. 제목의 핵심 단어를 본문에 포함시키세요."

        return {
            'consistent_posts': consistent_posts,
            'total_posts': len(posts),
            'ratio': f"{consistency_ratio*100:.1f}%",
            'description': f"{consistent_posts}/{len(posts)}개 포스트에서 제목-본문 일치",
            'reasoning': reasoning,
            'examples': examples[:3],
            'how_to_improve': '제목의 핵심 키워드를 본문에 자연스럽게 포함시키세요.' if consistency_ratio < 0.7 else '현재 수준 유지'
        }

    def _get_experience_breakdown(self, posts: List[Dict]) -> Dict[str, Any]:
        """경험 정보 상세"""
        experience_keywords = [
            "다녀왔", "방문했", "체험", "후기", "리뷰", "직접", "경험",
            "느낌", "생각", "추천", "솔직", "써보", "먹어봤", "가봤"
        ]

        experience_posts = []
        for p in posts[:10]:  # 최대 10개 분석
            title = p.get("title", "")
            desc = p.get("description", "")
            text = title + " " + desc

            found_keywords = [kw for kw in experience_keywords if kw in text]
            if found_keywords:
                experience_posts.append({
                    'title': title[:50],
                    'keywords': found_keywords[:3]
                })

        experience_ratio = len(experience_posts) / len(posts) if posts else 0

        if experience_ratio >= 0.7:
            reasoning = "대부분의 포스트가 실제 경험 기반 콘텐츠입니다. 네이버는 체험 후기를 높이 평가합니다."
        elif experience_ratio >= 0.5:
            reasoning = "절반 이상이 경험 기반 콘텐츠입니다. 경험 후기 비율을 더 늘리면 좋습니다."
        elif experience_ratio >= 0.3:
            reasoning = "일부 경험 기반 콘텐츠가 있습니다. 직접 경험한 내용을 더 많이 작성하세요."
        else:
            reasoning = "경험 기반 콘텐츠가 부족합니다. '직접', '후기', '리뷰' 등 경험을 나타내는 표현을 사용하세요."

        return {
            'experience_posts': len(experience_posts),
            'total_posts': len(posts),
            'ratio': f"{experience_ratio*100:.1f}%",
            'description': f"{len(experience_posts)}/{len(posts)}개 포스트에서 경험 키워드 발견",
            'reasoning': reasoning,
            'examples': experience_posts[:3],
            'how_to_improve': '직접 경험한 내용, 솔직한 후기, 실제 사용 리뷰를 작성하세요.' if experience_ratio < 0.7 else '현재 수준 유지'
        }

    def _get_information_richness_breakdown(self, posts: List[Dict], stats: Dict) -> Dict[str, Any]:
        """정보 충실성 상세"""
        total_length = sum(len(p.get("description", "")) for p in posts)
        avg_length = total_length / len(posts) if posts else 0

        lengths = [len(p.get("description", "")) for p in posts]
        max_length = max(lengths) if lengths else 0
        min_length = min(lengths) if lengths else 0

        if avg_length >= 100:
            reasoning = "평균 글 길이가 100자 이상으로 정보가 충실합니다."
        elif avg_length >= 70:
            reasoning = "평균 글 길이가 양호합니다. 100자 이상으로 늘리면 더 좋습니다."
        else:
            reasoning = "글이 짧습니다. 더 상세한 정보를 포함하여 100자 이상 작성하세요."

        return {
            'average_length': round(avg_length, 0),
            'max_length': max_length,
            'min_length': min_length,
            'total_posts': len(posts),
            'description': f"평균 {avg_length:.0f}자 (최대 {max_length}자, 최소 {min_length}자)",
            'reasoning': reasoning,
            'note': '※ RSS 요약 기준 (실제 글은 더 김)',
            'how_to_improve': '상세한 정보, 구체적인 설명, 풍부한 내용을 담아 작성하세요.' if avg_length < 100 else '현재 수준 유지'
        }

    def _get_originality_breakdown(self, posts: List[Dict]) -> Dict[str, Any]:
        """독창성 상세"""
        if len(posts) >= 3:
            titles = [p.get("title", "") for p in posts]
            unique_words = set()
            total_words = 0

            for title in titles:
                words = title.split()
                total_words += len(words)
                unique_words.update(words)

            uniqueness_ratio = len(unique_words) / total_words if total_words > 0 else 0

            if uniqueness_ratio >= 0.7:
                reasoning = "다양한 단어를 사용하여 독창적인 콘텐츠를 작성하고 있습니다."
            elif uniqueness_ratio >= 0.5:
                reasoning = "적절한 수준의 단어 다양성을 보입니다. 더 다양한 표현을 사용하면 좋습니다."
            else:
                reasoning = "반복되는 단어가 많습니다. 다양한 표현과 본인만의 언어로 작성하세요."

            return {
                'unique_words': len(unique_words),
                'total_words': total_words,
                'ratio': f"{uniqueness_ratio*100:.1f}%",
                'description': f"제목에서 {len(unique_words)}/{total_words}개 고유 단어 사용",
                'reasoning': reasoning,
                'how_to_improve': '다양한 표현과 본인만의 시각을 담은 독창적인 콘텐츠를 작성하세요.' if uniqueness_ratio < 0.7 else '현재 수준 유지'
            }
        else:
            return {
                'description': "포스트 부족 (3개 이상 필요)"
            }

    def _get_timeliness_breakdown(self, posts: List[Dict]) -> Dict[str, Any]:
        """적시성 상세"""
        now = datetime.utcnow()
        most_recent_days = 999
        most_recent_title = ""

        for p in posts:
            try:
                date = datetime.fromisoformat(p["date"].replace('Z', '+00:00'))
                days_ago = (now - date).days
                if days_ago < most_recent_days:
                    most_recent_days = days_ago
                    most_recent_title = p.get("title", "")
            except (ValueError, KeyError, AttributeError, TypeError) as e:
                logger.debug(f"Failed to parse post date for freshness: {e}")
                continue

        if most_recent_days <= 3:
            freshness = "매우 최신"
        elif most_recent_days <= 7:
            freshness = "최신"
        elif most_recent_days <= 30:
            freshness = "1개월 이내"
        elif most_recent_days <= 90:
            freshness = "3개월 이내"
        else:
            freshness = "오래됨"

        if most_recent_days <= 7:
            reasoning = "최근 7일 이내에 작성된 포스트가 있어 매우 신선한 콘텐츠입니다."
        elif most_recent_days <= 30:
            reasoning = "1개월 이내의 최근 포스트가 있어 적시성이 있습니다."
        elif most_recent_days <= 90:
            reasoning = "3개월 이내의 포스트입니다. 더 자주 작성하면 점수가 향상됩니다."
        else:
            reasoning = "최근 포스트가 오래되었습니다. 정기적으로 새 포스트를 작성하세요."

        return {
            'most_recent_days': most_recent_days,
            'freshness_level': freshness,
            'most_recent_post': most_recent_title[:50],
            'description': f"최근 포스트: {most_recent_days}일 전",
            'reasoning': reasoning,
            'how_to_improve': '주 1-2회 이상 정기적으로 새 포스트를 작성하세요.' if most_recent_days > 7 else '현재 수준 유지'
        }

    def _get_abuse_breakdown(self, posts: List[Dict]) -> Dict[str, Any]:
        """어뷰징 상세 (강화된 감지)"""
        # 1. 제목 중복
        titles = [p.get("title", "") for p in posts]
        unique_ratio = len(set(titles)) / len(titles) if titles else 1.0
        duplicate_ratio = 1 - unique_ratio

        # 2. 짧은 글
        very_short = sum(1 for p in posts if len(p.get("description", "")) < 20)
        short_posts = sum(1 for p in posts if len(p.get("description", "")) < 50)
        very_short_ratio = very_short / len(posts) if posts else 0
        short_ratio = short_posts / len(posts) if posts else 0

        # 3. 광고성
        ad_keywords = [
            "광고", "협찬", "제공", "홍보", "이벤트",
            "체험단", "원고료", "서포터즈", "PPL",
            "무료제공", "소정의", "리워드"
        ]
        ad_posts = 0
        for p in posts:
            text = p.get("title", "") + " " + p.get("description", "")
            if sum(1 for keyword in ad_keywords if keyword in text) >= 2:
                ad_posts += 1
        ad_ratio = ad_posts / len(posts) if posts else 0

        # 4. 매우 짧은 제목
        very_short_titles = sum(1 for t in titles if len(t) < 5)
        short_title_ratio = very_short_titles / len(titles) if titles else 0

        # 5. 동일 문구 반복
        descriptions = [p.get("description", "") for p in posts if p.get("description", "")]
        desc_repeat_ratio = 0
        if len(descriptions) >= 5:
            desc_freq = {}
            for desc in descriptions:
                if len(desc) > 10:
                    desc_freq[desc] = desc_freq.get(desc, 0) + 1
            if desc_freq:
                max_freq = max(desc_freq.values())
                desc_repeat_ratio = max_freq / len(descriptions)

        # 이슈 수집 (더 엄격한 기준)
        issues = []
        critical_issues = []

        if duplicate_ratio >= 0.5:
            critical_issues.append(f"⚠️ 심각: 제목 중복 {duplicate_ratio*100:.0f}%")
        elif duplicate_ratio >= 0.3:
            issues.append(f"제목 중복 {duplicate_ratio*100:.0f}%")
        elif duplicate_ratio >= 0.2:
            issues.append(f"제목 중복 {duplicate_ratio*100:.0f}%")

        if very_short_ratio >= 0.7:
            critical_issues.append(f"⚠️ 심각: 매우 짧은 글 {very_short_ratio*100:.0f}%")
        elif very_short_ratio >= 0.5:
            issues.append(f"매우 짧은 글 (20자 미만) {very_short_ratio*100:.0f}%")
        elif short_ratio >= 0.7:
            issues.append(f"짧은 글 (50자 미만) {short_ratio*100:.0f}%")
        elif short_ratio >= 0.5:
            issues.append(f"짧은 글 {short_ratio*100:.0f}%")

        if ad_ratio >= 0.8:
            critical_issues.append(f"⚠️ 심각: 광고성 글 {ad_ratio*100:.0f}%")
        elif ad_ratio >= 0.6:
            issues.append(f"광고성 글 {ad_ratio*100:.0f}%")
        elif ad_ratio >= 0.4:
            issues.append(f"광고성 글 {ad_ratio*100:.0f}%")

        if short_title_ratio >= 0.5:
            issues.append(f"매우 짧은 제목 {short_title_ratio*100:.0f}%")
        elif short_title_ratio >= 0.3:
            issues.append(f"짧은 제목 {short_title_ratio*100:.0f}%")

        if desc_repeat_ratio >= 0.3:
            issues.append(f"동일 문구 반복 {desc_repeat_ratio*100:.0f}%")

        all_issues = critical_issues + issues

        # 저품질 경고 레벨
        quality_level = "정상"
        if len(critical_issues) >= 2:
            quality_level = "⚠️ 저품질 의심 (심각)"
            reasoning = f"심각한 어뷰징 패턴이 다수 발견되었습니다. 네이버 저품질 블로그로 판정받을 가능성이 높습니다: {', '.join(critical_issues)}"
        elif len(critical_issues) >= 1:
            quality_level = "⚠️ 저품질 위험"
            reasoning = f"심각한 어뷰징 패턴이 발견되었습니다: {critical_issues[0]}. 즉시 개선이 필요합니다."
        elif len(issues) >= 3:
            quality_level = "주의 필요"
            reasoning = f"여러 어뷰징 패턴이 발견되었습니다. 네이버 검색 노출에 불리할 수 있습니다: {', '.join(issues[:3])}"
        elif len(issues) >= 1:
            quality_level = "개선 권장"
            reasoning = f"일부 어뷰징 패턴이 발견되었습니다: {issues[0]}. 개선을 권장합니다."
        else:
            reasoning = "어뷰징 패턴이 발견되지 않았습니다. 건전한 블로그 운영을 하고 있습니다."

        return {
            'quality_level': quality_level,
            'duplicate_ratio': f"{duplicate_ratio*100:.1f}%",
            'very_short_ratio': f"{very_short_ratio*100:.1f}%",
            'short_post_ratio': f"{short_ratio*100:.1f}%",
            'ad_post_ratio': f"{ad_ratio*100:.1f}%",
            'short_title_ratio': f"{short_title_ratio*100:.1f}%",
            'repeat_ratio': f"{desc_repeat_ratio*100:.1f}%",
            'issues': all_issues if all_issues else ["이슈 없음"],
            'critical_count': len(critical_issues),
            'description': f"품질 수준: {quality_level}",
            'reasoning': reasoning,
            'how_to_improve': '제목 다양화, 상세한 내용 작성 (최소 100자 이상), 광고성 표현 삭제, 체험/후기 중심 작성' if all_issues else '현재 수준 유지'
        }


    def _get_chain_breakdown(self, stats: Dict, neighbor_count: int) -> Dict[str, Any]:
        """Chain (소통) 상세 계산 과정"""
        avg_comments = stats.get("avg_comments", 0)
        avg_likes = stats.get("avg_likes", 0)

        # 1. 댓글 점수 분석
        if avg_comments >= 20:
            comment_score = 50
            comment_desc = f"매우 활발 (평균 {avg_comments:.1f}개)"
            comment_reasoning = "매우 활발한 댓글 활동으로 소통이 우수합니다."
        elif avg_comments >= 10:
            comment_score = 40 + (avg_comments - 10) / 10 * 10
            comment_desc = f"활발 (평균 {avg_comments:.1f}개)"
            comment_reasoning = "활발한 댓글 활동이 있습니다."
        elif avg_comments >= 5:
            comment_score = 28 + (avg_comments - 5) / 5 * 12
            comment_desc = f"보통 (평균 {avg_comments:.1f}개)"
            comment_reasoning = "적절한 수준의 댓글 활동이 있습니다."
        elif avg_comments >= 1:
            comment_score = 12 + (avg_comments - 1) * 6
            comment_desc = f"부족 (평균 {avg_comments:.1f}개)"
            comment_reasoning = "댓글이 부족합니다. 독자와 소통을 늘리세요."
        else:
            comment_score = avg_comments * 12
            comment_desc = f"매우 부족 (평균 {avg_comments:.1f}개)"
            comment_reasoning = "댓글이 거의 없습니다. 독자 참여를 유도하세요."

        # 2. 공감/좋아요 점수 분석
        if avg_likes >= 30:
            like_score = 30
            like_desc = f"매우 많음 (평균 {avg_likes:.1f}개)"
            like_reasoning = "공감 수가 매우 많아 인기 있는 콘텐츠입니다."
        elif avg_likes >= 15:
            like_score = 23 + (avg_likes - 15) / 15 * 7
            like_desc = f"많음 (평균 {avg_likes:.1f}개)"
            like_reasoning = "적절한 공감을 받고 있습니다."
        elif avg_likes >= 3:
            like_score = 10 + (avg_likes - 3) / 4 * 6
            like_desc = f"보통 (평균 {avg_likes:.1f}개)"
            like_reasoning = "공감 수를 늘리면 노출이 개선됩니다."
        else:
            like_score = avg_likes * 3
            like_desc = f"부족 (평균 {avg_likes:.1f}개)"
            like_reasoning = "공감이 부족합니다. 양질의 콘텐츠로 공감을 유도하세요."

        # 3. 이웃 수 분석
        if neighbor_count >= 500:
            neighbor_score = 20
            neighbor_desc = f"매우 많음 ({neighbor_count}명)"
            neighbor_reasoning = "이웃 수가 매우 많아 영향력이 큽니다."
        elif neighbor_count >= 200:
            neighbor_score = 16 + (neighbor_count - 200) / 300 * 4
            neighbor_desc = f"많음 ({neighbor_count}명)"
            neighbor_reasoning = "적절한 이웃 수를 유지하고 있습니다."
        elif neighbor_count >= 100:
            neighbor_score = 12 + (neighbor_count - 100) / 100 * 4
            neighbor_desc = f"보통 ({neighbor_count}명)"
            neighbor_reasoning = "이웃을 늘리면 점수가 향상됩니다."
        else:
            neighbor_score = neighbor_count / 20 * 5
            neighbor_desc = f"부족 ({neighbor_count}명)"
            neighbor_reasoning = "이웃이 부족합니다. 다른 블로거와 교류하세요."

        return {
            'comments': {
                'score': round(comment_score, 2),
                'max_score': 50,
                'value': avg_comments,
                'description': comment_desc,
                'reasoning': comment_reasoning,
                'how_to_improve': '댓글에 답변하고 독자와 소통하세요.' if avg_comments < 5 else '현재 수준 유지'
            },
            'likes': {
                'score': round(like_score, 2),
                'max_score': 30,
                'value': avg_likes,
                'description': like_desc,
                'reasoning': like_reasoning,
                'how_to_improve': '유익하고 공감되는 콘텐츠를 작성하세요.' if avg_likes < 10 else '현재 수준 유지'
            },
            'neighbors': {
                'score': round(neighbor_score, 2),
                'max_score': 20,
                'value': neighbor_count,
                'description': neighbor_desc,
                'reasoning': neighbor_reasoning,
                'how_to_improve': '다른 블로거를 이웃 추가하고 교류하세요.' if neighbor_count < 100 else '현재 수준 유지'
            }
        }

    def _get_creator_breakdown(self, blog_age_days: int, total_posts: int, posts: List[Dict]) -> Dict[str, Any]:
        """Creator (운영기간) 상세 계산 과정"""
        years = blog_age_days / 365.0 if blog_age_days > 0 else 0

        # 1. 운영 기간 분석
        if years >= 5:
            age_score = 60
            age_desc = f"오래됨 ({years:.1f}년)"
            age_reasoning = f"블로그를 {years:.1f}년간 운영하여 신뢰도가 높습니다."
        elif years >= 3:
            age_score = 50 + (years - 3) / 2 * 10
            age_desc = f"충분함 ({years:.1f}년)"
            age_reasoning = f"{years:.1f}년간 운영하여 적절한 신뢰도를 쌓았습니다."
        elif years >= 1:
            age_score = 28 + (years - 1) * 12
            age_desc = f"보통 ({years:.1f}년)"
            age_reasoning = f"{years:.1f}년간 운영 중입니다. 꾸준히 운영하면 점수가 향상됩니다."
        elif years >= 0.5:
            age_score = 18 + (years - 0.5) / 0.5 * 10
            age_desc = f"신규 ({years:.1f}년)"
            age_reasoning = "신규 블로그입니다. 꾸준한 운영이 필요합니다."
        else:
            age_score = years / 0.5 * 18
            age_desc = f"매우 신규 ({int(years * 12)}개월)"
            age_reasoning = "매우 신규 블로그입니다. 시간이 지나면 신뢰도가 올라갑니다."

        # 2. 포스팅 활동 분석
        if len(posts) >= 2:
            now = datetime.utcnow()
            recent_30days = 0
            recent_90days = 0

            for p in posts:
                try:
                    date = datetime.fromisoformat(p["date"].replace('Z', '+00:00'))
                    days_ago = (now - date).days

                    if days_ago <= 30:
                        recent_30days += 1
                    if days_ago <= 90:
                        recent_90days += 1
                except (ValueError, KeyError, AttributeError, TypeError) as e:
                    logger.debug(f"Failed to parse post data: {e}")
                    continue

            # 최근 활동
            if recent_30days >= 8:
                activity = 25
                activity_desc = f"매우 활발 (최근 30일 {recent_30days}개)"
                activity_reasoning = "최근 활동이 매우 활발합니다."
            elif recent_30days >= 4:
                activity = 20 + (recent_30days - 4) / 4 * 5
                activity_desc = f"활발 (최근 30일 {recent_30days}개)"
                activity_reasoning = "적절한 포스팅 빈도를 유지하고 있습니다."
            elif recent_30days >= 1:
                activity = 8
                activity_desc = f"부족 (최근 30일 {recent_30days}개)"
                activity_reasoning = "최근 활동이 부족합니다. 주 1-2회 작성을 권장합니다."
            else:
                activity = 3
                activity_desc = "없음 (최근 30일 0개)"
                activity_reasoning = "최근 활동이 없습니다. 꾸준한 포스팅이 필요합니다."

            # 3개월 활동
            if recent_90days >= 20:
                long_activity = 15
                long_desc = f"매우 활발 (최근 90일 {recent_90days}개)"
            elif recent_90days >= 12:
                long_activity = 12 + (recent_90days - 12) / 8 * 3
                long_desc = f"활발 (최근 90일 {recent_90days}개)"
            elif recent_90days >= 6:
                long_activity = 8 + (recent_90days - 6) / 6 * 4
                long_desc = f"보통 (최근 90일 {recent_90days}개)"
            else:
                long_activity = recent_90days / 3 * 5
                long_desc = f"부족 (최근 90일 {recent_90days}개)"
        else:
            activity = 15
            activity_desc = "데이터 부족"
            activity_reasoning = "포스트 데이터가 부족합니다."
            long_activity = 0
            long_desc = "데이터 부족"
            recent_30days = 0
            recent_90days = 0

        return {
            'blog_age': {
                'score': round(age_score, 2),
                'max_score': 60,
                'value_years': round(years, 1),
                'value_days': blog_age_days,
                'description': age_desc,
                'reasoning': age_reasoning,
                'how_to_improve': '꾸준히 운영하여 블로그 신뢰도를 높이세요.' if years < 3 else '현재 수준 유지'
            },
            'recent_activity': {
                'score': round(activity, 2),
                'max_score': 25,
                'value': recent_30days,
                'description': activity_desc,
                'reasoning': activity_reasoning,
                'how_to_improve': '주 1-2회 이상 정기적으로 포스팅하세요.' if recent_30days < 4 else '현재 수준 유지'
            },
            'long_term_activity': {
                'score': round(long_activity, 2),
                'max_score': 15,
                'value': recent_90days,
                'description': long_desc,
                'how_to_improve': '3개월간 꾸준히 작성하세요.' if recent_90days < 12 else '현재 수준 유지'
            }
        }


def get_blog_scorer() -> BlogScorer:
    """블로그 점수 계산기 인스턴스 반환"""
    return BlogScorer()
