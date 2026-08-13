"""
키워드 상위노출 판정 v2 — "이 키워드 1페이지의 컷라인 대비 내 위치"
====================================================================

기존 judge-keyword(services/exposure_ceiling.judge_keyword)의 한계에서 출발한다:

  기존: "이 키워드 검색량(수요) vs 내가 뚫어본 최대 검색량(천장)"
  → 검색량은 난이도의 **대리변수**일 뿐이다. 월 300짜리 전문 키워드의 1페이지가
    최적3들로 채워져 있고, 월 5,000짜리 롱테일의 1페이지가 휴면 블로그들일 때
    검색량 비교는 정확히 반대로 답한다.

  이 모듈: "그 키워드 1페이지에 실제로 앉아 있는 블로그들을 **내 블로그와 같은
    채점기(v5)** 로 채점해서, 1페이지 진입 **컷라인**을 구하고 내 점수를 그 자리에
    놓아본다."

2단 응답 구조 (사용자 체감 ≠ 정확도 희생):
  STAGE 1 (facts, ~3~8초) — 반박 불가능한 사실만. 실제 블로그탭 SERP 1회 조회.
      · 내 블로그가 지금 그 키워드로 몇 위인가 (있으면 판정 자체가 불필요)
      · 1페이지를 누가 점유 중인가 (blog_id + 제목)
      · 월 검색량
  STAGE 2 (cutline, ~10~40초, worker 프로세스) — 판정.
      · 상위 10개 경쟁자 + 내 블로그를 동일 채점기로 채점 → cut_line / median
      · 주제 적합도(내 RSS에 그 주제 글이 몇 개인가 = C-Rank 대리)
      · 공석(휴면 경쟁자 비율) = 뚫을 자리 수
      · 로지스틱 결합 → 1페이지 진입 확률

신뢰도 규칙 (이 모듈의 존재 이유):
  1. **순위는 실제 SERP 만 쓴다.** openapi(search/blog.json, sort=sim) 순서는 실제
     블로그탭 순서와 다르므로 순위 근거로 절대 쓰지 않는다. 검색 HTML 파싱
     (rank_source=http/mobile) 만 ground truth 로 인정한다.
  2. **측정 실패는 '어려움'이 아니라 '측정 실패'다.** SERP 조회 실패, 내 블로그
     채점 실패는 unknown 으로 나가고 확률(=채점 대상)을 만들지 않는다.
  3. **확률은 보정 가능한 형태로만 낸다.** 상수 분기가 아니라 로지스틱 결합이며,
     계수는 /data/keyword_verdict_model.json 으로 교체 가능하다. 정답지
     (keyword_predictions 원장 + ceiling_backtest 라벨)가 쌓이면 fit 값을 얹는다.
  4. **표본이 얇으면 확신을 줄인다.** base rate(0.35)로 수축한다.

비용:
  · SERP 는 키워드 단위 **공용 캐시**(6h). 사용자가 달라도 같은 키워드면 1회만 조회한다.
  · 경쟁자 채점은 analyze_blog 의 블로그 단위 캐시(1h)를 그대로 탄다.
"""

import asyncio
import hashlib
import json
import logging
import math
import os
import re
import statistics
import time
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── 상수 ──────────────────────────────────────────────────────────
PAGE1_CUTOFF = 10          # 1페이지 = 상위 10위
SERP_LIMIT = 20            # 조회 범위 (2페이지) — 11~30위 색인 신호까지 본다
SERP_TTL = 6 * 3600        # 공용 SERP 캐시 6시간
SCORE_CONCURRENCY = 5      # 경쟁자 동시 채점 (worker nice19, 봇탐지 회피)
# 프로덕션 worker 는 nice 19 + 공유 2vCPU 라 로컬(4.3s)보다 훨씬 느리다. 20초로 잘랐더니
# 10명 중 4명이 미채점으로 남아 confidence 가 medium 으로 떨어졌다(2026-08-13 실측).
PER_BLOG_TIMEOUT = 32.0    # 경쟁자 1개 채점 상한
RETRY_MISSING = 6          # 1차에서 못 잰 경쟁자 재시도 상한 (캐시가 채워져 대부분 즉답)
SERP_PAGE_TIMEOUT = 12.0
PLAYWRIGHT_TIMEOUT = 75.0  # 브라우저 기동~파싱 전체 상한 (매달림 방지)

_DATA_DIR = os.environ.get("DATA_DIR", "/data")
_SERP_DIR = os.path.join(_DATA_DIR, "_kwverdict_serp")

_MEM_SERP: Dict[str, Dict] = {}   # 프로세스 내 캐시 (app/worker 각각)

DISCLAIMER = (
    "판정은 이 키워드의 실제 네이버 블로그탭 1페이지를 조회해, 그 자리에 앉아 있는 "
    "블로그들과 내 블로그를 같은 기준으로 채점해 낸 추정치입니다. 네이버 알고리즘은 "
    "비공개이며 SERP는 수시로 바뀌므로 노출을 보장하지 않습니다."
)

# 검색 의도와 무관한 범용어 (주제 적합도 계산에서 제외)
_GENERIC_PARTS = {
    "방법", "추천", "후기", "확인", "정보", "비교", "순위", "리뷰", "가격",
    "종류", "사이트", "사용법", "차이", "장단점", "정리", "소개", "모음", "총정리",
}


# ══════════════════════════════════════════════════════════════════
# 1. SERP 스냅샷 — 실제 블로그탭만, 키워드 단위 공용 캐시
# ══════════════════════════════════════════════════════════════════

def _cache_key(keyword: str) -> str:
    return hashlib.md5(keyword.strip().lower().encode("utf-8")).hexdigest()[:16]


def _serp_path(keyword: str) -> str:
    return os.path.join(_SERP_DIR, f"{_cache_key(keyword)}.json")


def _serp_cache_get(keyword: str) -> Optional[Dict]:
    k = _cache_key(keyword)
    now = time.time()
    hit = _MEM_SERP.get(k)
    if hit and now - hit.get("measured_at", 0) < SERP_TTL:
        return hit
    try:
        with open(_serp_path(keyword), "r", encoding="utf-8") as f:
            data = json.load(f)
        if now - float(data.get("measured_at") or 0) < SERP_TTL:
            _MEM_SERP[k] = data
            return data
    except Exception:
        pass
    return None


def _serp_cache_set(keyword: str, data: Dict) -> None:
    k = _cache_key(keyword)
    if len(_MEM_SERP) > 500:
        for old in sorted(_MEM_SERP, key=lambda x: _MEM_SERP[x].get("measured_at", 0))[:250]:
            _MEM_SERP.pop(old, None)
    _MEM_SERP[k] = data
    try:
        os.makedirs(_SERP_DIR, exist_ok=True)
        tmp = _serp_path(keyword) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, _serp_path(keyword))
    except Exception as e:
        logger.debug(f"[kwv] serp cache write failed: {e}")


_POST_RE = re.compile(r"blog\.naver\.com/([A-Za-z0-9_-]+)/(\d+)")

# 2026-08-13 실측 기준 네이버 블로그탭 마크업.
#   · 본문 결과 목록은 `div.fds-ugc-single-intention-item-list-tab` 하나에 들어 있다.
#   · 그 바깥의 `li.info_item`(인기주제 캐러셀)·기관 블로그 띠는 **순위가 아니다**.
#     전역 정규식으로 긁으면 이 캐러셀이 1~12위로 잡혀 순위가 통째로 틀린다
#     (개발 중 실측: '두통' 1위가 일산백병원 공식블로그로 나왔으나 실제 1위는 개인블로그).
#   · 클래스명 대부분이 해시(q8qyx0TaRoC1n7jj)라 셀렉터로 못 쓰고, `fds-` 접두 클래스만
#     의미가 안정적이다.
_LIST_SELECTORS = (
    'div[class*="fds-ugc-single-intention-item-list-tab"]',
    'div[class*="fds-ugc-single-intention-item-list"]',
)
_TITLE_NOISE = re.compile(r"새\s*창\s*열림\s*$")


def _parse_serp_html(html: str) -> Tuple[List[Dict], str]:
    """검색 HTML → 순위 보존 파싱. (rows, parse_mode) 반환.

    parse_mode: "list"(본문 목록 컨테이너 = 신뢰) | "regex"(폴백 = 순위 신뢰 낮음)
    """
    from bs4 import BeautifulSoup

    rows: List[Dict] = []
    seen: set = set()
    try:
        soup = BeautifulSoup(html, "html.parser")
        containers = []
        for sel in _LIST_SELECTORS:
            containers = soup.select(sel)
            if containers:
                break
        for c in containers:
            for a in c.select('a[href*="blog.naver.com"]'):
                m = _POST_RE.search(a.get("href", ""))
                if not m:
                    continue
                blog_id, post_id = m.group(1), m.group(2)
                if blog_id in seen:
                    continue
                seen.add(blog_id)
                title = _TITLE_NOISE.sub("", a.get_text(strip=True) or "").strip()
                rows.append({
                    "rank": len(rows) + 1,
                    "blog_id": blog_id,
                    "blog_name": blog_id,
                    "post_title": title or f"포스팅 #{post_id}",
                    "post_url": f"https://blog.naver.com/{blog_id}/{post_id}",
                })
        if rows:
            return rows, "list"
    except Exception as e:
        logger.warning(f"[kwv] dom parse failed: {e}")

    # 폴백: 목록 컨테이너를 못 찾았다(마크업 변경 또는 차단). 순위 신뢰도가 낮으므로
    # 호출부가 parse_mode 로 구분할 수 있게 표시한다.
    for blog_id, post_id in _POST_RE.findall(html):
        if blog_id in seen:
            continue
        seen.add(blog_id)
        rows.append({
            "rank": len(rows) + 1, "blog_id": blog_id, "blog_name": blog_id,
            "post_title": f"포스팅 #{post_id}",
            "post_url": f"https://blog.naver.com/{blog_id}/{post_id}",
        })
    return rows, "regex"


async def _fetch_serp_playwright(keyword: str, limit: int) -> List[Dict]:
    """브라우저로 블로그탭을 열어 목록을 읽는다 (HTTP 가 막힌 환경용).

    **왜 필요한가 (2026-08-13 프로덕션 실측)**: Fly IP 로 검색 HTML 을 그냥 GET 하면
    200 이 오지만 본문에 blog.naver.com 링크가 **한 개도 없는** 축소 페이지가 온다
    (70KB, 로컬은 491KB, 캡차도 아님). 즉 결과가 JS/차단 뒤에 있다. 로컬·개발에서는
    HTTP 로 충분하므로 HTTP → 실패 시 이 경로 순으로 쓴다.

    기존 scrape_blog_tab_results 를 쓰지 않는 이유: 그쪽은 구 URL(where=blog)과 구
    셀렉터(.api_subject_bx)를 쓰고 스크롤을 30회 돌아 키워드당 2분이 넘는다. 여기서는
    상위 20개만 필요하고, 그건 첫 렌더에 이미 들어 있다.
    """
    return await _playwright_serp_guarded(keyword, limit)


async def _playwright_serp_guarded(keyword: str, limit: int) -> List[Dict]:
    """전용 브라우저로 조회 + 전체 하드 타임아웃."""
    try:
        return await asyncio.wait_for(_playwright_serp_inner(keyword, limit),
                                      timeout=PLAYWRIGHT_TIMEOUT)
    except asyncio.TimeoutError:
        logger.warning(f"[kwv] playwright serp hard-timeout {keyword!r}")
        return []
    except Exception as e:
        logger.warning(f"[kwv] playwright serp error {keyword!r}: {e}")
        return []


async def _playwright_serp_inner(keyword: str, limit: int) -> List[Dict]:
    from urllib.parse import quote
    from playwright.async_api import async_playwright

    url = f"https://search.naver.com/search.naver?ssc=tab.blog.all&query={quote(keyword)}&start=1"
    pw = browser = context = None
    t0 = time.time()
    try:
        # ⚠️ services.blog_scraper.get_browser() 의 공용 인스턴스를 쓰지 않는다.
        #   그 브라우저는 다른 크론(winner-keywords 등)과 공유되고 `--single-process` +
        #   힙 256MB 로 떠 있어, 실측에서 "Target page, context or browser has been closed"
        #   가 나거나 컨텍스트 생성 단계에서 매달렸다(stage1 210초 타임아웃).
        #   여기서는 전용 인스턴스를 띄우고 즉시 닫는다 — 격리가 속도보다 중요하다.
        pw = await async_playwright().start()
        browser = await pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
                  "--disable-extensions", "--mute-audio"],
        )
        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"),
            locale="ko-KR",
        )
        # 이미지·폰트·미디어 차단. 우리가 필요한 건 링크 목록 DOM 뿐인데, SERP 는 썸네일이
        # 수십 개라 worker(nice 19, 공유 2vCPU)에서는 이게 시간을 지배한다
        # (2026-08-13 실측: 차단 없이 stage1 이 90초 타임아웃).
        async def _block(route, request):
            if request.resource_type in ("image", "font", "media", "stylesheet"):
                await route.abort()
            else:
                await route.continue_()
        await context.route("**/*", _block)

        page = await context.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=25000)
        try:
            await page.wait_for_selector(
                'div[class*="fds-ugc-single-intention-item-list"]', timeout=12000)
        except Exception:
            logger.warning(f"[kwv] playwright: list container not found {keyword!r}")
        rows, mode = _parse_serp_html(await page.content())
        logger.warning(f"[kwv] playwright serp {keyword!r}: {len(rows)} rows mode={mode} "
                       f"in {round(time.time() - t0, 1)}s")
        if mode != "list":
            return []
        return rows[:limit]
    except Exception as e:
        logger.warning(f"[kwv] playwright serp failed {keyword!r} "
                       f"after {round(time.time() - t0, 1)}s: {e}")
        return []
    finally:
        for closer in (context, browser):
            if closer:
                try:
                    await closer.close()
                except Exception:
                    pass
        if pw:
            try:
                await pw.stop()
            except Exception:
                pass


async def _fetch_serp_pages(keyword: str, limit: int) -> Tuple[List[Dict], Optional[str], str]:
    """실제 블로그탭 SERP 조회. (rows, source, parse_mode)

    ⚠️ playwright 를 쓰지 않는 것이 핵심이다. fetch_naver_search_results 는 블로그탭
    playwright 스크래핑(기본 30스크롤)을 먼저 시도하는데 프로덕션 실측에서 120초를 넘겨
    무응답이었다(2026-08-13 /serp-difficulty 두통). 블로그탭 URL 1회 요청이면 상위 20여 개가
    한 번에 오므로 페이지네이션도 필요 없다.
    """
    from urllib.parse import quote
    from routers.blogs import get_http_client, get_random_headers

    client = await get_http_client()
    encoded = quote(keyword)

    attempts = [
        ("http", f"https://search.naver.com/search.naver?ssc=tab.blog.all&query={encoded}&start=1", False),
        ("mobile", f"https://m.search.naver.com/search.naver?ssc=tab.m_blog.all&query={encoded}&start=1", True),
    ]

    for source, url, mobile in attempts:
        headers = get_random_headers(mobile=mobile)
        headers["Referer"] = ("https://m.search.naver.com/" if mobile
                              else "https://search.naver.com/")
        try:
            resp = await client.get(url, headers=headers, timeout=SERP_PAGE_TIMEOUT)
        except Exception as e:
            logger.warning(f"[kwv] serp {source} failed {keyword!r}: {e}")
            continue
        if resp.status_code != 200:
            logger.warning(f"[kwv] serp {source} HTTP {resp.status_code} {keyword!r}")
            continue
        rows, mode = _parse_serp_html(resp.text)
        if rows:
            return rows[:limit], source, mode

    # HTTP 로 한 줄도 못 얻었다 → 브라우저로 재시도 (프로덕션의 정상 경로)
    rows = await _fetch_serp_playwright(keyword, limit)
    if rows:
        return rows, "playwright", "list"

    return [], None, "none"


async def serp_snapshot(keyword: str, limit: int = SERP_LIMIT,
                        use_cache: bool = True) -> Dict:
    """키워드의 실제 블로그탭 SERP 스냅샷 (공용 캐시).

    Returns:
        {ok, keyword, rows:[{rank, blog_id, blog_name, post_title, post_url}],
         source: "http"|"mobile"|None, measured_at, cached, error}
    """
    keyword = (keyword or "").strip()
    if not keyword:
        return {"ok": False, "keyword": keyword, "rows": [], "source": None,
                "measured_at": None, "cached": False, "error": "empty_keyword"}

    if use_cache:
        hit = _serp_cache_get(keyword)
        if hit and hit.get("rows"):
            return {**hit, "cached": True}

    rows, source, parse_mode = await _fetch_serp_pages(keyword, limit)
    data = {
        "ok": bool(rows),
        "keyword": keyword,
        "rows": rows,
        "source": source,
        "parse_mode": parse_mode,   # "list"=본문 목록(신뢰) / "regex"=폴백(순위 신뢰 낮음)
        "measured_at": time.time(),
        "cached": False,
        "error": None if rows else "serp_fetch_failed",
    }
    if rows:
        _serp_cache_set(keyword, data)
    return data


# ══════════════════════════════════════════════════════════════════
# 2. STAGE 1 — 사실 층 (빠름)
# ══════════════════════════════════════════════════════════════════

async def stage1_facts(blog_id: str, keyword: str, use_cache: bool = True,
                       cache_only: bool = False) -> Dict:
    """반박 불가능한 사실만: 내 현재 순위 + 1페이지 점유자 + 검색량.

    판정(확률)은 하지 않는다. 여기서 이미 노출 중이면 판정 자체가 불필요하다.

    cache_only=True 면 SERP 를 새로 조회하지 않는다. public API 프로세스에서 호출할 때
    쓴다 — 프로덕션에서 SERP 조회는 브라우저 경로라 API 이벤트루프에서 돌리면 안 된다.
    """
    from services.exposure_ceiling import _fetch_volumes

    blog_id = (blog_id or "").strip()
    keyword = (keyword or "").strip()

    if cache_only:
        cached = _serp_cache_get(keyword) if use_cache else None
        if not cached or not cached.get("rows"):
            return {"ok": False, "blog_id": blog_id, "keyword": keyword,
                    "error": "not_measured_yet", "page1": [], "my_rank": None,
                    "already_page1": False, "volume": 0, "volume_measured": False,
                    "serp_source": None, "serp_parse_mode": None, "serp_cached": False,
                    "serp_measured_at": None, "serp_size": 0}

    serp_task = serp_snapshot(keyword, use_cache=use_cache)
    vol_task = _fetch_volumes([keyword])
    serp, vols = await asyncio.gather(serp_task, vol_task)

    volume = vols.get(keyword.replace(" ", ""), 0)
    rows = serp.get("rows") or []
    my_rank = next((r["rank"] for r in rows if r["blog_id"] == blog_id), None)

    return {
        "ok": bool(serp.get("ok")),
        "blog_id": blog_id,
        "keyword": keyword,
        "volume": volume,
        "volume_measured": bool(vols),
        "my_rank": my_rank,
        "already_page1": my_rank is not None and my_rank <= PAGE1_CUTOFF,
        "serp_source": serp.get("source"),
        "serp_parse_mode": serp.get("parse_mode"),
        "serp_cached": serp.get("cached", False),
        "serp_measured_at": serp.get("measured_at"),
        "serp_size": len(rows),
        "page1": rows[:PAGE1_CUTOFF],
        "error": serp.get("error"),
    }


# ══════════════════════════════════════════════════════════════════
# 3. STAGE 2 — 컷라인 층 (판정)
# ══════════════════════════════════════════════════════════════════

async def _score_blog(blog_id: str) -> Optional[Dict]:
    """블로그 1개를 v5 채점기로 채점 (analyze_blog 캐시 재사용). 실패 시 None."""
    from routers.blogs import analyze_blog
    try:
        res = await asyncio.wait_for(analyze_blog(blog_id), timeout=PER_BLOG_TIMEOUT)
    except asyncio.TimeoutError:
        logger.warning(f"[kwv] score timeout {blog_id}")
        return None
    except Exception as e:
        logger.warning(f"[kwv] score failed {blog_id}: {e}")
        return None
    if not res or res.get("error_code"):
        return None
    idx = res.get("index") or {}
    score = idx.get("total_score")
    if not score:  # 0 또는 None = 채점 실패로 본다(추정값을 만들지 않는다)
        return None
    return {
        "blog_id": blog_id,
        "score": float(score),
        "level": idx.get("level"),
        "grade": idx.get("grade"),
        "total_posts": (res.get("stats") or {}).get("total_posts"),
    }


async def _measure_idle_days(blog_ids: List[str]) -> Dict[str, Optional[int]]:
    """경쟁자별 '마지막 글 경과일'을 RSS 로 측정 (블로그당 1콜).

    analyze_blog 응답에는 활동성 필드가 없어(실측 확인) 따로 잰다. serp_difficulty 가
    쓰는 것과 **같은 함수**를 써서 '휴면' 기준이 두 기능에서 갈라지지 않게 한다.
    """
    import httpx
    from services.serp_difficulty import _measure_blog_vitality

    out: Dict[str, Optional[int]] = {b: None for b in blog_ids}
    if not blog_ids:
        return out
    sem = asyncio.Semaphore(6)
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            async def _one(bid: str):
                async with sem:
                    try:
                        return bid, await _measure_blog_vitality(client, bid)
                    except Exception:
                        return bid, None
            for bid, v in await asyncio.gather(*[_one(b) for b in blog_ids]):
                if v:
                    out[bid] = v.get("days_idle")
    except Exception as e:
        logger.warning(f"[kwv] idle measure failed: {e}")
    return out


def _significant_parts(keyword: str) -> List[str]:
    parts = [p for p in keyword.lower().split() if len(p) >= 2]
    sig = [p for p in parts if p not in _GENERIC_PARTS]
    return sig or parts or [keyword.lower()]


async def _topical_fit(blog_id: str, keyword: str) -> Optional[int]:
    """내 블로그 RSS 최근 글 중 이 주제 글 수 (C-Rank '주제 전문성' 대리).

    None = RSS 조회 실패(측정 불가). 0 = 진짜로 없음. 둘을 섞지 않는다.
    """
    from services.competitive_analysis_v2 import fetch_blog_rss_posts, count_keyword_related_posts
    import httpx
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            posts = await fetch_blog_rss_posts(blog_id, client)
    except Exception as e:
        logger.warning(f"[kwv] topical fit failed {blog_id}: {e}")
        return None
    if not posts:
        return None
    return count_keyword_related_posts(posts, keyword)


# ── 확률 모델 ────────────────────────────────────────────────────
#
# 상수 분기가 아니라 로지스틱 결합인 이유: **정답지로 재보정하기 위해서**다.
# 계수는 초기값이 휴리스틱이지만 구조가 fit 가능하므로, ceiling_backtest 가 만드는
# (블로그, 키워드, 실제순위) 라벨로 계수만 갈아끼우면 된다.
# /data/keyword_verdict_model.json 이 있으면 그 계수를 쓴다.
_DEFAULT_MODEL = {
    "version": "v1-heuristic",
    "bias": -0.90,
    "weights": {
        "score_margin": 1.15,    # (내 점수 - 1페이지 컷라인) / 8점
        "median_margin": 0.45,   # (내 점수 - 1페이지 중앙값) / 8점
        "topical_fit": 0.90,     # 내 RSS 내 주제글 수 (0~1 정규화)
        "vacancy": 1.00,         # 1페이지 휴면 경쟁자 비율
        "ceiling_head": 0.50,    # log10(내 안정권 검색량 / 이 키워드 검색량)
        "indexed30": 0.60,       # 이미 11~30위에 색인돼 있음
    },
    "base_rate": 0.35,
    "shrink": {"high": 1.0, "medium": 0.75, "low": 0.45},
    "thresholds": {"likely": 0.62, "contested": 0.32},
}


def load_model() -> Dict:
    """보정된 계수 파일이 있으면 그것을, 없으면 휴리스틱 기본값을 쓴다."""
    path = os.path.join(_DATA_DIR, "keyword_verdict_model.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            m = json.load(f)
        if isinstance(m, dict) and m.get("weights"):
            return {**_DEFAULT_MODEL, **m}
    except Exception:
        pass
    return _DEFAULT_MODEL


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-_clamp(z, -12, 12)))


def compute_verdict(*, my: Optional[Dict], competitors: List[Dict], volume: int,
                    my_rank: Optional[int], topical: Optional[int],
                    ceiling: Optional[Dict], serp_reliable: bool = True) -> Dict:
    """컷라인·주제적합도·공석을 로지스틱으로 결합해 1페이지 진입 확률을 낸다."""
    model = load_model()
    w = model["weights"]

    page1 = [c for c in competitors if c.get("rank", 99) <= PAGE1_CUTOFF]
    scored = [c for c in page1 if c.get("score")]

    # ── 측정 실패는 판정하지 않는다 ──
    if my is None:
        return {"verdict": "unknown", "probability": None, "confidence": "low",
                "reasons": ["내 블로그 채점에 실패했습니다(비공개·삭제·일시 오류)."],
                "features": {}, "cut_line": None, "median_score": None}
    if len(scored) < 3:
        return {"verdict": "unknown", "probability": None, "confidence": "low",
                "reasons": [f"1페이지 경쟁자 중 채점된 블로그가 {len(scored)}개뿐이라 "
                            "컷라인을 낼 수 없습니다(인플루언서·카페·광고 비중이 높은 SERP)."],
                "features": {}, "cut_line": None, "median_score": None}

    scores = sorted(c["score"] for c in scored)
    cut_line = scores[0]                       # 1페이지 최하위 = 진입 문턱(표시용)
    # 피처는 최하위 1개가 아니라 **하위 2개 평균**을 쓴다. 유난히 약한 블로그 하나가
    # 우연히 10위에 앉아 있으면 min 만으로는 "누구나 들어간다"가 돼 과대확신이 난다.
    entry_bar = statistics.fmean(scores[:2]) if len(scores) >= 2 else cut_line
    median_score = statistics.median(scores)
    my_score = my["score"]

    dormant = [c for c in scored
               if (c.get("recent_activity_days") or 0) > 90]
    vacancy = len(dormant) / len(scored)

    f = {
        # 상한을 하한보다 좁게(+2) 잡는다 — "훨씬 세다"가 무한히 확신으로 변환되면
        # 검증 안 된 모델이 과대확신한다. 반대로 크게 모자란 건 확실한 신호라 -3 까지 둔다.
        "score_margin": _clamp((my_score - entry_bar) / 8.0, -3, 2),
        "median_margin": _clamp((my_score - median_score) / 8.0, -3, 3),
        "topical_fit": (min(topical, 8) / 8.0) if topical is not None else 0.25,
        "vacancy": vacancy,
        "ceiling_head": 0.0,
        "indexed30": 1.0 if (my_rank is not None and my_rank > PAGE1_CUTOFF) else 0.0,
    }
    if ceiling and ceiling.get("ceiling_p50") and volume > 0:
        f["ceiling_head"] = _clamp(
            math.log10((ceiling["ceiling_p50"] + 1) / (volume + 1)), -2, 2)

    z = model["bias"] + sum(w.get(k, 0.0) * v for k, v in f.items())
    prob = _sigmoid(z)

    # ── 신뢰도: 컷라인을 몇 개로 냈는가 + 주제적합도 측정 여부 ──
    if len(scored) >= 7 and topical is not None:
        confidence = "high"
    elif len(scored) >= 5:
        confidence = "medium"
    else:
        confidence = "low"
    # SERP 를 폴백 파싱으로 얻었으면 순위 자체가 흔들린다 → 확신을 깎는다.
    if not serp_reliable:
        confidence = "low"

    base = model["base_rate"]
    shrink = model["shrink"].get(confidence, 0.45)
    # 상한 0.90 — 아직 실측 정답지로 보정되지 않은 모델이라 "확실"을 팔지 않는다.
    prob = round(_clamp(base + shrink * (prob - base), 0.02, 0.90), 3)

    th = model["thresholds"]
    verdict = ("likely" if prob >= th["likely"]
               else "contested" if prob >= th["contested"] else "unlikely")

    # ── 근거 문장 (숫자 그대로. 판정이 왜 그런지 사용자가 검산할 수 있어야 한다) ──
    reasons = []
    gap = my_score - cut_line
    if gap >= 0:
        reasons.append(
            f"1페이지 진입 컷라인은 {cut_line:.1f}점(현재 10위권 최하위)이고 "
            f"내 블로그는 {my_score:.1f}점 — {gap:.1f}점 위입니다.")
    else:
        reasons.append(
            f"1페이지 진입 컷라인은 {cut_line:.1f}점인데 내 블로그는 {my_score:.1f}점 — "
            f"{abs(gap):.1f}점 모자랍니다.")
    reasons.append(f"1페이지 중앙값 {median_score:.1f}점, 채점된 경쟁자 {len(scored)}명.")
    if vacancy > 0:
        reasons.append(
            f"1페이지 중 {len(dormant)}자리가 90일 이상 방치된 블로그입니다(뚫을 공석).")
    if topical is not None:
        if topical >= 3:
            reasons.append(f"내 블로그 최근 글 중 이 주제 글이 {topical}개 — 주제 적합도가 있습니다.")
        elif topical == 0:
            reasons.append("내 블로그 최근 글에 이 주제 글이 없습니다 — 주제 적합도가 약합니다.")
    if my_rank is not None and my_rank > PAGE1_CUTOFF:
        reasons.append(f"이미 {my_rank}위로 색인돼 있습니다(1페이지 근접 신호).")
    if not serp_reliable:
        reasons.append("⚠️ 검색 결과 목록 파싱이 폴백 경로여서 순위 정확도가 낮습니다 "
                       "— 판정을 참고용으로만 보세요.")

    return {
        "verdict": verdict,
        "probability": prob,
        "confidence": confidence,
        "reasons": reasons,
        "features": {k: round(v, 3) for k, v in f.items()},
        "cut_line": round(cut_line, 1),
        "entry_bar": round(entry_bar, 1),   # 하위 2개 평균 (모델이 실제로 쓴 문턱)
        "median_score": round(median_score, 1),
        "my_score": round(my_score, 1),
        "scored_competitors": len(scored),
        "vacancy_count": len(dormant),
        "model_version": model["version"],
    }


async def stage2_deep(blog_id: str, keyword: str,
                      facts: Optional[Dict] = None) -> Dict:
    """전체 판정 — SERP + 경쟁자/내 블로그 채점 + 주제적합도 + 확률.

    무거우므로 worker 프로세스에서 실행한다(routers/keyword_verdict.py 가 큐로 넘긴다).
    facts 를 넘기면 stage1 을 다시 돌지 않는다(워커가 사실을 먼저 발행할 때 씀).
    """
    t0 = time.time()
    blog_id = (blog_id or "").strip()
    keyword = (keyword or "").strip()

    if facts is None:
        facts = await stage1_facts(blog_id, keyword)
    rows = (facts.get("page1") or [])
    serp_rows_all = rows

    if not facts.get("ok"):
        return {
            "ok": False, "blog_id": blog_id, "keyword": keyword,
            "error": facts.get("error") or "serp_unavailable",
            "verdict": "unknown", "probability": None, "confidence": "low",
            "reasons": ["네이버 검색 결과를 가져오지 못했습니다(일시적 차단 가능). "
                        "잠시 후 다시 시도해 주세요."],
            "facts": facts, "elapsed": round(time.time() - t0, 1),
            "disclaimer": DISCLAIMER,
        }

    # 이미 1페이지면 판정 불필요 — 사실이 예측을 이긴다.
    if facts.get("already_page1"):
        return {
            "ok": True, "blog_id": blog_id, "keyword": keyword,
            "verdict": "already_ranked", "probability": 1.0, "confidence": "high",
            "reasons": [f"이미 이 키워드로 블로그탭 {facts['my_rank']}위에 노출 중입니다."],
            "facts": facts, "competitors": [], "cut_line": None,
            "elapsed": round(time.time() - t0, 1), "disclaimer": DISCLAIMER,
        }

    # 경쟁자 + 내 블로그 채점 (동시성 제한)
    sem = asyncio.Semaphore(SCORE_CONCURRENCY)

    async def _bounded(bid: str):
        async with sem:
            return await _score_blog(bid)

    targets = [r["blog_id"] for r in serp_rows_all[:PAGE1_CUTOFF]]
    scored_list, my, topical, ceiling, idle = await asyncio.gather(
        asyncio.gather(*[_bounded(b) for b in targets]),
        _bounded(blog_id),
        _topical_fit(blog_id, keyword),
        _cached_ceiling(blog_id),
        _measure_idle_days(targets),
    )

    by_id = {s["blog_id"]: s for s in scored_list if s}

    # 1차에서 타임아웃난 경쟁자 재시도 — analyze_blog 는 타임아웃 뒤에도 내부적으로
    # 캐시를 채우는 경우가 많아(실측: 15s 타임아웃 → 재호출 4.3s→0.1s) 두 번째 시도는
    # 대부분 즉답이다. 컷라인은 채점된 경쟁자 수가 곧 신뢰도라 회수 가치가 크다.
    missing = [b for b in targets if b not in by_id][:RETRY_MISSING]
    for bid in missing:
        s = await _score_blog(bid)
        if s:
            by_id[bid] = s

    # 내 블로그도 같은 이유로 실패할 수 있고, 실패하면 **판정 자체가 unknown 이 된다**
    # (경쟁자 10명을 다 채점해 놓고 내 점수가 없어서 버리는 낭비 — 2026-08-13 실측).
    if my is None:
        my = await _score_blog(blog_id)

    competitors = []
    for r in serp_rows_all[:PAGE1_CUTOFF]:
        s = by_id.get(r["blog_id"])
        competitors.append({
            "rank": r["rank"],
            "blog_id": r["blog_id"],
            "blog_name": r.get("blog_name"),
            "post_title": r.get("post_title"),
            "score": round(s["score"], 1) if s else None,
            "level": s.get("level") if s else None,
            "grade": s.get("grade") if s else None,
            "recent_activity_days": idle.get(r["blog_id"]),
            "measured": bool(s),
        })

    verdict = compute_verdict(
        my=my, competitors=competitors, volume=facts.get("volume") or 0,
        my_rank=facts.get("my_rank"), topical=topical, ceiling=ceiling,
        serp_reliable=(facts.get("serp_parse_mode") == "list"),
    )

    return {
        "ok": True,
        "blog_id": blog_id,
        "keyword": keyword,
        "facts": facts,
        "competitors": competitors,
        "my": ({"score": round(my["score"], 1), "level": my.get("level"),
                "grade": my.get("grade")} if my else None),
        "topical_posts": topical,
        "ceiling": ({"ceiling_p50": ceiling.get("ceiling_p50"),
                     "ceiling_volume": ceiling.get("ceiling_volume"),
                     "confidence": ceiling.get("confidence")} if ceiling else None),
        "elapsed": round(time.time() - t0, 1),
        "disclaimer": DISCLAIMER,
        **verdict,
    }


async def _cached_ceiling(blog_id: str) -> Optional[Dict]:
    """이미 측정해 둔 노출 천장이 있으면 쓴다. **없다고 새로 측정하지 않는다.**

    measure_exposure_ceiling 은 스크래핑 10회라 판정 경로에 넣으면 그 자체로 분 단위가
    된다(기존 judge-keyword 가 프로덕션에서 2분+ 무응답이던 이유). 천장은 보조 피처이므로
    캐시가 있을 때만 가산점으로 쓴다.
    """
    try:
        from services.exposure_ceiling import _cache_get
        return _cache_get(blog_id)
    except Exception:
        return None
