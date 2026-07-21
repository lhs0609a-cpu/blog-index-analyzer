"""
SERP 난이도(Competitor Strength) 스캐너
========================================

특정 키워드의 1페이지를 실제로 점유한 블로그들이 얼마나 강한지 측정한다.

노출 천장(exposure_ceiling)은 "내 블로그가 뚫을 수 있는 검색량"을 보지만, 그것만으로는
부족하다. 같은 검색량이라도 1페이지 경쟁자가 죽어가는 블로그들이면 뚫기 쉽고, 활발한
강자들이면 어렵다. 이 모듈이 그 '경쟁자 체력'을 본다.

가벼운 측정(전부 RSS만, 검색 API 미사용 → 저비용):
  1. 키워드로 블로그탭 상위 N개 블로그 수집
  2. 각 경쟁 블로그의 RSS로 활동성(마지막 글 경과일·발행빈도)만 측정
  3. 경쟁자들의 활동성 분포 → SERP 난이도 산출

활동성 계수는 blogs.py 의 vitality 게이트와 동일 기준(자체 휴리스틱)을 쓴다.
전체 지수를 재계산하지 않으므로 경쟁자당 비용은 RSS 1회뿐이다.

한계:
  - 활동성만 본다. 경쟁자의 콘텐츠 품질·권위는 보지 않는다(그건 무거움).
    "죽은 블로그가 점유한 쉬운 SERP"를 걸러내는 게 1차 목적이다.
  - 상위 결과가 인플루언서/카페/광고로 채워지면 블로그 표본이 작아져 confidence 하락.
"""

import asyncio
import logging
import statistics
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Dict, List, Optional

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

TOP_N = 10                 # 상위 몇 개 블로그를 볼지
RSS_CONCURRENCY = 6
_RSS_TIMEOUT = 6.0


def _vitality_from_gap(days_idle: Optional[int]) -> float:
    """마지막 글 경과일 → 활동성 계수. blogs.py 의 vitality 게이트와 동일 기준."""
    if days_idle is None:
        return 0.6  # 불명 → 중립보다 약간 아래
    if days_idle <= 7:
        return 1.0
    if days_idle <= 30:
        return 0.95
    if days_idle <= 60:
        return 0.82
    if days_idle <= 90:
        return 0.65
    if days_idle <= 180:
        return 0.42
    if days_idle <= 365:
        return 0.25
    return 0.15


async def _measure_blog_vitality(client: httpx.AsyncClient, blog_id: str) -> Dict:
    """경쟁 블로그 하나의 활동성을 RSS로 가볍게 측정."""
    out = {"blog_id": blog_id, "days_idle": None, "posts_90d": None, "vitality": 0.6}
    try:
        resp = await client.get(
            f"https://rss.blog.naver.com/{blog_id}.xml",
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=_RSS_TIMEOUT,
        )
        if resp.status_code != 200 or "<item>" not in resp.text:
            return out
        soup = BeautifulSoup(resp.text, "xml")
        now = datetime.now(timezone.utc)
        dates = []
        for it in soup.find_all("item"):
            p = it.find("pubDate")
            if p:
                try:
                    dates.append(parsedate_to_datetime(p.get_text()))
                except Exception:
                    pass
        if not dates:
            return out
        dates.sort(reverse=True)
        gap = max((now - dates[0]).days, 0)
        out["days_idle"] = gap
        out["posts_90d"] = sum(1 for d in dates if (now - d).days <= 90)
        out["vitality"] = _vitality_from_gap(gap)
    except Exception as e:
        logger.debug(f"[serp] vitality fetch failed for {blog_id}: {e}")
    return out


def _difficulty_label(score: float) -> str:
    """0~100 난이도 → 라벨."""
    if score >= 75:
        return "very_hard"
    if score >= 55:
        return "hard"
    if score >= 35:
        return "moderate"
    if score >= 18:
        return "easy"
    return "very_easy"


async def measure_serp_difficulty(keyword: str, top_n: int = TOP_N) -> Dict:
    """키워드 1페이지 경쟁자들의 체력으로 SERP 난이도를 측정.

    Returns:
        {
          "ok": bool,
          "keyword": str,
          "difficulty_score": float,   # 0(매우 쉬움)~100(매우 어려움)
          "difficulty_label": str,
          "competitors_scanned": int,
          "alive_ratio": float,        # 상위 중 활발(≤30일)한 블로그 비율
          "dormant_ratio": float,      # 휴면(>90일)한 블로그 비율
          "median_vitality": float,
          "competitors": [{blog_id, rank, days_idle, vitality}],
          "confidence": "high|medium|low",
          "error": str|None,
        }
    """
    from routers.blogs import fetch_naver_search_results

    base = {
        "ok": False, "keyword": keyword, "difficulty_score": None,
        "difficulty_label": None, "competitors_scanned": 0,
        "alive_ratio": 0.0, "dormant_ratio": 0.0, "median_vitality": None,
        "competitors": [], "confidence": "low", "error": None,
    }

    try:
        results = await fetch_naver_search_results(keyword, limit=top_n)
    except Exception as e:
        logger.warning(f"[serp] search failed for {keyword!r}: {e}")
        return {**base, "error": f"search_failed: {e}"}

    # 블로그 결과만 (blog_id 있는 것), 순위 보존, 중복 제거
    seen = set()
    blogs = []
    for r in results or []:
        bid = r.get("blog_id")
        if bid and bid not in seen:
            seen.add(bid)
            blogs.append({"blog_id": bid, "rank": r.get("rank") or r.get("source_rank")})
    if not blogs:
        return {**base, "error": "no_blog_results"}

    sem = asyncio.Semaphore(RSS_CONCURRENCY)
    async with httpx.AsyncClient(follow_redirects=True) as client:
        async def _one(b):
            async with sem:
                v = await _measure_blog_vitality(client, b["blog_id"])
                v["rank"] = b["rank"]
                return v
        measured = await asyncio.gather(*[_one(b) for b in blogs])

    n = len(measured)
    vitalities = [m["vitality"] for m in measured]
    idles = [m["days_idle"] for m in measured if m["days_idle"] is not None]

    alive = sum(1 for m in measured if m["days_idle"] is not None and m["days_idle"] <= 30)
    dormant = sum(1 for m in measured if m["days_idle"] is not None and m["days_idle"] > 90)

    # 난이도 = 경쟁자 평균 활동성 * 100. 활발한 경쟁자가 많을수록 어렵다.
    median_vit = statistics.median(vitalities) if vitalities else 0.6
    difficulty = round(median_vit * 100, 1)

    # confidence: 활동성을 실제로 잰 블로그 수 기준
    measured_ct = len(idles)
    confidence = "high" if measured_ct >= 7 else "medium" if measured_ct >= 4 else "low"

    return {
        "ok": True,
        "keyword": keyword,
        "difficulty_score": difficulty,
        "difficulty_label": _difficulty_label(difficulty),
        "competitors_scanned": n,
        "alive_ratio": round(alive / n, 3) if n else 0.0,
        "dormant_ratio": round(dormant / n, 3) if n else 0.0,
        "median_vitality": round(median_vit, 3),
        "competitors": sorted(
            [{"blog_id": m["blog_id"], "rank": m["rank"],
              "days_idle": m["days_idle"], "vitality": round(m["vitality"], 2)}
             for m in measured],
            key=lambda x: (x["rank"] is None, x["rank"] or 999),
        ),
        "confidence": confidence,
        "error": None,
    }
