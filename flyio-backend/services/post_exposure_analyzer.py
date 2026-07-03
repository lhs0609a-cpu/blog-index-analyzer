"""
포스트 노출 분석 — 블덱스식 "최근 포스팅" 카드 생성

블덱스 3.0의 최근 포스팅 섹션이 보여주는 것을 그대로 재현한다:
  - 글별 "누락" 뱃지 (제목 정확매칭이 검색에 색인됐는가)
  - 제목에서 뽑은 키워드별 [순위 · 월검색량] 칩

기존 부품을 조립만 한다 (신규 크롤러 없음):
  - RSS 글목록:      routers.content_lifespan.fetch_blog_posts_via_rss
  - SERP 순위/색인:  services.rank_checker.RankChecker (네이버 OpenAPI blog.json)
  - 월검색량:        routers.blogs.get_related_keywords_from_searchad (searchad keywordstool, 24h 캐시)
  - 키워드/불용어:   services.blog_index_verifier._extract_keywords

크레덴셜이 없으면 해당 신호만 None 으로 우아하게 저하한다 (조작값 만들지 않음).
"""
import asyncio
import logging
import re
from typing import Dict, List, Optional

from services.rank_checker import RankChecker
from services.blog_index_verifier import _extract_keywords, _quoted, SEARCH_TOP_K

logger = logging.getLogger(__name__)

# 카드당 파라미터
MAX_POSTS_DEFAULT = 10           # 블덱스도 최근 10개 노출
MAX_KEYWORDS_PER_POST = 3        # 칩 개수
MAX_VOLUME_LOOKUPS_PER_POST = 5  # 검색량 조회 후보 상한 (rate-limit 보호)
POST_CONCURRENCY = 3
VOLUME_CONCURRENCY = 2           # searchad 검색량 조회 동시성 (429 방지)


def _normalize_kw(s: str) -> str:
    """검색량 매칭용 정규화 — 공백 제거 + 소문자."""
    return re.sub(r"\s+", "", s or "").lower()


async def _get_keyword_volume(keyword: str) -> Optional[int]:
    """
    단일 키워드의 월 총검색량(PC+모바일)을 searchad keywordstool 에서 조회.
    반환 리스트에서 질의어와 정확히 일치하는 항목의 volume 만 사용 (연관어 아님).
    실패/미설정 시 None.
    """
    try:
        # 지연 임포트로 순환 방지
        from routers.blogs import get_related_keywords_from_searchad

        resp = await get_related_keywords_from_searchad(keyword)
        if not resp or not getattr(resp, "success", False):
            return None

        target = _normalize_kw(keyword)
        for kw in resp.keywords:
            if _normalize_kw(kw.keyword) == target:
                return kw.monthly_total_search
        return None
    except Exception as e:
        logger.debug(f"volume lookup failed for {keyword!r}: {e}")
        return None


def _title_keyword_pool(title: str) -> List[str]:
    """제목에서 검색량 조회 후보 키워드 뽑기 (중복 제거, 긴 것=구체적 우선)."""
    seen = set()
    uniq = []
    for c in _extract_keywords(title):
        if c not in seen:
            seen.add(c)
            uniq.append(c)
    uniq.sort(key=len, reverse=True)
    return uniq[:MAX_VOLUME_LOOKUPS_PER_POST]


async def _analyze_single_post(
    checker: RankChecker,
    blog_id: str,
    post: Dict,
    max_keywords: int,
    volume_map: Dict[str, Optional[int]],
) -> Dict:
    """단일 포스트의 누락 여부 + 키워드별 순위/검색량 카드 생성.

    volume_map: 사전 조회된 {키워드: 월검색량} (교차 중복 제거로 API 호출 절약).
    """
    title = (post.get("title") or "").strip()
    link = post.get("link") or ""

    card = {
        "title": title,
        "link": link,
        "pub_date": post.get("pubDate").isoformat() if post.get("pubDate") else None,
        "indexed": None,       # True=색인, False=누락, None=측정불가
        "missing": None,       # 누락 여부 (indexed 의 반대)
        "keywords": [],        # [{keyword, rank, rank_label, monthly_volume}]
    }
    if not title:
        return card

    # ===== 1) 누락 판정 — 제목 정확매칭이 블로그탭에 색인됐는가 =====
    quoted = _quoted(title)
    if quoted:
        exact_rank = await checker.check_blog_tab_rank(quoted, blog_id, max_results=SEARCH_TOP_K)
        if exact_rank is not None:
            card["indexed"] = True
            card["missing"] = False
        else:
            # 크레덴셜 없으면 check_blog_tab_rank 이 항상 None → 측정불가와 구분 필요
            if checker.NAVER_CLIENT_ID and checker.NAVER_CLIENT_SECRET:
                card["indexed"] = False
                card["missing"] = True
            # else: None 유지 (측정불가)

    # ===== 2) 사전 조회된 검색량으로 상위 키워드 선정 → 순위 조회 =====
    scored = [
        {"keyword": k, "monthly_volume": volume_map.get(k)}
        for k in _title_keyword_pool(title)
        if volume_map.get(k) is not None
    ]
    # 검색량 큰 순 (블덱스도 의미 있는 키워드=검색량 있는 것만 칩으로 노출)
    scored.sort(key=lambda x: x["monthly_volume"], reverse=True)
    top = scored[:max_keywords]

    # 선정된 키워드의 실제 SERP 순위 조회 (블로그탭)
    ranks = await asyncio.gather(
        *[checker.check_blog_tab_rank(item["keyword"], blog_id, max_results=SEARCH_TOP_K) for item in top]
    )
    for item, rank in zip(top, ranks):
        item["rank"] = rank
        item["rank_label"] = _rank_label(rank, has_creds=bool(checker.NAVER_CLIENT_ID))
    card["keywords"] = top

    return card


def _rank_label(rank: Optional[int], has_creds: bool) -> str:
    """순위를 블덱스식 라벨로. 미노출은 '90+위'(측정범위 밖), 크레덴셜 없으면 '-'."""
    if rank is not None:
        return f"{rank}위"
    if not has_creds:
        return "-"
    return f"{SEARCH_TOP_K}+위"  # 측정 범위(TOP_K) 밖 = 사실상 미노출


async def analyze_post_exposure(
    blog_id: str,
    max_posts: int = MAX_POSTS_DEFAULT,
    max_keywords_per_post: int = MAX_KEYWORDS_PER_POST,
) -> Dict:
    """
    최근 포스팅 N개에 대해 누락 여부 + 키워드별 순위/검색량 카드 생성.

    Returns:
        {
            "ok": bool,
            "blog_id": str,
            "checked_posts": int,
            "missing_count": int,           # 누락으로 판정된 글 수
            "measured_index": bool,         # 색인 여부를 실제 측정했는지 (크레덴셜)
            "posts": [card, ...],
            "error": Optional[str],
        }
    """
    from routers.content_lifespan import fetch_blog_posts_via_rss

    posts = await fetch_blog_posts_via_rss(blog_id)
    if not posts:
        return {
            "ok": False, "blog_id": blog_id, "checked_posts": 0,
            "missing_count": 0, "measured_index": False, "posts": [],
            "error": "no_posts_via_rss",
        }

    sample = posts[:max_posts]
    checker = RankChecker()

    # ===== 검색량 사전 조회 (교차 중복 제거로 API 호출 최소화) =====
    # 여러 글이 같은 키워드(습진/아토피 등)를 공유 → 유니크 키워드만 1회씩 조회.
    unique_keywords = set()
    for p in sample:
        unique_keywords.update(_title_keyword_pool((p.get("title") or "").strip()))

    vol_sem = asyncio.Semaphore(VOLUME_CONCURRENCY)

    async def _bounded_volume(kw: str):
        async with vol_sem:
            return kw, await _get_keyword_volume(kw)

    volume_pairs = await asyncio.gather(*[_bounded_volume(k) for k in unique_keywords])
    volume_map: Dict[str, Optional[int]] = {k: v for k, v in volume_pairs}

    # ===== 글별 카드 생성 (누락 + 순위) =====
    sem = asyncio.Semaphore(POST_CONCURRENCY)

    async def _bounded(p: Dict) -> Dict:
        async with sem:
            return await _analyze_single_post(checker, blog_id, p, max_keywords_per_post, volume_map)

    try:
        cards = await asyncio.gather(*[_bounded(p) for p in sample])
    finally:
        await checker.close()

    measured_index = bool(checker.NAVER_CLIENT_ID and checker.NAVER_CLIENT_SECRET)
    missing_count = sum(1 for c in cards if c.get("missing") is True)

    return {
        "ok": True,
        "blog_id": blog_id,
        "checked_posts": len(cards),
        "missing_count": missing_count,
        "measured_index": measured_index,
        "posts": cards,
    }
