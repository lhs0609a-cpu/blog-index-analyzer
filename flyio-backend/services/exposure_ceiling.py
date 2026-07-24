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
  1. RSS로 최근 글 제목 + 본문요약 수집
  2. 제목·본문에서 후보 키워드 추출(빈도순 = 이 블로그의 핵심 주제)
  3. 검색광고 API로 월 검색량 조회 → 실수요 있는 것만 + 응답의 연관키워드(relKeyword)를
     주제 토큰으로 필터링해 후보를 '공짜로' 확장 (연관검색어 종료 대체)
  4. 순위 확인 2단계:
       (a) openapi(sort=sim)로 싼 프리필터 — 어느 키워드가 유망한지 대략 스캔
       (b) 유망 키워드만 '실제 블로그탭 스크래핑'으로 진짜 순위 확정 (비용 캡)
  5. 확정된 실제 순위로 1페이지 진입 키워드들의 검색량 분포 = 노출 천장

2026-07 개편(딥리서치 근거):
  - openapi sort=sim 순서는 실제 블로그탭 순서와 다르다(1차 확인). 그래서 천장 산정은
    반드시 '실제 블로그탭 스크래핑'을 ground truth로 삼는다. openapi는 프리필터 전용.
  - 예측(천장)과 실측(정답지 채점)이 동일한 순위 소스(실제 탭)를 써야 calibration이 유효.
    → blog_tab_true_rank() 를 verify-pending 도 공유한다.

한계:
  - 스크래핑은 무거워 확인 키워드 수를 MAX_SCRAPE_CONFIRMS 로 캡한다(비용/정확도 트레이드오프).
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
MAX_KEYWORDS = 24          # (하위호환) 기본 프리필터 대상 상한
MAX_CANDIDATES = 40        # 확장 후보 총 상한 (제목+본문+연관키워드)
MAX_SCRAPE_CONFIRMS = 10   # '실제 블로그탭 스크래핑'으로 확정할 최대 키워드 (비용 캡)
VOLUME_FLOOR = 10          # 이 미만 검색량은 '실수요 없음'으로 제외
RANK_CUTOFF_PAGE1 = 10     # 1페이지(상위노출) 기준 순위
RANK_CUTOFF_INDEXED = 30   # 색인/노출 확인 상한
RANK_CONCURRENCY = 5       # openapi 프리필터 동시성
SCRAPE_CONCURRENCY = 2     # 스크래핑은 무거워 동시성 낮춤(봇탐지·비용)
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


async def blog_tab_true_rank(keyword: str, blog_id: str, limit: int = RANK_CUTOFF_INDEXED) -> Optional[int]:
    """'실제 블로그탭 스크래핑'으로 blog_id의 진짜 순위를 조회.

    openapi search/blog.json(sort=sim)은 실제 블로그탭 노출 순서와 다르므로, 천장 산정과
    정답지 채점의 ground truth 는 반드시 이 함수(실제 탭 스크래핑)를 쓴다.
    routers.blogs 를 함수 내부에서 지연 import (순환 import 회피 — serp_difficulty 와 동일 패턴).

    Returns: 실제 순위(1-based) 또는 None(상위 limit 내 미노출/조회실패).
    """
    from routers.blogs import fetch_naver_search_results  # 지연 import
    try:
        results = await fetch_naver_search_results(keyword, limit=limit)
    except Exception as e:
        logger.warning(f"[ceiling] blog-tab scrape failed {blog_id}/{keyword!r}: {e}")
        return None
    for r in results or []:
        if r.get("blog_id") == blog_id:
            rank = r.get("source_rank") or r.get("rank")
            return int(rank) if rank else None
    return None


def _char_bigrams(text: str) -> set:
    """한글/영숫자 런에서 2글자 슁글 집합 (한국어 부분일치 overlap용).

    한국어는 띄어쓰기가 없어 '경희온담한의원' 같은 런이 통째로 한 토큰이 된다. 그러면
    연관키워드('자율신경실조증' 등)와 겹치는 토큰이 없어 확장이 안 된다. 2글자 슁글로
    쪼개면 '한의' '의원' '자율' '신경' 수준의 부분일치가 가능해진다.
    """
    import re as _re
    grams: set = set()
    for run in _re.findall(r"[가-힣A-Za-z0-9]{2,}", (text or "").lower()):
        for i in range(len(run) - 1):
            grams.add(run[i:i + 2])
    return grams


# 너무 흔해 주제 변별력이 없는 슁글(과확장 방지). 필요시 확장.
_STOP_BIGRAMS = {"한의", "의원", "병원", "치료", "클리", "리닉", "센터", "효과", "가격", "후기", "추천"}


def _gather_seed_keywords(posts: List[Dict], volumes: Dict[str, int], core: List[str]) -> List[str]:
    """제목·본문 코어 키워드 + 검색광고 응답의 연관키워드(relKeyword)를 2글자 슁글
    오버랩으로 필터링해 후보를 공격적으로 확장한다. relKeyword 볼륨은 이미 _fetch_volumes 가
    공짜로 반환하므로 추가 API 비용 없이 시드를 넓힌다(연관검색어 종료 대체).

    필터: relKeyword 가 코어의 '변별력 있는'(스톱워드 제외) 슁글을 하나라도 공유하면 주제 내로
    본다. 흔한 슁글(한의/의원 등)만 겹치는 건 제외해 과확장을 막는다.
    """
    core_grams: set = set()
    for kw in core:
        core_grams |= _char_bigrams(kw)
    signal_grams = core_grams - _STOP_BIGRAMS  # 변별력 있는 슁글만
    if not signal_grams:
        signal_grams = core_grams  # 코어가 죄다 흔한 말이면 폴백
    if not signal_grams:
        return core

    expanded = list(core)
    seen = {c.replace(" ", "") for c in core}
    # volumes 에 실려온 연관키워드 중 변별 슁글을 공유하고 실수요 있는 것만, 검색량 높은 순
    for rel, vol in sorted(volumes.items(), key=lambda x: x[1], reverse=True):
        if len(expanded) >= MAX_CANDIDATES:
            break
        key = rel.replace(" ", "")
        if key in seen or vol < VOLUME_FLOOR:
            continue
        if _char_bigrams(rel) & signal_grams:  # 주제 경계 안(부분일치)
            expanded.append(rel)
            seen.add(key)
    return expanded[:MAX_CANDIDATES]


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

    # 후보 키워드: 최근 글 제목 + 본문요약에서 추출, 빈도순 = 이 블로그의 핵심 주제
    counter: Counter = Counter()
    for p in posts[:SAMPLE_POSTS]:
        counter.update(set(_extract_keywords(p.get("title", ""))))       # 제목(글당 1회)
        desc = p.get("description_text", "")
        if desc:
            counter.update(set(_extract_keywords(desc)))                 # 본문요약(글당 1회)
    if not counter:
        return {**base, "error": "no_keywords_extracted"}

    core = [kw for kw, _ in counter.most_common(max_keywords)]

    # 검색광고 API: 코어 키워드 볼륨 + 응답에 딸려오는 연관키워드 볼륨(공짜)
    volumes = await _fetch_volumes(core)
    if not volumes:
        return {**base, "error": "no_volume_data"}

    # 연관키워드로 후보 확장(주제 토큰 필터) → 실제 1위 하는 키워드를 놓치지 않도록
    candidates = _gather_seed_keywords(posts, volumes, core)

    testable = [(kw, volumes.get(kw.replace(" ", ""), 0)) for kw in candidates]
    testable = [(kw, v) for kw, v in testable if v >= VOLUME_FLOOR]
    if not testable:
        return {**base, "error": "no_keywords_with_demand", "tested": 0}
    # 검색량 높은 순 = 가장 알고 싶은(가치 큰) 키워드 우선
    testable.sort(key=lambda x: x[1], reverse=True)

    # ── 1단계: openapi 싼 프리필터 (어느 키워드가 유망한지 대략 스캔) ──
    checker = RankChecker()
    pre_sem = asyncio.Semaphore(RANK_CONCURRENCY)

    async def _prefilter(kw: str, vol: int):
        async with pre_sem:
            try:
                r = await checker.check_blog_tab_rank(kw, blog_id, max_results=RANK_CUTOFF_INDEXED)
            except Exception as e:
                logger.warning(f"[ceiling] prefilter failed {blog_id}/{kw!r}: {e}")
                r = None
            return {"keyword": kw, "volume": vol, "openapi_rank": r}

    try:
        pre = await asyncio.gather(*[_prefilter(kw, v) for kw, v in testable])
    finally:
        await checker.close()

    # ── 2단계: 유망 키워드만 '실제 블로그탭 스크래핑'으로 진짜 순위 확정 (비용 캡) ──
    # 확정 대상 선정: exploit(openapi 색인분) 우선 + explore(openapi가 놓친 고볼륨) 소량.
    #   - openapi 색인 표시 = 실제 탭에서도 뜰 가능성 큰 신호 → 이걸 스크래핑해 '진짜 순위' 확정
    #     (openapi 순서는 부정확해도 색인 여부 자체는 유용). 대부분의 예산을 여기 씀.
    #   - 단 openapi 가 실제 강점을 통째 놓치는 경우(연구근거)를 대비해 EXPLORE 슬롯을
    #     openapi 미색인 고볼륨에 소량 배정. 예산을 몰아주면(과거 버그) 뜨는 키워드를 밀어냄.
    # pre 는 volume desc 정렬 유지 → 각 그룹 내부도 volume 우선.
    EXPLORE = 2
    indexed = [p for p in pre if p["openapi_rank"] is not None]
    non_indexed = [p for p in pre if p["openapi_rank"] is None]
    n_explore = min(EXPLORE, len(non_indexed))
    n_exploit = MAX_SCRAPE_CONFIRMS - n_explore
    confirm_list = indexed[:n_exploit] + non_indexed[:n_explore]
    # 남는 예산(색인분이 적을 때)은 남은 후보로 볼륨순 채움
    if len(confirm_list) < MAX_SCRAPE_CONFIRMS:
        picked = {p["keyword"] for p in confirm_list}
        leftovers = [p for p in (indexed + non_indexed) if p["keyword"] not in picked]
        confirm_list += leftovers[:MAX_SCRAPE_CONFIRMS - len(confirm_list)]
    confirm_keys = {p["keyword"] for p in confirm_list}

    scr_sem = asyncio.Semaphore(SCRAPE_CONCURRENCY)

    async def _confirm(p: Dict):
        async with scr_sem:
            true_rank = await blog_tab_true_rank(p["keyword"], blog_id, limit=RANK_CUTOFF_INDEXED)
            return {**p, "rank": true_rank, "rank_source": "scraped"}

    confirmed = await asyncio.gather(*[_confirm(p) for p in confirm_list]) if confirm_list else []

    # 확정 안 된 키워드는 openapi 순위를 '미확정' 표시로 보관(천장 산정엔 미포함)
    results = list(confirmed)
    for p in pre:
        if p["keyword"] not in confirm_keys:
            results.append({**p, "rank": None, "rank_source": "openapi_unconfirmed",
                            "openapi_hint_rank": p["openapi_rank"]})

    # 천장은 '확정된 실제 순위'만으로 계산 (idea13022 유형 오측정 방지)
    confirmed_ranked = [r for r in confirmed if r["rank"] is not None]
    page1 = [r for r in confirmed_ranked if r["rank"] <= RANK_CUTOFF_PAGE1]
    top30 = [r for r in confirmed_ranked if r["rank"] <= RANK_CUTOFF_INDEXED]

    page1_vols = sorted((r["volume"] for r in page1), reverse=True)
    top30_vols = [r["volume"] for r in top30]

    data = {
        "ok": True,
        "ceiling_volume": page1_vols[0] if page1_vols else None,
        "ceiling_p50": int(statistics.median(page1_vols)) if page1_vols else None,
        "top30_ceiling": max(top30_vols) if top30_vols else None,
        "win_rate": round(len(page1) / len(confirmed), 3) if confirmed else 0.0,
        "ranked_keywords": sorted(
            [{"keyword": r["keyword"], "volume": r["volume"], "rank": r["rank"],
              "rank_source": r.get("rank_source", "scraped")} for r in top30],
            key=lambda x: x["volume"], reverse=True,
        )[:15],
        "tested": len(testable),           # 프리필터한 후보 수
        "scrape_confirmed": len(confirmed),  # 실제 스크래핑으로 확정한 수
        "candidates": len(candidates),
        "ranked_count": len(page1),
        "confidence": _confidence(len(confirmed), len(page1)),
        "rank_source": "blog_tab_scraping",
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
        {verdict, probability, reason, confidence, serp_adjustment}
          verdict: "likely"|"contested"|"unlikely"|"unknown"
          probability: float|None — 이 블로그가 이 키워드로 1페이지 진입할 확률(0~1).
                       Brier/CORP 채점의 예측값. unknown 이면 None(채점 제외).
    """
    if not ceiling.get("ok") or ceiling.get("ceiling_volume") is None:
        # 내 천장을 모를 때도 SERP가 매우 쉬우면 최소한의 단서는 준다
        if serp and serp.get("ok") and serp.get("difficulty_label") in ("very_easy", "easy"):
            return {
                "verdict": "contested",
                "probability": 0.30,  # 천장 미상 + 죽은 SERP: 약한 긍정
                "reason": (
                    "이 블로그의 상위노출 실적이 부족해 천장은 미상이지만, 해당 키워드 1페이지가 "
                    f"휴면 블로그 위주({serp['difficulty_label']})라 시도해볼 만합니다."
                ),
                "confidence": "low",
                "serp_adjustment": "none",
            }
        return {
            "verdict": "unknown",
            "probability": None,  # 정보 없음 → 채점 제외
            "reason": "이 블로그의 노출 천장을 아직 측정하지 못했습니다(상위노출 실적 부족).",
            "confidence": "low",
            "serp_adjustment": "none",
        }

    p50 = ceiling.get("ceiling_p50") or 0
    ceil = ceiling["ceiling_volume"]
    conf = ceiling.get("confidence", "low")

    # 1차 판정: 내 천장 대비 수요 위치 (+ 연속 base 확률)
    if target_volume <= p50:
        verdict, reason = "likely", (
            f"검색량 {target_volume:,}은 이 블로그가 안정적으로 상위노출해온 수준"
            f"(중앙값 {p50:,}) 이하입니다."
        )
        base_prob = 0.75
    elif target_volume <= ceil:
        verdict, reason = "contested", (
            f"검색량 {target_volume:,}은 이 블로그의 최고 실적({ceil:,})과 "
            f"안정권({p50:,}) 사이입니다."
        )
        base_prob = 0.45
    else:
        verdict, reason = "unlikely", (
            f"검색량 {target_volume:,}은 이 블로그가 지금까지 뚫은 최고치({ceil:,})를 넘습니다."
        )
        base_prob = max(0.03, 0.20 * (ceil / max(target_volume, 1)))

    # 2차 보정: 경쟁자 체력. 죽은 SERP면 한 단계 상향, 강한 SERP면 한 단계 하향.
    adjustment = "none"
    if serp and serp.get("ok"):
        label = serp.get("difficulty_label")
        rank = _VERDICT_RANK[verdict]
        if label in ("very_easy", "easy") and rank < 3:
            rank += 1
            adjustment = "up"
            base_prob += 0.12
            reason += f" 다만 1페이지가 휴면 블로그 위주({label})라 한 단계 유리하게 봅니다."
        elif label in ("very_hard",) and rank > 1:
            rank -= 1
            adjustment = "down"
            base_prob -= 0.12
            reason += f" 다만 1페이지가 활발한 강자들({label})이라 한 단계 불리하게 봅니다."
        elif label == "hard":
            base_prob -= 0.06
        verdict = {v: k for k, v in _VERDICT_RANK.items()}[rank]

    # 3차: 신뢰도에 따라 base rate(0.35)로 회귀 — 표본 적으면 확신을 줄인다(과대확신 방지).
    _BASE_RATE = 0.35
    shrink = {"high": 1.0, "medium": 0.6, "low": 0.35}.get(conf, 0.35)
    probability = _BASE_RATE + shrink * (base_prob - _BASE_RATE)
    probability = round(min(0.95, max(0.02, probability)), 3)

    return {
        "verdict": verdict,
        "probability": probability,
        "reason": reason,
        "confidence": conf,
        "serp_adjustment": adjustment,
    }
