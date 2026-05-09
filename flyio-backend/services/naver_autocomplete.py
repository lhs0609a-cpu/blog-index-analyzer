"""naver 검색 자동완성 mining — keywordstool BFS 와 별도 발굴 채널.

사용 시나리오:
  keywordstool 만으로는 시드별 인접 KW 가 한정 (네이버 광고 추천 알고리즘).
  검색 자동완성은 사용자 검색 의도 기반이라 keywordstool 과 다른 KW pool 을 줌.
  시드 1500개 × 자동완성 10개 = 15,000 KW 후보 (1회 mining).

흐름 (autocomplete cron):
  시드 200개 rotate → 자동완성 batch 수집 (concurrency 10)
  → 풀/reject 풀 dedup → keywordstool 검색량 batch
  → ≥50 → GPT 분류 → 통과 KW source='ai_autocomplete' 자식 풀 추가
"""
import asyncio
import logging
from typing import Dict, List, Set
import httpx

logger = logging.getLogger(__name__)

# 비공식 endpoint (네이버 검색 자동완성). 무료, 인증 불요, rate limit 존재.
# 응답 형식: {"items": [[["KW1", ...meta], ["KW2", ...]], ...]}
NAVER_AC_URL = "https://ac.search.naver.com/nx/ac"

_DEFAULT_PARAMS = {
    "con": "0",
    "frm": "nv",
    "ans": "2",
    "r_format": "json",
    "r_enc": "UTF-8",
    "r_unicode": "0",
    "t_koreng": "1",
    "run": "2",
    "rev": "4",
    "q_enc": "UTF-8",
    "st": "100",
}

_HEADERS = {
    # 일반 브라우저 UA — 비공식 endpoint 라 차단 회피
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.naver.com/",
}


async def _fetch_one(
    client: httpx.AsyncClient, seed: str, *, limit: int,
) -> List[str]:
    """단일 시드 자동완성 호출. 실패 시 빈 리스트."""
    seed_clean = (seed or "").strip()
    if not seed_clean or len(seed_clean) < 2:
        return []
    params = {"q": seed_clean, **_DEFAULT_PARAMS}
    try:
        resp = await client.get(NAVER_AC_URL, params=params, headers=_HEADERS)
        if resp.status_code != 200:
            return []
        data = resp.json()
    except Exception as e:
        logger.debug(f"[autocomplete] {seed_clean} 실패: {type(e).__name__}: {e}")
        return []

    items = data.get("items") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return []

    out: List[str] = []
    seen: Set[str] = set()
    seed_norm = seed_clean.replace(" ", "")
    for group in items:
        if not isinstance(group, list):
            continue
        for entry in group:
            # entry 형식: ["KW", [meta..]] 또는 단순 문자열 등 — 방어적 파싱
            kw = ""
            if isinstance(entry, list) and entry:
                first = entry[0]
                if isinstance(first, str):
                    kw = first.strip()
            elif isinstance(entry, str):
                kw = entry.strip()
            if not kw or len(kw) < 2:
                continue
            # 시드 자기 자신 제외
            if kw.replace(" ", "") == seed_norm:
                continue
            # dedup (공백 무시)
            key = kw.replace(" ", "").lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(kw)
            if len(out) >= limit:
                return out
    return out


async def collect_autocomplete(
    seeds: List[str],
    *,
    per_seed: int = 10,
    concurrency: int = 10,
    timeout: float = 5.0,
) -> Dict[str, List[str]]:
    """시드 N개의 자동완성 KW 를 동시 수집.

    Args:
        seeds: 시드 목록
        per_seed: 시드당 자동완성 KW 최대 개수
        concurrency: 동시 호출 수 (rate limit 보호)
        timeout: 시드당 timeout (s)

    Returns:
        { seed: [kw1, kw2, ...], ... }
    """
    sem = asyncio.Semaphore(concurrency)
    result: Dict[str, List[str]] = {}

    async with httpx.AsyncClient(timeout=timeout, http2=False) as client:
        async def _one(seed: str):
            async with sem:
                kws = await _fetch_one(client, seed, limit=per_seed)
                # rate limit 회피 — 시드당 최소 0.15s 간격
                await asyncio.sleep(0.15)
                return seed, kws

        tasks = [_one(s) for s in seeds if s and isinstance(s, str)]
        for fut in asyncio.as_completed(tasks):
            try:
                seed, kws = await fut
                result[seed] = kws
            except Exception as e:
                logger.warning(f"[autocomplete] task 실패: {type(e).__name__}: {e}")
    return result
