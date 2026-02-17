"""
경쟁력 분석 서비스 v2 - 네이버 공식 레벨 기반
네이버 공식 레벨(1~4)을 핵심 축으로 6개 차원 경쟁력 분석
가짜 데이터(해시 기반 추정값) 제거, 보수적 확률 산출
"""
import re
import asyncio
import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timezone
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# 차원별 가중치 (네이버 공식 레벨 중심)
DIMENSION_WEIGHTS = {
    "blog_level": 0.30,           # 네이버 공식 레벨 (C-Rank 결과물이지 원인이 아님)
    "topical_authority": 0.30,    # 관련 글 수 (C-Rank 핵심, 주제 전문성)
    "content_freshness": 0.15,    # 최신성
    "content_quality": 0.10,      # 글 길이/깊이
    "keyword_optimization": 0.10, # 제목 키워드 포함률
    "posting_consistency": 0.05,  # 포스팅 빈도
}


async def fetch_blog_rss_posts(blog_id: str, http_client) -> List[Dict]:
    """RSS 피드에서 최근 글 목록 가져오기"""
    try:
        rss_url = f"https://rss.blog.naver.com/{blog_id}.xml"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/xml, text/xml, */*",
        }
        resp = await http_client.get(rss_url, headers=headers, timeout=8.0)
        if resp.status_code != 200:
            return []

        soup = BeautifulSoup(resp.text, "xml")
        items = soup.find_all("item")
        posts = []
        for item in items[:50]:
            title = item.find("title")
            description = item.find("description")
            pub_date = item.find("pubDate")
            link = item.find("link")
            category = item.find("category")

            post = {
                "title": title.get_text(strip=True) if title else "",
                "description": description.get_text(strip=True) if description else "",
                "pub_date": pub_date.get_text(strip=True) if pub_date else "",
                "link": link.get_text(strip=True) if link else "",
                "category": category.get_text(strip=True) if category else "",
            }
            posts.append(post)
        return posts
    except Exception as e:
        logger.warning(f"RSS fetch failed for {blog_id}: {e}")
        return []


# 검색 의도와 무관한 범용 단어 (키워드 부분매칭에서 제외)
_GENERIC_PARTS = {
    "방법", "추천", "후기", "확인", "정보", "비교", "순위", "리뷰",
    "best", "top", "종류", "가격", "사이트", "사용법", "차이",
    "장단점", "정리", "소개", "알아보기", "모음", "총정리",
}


def count_keyword_related_posts(posts: List[Dict], keyword: str) -> int:
    """
    키워드와 관련된 글 개수 세기 (부분매칭 포함)

    매칭 우선순위:
    1. 전체 키워드 정확 매칭 → 1.0
    2. 모든 유의미 파트 매칭 → 1.0
    3. 과반 유의미 파트 매칭 → 0.5 (partial)
    4. 카테고리에 유의미 파트 포함 → 0.3 (category)
    """
    if not posts or not keyword:
        return 0

    keyword_lower = keyword.lower().strip()
    keyword_parts = [p for p in keyword_lower.split() if len(p) >= 2]
    # 유의미 파트: 범용 단어 제외
    significant_parts = [p for p in keyword_parts if p not in _GENERIC_PARTS]
    # 유의미 파트가 없으면 (전부 범용어) 원래 파트 사용
    if not significant_parts:
        significant_parts = keyword_parts

    full_count = 0
    partial_count = 0

    for post in posts:
        title = post.get("title", "").lower()
        desc = post.get("description", "").lower()
        category = post.get("category", "").lower()
        text = f"{title} {desc}"

        # 1. 전체 키워드 정확 매칭
        if keyword_lower in text:
            full_count += 1
            continue

        # 2. 모든 유의미 파트 매칭
        if len(significant_parts) >= 2:
            if all(part in text for part in significant_parts):
                full_count += 1
                continue

        # 3. 과반 유의미 파트 매칭 (본문)
        if significant_parts:
            matched = sum(1 for p in significant_parts if p in text)
            threshold = max(1, len(significant_parts) // 2)
            if matched >= threshold:
                partial_count += 1
                continue

        # 4. 카테고리에 유의미 파트 포함
        if category and significant_parts:
            cat_matched = sum(1 for p in significant_parts if p in category)
            if cat_matched >= 1:
                partial_count += 1

    # 부분 매칭은 2개당 1건으로 환산
    return full_count + max(0, partial_count // 2)


def estimate_naver_level_from_stats(stats: Dict) -> Optional[int]:
    """
    naver_level(1~4) 스크래핑 실패 시 공개 통계로 추정

    total_posts + neighbor_count → 블로그 권한 수준 추정
    실제 네이버 레벨과 1:1 대응은 아니지만, 상대 비교에 유효
    """
    total_posts = stats.get("total_posts") or 0
    neighbor_count = stats.get("neighbor_count") or 0

    authority = 0.0

    # 글 수 기반 (최대 2.0)
    if total_posts >= 1000:
        authority += 2.0
    elif total_posts >= 500:
        authority += 1.5
    elif total_posts >= 200:
        authority += 1.0
    elif total_posts >= 50:
        authority += 0.5

    # 이웃 수 기반 (최대 2.0)
    if neighbor_count >= 1000:
        authority += 2.0
    elif neighbor_count >= 500:
        authority += 1.5
    elif neighbor_count >= 200:
        authority += 1.0
    elif neighbor_count >= 50:
        authority += 0.5

    if authority >= 3.5:
        return 4
    elif authority >= 2.0:
        return 3
    elif authority >= 1.0:
        return 2
    else:
        return 1


def get_last_post_days(posts: List[Dict]) -> Optional[int]:
    """RSS 포스트 목록에서 마지막 포스팅 일수 계산"""
    if not posts:
        return None

    now = datetime.now(timezone.utc)
    for post in posts[:1]:
        pub_date_str = post.get("pub_date", "")
        if pub_date_str:
            try:
                from email.utils import parsedate_to_datetime
                dt = parsedate_to_datetime(pub_date_str)
                return (now - dt).days
            except Exception:
                pass
    return None


# ========== 키워드 경쟁도 분석 ==========

def assess_keyword_competitiveness(competitor_naver_levels: List[Optional[int]],
                                   top_results_count: int) -> Dict:
    """
    상위 10개 블로그의 네이버 레벨을 분석하여 키워드 경쟁도 판단

    Returns:
        difficulty: easy/moderate/hard/very_hard
        difficulty_score: 0~100
        level_floor: 최소 필요 레벨
        high_level_count: 고레벨(3~4) 블로그 수
    """
    valid_levels = [lv for lv in competitor_naver_levels if lv is not None]

    if not valid_levels or top_results_count == 0:
        return {
            "difficulty": "unknown",
            "difficulty_score": 50,
            "level_floor": 1,
            "high_level_count": 0,
            "detail": "경쟁자 레벨 정보 부족",
        }

    avg_level = sum(valid_levels) / len(valid_levels)
    high_level_count = sum(1 for lv in valid_levels if lv >= 3)
    max_level = max(valid_levels)
    level_3_4_ratio = high_level_count / len(valid_levels)

    # 경쟁도 판단
    if level_3_4_ratio >= 0.7 or avg_level >= 3.5:
        difficulty = "very_hard"
        difficulty_score = 90
        level_floor = 3
        detail = f"상위 {high_level_count}/{len(valid_levels)}개가 고레벨 블로그"
    elif level_3_4_ratio >= 0.4 or avg_level >= 2.8:
        difficulty = "hard"
        difficulty_score = 70
        level_floor = 2
        detail = f"상위 블로그 평균 Lv.{avg_level:.1f}"
    elif avg_level >= 2.0:
        difficulty = "moderate"
        difficulty_score = 45
        level_floor = 2
        detail = f"상위 블로그 평균 Lv.{avg_level:.1f} (보통)"
    else:
        difficulty = "easy"
        difficulty_score = 20
        level_floor = 1
        detail = f"상위 블로그 평균 Lv.{avg_level:.1f} (낮음)"

    return {
        "difficulty": difficulty,
        "difficulty_score": difficulty_score,
        "level_floor": level_floor,
        "high_level_count": high_level_count,
        "avg_level": round(avg_level, 1),
        "detail": detail,
    }


# ========== 6개 차원 분석 함수 ==========

def analyze_blog_level(my_naver_level: Optional[int],
                       competitor_naver_levels: List[Optional[int]]) -> Dict:
    """
    블로그 레벨 분석 (30%) - 네이버 공식 레벨 기반
    Lv.1 블로그는 점수 상한 35점
    """
    valid_comp_levels = [lv for lv in competitor_naver_levels if lv is not None]
    avg_comp_level = sum(valid_comp_levels) / len(valid_comp_levels) if valid_comp_levels else 2.0

    if my_naver_level is None:
        # 레벨 정보를 못 가져온 경우 - 보수적으로 Lv.1 취급
        score = 15
        detail = "네이버 레벨 확인 불가 (Lv.1로 추정)"
        my_naver_level_display = 1
    else:
        my_naver_level_display = my_naver_level
        level_diff = my_naver_level - avg_comp_level

        if my_naver_level == 4:
            score = 90
            detail = f"Lv.4 (최고 레벨)"
        elif my_naver_level == 3:
            if avg_comp_level <= 3.0:
                score = 72
                detail = f"Lv.3 (경쟁자 평균 Lv.{avg_comp_level:.1f} 대비 우위)"
            else:
                score = 58
                detail = f"Lv.3 (경쟁자 평균 Lv.{avg_comp_level:.1f})"
        elif my_naver_level == 2:
            if avg_comp_level <= 2.0:
                score = 50
                detail = f"Lv.2 (경쟁자 수준)"
            elif avg_comp_level <= 3.0:
                score = 30
                detail = f"Lv.2 (경쟁자 평균 Lv.{avg_comp_level:.1f} 대비 열세)"
            else:
                score = 18
                detail = f"Lv.2 (경쟁자 평균 Lv.{avg_comp_level:.1f} 대비 큰 열세)"
        else:  # Lv.1
            score = min(35, 10)  # Lv.1은 절대 상한 35
            detail = f"Lv.1 (아무리 다른 요소가 좋아도 한계 있음)"

    return {
        "dimension": "blog_level",
        "label": "네이버 레벨",
        "score": round(min(95, max(5, score))),
        "detail": detail,
        "my_value": my_naver_level_display,
        "competitor_avg": round(avg_comp_level, 1),
        "weight": DIMENSION_WEIGHTS["blog_level"],
    }


def analyze_topical_authority(my_related_count: int, my_total_posts: int) -> Dict:
    """
    주제 적합성 분석 (30%) — C-Rank Context 핵심
    관련 글 절대 수 + 전체 글 대비 주제 집중도 비율 반영
    """
    # (A) 관련글 절대 수 점수 (0~95)
    if my_related_count == 0:
        abs_score = 5
    elif my_related_count >= 10:
        abs_score = min(95, 60 + my_related_count * 2)
    elif my_related_count >= 5:
        abs_score = 45 + my_related_count * 3
    elif my_related_count >= 2:
        abs_score = 25 + my_related_count * 5
    else:
        abs_score = 15

    # (B) 주제 집중도 보너스/페널티 (C-Rank Context 핵심)
    # 전체 글 대비 관련글 비율이 높으면 = 주제 전문 블로그
    concentration_bonus = 0
    if my_total_posts > 0 and my_related_count > 0:
        concentration = my_related_count / my_total_posts
        if concentration >= 0.3:
            # 전체 글의 30%+ 가 이 주제 → 주제 전문 블로그
            concentration_bonus = 15
        elif concentration >= 0.15:
            concentration_bonus = 8
        elif concentration >= 0.05:
            concentration_bonus = 0
        else:
            # 전체 글의 5% 미만 → 잡다한 블로그
            concentration_bonus = -10

    score = max(5, min(95, abs_score + concentration_bonus))

    # 디테일 문구 생성
    if my_related_count == 0:
        detail = "관련 글이 없습니다"
    else:
        detail = f"관련 글 {my_related_count}개"
        if my_total_posts > 0:
            pct = round(my_related_count / my_total_posts * 100)
            detail += f" (전체 {my_total_posts}개 중 {pct}%)"
            if concentration_bonus >= 15:
                detail += " · 주제 전문 블로그"
            elif concentration_bonus <= -10:
                detail += " · 주제 집중도 낮음"
        if my_related_count < 3:
            detail += " — 부족"
        elif my_related_count < 5:
            detail += " — 보통"
        else:
            detail += " — 풍부"

    return {
        "dimension": "topical_authority",
        "label": "관련 글 수",
        "score": round(score),
        "detail": detail,
        "my_value": my_related_count,
        "competitor_avg": None,
        "weight": DIMENSION_WEIGHTS["topical_authority"],
    }


def analyze_content_freshness(top_post_dates: List[Optional[datetime]]) -> Dict:
    """최신성 분석 (15%) - 상위 글들의 작성일 분석"""
    now = datetime.now(timezone.utc)
    valid_dates = [d for d in top_post_dates if d is not None]

    if not valid_dates:
        return {
            "dimension": "content_freshness",
            "label": "최신성",
            "score": 50,
            "detail": "상위 글 날짜 분석 불가",
            "my_value": None,
            "competitor_avg": None,
            "weight": DIMENSION_WEIGHTS["content_freshness"],
        }

    ages_days = [(now - d).days for d in valid_dates]
    avg_age = sum(ages_days) / len(ages_days)
    recent_count = sum(1 for a in ages_days if a <= 30)

    if avg_age >= 365:
        score = 80
        detail = f"상위 글 평균 {int(avg_age)}일 전 (진입 기회 높음)"
    elif avg_age >= 180:
        score = 65
        detail = f"상위 글 평균 {int(avg_age)}일 전 (진입 가능)"
    elif avg_age >= 90:
        score = 50
        detail = f"상위 글 평균 {int(avg_age)}일 전 (보통)"
    elif avg_age >= 30:
        score = 35
        detail = f"상위 글 평균 {int(avg_age)}일 전 (경쟁 활발)"
    else:
        score = 20
        detail = f"상위 글 평균 {int(avg_age)}일 전 (매우 활발)"

    if recent_count >= 7:
        score = max(10, score - 15)
        detail += f", 최근 30일 내 {recent_count}개"

    return {
        "dimension": "content_freshness",
        "label": "최신성",
        "score": round(score),
        "detail": detail,
        "my_value": round(avg_age),
        "competitor_avg": recent_count,
        "weight": DIMENSION_WEIGHTS["content_freshness"],
    }


def analyze_content_quality(my_avg_length: int, my_posts: List[Dict],
                            competitor_avg_length: float) -> Dict:
    """콘텐츠 품질 분석 (10%) - RSS description 기준 (요약문 200~500자)"""
    if my_avg_length == 0:
        score = 10
        detail = "글 데이터 없음"
    elif my_avg_length >= 500:
        score = 85
        detail = f"RSS 평균 {my_avg_length:,}자 (풍부한 콘텐츠)"
    elif my_avg_length >= 350:
        score = 70
        detail = f"RSS 평균 {my_avg_length:,}자 (양호)"
    elif my_avg_length >= 200:
        score = 55
        detail = f"RSS 평균 {my_avg_length:,}자 (보통)"
    elif my_avg_length >= 100:
        score = 35
        detail = f"RSS 평균 {my_avg_length:,}자 (짧음)"
    else:
        score = 15
        detail = f"RSS 평균 {my_avg_length:,}자 (매우 짧음)"

    if competitor_avg_length > 0 and my_avg_length > 0:
        ratio = my_avg_length / competitor_avg_length
        if ratio >= 1.3:
            score = min(95, score + 10)
        elif ratio < 0.5:
            score = max(5, score - 15)

    return {
        "dimension": "content_quality",
        "label": "콘텐츠 품질",
        "score": round(score),
        "detail": detail,
        "my_value": my_avg_length,
        "competitor_avg": round(competitor_avg_length),
        "weight": DIMENSION_WEIGHTS["content_quality"],
    }


def analyze_keyword_optimization(keyword: str, top_results: List[Dict]) -> Dict:
    """키워드 최적화 분석 (10%)"""
    if not top_results or not keyword:
        return {
            "dimension": "keyword_optimization",
            "label": "키워드 최적화",
            "score": 50,
            "detail": "분석 데이터 부족",
            "my_value": None,
            "competitor_avg": None,
            "weight": DIMENSION_WEIGHTS["keyword_optimization"],
        }

    keyword_lower = keyword.lower().strip()
    keyword_parts = [p for p in keyword_lower.split() if len(p) >= 2]
    titles_with_keyword = 0

    for result in top_results[:10]:
        title = (result.get("title", "") or "").lower()
        title = re.sub(r"<[^>]+>", "", title)
        if keyword_lower in title:
            titles_with_keyword += 1
        elif len(keyword_parts) >= 2 and all(p in title for p in keyword_parts):
            titles_with_keyword += 1

    keyword_ratio = titles_with_keyword / min(10, len(top_results))

    if keyword_ratio >= 0.8:
        # 대부분 경쟁자가 키워드 사용 → 필수 전략이지만 차별화 어려움
        score = 50
        detail = f"상위 {titles_with_keyword}/{min(10, len(top_results))}개 제목에 키워드 포함 (치열)"
    elif keyword_ratio >= 0.5:
        # 키워드 관련성 높으면서 차별화 여지 존재
        score = 65
        detail = f"상위 {titles_with_keyword}/{min(10, len(top_results))}개 제목에 키워드 포함 (기회 있음)"
    elif keyword_ratio >= 0.3:
        score = 45
        detail = f"상위 {titles_with_keyword}/{min(10, len(top_results))}개 제목에 키워드 포함 (보통)"
    else:
        # 상위 글이 이 키워드에 최적화되지 않음 → SERP 매칭 낮음
        score = 30
        detail = f"상위 글 중 키워드 포함 {titles_with_keyword}개 (키워드-SERP 매칭 낮음)"

    return {
        "dimension": "keyword_optimization",
        "label": "키워드 최적화",
        "score": round(score),
        "detail": detail,
        "my_value": keyword_ratio,
        "competitor_avg": titles_with_keyword,
        "weight": DIMENSION_WEIGHTS["keyword_optimization"],
    }


def analyze_posting_consistency(my_last_post_days: Optional[int],
                                my_posts: List[Dict]) -> Dict:
    """
    포스팅 활동 분석 (5%) — 최근 활동 + 포스팅 빈도 + 블로그 나이
    """
    now = datetime.now(timezone.utc)

    # (A) 마지막 포스팅 기반 점수 (0~50)
    if my_last_post_days is None:
        recency_score = 10
    elif my_last_post_days <= 3:
        recency_score = 50
    elif my_last_post_days <= 7:
        recency_score = 40
    elif my_last_post_days <= 14:
        recency_score = 30
    elif my_last_post_days <= 30:
        recency_score = 20
    elif my_last_post_days <= 90:
        recency_score = 10
    else:
        recency_score = 5

    # (B) 최근 30일 포스팅 빈도 (0~30)
    recent_30d_count = 0
    if my_posts:
        for post in my_posts:
            pub_date_str = post.get("pub_date", "")
            if pub_date_str:
                try:
                    from email.utils import parsedate_to_datetime
                    dt = parsedate_to_datetime(pub_date_str)
                    if (now - dt).days <= 30:
                        recent_30d_count += 1
                except Exception:
                    pass

    if recent_30d_count >= 12:
        freq_score = 30  # 주 3회+ → 매우 활발
    elif recent_30d_count >= 8:
        freq_score = 25  # 주 2회
    elif recent_30d_count >= 4:
        freq_score = 18  # 주 1회
    elif recent_30d_count >= 1:
        freq_score = 10
    else:
        freq_score = 0

    # (C) 블로그 운영 기간 보너스 (0~15)
    blog_age_bonus = 0
    if my_posts and len(my_posts) >= 2:
        oldest_date = None
        for post in my_posts[-5:]:  # RSS 마지막 글들 (가장 오래된)
            pub_date_str = post.get("pub_date", "")
            if pub_date_str:
                try:
                    from email.utils import parsedate_to_datetime
                    dt = parsedate_to_datetime(pub_date_str)
                    if oldest_date is None or dt < oldest_date:
                        oldest_date = dt
                except Exception:
                    pass
        if oldest_date:
            blog_age_days = (now - oldest_date).days
            if blog_age_days >= 365:
                blog_age_bonus = 15  # 1년+ 운영
            elif blog_age_days >= 180:
                blog_age_bonus = 10
            elif blog_age_days >= 90:
                blog_age_bonus = 5

    score = recency_score + freq_score + blog_age_bonus

    # 디테일 생성
    details = []
    if my_last_post_days is not None:
        details.append(f"마지막 포스팅 {my_last_post_days}일 전")
    if recent_30d_count > 0:
        details.append(f"최근 30일 {recent_30d_count}건")
    if blog_age_bonus > 0:
        details.append(f"장기 운영 블로그")
    detail = " · ".join(details) if details else "포스팅 정보 없음"

    return {
        "dimension": "posting_consistency",
        "label": "포스팅 활동",
        "score": round(min(95, max(5, score))),
        "detail": detail,
        "my_value": my_last_post_days,
        "competitor_avg": None,
        "weight": DIMENSION_WEIGHTS["posting_consistency"],
    }


# ========== 확률 / 순위 계산 ==========

def calculate_probability_range(weighted_score: float,
                                my_naver_level: Optional[int],
                                keyword_difficulty: Dict,
                                already_ranking: Optional[int],
                                topical_authority_count: int,
                                my_total_posts: int = 0) -> Tuple[int, int, int]:
    """
    경쟁력 지수 범위 계산 (하한, 중간, 상한) — 0~100점 스케일

    HARD GATE 1: 관련 글 0개 → 최대 12점 (RSS 한계 보정 있음)
    HARD GATE 2: 내 레벨 < 키워드 필요레벨 → 상한 제한
    절대 상한 95점 (이미 노출 중 제외)
    """
    # 이미 랭킹 중이면 높은 점수
    if already_ranking is not None and already_ranking <= 10:
        return (70, 85, 95)

    # RSS 한계 보정: RSS는 최근 50건만 반환하므로
    # 총 게시글이 많은데 관련글이 0이면 RSS 범위 밖에 관련글이 있을 가능성
    rss_limited = my_total_posts >= 100

    # ===== HARD GATE 1: 관련 글 0개 =====
    if topical_authority_count == 0:
        if rss_limited:
            # 총 글 100+인데 RSS에서 관련글 0 → RSS 한계일 가능성
            return (5, 12, 25)
        return (2, 5, 12)

    # ===== HARD GATE 2: 레벨 부족 =====
    level_floor = keyword_difficulty.get("level_floor", 1)
    effective_level = my_naver_level if my_naver_level is not None else 1

    if effective_level < level_floor:
        level_gap = level_floor - effective_level
        if level_gap >= 2:
            cap = 18  # 2단계 이상 차이 → 거의 불가능
        else:
            cap = 40  # 1단계 차이 → 어려움
        base_mid = max(5, min(cap, int(weighted_score * 0.4)))
        low = max(2, base_mid - 8)
        high = min(cap, base_mid + 8)
        return (low, base_mid, high)

    # ===== 일반 경쟁력 지수 (0-100 스케일, 선형 보간) =====
    difficulty = keyword_difficulty.get("difficulty", "moderate")

    # 경쟁력 지수 매핑 테이블 (score_threshold, low, mid, high)
    _PROB_TABLE = [
        (0,   5,  10,  18),
        (30, 12,  22,  32),
        (40, 22,  35,  48),
        (50, 35,  48,  60),
        (60, 48,  60,  72),
        (75, 60,  72,  82),
        (90, 72,  82,  92),
    ]

    def _interpolate_prob(score: float) -> Tuple[int, int, int]:
        if score <= _PROB_TABLE[0][0]:
            return _PROB_TABLE[0][1], _PROB_TABLE[0][2], _PROB_TABLE[0][3]
        if score >= _PROB_TABLE[-1][0]:
            return _PROB_TABLE[-1][1], _PROB_TABLE[-1][2], _PROB_TABLE[-1][3]
        for i in range(len(_PROB_TABLE) - 1):
            s0, l0, m0, h0 = _PROB_TABLE[i]
            s1, l1, m1, h1 = _PROB_TABLE[i + 1]
            if s0 <= score <= s1:
                t = (score - s0) / (s1 - s0) if s1 != s0 else 0
                return (
                    int(round(l0 + t * (l1 - l0))),
                    int(round(m0 + t * (m1 - m0))),
                    int(round(h0 + t * (h1 - h0))),
                )
        return _PROB_TABLE[-1][1], _PROB_TABLE[-1][2], _PROB_TABLE[-1][3]

    low, mid, high = _interpolate_prob(weighted_score)

    # 키워드 난이도 보정
    if difficulty == "very_hard":
        low = max(1, low - 15)
        mid = max(2, mid - 15)
        high = max(5, high - 15)
    elif difficulty == "hard":
        low = max(1, low - 8)
        mid = max(2, mid - 8)
        high = max(5, high - 8)
    elif difficulty == "easy":
        low = min(85, low + 10)
        mid = min(90, mid + 10)
        high = min(95, high + 10)

    # 관련 글이 적으면 상한 추가 제한 (RSS 한계 보정 포함)
    if topical_authority_count == 1:
        if rss_limited:
            high = min(high, 50)
            mid = min(mid, 35)
        else:
            high = min(high, 35)
            mid = min(mid, 25)
    elif topical_authority_count <= 3:
        if rss_limited:
            high = min(high, 65)
        else:
            high = min(high, 55)

    # Lv.1 블로그는 절대 상한 (stats 추정 Lv.1이면서 total_posts 많으면 완화)
    if effective_level == 1:
        if rss_limited:
            # 총 글 많은데 Lv.1 → stats 추정 한계일 수 있음
            high = min(high, 45)
            mid = min(mid, 35)
            low = min(low, 20)
        else:
            high = min(high, 35)
            mid = min(mid, 25)
            low = min(low, 15)

    # 절대 상한 95점 (네이버 알고리즘 불확실성 반영)
    high = min(high, 95)
    mid = min(mid, high)
    low = min(low, mid)

    return (max(1, low), max(2, mid), max(3, high))


def estimate_rank_position(my_naver_level: Optional[int],
                           my_related_count: int,
                           my_content_score: float,
                           competitors: List[Dict],
                           already_ranking: Optional[int],
                           my_total_posts: int = 0) -> Tuple[int, int, str]:
    """
    예상 순위 계산 - 레벨 기반 비교

    Returns:
        (rank_best, rank_worst, explanation)
    """
    if already_ranking is not None and already_ranking <= 10:
        return (max(1, already_ranking - 1), min(10, already_ranking + 1),
                f"현재 {already_ranking}위 노출 중")

    if not competitors:
        return (5, 11, "경쟁자 데이터 부족")

    effective_level = my_naver_level if my_naver_level is not None else 1

    can_beat = 0
    cannot_beat = 0

    # 레벨별 추정 가중점수 (검색결과에 total_score가 없으므로 레벨로 추정)
    _LEVEL_ESTIMATED_SCORE = {1: 25, 2: 40, 3: 60, 4: 80}

    for comp in competitors:
        comp_level = comp.get("naver_level")
        if comp_level is None:
            comp_level = 2  # 알 수 없으면 보수적 추정

        # 3요소 복합 판정: 레벨 + 주제전문성 + 콘텐츠
        # level_advantage: -1 ~ +1 범위 (레벨 차이를 정규화)
        level_diff = effective_level - comp_level
        level_advantage = max(-1.0, min(1.0, level_diff / 2.0))

        # authority_advantage: 관련글 수 기반 (0~1)
        authority_advantage = min(1.0, my_related_count / 8.0)

        # content_advantage: 내 가중점수 vs 경쟁자 추정점수
        # 주의: my_content_score(키워드별 분석)와 total_score(블로그 전체)는
        # 서로 다른 메트릭이므로 보수적으로 비교 (/ 80.0)
        comp_total_score = comp.get("total_score") or 0
        if comp_total_score == 0:
            comp_total_score = _LEVEL_ESTIMATED_SCORE.get(comp_level, 35)
        content_advantage = min(1.0, max(-1.0, (my_content_score - comp_total_score) / 80.0))

        beat_score = level_advantage * 0.40 + authority_advantage * 0.35 + content_advantage * 0.25

        # 임계값: 같은 레벨 + 관련글 6개 + 콘텐츠 우위로 이길 수 있어야 함
        if beat_score >= 0.30:
            can_beat += 1
        elif beat_score <= 0.05:
            cannot_beat += 1
        # else: 중립 (순위에 영향 없음)

    rank_best = max(1, cannot_beat + 1)
    rank_worst = min(len(competitors) + 1, cannot_beat + (len(competitors) - can_beat - cannot_beat) + 1)

    # 동일 레벨 불확실성: 경쟁자 대부분이 같은 레벨이면 순위 예측 폭 확대
    # 레벨만으로 차별화 불가 → 실제 순위는 D.I.A./체류시간 등 측정 불가 요소에 좌우
    same_level_count = sum(1 for c in competitors if c.get("naver_level") == effective_level)
    if same_level_count >= len(competitors) * 0.7 and len(competitors) >= 5:
        uncertainty_width = max(3, same_level_count // 2)
        rank_worst = max(rank_worst, min(rank_best + uncertainty_width, len(competitors) + 1))

    # HARD GATE: 관련글 부족 시 순위 하한 강제 (확률 HARD GATE와 일관성)
    # RSS 한계 보정: 총 글 100+인데 관련글 적으면 실제로는 관련글이 있을 가능성
    rss_limited = my_total_posts >= 100
    if my_related_count == 0:
        if rss_limited:
            # RSS 한계: 총 글 100+인데 관련글 0 → 실제로는 관련글 존재 가능
            # 과도한 패널티 방지를 위해 rank_best를 6까지 완화 (min으로 상한 내림)
            rank_best = min(rank_best, 6)
            rank_worst = min(rank_worst, 9)
        else:
            rank_best = max(rank_best, 10)
            rank_worst = max(rank_worst, 11)
    elif my_related_count == 1:
        if rss_limited:
            rank_best = min(rank_best, 4)
        else:
            rank_best = max(rank_best, 7)
    elif my_related_count <= 2:
        if rss_limited:
            rank_best = min(rank_best, 3)
        else:
            rank_best = max(rank_best, 5)

    # 설명 생성
    if rank_best > 10:
        if my_related_count == 0:
            explanation = "순위권 밖 (관련 글 없음 — 주제 전문성 필요)"
        else:
            explanation = "순위권 밖 (레벨/관련글 부족)"
    elif rank_worst > 10:
        explanation = f"최선 {rank_best}위, 진입 불확실"
    else:
        explanation = f"{rank_best}~{rank_worst}위 예상"

    return (rank_best, rank_worst, explanation)


def get_competitiveness_grade(weighted_score: float) -> Tuple[str, str]:
    """경쟁력 등급 계산 (A/B/C/D/F)"""
    if weighted_score >= 75:
        return ("A", "매우 높음")
    elif weighted_score >= 60:
        return ("B", "높음")
    elif weighted_score >= 45:
        return ("C", "보통")
    elif weighted_score >= 30:
        return ("D", "낮음")
    else:
        return ("F", "매우 낮음")


def generate_recommendations(dimensions: List[Dict], my_related_count: int,
                             my_naver_level: Optional[int],
                             keyword_difficulty: Dict,
                             already_ranking: Optional[int]) -> List[Dict]:
    """구체적 개선 방안 생성"""
    recommendations = []

    if already_ranking is not None and already_ranking <= 10:
        recommendations.append({
            "type": "success",
            "message": f"이미 {already_ranking}위에 노출 중입니다! 순위 유지를 위해 콘텐츠를 최신 상태로 유지하세요.",
            "priority": "low",
        })
        return recommendations

    effective_level = my_naver_level if my_naver_level is not None else 1
    level_floor = keyword_difficulty.get("level_floor", 1)

    # 레벨 부족 경고
    if effective_level < level_floor:
        recommendations.append({
            "type": "critical",
            "message": f"이 키워드는 최소 Lv.{level_floor} 이상이 필요합니다. 현재 Lv.{effective_level}로는 상위 노출이 매우 어렵습니다. 블로그 레벨을 먼저 올리세요.",
            "priority": "high",
        })

    # 관련 글 부족
    if my_related_count == 0:
        recommendations.append({
            "type": "critical",
            "message": "이 키워드 관련 글이 없습니다. 관련 글을 최소 3~5개 먼저 작성해야 합니다.",
            "priority": "high",
            "current": 0,
            "target": 5,
        })
    elif my_related_count < 3:
        recommendations.append({
            "type": "improvement",
            "message": f"관련 글이 {my_related_count}개뿐입니다. 5개 이상 작성하면 C-Rank가 크게 올라갑니다.",
            "priority": "high",
            "current": my_related_count,
            "target": 5,
        })

    # 콘텐츠 품질
    cq = next((d for d in dimensions if d["dimension"] == "content_quality"), None)
    if cq and cq["score"] < 40:
        recommendations.append({
            "type": "improvement",
            "message": f"글 평균 길이가 {cq['my_value']:,}자로 짧습니다. 2,000자 이상의 상세한 글을 작성하세요.",
            "priority": "high",
            "current": cq["my_value"],
            "target": 2000,
        })

    # 최신성 기회
    fr = next((d for d in dimensions if d["dimension"] == "content_freshness"), None)
    if fr and fr["score"] >= 65:
        recommendations.append({
            "type": "opportunity",
            "message": "상위 글이 오래되어 새 글로 진입할 기회가 있습니다. 최신 정보가 담긴 글을 작성하세요.",
            "priority": "medium",
        })

    # 포스팅 빈도
    pc = next((d for d in dimensions if d["dimension"] == "posting_consistency"), None)
    if pc and pc["score"] < 30:
        recommendations.append({
            "type": "improvement",
            "message": "블로그 활동이 뜸합니다. 주 2~3회 이상 꾸준한 포스팅이 C-Rank 유지에 중요합니다.",
            "priority": "medium",
        })

    # 키워드 최적화
    ko = next((d for d in dimensions if d["dimension"] == "keyword_optimization"), None)
    if ko and ko["score"] >= 55:
        recommendations.append({
            "type": "tip",
            "message": "제목에 키워드를 정확히 포함하고, 본문 서두에서도 키워드를 자연스럽게 사용하세요.",
            "priority": "medium",
        })

    if not recommendations:
        recommendations.append({
            "type": "info",
            "message": "전반적으로 경쟁력이 있습니다. 꾸준한 관련 글 작성이 가장 중요합니다.",
            "priority": "low",
        })

    return recommendations


# ========== 메인 함수 ==========

async def run_competitive_analysis(
    blog_id: str,
    keyword: str,
    search_results: Optional[List[Dict]] = None,
    my_blog_data: Optional[Dict] = None,
) -> Dict:
    """
    경쟁력 분석 메인 함수 - 네이버 공식 레벨 기반

    Returns:
        다차원 경쟁력 분석 결과 (naver_level, keyword_competitiveness 포함)
    """
    from routers.blogs import get_http_client, analyze_blog, fetch_naver_search_results_both_tabs
    from services.rank_checker import RankChecker

    http_client = await get_http_client()

    # 1. 내 블로그 분석 데이터
    if my_blog_data is None:
        my_blog_data = await analyze_blog(blog_id, keyword)

    if not my_blog_data or my_blog_data.get("error_code"):
        error_code = my_blog_data.get("error_code", "ANALYSIS_FAILED") if my_blog_data else "ANALYSIS_FAILED"
        error_msg = my_blog_data.get("error_message", "블로그 분석에 실패했습니다") if my_blog_data else "블로그 분석에 실패했습니다"
        return {
            "success": False,
            "error_code": error_code,
            "error_message": error_msg,
        }

    my_stats = my_blog_data.get("stats", {}) or {}
    my_index = my_blog_data.get("index", {}) or {}
    my_naver_level = my_blog_data.get("naver_level")

    # naver_level 스크래핑 실패 시 stats에서 추정
    if my_naver_level is None and my_stats:
        my_naver_level = estimate_naver_level_from_stats(my_stats)
        logger.info(f"naver_level estimated from stats: Lv.{my_naver_level} "
                     f"(posts={my_stats.get('total_posts')}, "
                     f"neighbors={my_stats.get('neighbor_count')})")

    # 2. 검색 결과 가져오기
    if search_results is None:
        try:
            both_results = await fetch_naver_search_results_both_tabs(keyword, limit=10)
            search_results = both_results.get("blog_results", [])
        except Exception as e:
            logger.warning(f"Search results fetch failed: {e}")
            search_results = []

    top_results = search_results[:10] if search_results else []

    # 3. 현재 순위 확인
    already_ranking = None
    try:
        rank_checker = RankChecker()
        already_ranking = await rank_checker.check_blog_tab_rank(keyword, blog_id, max_results=10)
        await rank_checker.close()
    except Exception as e:
        logger.warning(f"Rank check failed: {e}")

    # 4. 내 블로그 RSS에서 관련 글 분석
    my_posts = await fetch_blog_rss_posts(blog_id, http_client)
    my_related_count = count_keyword_related_posts(my_posts, keyword)
    my_last_post_days = get_last_post_days(my_posts)

    # 내 관련 글의 평균 길이 계산
    my_avg_length = 0
    if my_posts:
        related_lengths = []
        for post in my_posts[:10]:
            desc = post.get("description", "")
            if desc:
                related_lengths.append(len(desc))
        if related_lengths:
            my_avg_length = sum(related_lengths) / len(related_lengths)

    # 5. 경쟁자 정보 수집 — 실제 네이버 레벨 병렬 스크래핑
    from routers.blogs import scrape_blog_stats_fast

    # 5-1. 검색 결과에서 blog_id 추출 + 날짜 파싱
    comp_blog_ids = []
    top_post_dates = []
    for result in top_results:
        # blog_id 추출 (검색 결과 또는 URL에서)
        comp_id = result.get("blog_id", "")
        if not comp_id:
            post_url = result.get("post_url", "") or result.get("link", "")
            match = re.search(r'blog\.naver\.com/(\w+)', post_url)
            if match:
                comp_id = match.group(1)
        comp_blog_ids.append(comp_id)

        # 상위 글 날짜 파싱
        pub_date_str = result.get("pub_date") or result.get("postdate", "")
        if pub_date_str:
            try:
                if len(pub_date_str) == 8 and pub_date_str.isdigit():
                    dt = datetime(int(pub_date_str[:4]), int(pub_date_str[4:6]),
                                 int(pub_date_str[6:8]), tzinfo=timezone.utc)
                    top_post_dates.append(dt)
                else:
                    from email.utils import parsedate_to_datetime
                    dt = parsedate_to_datetime(pub_date_str)
                    top_post_dates.append(dt)
            except Exception:
                pass

    # 5-2. 경쟁자 블로그 레벨 병렬 스크래핑 (내 blog_id 제외)
    unique_comp_ids = [cid for cid in comp_blog_ids if cid and cid != blog_id]
    scrape_tasks = [scrape_blog_stats_fast(cid) for cid in unique_comp_ids]
    scrape_results_raw = await asyncio.gather(*scrape_tasks, return_exceptions=True)

    # 스크래핑 결과를 blog_id → stats 매핑
    comp_scraped = {}
    for cid, sr in zip(unique_comp_ids, scrape_results_raw):
        if isinstance(sr, dict):
            comp_scraped[cid] = sr

    # 5-3. 경쟁자 레벨/스탯 조립
    competitor_naver_levels = []
    competitor_stats = []
    for i, result in enumerate(top_results):
        cid = comp_blog_ids[i]
        stats = result.get("stats") or {}
        index = result.get("index") or {}

        # 우선순위: 실제 스크래핑 > 검색결과 내장 > stats 추정
        scraped = comp_scraped.get(cid, {})
        comp_naver_level = (
            scraped.get("naver_level")
            or result.get("naver_level")
            or stats.get("naver_level")
        )
        comp_total_posts = (
            scraped.get("total_posts")
            or stats.get("total_posts", 0)
        )
        comp_neighbor = (
            scraped.get("neighbor_count")
            or stats.get("neighbor_count", 0)
        )
        # naver_level이 None이면 stats에서 추정
        if comp_naver_level is None:
            comp_naver_level = estimate_naver_level_from_stats({
                "total_posts": comp_total_posts,
                "neighbor_count": comp_neighbor,
            })
        competitor_naver_levels.append(comp_naver_level)

        competitor_stats.append({
            "naver_level": comp_naver_level,
            "total_posts": comp_total_posts or 0,
            "total_score": index.get("total_score", 0),
        })

    logger.info(
        f"Competitor scraping: {len(comp_scraped)}/{len(unique_comp_ids)} successful, "
        f"levels: {[lv for lv in competitor_naver_levels if lv is not None]}"
    )

    # 6. 키워드 경쟁도 분석
    keyword_competitiveness = assess_keyword_competitiveness(
        competitor_naver_levels, len(top_results)
    )

    # 경쟁자 평균 글 길이
    comp_lengths = []
    for result in top_results:
        desc = result.get("description", "")
        if desc:
            clean = re.sub(r"<[^>]+>", "", desc)
            if len(clean) > 50:
                comp_lengths.append(len(clean))
    competitor_avg_length = sum(comp_lengths) / len(comp_lengths) if comp_lengths else 1500

    # 7. 6개 차원 분석
    dimensions = []

    dim_level = analyze_blog_level(my_naver_level, competitor_naver_levels)
    dimensions.append(dim_level)

    my_total_posts = len(my_posts) if my_posts else (my_stats.get("total_posts") or 0)
    dim_topical = analyze_topical_authority(my_related_count, my_total_posts)
    dimensions.append(dim_topical)

    dim_freshness = analyze_content_freshness(top_post_dates)
    dimensions.append(dim_freshness)

    dim_quality = analyze_content_quality(int(my_avg_length), my_posts, competitor_avg_length)
    dimensions.append(dim_quality)

    dim_keyword = analyze_keyword_optimization(keyword, top_results)
    dimensions.append(dim_keyword)

    dim_consistency = analyze_posting_consistency(my_last_post_days, my_posts)
    dimensions.append(dim_consistency)

    # 8. 가중 점수 계산
    weighted_score = sum(d["score"] * d["weight"] for d in dimensions)

    # 8-1. 방치 블로그 패널티 (C-Rank Chain 반영)
    # posting_consistency 5%로는 비활동 영향을 반영 못 하므로 직접 감점
    recent_30d_count = 0
    if my_posts:
        _now = datetime.now(timezone.utc)
        for _p in my_posts:
            _pd = _p.get("pub_date", "")
            if _pd:
                try:
                    from email.utils import parsedate_to_datetime
                    _dt = parsedate_to_datetime(_pd)
                    if (_now - _dt).days <= 30:
                        recent_30d_count += 1
                except Exception:
                    pass

    if my_last_post_days is not None and my_last_post_days > 90 and recent_30d_count == 0:
        if my_last_post_days > 180:
            weighted_score = max(5, weighted_score - 20)
        else:
            weighted_score = max(5, weighted_score - 10)

    # 9. 경쟁력 등급
    grade, grade_label = get_competitiveness_grade(weighted_score)

    # 10. 확률 범위 계산
    prob_low, prob_mid, prob_high = calculate_probability_range(
        weighted_score, my_naver_level, keyword_competitiveness,
        already_ranking, my_related_count, my_total_posts
    )

    # 11. 순위 예측
    rank_best, rank_worst, rank_explanation = estimate_rank_position(
        my_naver_level, my_related_count, weighted_score,
        competitor_stats, already_ranking, my_total_posts
    )

    # 12. 추천사항 생성
    recommendations = generate_recommendations(
        dimensions, my_related_count, my_naver_level,
        keyword_competitiveness, already_ranking
    )

    # 데이터 품질 경고
    data_quality = {
        "estimated_fields": [],
        "warnings": [],
    }
    if my_naver_level is None:
        data_quality["warnings"].append("네이버 공식 레벨을 가져올 수 없어 Lv.1로 추정합니다.")
    if not my_posts:
        data_quality["warnings"].append("RSS 피드를 가져올 수 없어 주제 적합성 분석이 제한적입니다.")
    if not top_results:
        data_quality["warnings"].append("검색 결과를 가져올 수 없어 경쟁자 비교가 제한적입니다.")

    valid_comp_levels = [lv for lv in competitor_naver_levels if lv is not None]
    if len(valid_comp_levels) < len(top_results) * 0.5:
        data_quality["warnings"].append("경쟁자 레벨 정보가 부족하여 난이도 분석이 제한적입니다.")

    # confidence 계산: 경쟁자 레벨 수집률 기반
    comp_level_ratio = len(valid_comp_levels) / len(top_results) if top_results else 0
    if comp_level_ratio >= 0.8:
        confidence = "high"
    elif comp_level_ratio >= 0.5:
        confidence = "medium"
    else:
        confidence = "low"

    # P3: 측정 불가 요소 안내 (글 발행 전 구조적 한계)
    data_quality["limitations"] = [
        "체류시간·이탈률: 글 발행 후 사용자 반응으로만 측정 가능",
        "댓글·공감·스크랩: 발행 후 축적되는 신호",
        "네이버 인플루언서 여부: 별도 SmartBlock 배치에 영향",
        "콘텐츠 원본성·직접 경험: AI가 판별하나 발행 전 측정 불가",
        "글 구조(소제목·이미지·영상): RSS 요약문에 미포함",
    ]
    data_quality["limitation_summary"] = (
        "이 점수는 블로그 기본 경쟁력(레벨·관련글·활동량) 기반입니다. "
        "실제 순위는 글 품질, 체류시간, 사용자 반응에 따라 달라질 수 있습니다."
    )

    return {
        "success": True,
        "my_blog": {
            "blog_id": blog_id,
            "blog_name": my_blog_data.get("blog_name") or blog_id,
            "naver_level": my_naver_level,
            "related_post_count": my_related_count,
            "already_ranking": already_ranking,
            "stats": {
                "total_posts": my_stats.get("total_posts"),
            },
        },
        "keyword_competitiveness": keyword_competitiveness,
        "competitive_position": {
            "probability_low": prob_low,
            "probability_mid": prob_mid,
            "probability_high": prob_high,
            "rank_best": rank_best,
            "rank_worst": rank_worst,
            "rank_explanation": rank_explanation,
            "weighted_score": round(weighted_score, 1),
            "grade": grade,
            "grade_label": grade_label,
            "confidence": confidence,
        },
        "dimension_comparisons": dimensions,
        "recommendations": recommendations,
        "data_quality": data_quality,
    }
