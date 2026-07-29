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


# ===== 자모 접두사 확장 =====
# 네이버 자동완성은 접두사가 1글자만 달라져도 **완전히 다른 결과 집합**을 준다.
# 시드를 그대로 던지면 7~10개에서 끝나지만, 초성 자모를 붙여 14번 물으면 그 10배가 나온다.
#
# 2026-07-29 실측 (질의당 신규 KW):
#   A 시드 그대로   1회  → 7.0
#   B 시드+자모     14회 → 9.9 / 3.1   ← 주력
#   C 시드+공백+자모 14회 → 2.4 / 0.1   ← 시드 편차 큼
#   D 시드+가나다    14회 → 3.8 / 0.1   ← 시드 편차 큼
#   E 시드+공백+가나다     → 0.1 / 0.0  ← 버림
# 예: "리프팅" 7개 → 자모 확장 140개(20배).
# 해울 두통에서 "완전포화" 판정을 뒤집은 기법이 이것이다(클린우주 7,080→19,841).
_CHOSUNG = "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ"
_GANADA = "가나다라마바사아자차카타파하"

# B 가 이 정도 못 내면 좁은 시드로 보고 C/D 를 건너뛴다 (호출비 낭비 방지)
_BROAD_SEED_THRESHOLD = 60


def build_jamo_variants(seed: str, *, tier: int = 1) -> List[str]:
    """시드의 자동완성 질의 변형 목록.

    tier 1 = B(자모 붙임) 14개, tier 2 = B + C + D 42개.
    시드 자신은 포함하지 않는다 (호출부가 따로 조회).
    """
    s = (seed or "").strip()
    if not s:
        return []
    out = [f"{s}{c}" for c in _CHOSUNG]
    if tier >= 2:
        out += [f"{s} {c}" for c in _CHOSUNG]
        out += [f"{s}{c}" for c in _GANADA]
    return out


async def collect_autocomplete_expanded(
    seeds: List[str],
    *,
    per_seed: int = 30,
    concurrency: int = 10,
    timeout: float = 5.0,
    adaptive: bool = True,
) -> Dict[str, List[str]]:
    """자모 접두사까지 확장해 자동완성을 수집한다.

    시드 그대로만 묻는 collect_autocomplete 의 상위 버전. 질의 수는 시드당
    15배(tier1)~43배(tier2)로 늘지만 수확은 그 이상으로 늘어난다.

    adaptive=True 면 tier1 수확이 _BROAD_SEED_THRESHOLD 이상인 넓은 시드에만
    tier2 를 추가로 돌린다.

    Returns: { 원본시드: [kw, ...] } — 변형별로 쪼개지 않고 시드 단위로 합쳐서 준다.
    """
    valid = [s for s in seeds if s and isinstance(s, str) and len(s.strip()) >= 2]
    if not valid:
        return {}

    # 1차: 시드 자신 + tier1 변형
    queries: List[str] = []
    owner: Dict[str, str] = {}   # 질의 → 원본 시드
    for s in valid:
        s = s.strip()
        for q in [s] + build_jamo_variants(s, tier=1):
            if q not in owner:
                owner[q] = s
                queries.append(q)

    raw = await collect_autocomplete(
        queries, per_seed=per_seed, concurrency=concurrency, timeout=timeout
    )

    merged: Dict[str, Set[str]] = {s.strip(): set() for s in valid}
    for q, kws in raw.items():
        src = owner.get(q)
        if src is not None:
            merged[src].update(kws)

    # 2차: 넓은 시드만 tier2 추가
    if adaptive:
        broad = [s for s, kws in merged.items() if len(kws) >= _BROAD_SEED_THRESHOLD]
        if broad:
            q2: List[str] = []
            owner2: Dict[str, str] = {}
            for s in broad:
                for q in build_jamo_variants(s, tier=2):
                    if q not in owner and q not in owner2:
                        owner2[q] = s
                        q2.append(q)
            if q2:
                raw2 = await collect_autocomplete(
                    q2, per_seed=per_seed, concurrency=concurrency, timeout=timeout
                )
                for q, kws in raw2.items():
                    src = owner2.get(q)
                    if src is not None:
                        merged[src].update(kws)
            logger.info(f"[autocomplete] tier2 확장: 넓은 시드 {len(broad)}개 → 질의 {len(q2)}회")

    return {s: sorted(kws) for s, kws in merged.items()}


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
