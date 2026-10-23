"""
네이버 AI 브리핑(AI 답변)이 누구를 인용했는가.

왜 만드는가 — 2026년 네이버는 블로그를 '사람이 읽는 글'이 아니라 **AI가 인용할
답변 단위**로 재정의했다. 검색 결과 맨 위에 AI 브리핑이 붙고, 거기 인용되지
않으면 1위여도 사람 눈에 먼저 닿지 않는다. 그런데 "내 글이 AI 답변에 인용되나"를
알려주는 도구가 없다. 수요 어휘는 이미 생겼고(`블로그AI인용수` 월 820,
`네이버블로그AI인용` 290), 블스피 유입에도 chatgpt.com 22명·perplexity.ai 4명이
들어와 있다.

측정 방법 — **추정이 아니라 관측이다.**
AI 브리핑은 검색 HTML 안에 출처 배열(JSON)로 들어 있고, 각 항목에 제목·URL·
플랫폼·순번이 그대로 있다. 서버에서 실측 확인(2026-10-23):

    블로그지수올리는방법 → 출처 8개 (네이버 블로그 6개, blog_id/logNo 식별 가능)
    블로그누락확인      → 출처 6개
    강남맛집추천        → 출처 0개 (이 질의에는 AI 답변이 없다)

즉 '인용 안 됨'과 'AI 답변 자체가 없음'을 구분할 수 있다. 이 구분이 중요하다 —
AI 답변이 없는 키워드에서 "인용되지 않았습니다"라고 말하면 거짓이 된다.
"""
import json
import logging
import re
import time
from typing import Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

SEARCH_URL = "https://search.naver.com/search.naver"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9",
}

_BLOG_URL = re.compile(r"blog\.naver\.com/([A-Za-z0-9_-]+)/(\d+)")
_SOURCES_KEY = re.compile(r'"sources"\s*:\s*\[')

# AI 브리핑이 실제로 렌더된 페이지에만 나타나는 문자열. 하나라도 있으면 브리핑이
# 있는 것으로 본다(서버 실측에서 양성 질의는 전부 1 이상, 음성 질의는 전부 0).
_BRIEFING_MARKERS = (
    "AI브리핑에서 생성된 결과",
    '"aibType"',
    '"aiTabInput"',
    '"disclaimerInfo"',
)

# SERP 한 번이 1~2MB 다. 같은 키워드를 반복 조회하면 박스가 먼저 죽는다
# (부하 중 SEO 페이지 78%가 500 났던 전력). 그래서 캐시는 선택이 아니다.
_CACHE_TTL_S = 6 * 3600
_CACHE_MAX = 500
_cache: Dict[str, tuple] = {}


def _balanced(s: str, start: int) -> Optional[str]:
    """`start` 의 '[' 와 짝이 맞는 ']' 까지. 문자열 리터럴 안의 괄호는 세지 않는다."""
    backslash = chr(92)
    depth, i, in_str, esc = 0, start, False, False
    while i < len(s):
        c = s[i]
        if in_str:
            if esc:
                esc = False
            elif c == backslash:
                esc = True
            elif c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c in "[{":
                depth += 1
            elif c in "]}":
                depth -= 1
                if depth == 0:
                    return s[start:i + 1]
        i += 1
    return None


def has_ai_briefing(html: str) -> bool:
    """
    이 페이지에 AI 브리핑이 **있는가**.

    왜 별도 게이트인가 — `"sources":[...]` 는 AI 브리핑만 쓰는 키가 아니다.
    서버 실측(2026-10-23):

        블로그지수올리는방법 → 마커 있음, sources 배열 1개(order·gdid 보유)
        블로그체험단        → **마커 0**, 그런데 sources 배열이 3개 있다
                              (order·gdid 없음 — 다른 컴포넌트의 각주 출처)
        강남맛집추천        → 마커 0, 배열 0

    마커를 안 보고 배열만 세면 블로그체험단에서 "AI 답변 출처 5개"라고
    보고한다. 없는 것을 있다고 말하는 쪽이 가장 비싼 오류다.
    """
    return any(m in html for m in _BRIEFING_MARKERS)


def extract_sources(html: str) -> List[Dict]:
    """
    AI 브리핑 출처 배열. 브리핑이 없으면 빈 리스트.

    브리핑 출처 항목만 가진 특징이 `order` 다(다른 컴포넌트의 각주 배열에는
    `footnoteSourceIndex` 만 있고 `order` 가 없다). 그래서 `order` 를 가진
    항목 수가 가장 많은 배열을 고른다 — 첫 번째를 집으면 엉뚱한 배열을 읽는다.
    """
    if not has_ai_briefing(html):
        return []

    best: List[Dict] = []
    for m in _SOURCES_KEY.finditer(html):
        try:
            bracket = html.index("[", m.start() + len('"sources"'))
        except ValueError:
            continue
        raw = _balanced(html, bracket)
        if not raw:
            continue
        try:
            arr = json.loads(raw)
        except Exception:
            continue
        if not isinstance(arr, list):
            continue
        scored = [
            x for x in arr
            if isinstance(x, dict) and x.get("url") and "order" in x
        ]
        if len(scored) > len(best):
            best = scored
    return best


def _normalize(source: Dict) -> Dict:
    url = source.get("url") or ""
    m = _BLOG_URL.search(url)
    return {
        "order": source.get("order") or source.get("footnoteSourceIndex"),
        "title": source.get("title") or "",
        "url": url,
        "platform": source.get("platform") or "",
        "is_naver_blog": bool(m),
        "blog_id": m.group(1) if m else None,
        "log_no": m.group(2) if m else None,
    }


async def ai_citation(keyword: str, blog_id: Optional[str] = None) -> Dict:
    """
    이 키워드의 AI 답변이 누구를 인용했는가, 그 안에 내 블로그가 있는가.

    반환의 `has_ai_answer` 가 False 면 '인용 안 됨'이 아니라 **AI 답변이 없는
    키워드**라는 뜻이다. 화면은 이 둘을 절대 같은 말로 쓰면 안 된다.
    """
    kw = (keyword or "").strip()
    if not kw:
        return {"ok": False, "error": "empty_keyword"}

    now = time.time()
    hit = _cache.get(kw)
    if hit and now - hit[0] < _CACHE_TTL_S:
        sources, fetched_at = hit[1], hit[0]
        cached = True
    else:
        try:
            async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
                resp = await client.get(SEARCH_URL, params={"query": kw}, headers=_HEADERS)
            if resp.status_code != 200:
                return {"ok": False, "error": f"http_{resp.status_code}", "keyword": kw}
            sources = [_normalize(s) for s in extract_sources(resp.text)]
        except Exception as e:
            logger.warning(f"[ai_citation] fetch failed kw={kw}: {e}")
            return {"ok": False, "error": "fetch_failed", "keyword": kw}

        if len(_cache) >= _CACHE_MAX:
            # 가장 오래된 것부터 버린다. LRU 를 쓸 만큼 큰 캐시가 아니다.
            for k in sorted(_cache, key=lambda k: _cache[k][0])[:_CACHE_MAX // 5]:
                _cache.pop(k, None)
        _cache[kw] = (now, sources)
        fetched_at, cached = now, False

    mine = [s for s in sources if blog_id and s.get("blog_id") == blog_id] if blog_id else []
    blog_sources = [s for s in sources if s["is_naver_blog"]]

    return {
        "ok": True,
        "keyword": kw,
        "has_ai_answer": len(sources) > 0,
        "sources": sources,
        "source_count": len(sources),
        "blog_source_count": len(blog_sources),
        "cited": bool(mine),
        "my_citations": mine,
        "cached": cached,
        "fetched_at": int(fetched_at),
        # 이 숫자가 뜻하는 것과 뜻하지 않는 것을 서버가 먼저 말해 둔다
        "note": (
            "AI 브리핑은 질의마다 있을 수도 없을 수도 있고, 같은 질의에서도 시점에 따라 "
            "출처가 바뀝니다. 인용 여부는 그 시점의 관측이며 순위처럼 고정된 값이 아닙니다."
        ),
    }
