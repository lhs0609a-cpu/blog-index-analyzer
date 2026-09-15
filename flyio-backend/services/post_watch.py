"""
새 글 누락 감시 — 판정과 한 주기 처리. docs/POST_EXPOSURE_WATCH_SPEC.md.

판정: 실제 블로그탭 검색 결과 링크에서 블로그 ID와 logNo를 확인한다.
API는 비교 진단에만 사용한다. 검색 미발견은 누락의 증거가 아니다.

오탐 누락 알림이 제일 큰 신뢰 손실이다. 그래서 확신이 없으면 누락이 아니라
unmeasurable 로 빼고, API 오류는 누락으로 세지 않는다.
"""
import asyncio
import logging
import os
import re
from html import unescape
from urllib.parse import urlparse
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import httpx

from database import post_watch_db as db

logger = logging.getLogger(__name__)

# 게시 시각 기준 확인 시점. 마지막이 누락 판정 시점이다.
CHECKPOINTS = (timedelta(hours=1), timedelta(hours=6), timedelta(hours=24), timedelta(hours=72))
DELAYED_AFTER = timedelta(hours=24)
MISSING_AFTER = CHECKPOINTS[-1]

# 정제 후 이보다 짧은 제목은 정확매칭의 변별력이 없다
MIN_TITLE_LEN = 6
SEARCH_DISPLAY = 30
# API 오류가 이만큼 이어지면 판정을 포기한다
MAX_FAILS = 3
RETRY_AFTER = timedelta(minutes=30)

DAILY_API_CAP = int(os.environ.get("POST_WATCH_DAILY_API_CAP", "3000"))
CHECK_BATCH = int(os.environ.get("POST_WATCH_CHECK_BATCH", "50"))
CHECK_SPACING_SECONDS = float(os.environ.get("POST_WATCH_CHECK_SPACING", "1.0"))
RSS_SPACING_SECONDS = float(os.environ.get("POST_WATCH_RSS_SPACING", "2.0"))

_LOG_NO_QUERY = re.compile(r"[?&]logNo=(\d+)")
_LOG_NO_PATH = re.compile(r"blog\.naver\.com/([A-Za-z0-9_-]+)/(\d+)")


def extract_log_no(url: str, blog_id: Optional[str] = None) -> Optional[str]:
    """글 URL 에서 logNo. blog_id 가 주어지면 그 블로그의 글일 때만 돌려준다.

    형식: blog.naver.com/{id}/{logNo}[?fromRss=...], PostView.naver?blogId=..&logNo=..,
    m.blog.naver.com/{id}/{logNo}
    """
    if not url:
        return None
    parsed = urlparse(unescape(url))
    if parsed.scheme not in ('http', 'https') or parsed.hostname not in ('blog.naver.com', 'm.blog.naver.com'):
        return None
    url = unescape(url)
    m = _LOG_NO_PATH.search(url)
    if m:
        if blog_id and m.group(1).lower() != blog_id.lower():
            return None
        return m.group(2)
    m = _LOG_NO_QUERY.search(url)
    if m:
        if blog_id:
            bm = re.search(r"[?&]blogId=([A-Za-z0-9_-]+)", url)
            if not bm or bm.group(1).lower() != blog_id.lower():
                return None
        return m.group(1)
    return None


def clean_title(title: str) -> str:
    # Preserve the full title: truncation can turn a unique title into a generic query.
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', unescape(title or ''))).strip()


def first_check_at(published_at: datetime, now: datetime) -> Tuple[str, Optional[datetime]]:
    """새로 잡힌 글의 (status, next_check_at).

    72시간이 이미 지난 글은 감시 전의 글이다 — baseline 으로 넣고 확인하지 않는다.
    """
    elapsed = now - published_at
    if elapsed >= MISSING_AFTER:
        return "baseline", None
    return "pending", _next_checkpoint(published_at, elapsed)


def _next_checkpoint(published_at: datetime, elapsed: timedelta) -> datetime:
    for cp in CHECKPOINTS:
        if cp > elapsed:
            return published_at + cp
    return published_at + MISSING_AFTER


def transition(post: Dict, published_at: datetime, now: datetime,
               found: Optional[bool], rank: Optional[int]) -> Dict:
    """한 번 확인한 결과로 바뀔 필드. found=None 은 API 오류(판정 없음)."""
    if found is None:
        fails = (post.get("fail_count") or 0) + 1
        if fails >= MAX_FAILS:
            return {"fail_count": fails, "status": "unmeasurable", "next_check_at": None,
                    "last_checked_at": now}
        return {"fail_count": fails, "next_check_at": now + RETRY_AFTER, "last_checked_at": now}

    update = {"checks_done": (post.get("checks_done") or 0) + 1, "fail_count": 0,
              "last_checked_at": now}
    if found:
        update.update(status="indexed", indexed_at=now, first_rank=rank, next_check_at=None)
        return update

    elapsed = now - published_at
    if elapsed >= MISSING_AFTER:
        update.update(status="unmeasurable", next_check_at=None)
    else:
        update.update(
            status="delayed" if elapsed >= DELAYED_AFTER else "pending",
            next_check_at=_next_checkpoint(published_at, elapsed),
        )
    return update


def find_post_rank(items: List[Dict], blog_id: str, log_no: str) -> Optional[int]:
    """검색 결과에서 그 글(logNo)의 순위. 같은 블로그의 다른 글은 치지 않는다."""
    for i, item in enumerate(items, 1):
        if extract_log_no(item.get("link", ""), blog_id) == log_no:
            return i
    return None


async def check_post_api(title: str, blog_id: str, log_no: str,
                             client: httpx.AsyncClient) -> Tuple[Optional[bool], Optional[int], Optional[str]]:
    """(found, rank, error). found=None 이면 판정 불가(오류)."""
    from services.rank_checker import _resolve_naver_creds

    cid, csec = _resolve_naver_creds()
    if not cid or not csec:
        return None, None, "no_credentials"
    query = clean_title(title)
    if len(query) < MIN_TITLE_LEN:
        return None, None, "title_too_short"
    try:
        resp = await client.get(
            "https://openapi.naver.com/v1/search/blog.json",
            params={"query": f'"{query}"', "display": SEARCH_DISPLAY, "start": 1, "sort": "sim"},
            headers={"X-Naver-Client-Id": cid, "X-Naver-Client-Secret": csec},
        )
    except Exception as e:
        return None, None, f"request:{type(e).__name__}"
    finally:
        await asyncio.to_thread(db.budget_add, 1)
    if resp.status_code != 200:
        return None, None, f"http_{resp.status_code}"
    try:
        items = resp.json()['items']
        if not isinstance(items, list) or any(not isinstance(i, dict) for i in items):
            raise ValueError('invalid items')
        rank = find_post_rank(items, blog_id, log_no)
    except (ValueError, KeyError, TypeError):
        return None, None, 'invalid_api_response'
    return rank is not None, rank, None


def search_result_links(html: str) -> List[Dict]:
    """Only rendered anchors inside the search results; ignore script/metadata matches."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')
    root = soup.select_one('#main_pack')
    if root is None:
        return []
    links, seen = [], set()
    for a in root.select('a[href]'):
        if a.find_parent(['script', 'style', 'template']) or a.get('aria-hidden') == 'true':
            continue
        href = a['href']
        number = extract_log_no(href)
        if number and number not in seen and a.get_text(strip=True):
            seen.add(number)
            links.append({'link': href})
    return links


async def check_post_indexed(title: str, blog_id: str, log_no: str,
                             client: httpx.AsyncClient) -> Tuple[Optional[bool], Optional[int], Optional[str]]:
    """Actual blog search is the evidence source. Absence is never proof of deindexing."""
    query = clean_title(title)
    if len(query) < MIN_TITLE_LEN:
        return None, None, 'title_too_short'
    errors = []
    for q in (query, f'"{query}"'):
        try:
            await asyncio.to_thread(db.budget_add, 1)
            resp = await client.get('https://search.naver.com/search.naver',
                                    params={'where': 'blog', 'query': q},
                                    headers={'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ko-KR,ko;q=0.9'})
            if resp.status_code != 200:
                errors.append(f'serp_http_{resp.status_code}')
                continue
            links = search_result_links(resp.text)
            rank = find_post_rank(links, blog_id, log_no)
            if rank is not None:
                # Link order is not a reliable visual rank (cards can contain multiple anchors).
                return True, None, None
            errors.append('serp_not_found' if links else 'serp_unrecognized_or_blocked')
        except (httpx.HTTPError, ValueError) as exc:
            errors.append(f'serp_request:{type(exc).__name__}')
    return None, None, ';'.join(errors)


def _parse_iso(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


# ===== 한 주기 =====

async def poll_blog(blog_id: str, now: Optional[datetime] = None) -> Dict:
    """RSS 를 읽어 새 글을 넣고, RSS 에서 사라진 미결 글을 removed 로 닫는다."""
    from routers.content_lifespan import fetch_blog_posts_via_rss

    now = now or datetime.now(timezone.utc)
    posts = await fetch_blog_posts_via_rss(blog_id)
    await asyncio.to_thread(db.record_rss_result, blog_id, bool(posts))
    if not posts:
        return {"blog_id": blog_id, "rss": "empty_or_failed", "new": 0}

    known = await asyncio.to_thread(db.known_log_nos, blog_id)
    seen, oldest, new = set(), None, 0
    for p in posts:
        log_no = extract_log_no(p.get("link", ""), blog_id)
        pub = p.get("pubDate")
        if not log_no or not isinstance(pub, datetime):
            continue
        pub = pub.astimezone(timezone.utc)
        seen.add(log_no)
        oldest = pub if oldest is None or pub < oldest else oldest
        if log_no in known:
            continue
        if len(clean_title(p.get("title", ""))) < MIN_TITLE_LEN:
            status, next_at = "unmeasurable", None
        else:
            status, next_at = first_check_at(pub, now)
        inserted = await asyncio.to_thread(
            db.insert_post, blog_id, log_no, p.get("title", ""), p.get("link", ""), pub, status, next_at
        )
        new += int(inserted and status == "pending")

    # RSS omission alone cannot establish deletion/privacy; keep checking the post.
    removed = 0
    return {"blog_id": blog_id, "rss": "ok", "new": new, "removed": removed}


async def poll_all() -> Dict:
    blog_ids = await asyncio.to_thread(db.list_active_blog_ids)
    total_new = 0
    for bid in blog_ids:
        try:
            r = await poll_blog(bid)
            total_new += r.get("new", 0)
        except Exception as e:
            logger.warning(f"[post-watch] rss {bid} failed: {e}")
        await asyncio.sleep(RSS_SPACING_SECONDS)
    return {"blogs": len(blog_ids), "new": total_new}


async def check_due(now: Optional[datetime] = None) -> Dict:
    # Shared SQLite lease also covers manual runs in the separate API process.
    owner = await asyncio.to_thread(db.acquire_check_lease)
    if owner is None:
        return {'checked': 0, 'already_running': True}
    try:
        return await asyncio.wait_for(_check_due(now), timeout=600)
    finally:
        await asyncio.to_thread(db.release_check_lease, owner)


async def _check_due(now: Optional[datetime] = None) -> Dict:
    now = now or datetime.now(timezone.utc)
    used = await asyncio.to_thread(db.budget_used_today)
    room = DAILY_API_CAP - used
    if room <= 0:
        logger.info(f"[post-watch] daily API cap reached ({used}/{DAILY_API_CAP})")
        return {"checked": 0, "cap_reached": True}

    due = await asyncio.to_thread(db.due_posts, now, min(CHECK_BATCH, room // 2))
    counts = {"checked": 0, "indexed": 0, "delayed": 0, "missing": 0, "errors": 0}
    async with httpx.AsyncClient(timeout=15.0) as client:
        for post in due:
            found, rank, error = await check_post_indexed(post["title"], post["blog_id"], post["log_no"], client)
            checked_at = datetime.now(timezone.utc)
            update = transition(post, _parse_iso(post["published_at"]), checked_at, found, rank)
            await asyncio.to_thread(db.log_check, post["id"], found, rank, error)
            await asyncio.to_thread(db.apply_update, post["id"], update)
            counts["checked"] += 1
            if found is None:
                counts["errors"] += 1
            elif update.get("status") in ("indexed", "delayed", "missing"):
                counts[update["status"]] += 1
            await asyncio.sleep(CHECK_SPACING_SECONDS)
    return counts
