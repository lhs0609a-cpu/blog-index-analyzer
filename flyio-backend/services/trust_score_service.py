"""
2025 네이버 AI 신뢰도 평가 서비스
참고: 네이버 검색 블로그 "AI와 검색의 시너지" (2025.09.05)

HyperClova X + VLM 기반 신뢰도 평가 시스템:
1. 출처 신뢰도 (공공기관, 학술기관 등)
2. 전문성 판별 (전문용어, 인용, 참고문헌)
3. 시각적 품질 (VLM 기반 레이아웃/디자인 평가)
4. 출처 다양성 (AI 브리핑/에이전트용 다양한 관점)

효과:
- 공공기관 등 신뢰도 높은 출처 클릭 77.2% 증가
- 학술/연구 기관 등 전문성 높은 출처 클릭 30.7% 증가
"""
from typing import Dict, List, Optional, Tuple
import re
from datetime import datetime, timedelta


# ===== 출처 유형별 신뢰도 점수 =====
SOURCE_TRUST_SCORES = {
    'official_gov': 100,      # 정부/공공기관 공식 블로그
    'academic': 95,           # 학술/연구기관 블로그
    'medical_certified': 95,  # 의료 전문가 인증 블로그
    'legal_certified': 95,    # 법률 전문가 인증 블로그
    'official_corp': 90,      # 기업 공식 블로그
    'certified_expert': 85,   # 기타 전문가 인증 블로그
    'influencer_top': 80,     # 상위 인플루언서 (10만+ 이웃)
    'power_blogger': 75,      # 파워블로거/공식 선정
    'influencer_mid': 70,     # 중간 인플루언서 (1만+ 이웃)
    'general_active': 60,     # 활발한 일반 블로거
    'general': 50,            # 일반 블로거
    'new_blogger': 40,        # 신규 블로거 (3개월 미만)
    'inactive': 30,           # 비활성 블로거
    'spam_suspected': 10,     # 스팸/광고 의심
}

# ===== 키워드 카테고리별 신뢰 출처 우선순위 =====
KEYWORD_TRUST_MAPPING = {
    'medical': {
        'keywords': ['병원', '의사', '약', '증상', '치료', '건강', '질병', '진료', '수술', '처방',
                     '두통', '당뇨', '암', '혈압', '알레르기', '피부', '눈', '치과', '정형외과'],
        'priority': ['medical_certified', 'academic', 'official_gov'],
        'boost': 1.5,
    },
    'legal': {
        'keywords': ['변호사', '법률', '소송', '재판', '이혼', '상속', '계약', '손해배상', '형사',
                     '민사', '세금', '부동산', '등기', '공증'],
        'priority': ['legal_certified', 'official_gov', 'academic'],
        'boost': 1.5,
    },
    'finance': {
        'keywords': ['은행', '대출', '적금', '예금', '투자', '주식', '펀드', '보험', '연금',
                     '신용카드', '금리', '환율', '코인', '부동산투자'],
        'priority': ['official_gov', 'official_corp', 'certified_expert'],
        'boost': 1.4,
    },
    'parenting': {
        'keywords': ['육아', '아기', '유아', '어린이집', '유치원', '출산', '임신', '육아휴직',
                     '아동수당', '모유', '이유식', '예방접종'],
        'priority': ['official_gov', 'medical_certified', 'certified_expert'],
        'boost': 1.3,
    },
    'education': {
        'keywords': ['수능', '대학', '입시', '학원', '과외', '공부', '시험', '자격증', '토익',
                     '영어', '수학', '학교', '교육'],
        'priority': ['official_gov', 'academic', 'certified_expert'],
        'boost': 1.3,
    },
    'tech': {
        'keywords': ['아이폰', '갤럭시', '컴퓨터', '노트북', 'AI', '코딩', '프로그래밍', '앱',
                     '소프트웨어', '게임', 'IT', '스마트폰'],
        'priority': ['official_corp', 'academic', 'influencer_top'],
        'boost': 1.2,
    },
    'food': {
        'keywords': ['맛집', '레시피', '요리', '음식', '카페', '베이커리', '배달', '밀키트'],
        'priority': ['influencer_top', 'power_blogger', 'general_active'],
        'boost': 1.0,
    },
    'travel': {
        'keywords': ['여행', '호텔', '펜션', '항공', '관광', '해외여행', '국내여행', '캠핑'],
        'priority': ['influencer_top', 'power_blogger', 'general_active'],
        'boost': 1.0,
    },
    'beauty': {
        'keywords': ['화장품', '스킨케어', '메이크업', '피부', '뷰티', '헤어', '네일', '성형'],
        'priority': ['influencer_top', 'official_corp', 'power_blogger'],
        'boost': 1.1,
    },
}

# ===== 전문성 판별 키워드 =====
EXPERTISE_INDICATORS = {
    'citations': ['참고문헌', '출처:', '인용:', '연구에 따르면', '논문', '학회', '연구결과'],
    'professional_terms': ['진단', '처방', '판례', '법령', '조항', '학술', '임상', '실험'],
    'credentials': ['전문의', '변호사', '회계사', '박사', '교수', '연구원', '공인'],
    'methodology': ['방법론', '분석', '통계', '데이터', '실험군', '대조군', '표본'],
}


def detect_keyword_category(keyword: str) -> str:
    """키워드의 카테고리 감지"""
    keyword_lower = keyword.lower()

    for category, config in KEYWORD_TRUST_MAPPING.items():
        for kw in config['keywords']:
            if kw in keyword_lower or keyword_lower in kw:
                return category

    return 'general'


def calculate_source_trust_score(blog_info: Dict, keyword: str = '') -> Dict:
    """
    출처 신뢰도 점수 계산

    Args:
        blog_info: 블로그 정보 딕셔너리
        keyword: 검색 키워드 (카테고리별 가중치 적용)

    Returns:
        신뢰도 점수 및 세부 정보
    """
    # 블로그 유형 판별
    source_type = determine_source_type(blog_info)
    base_score = SOURCE_TRUST_SCORES.get(source_type, 50)

    # 키워드 카테고리별 가중치 적용
    category = detect_keyword_category(keyword)
    category_config = KEYWORD_TRUST_MAPPING.get(category, {'priority': [], 'boost': 1.0})

    # 우선순위 출처인 경우 부스트
    boost = 1.0
    if source_type in category_config.get('priority', []):
        priority_index = category_config['priority'].index(source_type)
        boost = category_config.get('boost', 1.0) - (priority_index * 0.1)

    final_score = min(base_score * boost, 100)

    return {
        'source_type': source_type,
        'base_score': base_score,
        'keyword_category': category,
        'boost_applied': boost,
        'final_score': final_score,
        'is_priority_source': source_type in category_config.get('priority', []),
    }


def determine_source_type(blog_info: Dict) -> str:
    """블로그 출처 유형 판별"""
    blog_id = blog_info.get('blog_id', '')
    blog_name = blog_info.get('blog_name', '')
    neighbor_count = blog_info.get('neighbor_count', 0) or 0
    post_count = blog_info.get('post_count', 0) or 0
    blog_age_days = blog_info.get('blog_age_days', 0) or 0
    is_official = blog_info.get('is_official', False)
    is_power_blogger = blog_info.get('is_power_blogger', False)

    # 공식 블로그 체크 패턴
    gov_patterns = ['gov', 'go.kr', '정부', '시청', '구청', '군청', '도청', '부처', '기관']
    official_patterns = ['official', '공식', 'kr_official', '_official']
    corp_patterns = ['corp', 'company', '공식블로그', '기업']

    blog_id_lower = blog_id.lower()
    blog_name_lower = blog_name.lower()

    # 정부/공공기관
    for pattern in gov_patterns:
        if pattern in blog_id_lower or pattern in blog_name_lower:
            return 'official_gov'

    # 기업 공식
    if is_official:
        return 'official_corp'
    for pattern in official_patterns + corp_patterns:
        if pattern in blog_id_lower or pattern in blog_name_lower:
            return 'official_corp'

    # 파워블로거
    if is_power_blogger:
        return 'power_blogger'

    # 인플루언서 등급
    if neighbor_count >= 100000:
        return 'influencer_top'
    elif neighbor_count >= 10000:
        return 'influencer_mid'

    # 블로그 활동도
    if blog_age_days < 90:
        return 'new_blogger'

    if post_count >= 500 and neighbor_count >= 1000:
        return 'general_active'

    return 'general'


def calculate_expertise_score(content: str, blog_info: Dict = None) -> Dict:
    """
    전문성 점수 계산
    """
    if not content:
        return {'score': 50, 'indicators': [], 'level': 'general'}

    content_lower = content.lower()
    found_indicators = []
    score = 50

    # 인용/참고문헌 체크
    for indicator in EXPERTISE_INDICATORS['citations']:
        if indicator in content_lower or indicator in content:
            found_indicators.append(f'citation:{indicator}')
            score += 10

    # 전문 용어 체크
    for term in EXPERTISE_INDICATORS['professional_terms']:
        if term in content_lower or term in content:
            found_indicators.append(f'term:{term}')
            score += 5

    # 전문가 자격 언급 체크
    for cred in EXPERTISE_INDICATORS['credentials']:
        if cred in content_lower or cred in content:
            found_indicators.append(f'credential:{cred}')
            score += 15

    # 방법론/데이터 언급 체크
    for method in EXPERTISE_INDICATORS['methodology']:
        if method in content_lower or method in content:
            found_indicators.append(f'methodology:{method}')
            score += 5

    score = min(score, 100)

    # 전문성 레벨
    if score >= 80:
        level = 'expert'
    elif score >= 65:
        level = 'professional'
    elif score >= 50:
        level = 'informed'
    else:
        level = 'general'

    return {
        'score': score,
        'indicators': found_indicators[:10],
        'level': level,
        'indicator_count': len(found_indicators),
    }


def calculate_visual_quality_score(post_info: Dict) -> Dict:
    """
    시각적 품질 점수 계산 (VLM 대체 지표)
    """
    score = 50
    details = []

    image_count = post_info.get('image_count', 0) or 0
    heading_count = post_info.get('heading_count', 0) or 0
    paragraph_count = post_info.get('paragraph_count', 0) or 0
    content_length = post_info.get('content_length', 0) or 0
    video_count = post_info.get('video_count', 0) or 0

    # 이미지 품질
    if 5 <= image_count <= 15:
        score += 15
        details.append('optimal_image_count')
    elif 3 <= image_count < 5 or 15 < image_count <= 25:
        score += 10
        details.append('good_image_count')
    elif image_count >= 1:
        score += 5
        details.append('has_images')

    # 구조화된 레이아웃
    if heading_count >= 5:
        score += 15
        details.append('well_structured')
    elif heading_count >= 3:
        score += 10
        details.append('structured')
    elif heading_count >= 1:
        score += 5
        details.append('has_headings')

    # 문단 구성
    if 5 <= paragraph_count <= 20:
        score += 10
        details.append('good_paragraphs')
    elif paragraph_count >= 3:
        score += 5
        details.append('has_paragraphs')

    # 콘텐츠 충실도
    if content_length >= 2000:
        score += 10
        details.append('comprehensive_content')
    elif content_length >= 1000:
        score += 5
        details.append('adequate_content')

    # 멀티미디어
    if video_count >= 1:
        score += 5
        details.append('has_video')

    score = min(score, 100)

    return {
        'score': score,
        'details': details,
        'image_count': image_count,
        'heading_count': heading_count,
        'paragraph_count': paragraph_count,
    }


def calculate_content_freshness_score(post_info: Dict) -> Dict:
    """
    콘텐츠 최신성 점수 계산
    """
    days_old = post_info.get('days_since_post', 365) or 365
    last_modified = post_info.get('last_modified_days', days_old) or days_old

    if days_old <= 7:
        freshness_score = 100
        freshness_level = 'very_fresh'
    elif days_old <= 30:
        freshness_score = 85
        freshness_level = 'fresh'
    elif days_old <= 90:
        freshness_score = 70
        freshness_level = 'recent'
    elif days_old <= 180:
        freshness_score = 55
        freshness_level = 'moderate'
    elif days_old <= 365:
        freshness_score = 40
        freshness_level = 'older'
    else:
        freshness_score = 25
        freshness_level = 'aged'

    # 업데이트된 콘텐츠 보너스
    if last_modified < days_old and last_modified <= 30:
        freshness_score = min(freshness_score + 20, 100)
        freshness_level = 'updated'

    return {
        'score': freshness_score,
        'level': freshness_level,
        'days_old': days_old,
        'was_updated': last_modified < days_old,
    }


def calculate_source_diversity_score(blog_info: Dict, post_info: Dict) -> Dict:
    """
    출처 다양성 점수 계산
    """
    score = 50
    details = []

    external_links = post_info.get('external_link_count', 0) or 0
    if external_links >= 3:
        score += 20
        details.append('diverse_references')
    elif external_links >= 1:
        score += 10
        details.append('has_references')

    citation_count = post_info.get('citation_count', 0) or 0
    if citation_count >= 3:
        score += 15
        details.append('multiple_citations')
    elif citation_count >= 1:
        score += 8
        details.append('has_citations')

    has_image = post_info.get('image_count', 0) > 0
    has_video = post_info.get('video_count', 0) > 0
    has_map = post_info.get('has_map', False)

    media_types = sum([has_image, has_video, has_map])
    if media_types >= 2:
        score += 10
        details.append('diverse_media')

    topic_consistency = blog_info.get('topic_consistency', 0.5) or 0.5
    if 0.6 <= topic_consistency <= 0.85:
        score += 10
        details.append('balanced_topics')

    score = min(score, 100)

    return {
        'score': score,
        'details': details,
        'external_links': external_links,
        'citation_count': citation_count,
    }


def calculate_total_trust_score(
    blog_info: Dict,
    post_info: Dict,
    content: str = '',
    keyword: str = ''
) -> Dict:
    """
    종합 신뢰도 점수 계산

    네이버 2025 AI 신뢰도 평가 기준 반영:
    - 출처 신뢰도 35%
    - 전문성 30%
    - 시각적 품질 15%
    - 출처 다양성 10%
    - 콘텐츠 최신성 10%
    """
    weights = {
        'source_trust': 0.35,
        'expertise': 0.30,
        'visual_quality': 0.15,
        'source_diversity': 0.10,
        'content_freshness': 0.10,
    }

    source_result = calculate_source_trust_score(blog_info, keyword)
    expertise_result = calculate_expertise_score(content, blog_info)
    visual_result = calculate_visual_quality_score(post_info)
    diversity_result = calculate_source_diversity_score(blog_info, post_info)
    freshness_result = calculate_content_freshness_score(post_info)

    total_score = (
        source_result['final_score'] * weights['source_trust'] +
        expertise_result['score'] * weights['expertise'] +
        visual_result['score'] * weights['visual_quality'] +
        diversity_result['score'] * weights['source_diversity'] +
        freshness_result['score'] * weights['content_freshness']
    )

    if total_score >= 80:
        trust_level = 'highly_trusted'
    elif total_score >= 65:
        trust_level = 'trusted'
    elif total_score >= 50:
        trust_level = 'moderate'
    elif total_score >= 35:
        trust_level = 'low_trust'
    else:
        trust_level = 'untrusted'

    return {
        'total_score': round(total_score, 1),
        'trust_level': trust_level,
        'components': {
            'source_trust': source_result,
            'expertise': expertise_result,
            'visual_quality': visual_result,
            'source_diversity': diversity_result,
            'content_freshness': freshness_result,
        },
        'weights': weights,
        'keyword_category': source_result.get('keyword_category', 'general'),
    }


def get_trust_recommendations(trust_result: Dict) -> List[str]:
    """신뢰도 개선을 위한 추천사항 생성"""
    recommendations = []
    components = trust_result.get('components', {})

    expertise = components.get('expertise', {})
    if expertise.get('score', 0) < 60:
        recommendations.append("전문성 향상: 참고문헌/출처를 명시하고, 전문 용어를 적절히 활용하세요")

    visual = components.get('visual_quality', {})
    if visual.get('score', 0) < 60:
        if visual.get('heading_count', 0) < 3:
            recommendations.append("구조화: 소제목을 3개 이상 사용하여 글을 구조화하세요")
        if visual.get('image_count', 0) < 5:
            recommendations.append("이미지: 5-15개의 고품질 이미지를 포함하세요")

    freshness = components.get('content_freshness', {})
    if freshness.get('score', 0) < 50:
        recommendations.append("업데이트: 오래된 정보를 최신 내용으로 업데이트하세요")

    diversity = components.get('source_diversity', {})
    if diversity.get('score', 0) < 50:
        recommendations.append("출처 다양화: 외부 참고 링크와 인용을 추가하세요")

    return recommendations if recommendations else ["신뢰도 점수가 양호합니다"]
