"""
블로그 발행 이력 수집.

지수는 "측정한 날"만 존재하지만, 글 발행일은 블로그가 스스로 들고 있는 과거 기록이다.
네이버 글목록 API(PostTitleListAsync)를 끝까지 넘기면 개설 이후 전체 발행일을 얻는다.
→ "언제부터 활동이 늘었나"를 지수 측정 이전 구간까지 실제 데이터로 그릴 수 있다.

여기서 과거 지수를 역산하지는 않는다. 방문자·이웃의 과거값이 존재하지 않아
발행량 하나로 점수를 만들면 그건 발행량을 지수라고 칠하는 것이기 때문이다.

응답 예:
    {"resultCode":"S","totalCount":"1336","postList":[{"logNo":"...","addDate":"2026. 7. 20."}, ...]}
addDate 는 최근 글이면 "2시간 전" 같은 상대 표기로 온다.
"""
import asyncio
import json
import logging
import re
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional
from urllib.parse import unquote_plus

logger = logging.getLogger(__name__)

LIST_URL = "https://blog.naver.com/PostTitleListAsync.naver"
PER_PAGE = 30           # 30 초과를 넘기면 네이버가 5로 깎아버린다 (실측)
MAX_PAGES = 120         # 최대 3,600개까지 (그 이상은 truncated 로 표시)
CONCURRENCY = 4
TIME_BUDGET_SECONDS = 25.0

_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


def _parse_add_date(raw: str, today: Optional[date] = None) -> Optional[str]:
    """네이버 addDate → 'YYYY-MM-DD'. 상대 표기와 절대 표기를 모두 받는다."""
    if not raw:
        return None
    today = today or datetime.now().date()
    s = raw.strip()

    m = re.match(r"^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?$", s)
    if m:
        y, mo, d = (int(g) for g in m.groups())
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            return None

    if "분 전" in s or "시간 전" in s or "방금" in s:
        return today.isoformat()
    if s.startswith("어제"):
        return (today - timedelta(days=1)).isoformat()
    m = re.match(r"^(\d+)일 전", s)
    if m:
        return (today - timedelta(days=int(m.group(1)))).isoformat()
    return None


def _extract(text: str) -> Dict:
    """응답에서 발행일·총 개수·제목을 뽑는다.

    제목까지 가져오는 이유: 이 블로그가 '무엇에 대해 쓰는 블로그인지'를 알 수 있는
    가장 확실한 신호다. 그게 없으면 대출 블로그에 '왕십리맛집'을 추천하게 된다.
    """
    dates = [d for d in (_parse_add_date(x) for x in re.findall(r'"addDate":"([^"]*)"', text)) if d]
    titles = []
    for raw in re.findall(r'"title":"([^"]*)"', text):
        try:
            titles.append(unquote_plus(raw))
        except Exception:
            continue
    total_m = re.search(r'"totalCount":"?(\d+)', text)
    return {
        "dates": dates,
        "titles": titles,
        "total": int(total_m.group(1)) if total_m else None,
    }


# 주제와 무관하게 아무 블로그 제목에나 나오는 말들
_STOPWORDS = {
    "추천", "후기", "정리", "방법", "가격", "비용", "이유", "차이", "총정리", "리뷰",
    "안내", "소개", "선택", "사용", "확인", "진행", "가능", "필요", "그리고", "하지만",
    "오늘", "요즘", "최근", "여기", "저기", "이것", "그것", "우리", "제가", "저는",
    "합니다", "했습니다", "입니다", "하는", "있는", "없는", "위한", "관련", "대해",
}


def extract_topic_terms(titles: List[str], top_n: int = 25) -> List[str]:
    """제목들에서 이 블로그의 주제어를 뽑는다 (빈도 기반, 형태소 분석기 없이).

    2글자 이상 한글 덩어리만 센다. 완벽한 주제 분류가 아니라
    '이 블로그가 반복해서 쓰는 말'을 찾는 것이 목적이다.
    """
    from collections import Counter
    counter: "Counter[str]" = Counter()
    for t in titles:
        for tok in re.findall(r"[가-힣]{2,}", t or ""):
            if tok in _STOPWORDS or len(tok) > 12:
                continue
            counter[tok] += 1
    # 한 번만 나온 말은 주제어가 아니라 그날의 소재다
    return [w for w, c in counter.most_common(top_n * 3) if c >= 2][:top_n]


async def fetch_posting_history(blog_id: str, max_pages: int = MAX_PAGES) -> Dict:
    """전체 발행 이력을 일자별 건수로 집계해 돌려준다."""
    import httpx

    headers = {"User-Agent": _UA, "Referer": f"https://blog.naver.com/{blog_id}"}
    params_base = {
        "blogId": blog_id,
        "viewdate": "",
        "categoryNo": "",
        "parentCategoryNo": "",
        "countPerPage": PER_PAGE,
    }

    result: Dict = {
        "blog_id": blog_id,
        "daily": [],
        "total_posts": None,
        "collected": 0,
        "first_post_date": None,
        "last_post_date": None,
        "truncated": False,
        "topic_terms": [],
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0),
                                 follow_redirects=True) as client:
        async def get_page(page: int) -> Dict:
            try:
                r = await client.get(LIST_URL, params={**params_base, "currentPage": page},
                                     headers=headers)
                if r.status_code != 200:
                    return {"dates": [], "total": None}
                return _extract(r.text)
            except Exception as e:
                logger.debug(f"[posting-history] page {page} failed for {blog_id}: {e}")
                return {"dates": [], "total": None}

        first = await get_page(1)
        if not first["dates"] and not first["total"]:
            return result

        total = first["total"] or len(first["dates"])
        result["total_posts"] = total

        pages_needed = max(1, -(-total // PER_PAGE))  # ceil
        if pages_needed > max_pages:
            pages_needed = max_pages
            result["truncated"] = True

        all_dates: List[str] = list(first["dates"])
        all_titles: List[str] = list(first.get("titles") or [])

        # 시간 예산 — Fly → 네이버는 로컬보다 훨씬 느릴 수 있다. 45페이지를 끝까지
        # 기다리다 요청이 통째로 타임아웃되느니, 모은 만큼만 주고 truncated 를 세운다.
        deadline = asyncio.get_event_loop().time() + TIME_BUDGET_SECONDS
        batch = CONCURRENCY * 3

        for start in range(2, pages_needed + 1, batch):
            if asyncio.get_event_loop().time() > deadline:
                result["truncated"] = True
                logger.info(f"[posting-history] time budget hit for {blog_id} at page {start}")
                break
            chunk = range(start, min(start + batch, pages_needed + 1))
            sem = asyncio.Semaphore(CONCURRENCY)

            async def guarded(page: int):
                async with sem:
                    return await get_page(page)

            for p in await asyncio.gather(*(guarded(i) for i in chunk)):
                all_dates.extend(p["dates"])
                all_titles.extend(p.get("titles") or [])

    if not all_dates:
        return result

    counts: Dict[str, int] = {}
    for d in all_dates:
        counts[d] = counts.get(d, 0) + 1

    daily = [{"date": d, "count": c} for d, c in sorted(counts.items())]
    result["daily"] = daily
    result["collected"] = len(all_dates)
    result["first_post_date"] = daily[0]["date"]
    result["last_post_date"] = daily[-1]["date"]
    result["topic_terms"] = extract_topic_terms(all_titles)
    return result


# ===== 캐시 =====
# 45페이지를 매번 긁으면 분석 화면이 느려진다. 발행 이력은 하루 단위로 충분하다.
CACHE_TTL_HOURS = 12


def _cache_conn():
    from database.blog_index_history_db import _connect
    conn = _connect()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS posting_history_cache (
            blog_id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    return conn


def read_cache(blog_id: str) -> Optional[Dict]:
    try:
        conn = _cache_conn()
        try:
            row = conn.execute(
                "SELECT payload, fetched_at FROM posting_history_cache WHERE blog_id = ?",
                (blog_id,),
            ).fetchone()
        finally:
            conn.close()
        if not row:
            return None
        fetched = datetime.fromisoformat(str(row["fetched_at"]).replace("Z", ""))
        if datetime.now() - fetched > timedelta(hours=CACHE_TTL_HOURS):
            return None
        payload = json.loads(row["payload"])
        # 주제어가 없는 캐시는 이 기능이 생기기 전에 저장된 것이다.
        # 그대로 쓰면 주제 필터가 조용히 꺼진 채로 돌아가므로 낡은 것으로 취급한다.
        if "topic_terms" not in payload:
            return None
        payload["cached"] = True
        return payload
    except Exception as e:
        logger.debug(f"[posting-history] cache read failed for {blog_id}: {e}")
        return None


def write_cache(blog_id: str, payload: Dict) -> None:
    try:
        conn = _cache_conn()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO posting_history_cache (blog_id, payload, fetched_at) "
                "VALUES (?, ?, CURRENT_TIMESTAMP)",
                (blog_id, json.dumps(payload, ensure_ascii=False)),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        logger.debug(f"[posting-history] cache write failed for {blog_id}: {e}")


async def get_posting_history(blog_id: str, force: bool = False) -> Dict:
    if not force:
        cached = await asyncio.to_thread(read_cache, blog_id)
        if cached:
            return cached
    payload = await fetch_posting_history(blog_id)
    if payload.get("daily"):
        await asyncio.to_thread(write_cache, blog_id, payload)
    payload["cached"] = False
    return payload
