"""
블로그 종합 지수 계산기
"""
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)


@dataclass
class IndexConfig:
    """지수 계산 설정"""

    # 카테고리별 최대 점수
    MAX_TRUST = 25.0
    MAX_CONTENT = 30.0
    MAX_ENGAGEMENT = 20.0
    MAX_SEO = 15.0
    MAX_TRAFFIC = 10.0

    # 세부 가중치
    TRUST_WEIGHTS = {
        'age': 0.20,
        'consistency': 0.30,
        'penalty': 0.30,
        'influencer': 0.20
    }

    CONTENT_WEIGHTS = {
        'text_quality': 0.30,
        'originality': 0.35,
        'structure': 0.20,
        'media': 0.15
    }

    ENGAGEMENT_WEIGHTS = {
        'interaction': 0.40,
        'retention': 0.35,
        'comment_quality': 0.25
    }

    SEO_WEIGHTS = {
        'keyword_exposure': 0.40,
        'rank': 0.35,
        'view_presence': 0.25
    }

    TRAFFIC_WEIGHTS = {
        'volume': 0.60,
        'growth': 0.40
    }


class BlogIndexCalculator:
    """블로그 종합 지수 계산기"""

    def __init__(self, config: Optional[IndexConfig] = None):
        self.config = config or IndexConfig()

    def calculate(
        self,
        blog_data: Dict,
        posts_data: List[Dict],
        history_data: Optional[List[Dict]] = None
    ) -> Dict:
        """
        종합 블로그 지수 계산

        Args:
            blog_data: 블로그 기본 정보 및 통계
            posts_data: 최근 포스트 데이터 목록
            history_data: 과거 지수 이력 (선택)

        Returns:
            계산된 지수 정보
        """

        logger.info(f"블로그 지수 계산 시작: {blog_data.get('blog_id')}")

        # 1. 신뢰도 점수
        trust_score = self._calculate_trust(blog_data, history_data)

        # 2. 콘텐츠 품질 점수
        content_score = self._calculate_content(posts_data)

        # 3. 참여도 점수
        engagement_score = self._calculate_engagement(posts_data, blog_data)

        # 4. SEO 점수
        seo_score = self._calculate_seo(posts_data, blog_data)

        # 5. 트래픽 점수
        traffic_score = self._calculate_traffic(blog_data, history_data)

        # 총점
        total_score = (
            trust_score +
            content_score +
            engagement_score +
            seo_score +
            traffic_score
        )

        # 레벨 및 등급 결정
        level, grade = self._determine_level(total_score)

        # 백분위 계산
        percentile = self._calculate_percentile(total_score)

        # 경고 및 권장사항 생성
        warnings = self._generate_warnings(blog_data, posts_data)
        recommendations = self._generate_recommendations(
            blog_data, posts_data,
            trust_score, content_score, engagement_score, seo_score, traffic_score
        )

        result = {
            'total_score': round(total_score, 2),
            'level': level,
            'grade': grade,
            'percentile': percentile,

            'score_breakdown': {
                'trust': round(trust_score, 2),
                'content': round(content_score, 2),
                'engagement': round(engagement_score, 2),
                'seo': round(seo_score, 2),
                'traffic': round(traffic_score, 2)
            },

            'warnings': warnings,
            'recommendations': recommendations,

            'calculated_at': datetime.utcnow().isoformat()
        }

        logger.info(f"블로그 지수 계산 완료: {total_score:.2f} (Level {level})")
        return result

    def _calculate_trust(
        self,
        blog_data: Dict,
        history_data: Optional[List[Dict]]
    ) -> float:
        """신뢰도 점수 계산 (25점 만점)"""

        score = 0.0
        weights = self.config.TRUST_WEIGHTS
        max_score = self.config.MAX_TRUST

        # 1. 블로그 나이 (최대 5점)
        created_at = blog_data.get('profile', {}).get('created_at')
        if created_at:
            try:
                if isinstance(created_at, str):
                    created_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                else:
                    created_date = created_at

                age_days = (datetime.now() - created_date).days
                age_score = min(age_days / 365, 1.0)  # 1년 = 만점
                score += age_score * weights['age'] * max_score

            except (ValueError, TypeError, AttributeError) as e:
                logger.warning(f"블로그 나이 계산 오류: {e}")

        # 2. 포스팅 일관성 (최대 7.5점)
        total_posts = blog_data.get('stats', {}).get('total_posts', 0)
        if total_posts >= 10:
            consistency = 0.8  # 기본적으로 좋은 점수
        elif total_posts >= 5:
            consistency = 0.5
        else:
            consistency = 0.3

        score += consistency * weights['consistency'] * max_score

        # 3. 저품질 이력 (최대 7.5점)
        has_penalty = blog_data.get('has_penalty', False)
        penalty_score = 0.0 if has_penalty else 1.0
        score += penalty_score * weights['penalty'] * max_score

        # 4. 인플루언서 상태 (최대 5점)
        is_influencer = blog_data.get('stats', {}).get('is_influencer', False)
        influencer_score = 1.0 if is_influencer else 0.3
        score += influencer_score * weights['influencer'] * max_score

        return min(score, max_score)

    def _calculate_content(self, posts_data: List[Dict]) -> float:
        """콘텐츠 품질 점수 계산 (30점 만점)"""

        if not posts_data:
            return 0.0

        score = 0.0
        weights = self.config.CONTENT_WEIGHTS
        max_score = self.config.MAX_CONTENT

        # 평균 지표 계산
        total_length = sum(
            p.get('content', {}).get('text_length', 0) or
            p.get('text_length', 0)
            for p in posts_data
        )
        avg_length = total_length / len(posts_data) if posts_data else 0

        total_media = sum(
            (p.get('media', {}).get('image_count', 0) or p.get('image_count', 0)) +
            (p.get('media', {}).get('video_count', 0) or p.get('video_count', 0)) * 2
            for p in posts_data
        )
        avg_media = total_media / len(posts_data) if posts_data else 0

        # 1. 텍스트 품질 (최대 9점)
        length_score = min(avg_length / 2000, 1.0)
        text_quality = length_score  # 단순화 (가독성 점수는 나중에 추가)
        score += text_quality * weights['text_quality'] * max_score

        # 2. 독창성 (최대 10.5점)
        # 실제로는 중복 검사 필요, 여기서는 기본값
        originality = 0.8  # 기본 80%
        score += originality * weights['originality'] * max_score

        # 3. 구조 (최대 6점)
        # 문단 수, 이미지 등으로 판단
        structure = 0.7  # 기본 70%
        if avg_length > 500:  # 적절한 길이
            structure += 0.1
        if avg_media > 2:  # 이미지/동영상 있음
            structure += 0.2

        structure = min(structure, 1.0)
        score += structure * weights['structure'] * max_score

        # 4. 미디어 풍부도 (최대 4.5점)
        media_score = min(avg_media / 8, 1.0)
        score += media_score * weights['media'] * max_score

        return min(score, max_score)

    def _calculate_engagement(
        self,
        posts_data: List[Dict],
        blog_data: Dict
    ) -> float:
        """참여도 점수 계산 (20점 만점)"""

        if not posts_data:
            return 0.0

        score = 0.0
        weights = self.config.ENGAGEMENT_WEIGHTS
        max_score = self.config.MAX_ENGAGEMENT

        # 1. 상호작용 (최대 8점)
        total_likes = sum(
            p.get('engagement', {}).get('like_count', 0) or
            p.get('like_count', 0)
            for p in posts_data
        )
        total_comments = sum(
            p.get('engagement', {}).get('comment_count', 0) or
            p.get('comment_count', 0)
            for p in posts_data
        )
        total_scraps = sum(
            p.get('engagement', {}).get('scrap_count', 0) or
            p.get('scrap_count', 0)
            for p in posts_data
        )

        avg_interaction = (
            total_likes * 0.3 +
            total_comments * 2.0 +
            total_scraps * 1.0
        ) / len(posts_data)

        interaction_score = min(avg_interaction / 20, 1.0)
        score += interaction_score * weights['interaction'] * max_score

        # 2. 체류 시간 (최대 7점) - 추정값
        retention_score = 0.5  # 기본 50%
        score += retention_score * weights['retention'] * max_score

        # 3. 댓글 품질 (최대 5점)
        if total_comments > 0:
            comment_quality = min(total_comments / (len(posts_data) * 5), 1.0)
        else:
            comment_quality = 0.0

        score += comment_quality * weights['comment_quality'] * max_score

        return min(score, max_score)

    def _calculate_seo(
        self,
        posts_data: List[Dict],
        blog_data: Dict
    ) -> float:
        """SEO 점수 계산 (15점 만점)"""

        score = 0.0
        weights = self.config.SEO_WEIGHTS
        max_score = self.config.MAX_SEO

        # 1. 키워드 노출 (최대 6점)
        # 실제로는 키워드 추적 필요, 여기서는 포스트 수로 추정
        total_posts = blog_data.get('stats', {}).get('total_posts', 0)
        keyword_score = min(total_posts / 50, 1.0)
        score += keyword_score * weights['keyword_exposure'] * max_score

        # 2. 평균 검색 순위 (최대 5.25점)
        # 실제로는 순위 추적 필요, 여기서는 중립 점수
        rank_score = 0.5
        score += rank_score * weights['rank'] * max_score

        # 3. VIEW 탭 진입 (최대 3.75점)
        # 실제로는 VIEW 탭 확인 필요, 여기서는 기본값
        view_score = 0.3
        score += view_score * weights['view_presence'] * max_score

        return min(score, max_score)

    def _calculate_traffic(
        self,
        blog_data: Dict,
        history_data: Optional[List[Dict]]
    ) -> float:
        """트래픽 점수 계산 (10점 만점)"""

        score = 0.0
        weights = self.config.TRAFFIC_WEIGHTS
        max_score = self.config.MAX_TRAFFIC

        # 1. 방문자 수 (최대 6점)
        total_visitors = blog_data.get('stats', {}).get('total_visitors', 0)
        visitor_score = min(total_visitors / 200, 1.0)
        score += visitor_score * weights['volume'] * max_score

        # 2. 성장률 (최대 4점)
        # 실제로는 히스토리 데이터 필요, 여기서는 중립 점수
        growth_score = 0.5
        score += growth_score * weights['growth'] * max_score

        return min(score, max_score)

    def _determine_level(self, total_score: float) -> tuple:
        """레벨 및 등급 결정"""

        if total_score >= 95:
            return (11, '최적화4')
        elif total_score >= 90:
            return (10, '최적화3')
        elif total_score >= 85:
            return (9, '최적화2')
        elif total_score >= 80:
            return (8, '최적화1')
        elif total_score >= 70:
            return (7, '준최적화7')
        elif total_score >= 65:
            return (6, '준최적화6')
        elif total_score >= 60:
            return (5, '준최적화5')
        elif total_score >= 55:
            return (4, '준최적화4')
        elif total_score >= 50:
            return (3, '준최적화3')
        elif total_score >= 40:
            return (2, '준최적화2')
        elif total_score >= 30:
            return (1, '준최적화1')
        else:
            return (0, '저품질')

    def _calculate_percentile(self, total_score: float) -> float:
        """백분위 계산 (정규분포 가정)"""
        # 간단한 선형 변환 (실제로는 scipy.stats.norm.cdf 사용)
        percentile = min(max((total_score / 100) * 100, 0), 100)
        return round(percentile, 1)

    def _generate_warnings(
        self,
        blog_data: Dict,
        posts_data: List[Dict]
    ) -> List[Dict]:
        """경고 생성"""

        warnings = []

        # 1. 포스팅 부족
        total_posts = blog_data.get('stats', {}).get('total_posts', 0)
        if total_posts < 10:
            warnings.append({
                'type': 'low_post_count',
                'severity': 'medium',
                'message': f'포스트 수가 적습니다 ({total_posts}개). 최소 20개 이상 작성을 권장합니다.'
            })

        # 2. 방문자 부족
        total_visitors = blog_data.get('stats', {}).get('total_visitors', 0)
        if total_visitors < 10:
            warnings.append({
                'type': 'low_traffic',
                'severity': 'medium',
                'message': '방문자 수가 매우 적습니다. SEO와 홍보에 집중하세요.'
            })

        # 3. 참여도 부족
        if posts_data:
            avg_engagement = sum(
                (p.get('engagement', {}).get('like_count', 0) or 0) +
                (p.get('engagement', {}).get('comment_count', 0) or 0)
                for p in posts_data
            ) / len(posts_data)

            if avg_engagement < 3:
                warnings.append({
                    'type': 'low_engagement',
                    'severity': 'medium',
                    'message': '독자 참여도가 낮습니다. 소통을 늘려보세요.'
                })

        return warnings

    def _generate_recommendations(
        self,
        blog_data: Dict,
        posts_data: List[Dict],
        trust_score: float,
        content_score: float,
        engagement_score: float,
        seo_score: float,
        traffic_score: float
    ) -> List[Dict]:
        """개선 권장사항 생성"""

        recommendations = []

        # 각 카테고리별 점수 비율
        scores = {
            'trust': (trust_score, self.config.MAX_TRUST),
            'content': (content_score, self.config.MAX_CONTENT),
            'engagement': (engagement_score, self.config.MAX_ENGAGEMENT),
            'seo': (seo_score, self.config.MAX_SEO),
            'traffic': (traffic_score, self.config.MAX_TRAFFIC)
        }

        # 가장 낮은 점수 찾기
        lowest_category = min(scores.items(), key=lambda x: x[1][0] / x[1][1])
        category_name, (score, max_score) = lowest_category

        ratio = score / max_score if max_score > 0 else 0

        # 카테고리별 맞춤 권장사항
        if ratio < 0.5:  # 50% 미만이면 집중 개선 필요
            if category_name == 'trust':
                recommendations.append({
                    'type': 'improve_trust',
                    'priority': 'high',
                    'category': 'trust',
                    'message': '신뢰도를 높이려면 꾸준한 포스팅이 중요합니다.',
                    'actions': [
                        '일주일에 2-3회 정기적으로 포스팅하세요',
                        '블로그 개설 초기라면 인내심을 가지세요',
                        '저품질 콘텐츠는 피하세요'
                    ]
                })

            elif category_name == 'content':
                recommendations.append({
                    'type': 'improve_content',
                    'priority': 'high',
                    'category': 'content',
                    'message': '콘텐츠 품질 개선이 필요합니다.',
                    'actions': [
                        '글자 수를 1500자 이상으로 늘리세요',
                        '이미지를 5개 이상 포함하세요',
                        '문단 구성에 신경 쓰세요',
                        '복사-붙여넣기를 피하고 직접 작성하세요'
                    ]
                })

            elif category_name == 'engagement':
                recommendations.append({
                    'type': 'improve_engagement',
                    'priority': 'high',
                    'category': 'engagement',
                    'message': '독자 참여도를 높이세요.',
                    'actions': [
                        '다른 블로거의 글에 댓글을 남기세요',
                        '이웃과 적극적으로 소통하세요',
                        '글 마지막에 질문을 던져보세요',
                        '댓글에 성실히 답변하세요'
                    ]
                })

            elif category_name == 'seo':
                recommendations.append({
                    'type': 'improve_seo',
                    'priority': 'high',
                    'category': 'seo',
                    'message': 'SEO 최적화가 필요합니다.',
                    'actions': [
                        '키워드 리서치를 통해 검색량 있는 주제를 선택하세요',
                        '제목에 핵심 키워드를 포함하세요',
                        '경쟁이 낮은 롱테일 키워드를 노리세요',
                        '대표 이미지를 설정하세요'
                    ]
                })

            elif category_name == 'traffic':
                recommendations.append({
                    'type': 'improve_traffic',
                    'priority': 'high',
                    'category': 'traffic',
                    'message': '방문자 수를 늘려보세요.',
                    'actions': [
                        'SNS에 블로그 글을 공유하세요',
                        '카페, 커뮤니티에서 활동하세요',
                        '검색 유입을 늘리기 위해 SEO에 집중하세요',
                        '타블로그에 댓글 활동을 하세요'
                    ]
                })

        # 일반 권장사항
        total_posts = blog_data.get('stats', {}).get('total_posts', 0)
        if total_posts < 20:
            recommendations.append({
                'type': 'general',
                'priority': 'medium',
                'category': 'general',
                'message': '포스트를 더 작성하세요.',
                'actions': ['최소 20-30개의 포스트를 작성하면 지수가 안정됩니다']
            })

        return recommendations
