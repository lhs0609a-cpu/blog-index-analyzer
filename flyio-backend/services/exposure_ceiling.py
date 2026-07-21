"""
노출 천장(Exposure Ceiling) 측정기
====================================

블로그의 "지수"를 추정하는 대신, 관측 가능한 사실을 직접 측정한다:
  이 블로그가 **실제로 상위노출에 성공한 키워드들의 검색량이 어디까지인가?**

그 상한선이 이 블로그의 '노출 천장'이다. 새 키워드가 이 천장 아래면 상위노출
가능성이 높고, 위면 현재 체력으론 어렵다 — 라고 실적 기반으로 판단할 수 있다.

배경(2026-07 리서치): 네이버는 "블로그 지수"를 공식 개념으로 인정하지 않으며,
숨은 지수 API에 의존하던 블덱스 등은 2025-12 서비스가 붕괴했다. 살아남은 방법론은
'관측 가능한 아웃풋(실제 SERP 노출)' 기반이다. 이 모듈이 그 접근을 구현한다.

측정 방식(전부 합법 — 공개 검색 API + 검색광고 API):
  1. RSS로 최근 글 제목 수집
  2. 제목에서 후보 키워드 추출(빈도순 = 이 블로그의 핵심 주제)
  3. 검색광고 API로 각 후보의 월 검색량 조회 → 실수요 있는 것만 남김
  4. 네이버 블로그 검색에서 이 블로그가 각 키워드로 몇 위에 뜨는지 실제 확인
  5. 1페이지(상위 N위) 진입에 성공한 키워드들의 검색량 분포 = 노출 천장

한계:
  - 제목 키워드만 테스트하므로 블로그가 다루지 않은 주제의 잠재력은 못 본다.
  - 검색 API는 정확도순(sim) 상위 30위까지만 조회 → 그 밖은 '미노출'로 처리.
  - 표본이 적으면(핵심 키워드 부족) confidence=low.
"""

import asyncio
import base64
import hashlib
import hmac
import logging
import statistics
import time
from collections import Counter
from typing import Dict, List, Optional

import httpx

from config import settings
from services.blog_index_verifier import _extract_keywords
from services.rank_checker import RankChecker
from routers.content_lifespan import fetch_blog_posts_via_rss

logger = logging.getLogger(__name__)

# ── 측정 파라미터 (자체 휴리스틱 — 업계 표준 아님) ──────────────────
SAMPLE_POSTS = 20          # RSS에서 볼 최근 글 수
MAX_KEYWORDS = 24          # 검색으로 테스트할 최대 키워드 수 (비용 상한)
VOLUME_FLOOR = 10          # 이 미만 검색량은 '실수요 없음'으로 제외
RANK_CUTOFF_PAGE1 = 10     # 1페이지(상위노출) 기준 순위
RANK_CUTOFF_INDEXED = 30   # 색인/노출 확인 상한 (검색 API 조회 한계)
RANK_CONCURRENCY = 5       # 동시 순위조회 수
_CACHE_TTL = 86400         # 24시간

_CACHE: Dict[str, Dict] = {}

_DISCLAIMER = (
    "노출 천장은 이 블로그가 최근 글 제목의 키워드로 네이버 블로그 검색에서 "
    "실제로 상위노출된 결과만을 근거로 한 실적 기반 추정치입니다. 네이버 알고리즘은 "
    "비공개이며 AI 브리핑 등으로 계속 변하므로 미래 노출을 보장하지 않습니다."
)


def _cache_get(blog_id: str) -> Optional[Dict]:
    c = _CACHE.get(blog_id)
    if c and time.time() - c["ts"] < _CACHE_TTL:
        return c["data"]
    if c:
        del _CACHE[blog_id]
    return None


def _cache_set(blog_id: str, data: Dict):
    if len(_CACHE) > 300:
        for k in sorted(_CACHE, key=lambda k: _CACHE[k]["ts"])[:150]:
            del _CACHE[k]
    _CACHE[blog_id] = {"data": data, "ts": time.time()}


async def _fetch_volumes(keywords: List[str]) -> Dict[str, int]:
    """검색광고 /keywordstool 로 키워드별 월 검색량(PC+모바일) 조회.

    응답의 relKeyword 는 공백이 제거된 형태로 오므로 호출부도 공백 제거로 매칭한다.
    반환에 없는 키워드는 검색량 0 또는 매우 낮음.
    """
    if not (settings.NAVER_AD_API_KEY and settings.NAVER_AD_SECRET_KEY and settings.NAVER_AD_CUSTOMER_ID):
        logger.warning("[ceiling] 검색광고 API 미설정 — 검색량 조회 불가")
        return {}

    def _to_int(v) -> int:
        if v is None:
            return 0
        if isinstance(v, (int, float)):
            return int(v)
        s = str(v).replace(",", "").strip()
        if s in ("< 10", "<10"):
            return 5
        try:
            return int(float(s))
        except (ValueError, TypeError):
            return 0

    out: Dict[str, int] = {}
    # hintKeywords 는 최대 5개, 공백 불가
    for i in range(0, len(keywords), 5):
        batch = [k.replace(" ", "") for k in keywords[i:i + 5] if k.replace(" ", "")]
        if not batch:
            continue
        ts = str(int(time.time() * 1000))
        uri = "/keywordstool"
        sig = base64.b64encode(
            hmac.new(settings.NAVER_AD_SECRET_KEY.encode(),
                     f"{ts}.GET.{uri}".encode(), hashlib.sha256).digest()
        ).decode()
        headers = {
            "X-Timestamp": ts,
            "X-API-KEY": settings.NAVER_AD_API_KEY,
            "X-Customer": settings.NAVER_AD_CUSTOMER_ID,
            "X-Signature": sig,
        }
        try:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                resp = await client.get(
                    "https://api.searchad.naver.com/keywordstool",
                    headers=headers,
                    params={"hintKeywords": ",".join(batch), "showDetail": "1"},
                    timeout=10.0,
                )
            if resp.status_code != 200:
                logger.warning(f"[ceiling] volume batch {resp.status_code} for {batch}")
                continue
            for it in resp.json().get("keywordList", []):
                rel = (it.get("relKeyword") or "").strip().replace(" ", "")
                if rel and rel not in out:
                    out[rel] = _to_int(it.get("monthlyPcQcCnt")) + _to_int(it.get("monthlyMobileQcCnt"))
        except Exception as e:
            logger.warning(f"[ceiling] volume batch error for {batch}: {e}")
        # 검색광고 API 레이트리밋 완화
        await asyncio.sleep(0.2)
    return out


def _confidence(tested: int, ranked: int) -> str:
    if tested >= 12 and ranked >= 4:
        return "high"
    if tested >= 6 and ranked >= 2:
        return "medium"
    return "low"


async def measure_exposure_ceiling(
    blog_id: str,
    *,
    use_cache: bool = True,
    max_keywords: int = MAX_KEYWORDS,
) -> Dict:
    """블로그의 노출 천장을 실측한다.

    Returns:
        {
          "ok": bool,
          "ceiling_volume": int|None,     # 1페이지 진입한 키워드 중 최대 검색량 (천장)
          "ceiling_p50": int|None,        # 그 중앙값 (안정적으로 뚫는 수준)
          "top30_ceiling": int|None,      # 상위 30위 내 색인된 키워드 중 최대 검색량
          "win_rate": float,              # 테스트 대비 1페이지 진입 비율
          "ranked_keywords": [{keyword, volume, rank}],  # 근거 (검색량 desc)
          "tested": int, "ranked_count": int,
          "confidence": "high|medium|low",
          "disclaimer": str,
          "error": str|None,
        }
    """
    if use_cache:
        cached = _cache_get(blog_id)
        if cached:
            return {**cached, "cached": True}

    base = {
        "ok": False, "ceiling_volume": None, "ceiling_p50": None,
        "top30_ceiling": None, "win_rate": 0.0, "ranked_keywords": [],
        "tested": 0, "ranked_count": 0, "confidence": "low",
        "disclaimer": _DISCLAIMER, "error": None,
    }

    posts = await fetch_blog_posts_via_rss(blog_id)
    if not posts:
        return {**base, "error": "no_posts_via_rss"}

    # 후보 키워드: 최근 글 제목에서 추출, 빈도순 = 이 블로그의 핵심 주제
    counter: Counter = Counter()
    for p in posts[:SAMPLE_POSTS]:
        counter.update(set(_extract_keywords(p.get("title", ""))))  # 글당 1회(제목 내 중복 제거)
    if not counter:
        return {**base, "error": "no_keywords_extracted"}

    candidates = [kw for kw, _ in counter.most_common(max_keywords)]

    # 실수요 있는 키워드만 남김
    volumes = await _fetch_volumes(candidates)
    if not volumes:
        return {**base, "error": "no_volume_data"}

    testable = [
        (kw, volumes.get(kw.replace(" ", ""), 0))
        for kw in candidates
    ]
    testable = [(kw, v) for kw, v in testable if v >= VOLUME_FLOOR]
    if not testable:
        return {**base, "error": "no_keywords_with_demand", "tested": 0}

    # 실제 순위 조회 (동시성 제한)
    checker = RankChecker()
    sem = asyncio.Semaphore(RANK_CONCURRENCY)

    async def _rank(kw: str, vol: int):
        async with sem:
            try:
                r = await checker.check_blog_tab_rank(kw, blog_id, max_results=RANK_CUTOFF_INDEXED)
            except Exception as e:
                logger.warning(f"[ceiling] rank check failed {blog_id}/{kw!r}: {e}")
                r = None
            return {"keyword": kw, "volume": vol, "rank": r}

    try:
        results = await asyncio.gather(*[_rank(kw, v) for kw, v in testable])
    finally:
        await checker.close()

    tested = len(results)
    page1 = [r for r in results if r["rank"] is not None and r["rank"] <= RANK_CUTOFF_PAGE1]
    top30 = [r for r in results if r["rank"] is not None and r["rank"] <= RANK_CUTOFF_INDEXED]

    page1_vols = sorted((r["volume"] for r in page1), reverse=True)
    top30_vols = [r["volume"] for r in top30]

    data = {
        "ok": True,
        "ceiling_volume": page1_vols[0] if page1_vols else None,
        "ceiling_p50": int(statistics.median(page1_vols)) if page1_vols else None,
        "top30_ceiling": max(top30_vols) if top30_vols else None,
        "win_rate": round(len(page1) / tested, 3) if tested else 0.0,
        "ranked_keywords": sorted(
            [{"keyword": r["keyword"], "volume": r["volume"], "rank": r["rank"]} for r in top30],
            key=lambda x: x["volume"], reverse=True,
        )[:15],
        "tested": tested,
        "ranked_count": len(page1),
        "confidence": _confidence(tested, len(page1)),
        "disclaimer": _DISCLAIMER,
        "error": None,
    }
    _cache_set(blog_id, data)
    return data


_VERDICT_RANK = {"likely": 3, "contested": 2, "unlikely": 1, "unknown": 0}


def judge_keyword(ceiling: Dict, target_volume: int, serp: Optional[Dict] = None) -> Dict:
    """측정된 노출 천장(+선택적 SERP 난이도)으로 키워드 상위노출 가능성을 판정.

    Args:
        ceiling: measure_exposure_ceiling() 결과 (내 블로그 공급 능력)
        target_volume: 판정할 키워드의 월 검색량 (수요)
        serp: measure_serp_difficulty() 결과 (경쟁 강도). 있으면 판정 보정.

    Returns:
        {verdict, reason, confidence, serp_adjustment}
          verdict: "likely"|"contested"|"unlikely"|"unknown"
    """
    if not ceiling.get("ok") or ceiling.get("ceiling_volume") is None:
        # 내 천장을 모를 때도 SERP가 매우 쉬우면 최소한의 단서는 준다
        if serp and serp.get("ok") and serp.get("difficulty_label") in ("very_easy", "easy"):
            return {
                "verdict": "contested",
                "reason": (
                    "이 블로그의 상위노출 실적이 부족해 천장은 미상이지만, 해당 키워드 1페이지가 "
                    f"휴면 블로그 위주({serp['difficulty_label']})라 시도해볼 만합니다."
                ),
                "confidence": "low",
                "serp_adjustment": "none",
            }
        return {
            "verdict": "unknown",
            "reason": "이 블로그의 노출 천장을 아직 측정하지 못했습니다(상위노출 실적 부족).",
            "confidence": "low",
            "serp_adjustment": "none",
        }

    p50 = ceiling.get("ceiling_p50") or 0
    ceil = ceiling["ceiling_volume"]
    conf = ceiling.get("confidence", "low")

    # 1차 판정: 내 천장 대비 수요 위치
    if target_volume <= p50:
        verdict, reason = "likely", (
            f"검색량 {target_volume:,}은 이 블로그가 안정적으로 상위노출해온 수준"
            f"(중앙값 {p50:,}) 이하입니다."
        )
    elif target_volume <= ceil:
        verdict, reason = "contested", (
            f"검색량 {target_volume:,}은 이 블로그의 최고 실적({ceil:,})과 "
            f"안정권({p50:,}) 사이입니다."
        )
    else:
        verdict, reason = "unlikely", (
            f"검색량 {target_volume:,}은 이 블로그가 지금까지 뚫은 최고치({ceil:,})를 넘습니다."
        )

    # 2차 보정: 경쟁자 체력. 죽은 SERP면 한 단계 상향, 강한 SERP면 한 단계 하향.
    adjustment = "none"
    if serp and serp.get("ok"):
        label = serp.get("difficulty_label")
        rank = _VERDICT_RANK[verdict]
        if label in ("very_easy", "easy") and rank < 3:
            rank += 1
            adjustment = "up"
            reason += f" 다만 1페이지가 휴면 블로그 위주({label})라 한 단계 유리하게 봅니다."
        elif label in ("very_hard",) and rank > 1:
            rank -= 1
            adjustment = "down"
            reason += f" 다만 1페이지가 활발한 강자들({label})이라 한 단계 불리하게 봅니다."
        verdict = {v: k for k, v in _VERDICT_RANK.items()}[rank]

    return {
        "verdict": verdict,
        "reason": reason,
        "confidence": conf,
        "serp_adjustment": adjustment,
    }
