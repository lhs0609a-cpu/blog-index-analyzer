"""
사이트 방문 통계 (자체 수집).

왜 자체 수집인가:
외부 애널리틱스를 붙이면 광고차단기에 막히고, 관리자 화면에서 우리 데이터와
합쳐 보기도 어렵다. 페이지뷰 한 줄 쌓는 건 비용이 거의 없으므로 직접 만든다.

⚠️ 개인정보: 원본 IP 를 저장하지 않는다. 고유 방문자를 세려면 식별자가 필요한데,
IP 를 그대로 두면 그 자체가 개인정보다. **날짜별 소금(salt)** 을 섞어 해시하므로
같은 사람도 날짜가 바뀌면 다른 값이 되고, 해시에서 IP 를 되돌릴 수 없다.
그래서 "오늘의 고유 방문자"는 셀 수 있어도 사람을 추적할 수는 없다.

⚠️ 봇: 크롤러는 JS 를 실행하지 않으므로 브라우저 비컨 방식이면 대부분 자동으로
걸러진다. 그래도 UA 로 한 번 더 거르고, 봇 트래픽은 지우지 않고 표시만 해둔다
(구글·네이버 크롤러가 실제로 오는지 보는 것도 SEO 관점에서 정보다).
"""
import hashlib
import logging
import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

if sys.platform == "win32":
    _DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "site_analytics.db")
else:
    _DEFAULT_PATH = "/data/site_analytics.db"

ANALYTICS_DB_PATH = os.environ.get("ANALYTICS_DB_PATH", _DEFAULT_PATH)

KST = timezone(timedelta(hours=9))

# 해시 소금. 환경변수로 주면 그걸 쓰고, 없으면 프로세스 기동 시 고정값 사용.
# 날짜와 함께 섞으므로 하루가 지나면 같은 방문자도 다른 해시가 된다.
_SALT = os.environ.get("ANALYTICS_SALT", "blank-analytics")

_BOT_UA = (
    "bot", "spider", "crawl", "slurp", "yeti", "googlebot", "bingbot",
    "duckduck", "baidu", "yandex", "facebookexternalhit", "headless",
    "python-requests", "curl", "wget", "axios", "go-http", "java/",
)


def _connect() -> sqlite3.Connection:
    d = os.path.dirname(ANALYTICS_DB_PATH)
    if d and not os.path.exists(d):
        os.makedirs(d, exist_ok=True)
    conn = sqlite3.connect(ANALYTICS_DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_analytics_db() -> None:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS pageviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                day TEXT NOT NULL,             -- KST 기준 YYYY-MM-DD (집계 축)
                ts TIMESTAMP NOT NULL,
                path TEXT NOT NULL,
                referrer_host TEXT,            -- 유입 출처 도메인만 (전체 URL 저장 안 함)
                visitor_hash TEXT NOT NULL,    -- 날짜별 소금 해시 — 역추적 불가
                is_bot INTEGER NOT NULL DEFAULT 0,
                user_id TEXT,
                device TEXT
            )
        """)
        for ddl in (
            "CREATE INDEX IF NOT EXISTS idx_pv_day ON pageviews(day)",
            "CREATE INDEX IF NOT EXISTS idx_pv_day_visitor ON pageviews(day, visitor_hash)",
            "CREATE INDEX IF NOT EXISTS idx_pv_path ON pageviews(day, path)",
            "CREATE INDEX IF NOT EXISTS idx_pv_ref ON pageviews(day, referrer_host)",
        ):
            cur.execute(ddl)
        conn.commit()
        logger.info(f"[analytics] initialized at {ANALYTICS_DB_PATH}")
    finally:
        conn.close()


def is_bot(user_agent: str) -> bool:
    ua = (user_agent or "").lower()
    return any(b in ua for b in _BOT_UA)


def visitor_hash(ip: str, user_agent: str, day: str) -> str:
    """
    날짜별 소금 해시. 같은 사람도 날짜가 바뀌면 값이 달라지고,
    해시에서 IP 를 복원할 수 없다.
    """
    raw = f"{_SALT}|{day}|{ip}|{(user_agent or '')[:120]}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def referrer_host(referrer: str) -> Optional[str]:
    """전체 URL 이 아니라 호스트만 남긴다 — 유입 경로 파악에는 그걸로 충분하다."""
    if not referrer:
        return None
    try:
        host = urlparse(referrer).hostname or ""
    except Exception:
        return None
    host = host.lower().removeprefix("www.")
    return host or None


def record_pageview(
    path: str,
    ip: str,
    user_agent: str,
    referrer: str = "",
    user_id: Optional[str] = None,
    device: Optional[str] = None,
) -> None:
    now = datetime.now(KST)
    day = now.strftime("%Y-%m-%d")
    # 쿼리스트링은 버린다 — 경로별 집계가 목적이고, 쿼리에 개인정보가 실릴 수 있다.
    clean_path = (path or "/").split("?")[0][:200]
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO pageviews (day, ts, path, referrer_host, visitor_hash, is_bot, user_id, device) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (
                day,
                now.isoformat(),
                clean_path,
                referrer_host(referrer),
                visitor_hash(ip, user_agent, day),
                1 if is_bot(user_agent) else 0,
                (user_id or None),
                (device or None),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def _range_days(days: int) -> List[str]:
    today = datetime.now(KST).date()
    return [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days - 1, -1, -1)]


def summary(days: int = 30, include_bots: bool = False) -> Dict[str, Any]:
    """관리자 대시보드용 집계."""
    init_analytics_db()
    day_list = _range_days(days)
    start = day_list[0]
    bot_clause = "" if include_bots else " AND is_bot = 0"

    conn = _connect()
    try:
        cur = conn.cursor()

        # 일별 추이
        cur.execute(
            f"SELECT day, COUNT(*) pv, COUNT(DISTINCT visitor_hash) uv "
            f"FROM pageviews WHERE day >= ?{bot_clause} GROUP BY day ORDER BY day",
            (start,),
        )
        by_day = {r["day"]: {"pv": r["pv"], "uv": r["uv"]} for r in cur.fetchall()}
        daily = [
            {"day": d, "pv": by_day.get(d, {}).get("pv", 0), "uv": by_day.get(d, {}).get("uv", 0)}
            for d in day_list
        ]

        def window(n: int) -> Dict[str, int]:
            s = _range_days(n)[0]
            cur.execute(
                f"SELECT COUNT(*) pv, COUNT(DISTINCT visitor_hash) uv "
                f"FROM pageviews WHERE day >= ?{bot_clause}",
                (s,),
            )
            r = cur.fetchone()
            return {"pv": r["pv"] or 0, "uv": r["uv"] or 0}

        today_s = day_list[-1]
        cur.execute(
            f"SELECT COUNT(*) pv, COUNT(DISTINCT visitor_hash) uv "
            f"FROM pageviews WHERE day = ?{bot_clause}",
            (today_s,),
        )
        r = cur.fetchone()
        today = {"pv": r["pv"] or 0, "uv": r["uv"] or 0}

        # 인기 페이지
        cur.execute(
            f"SELECT path, COUNT(*) pv, COUNT(DISTINCT visitor_hash) uv "
            f"FROM pageviews WHERE day >= ?{bot_clause} "
            f"GROUP BY path ORDER BY pv DESC LIMIT 20",
            (start,),
        )
        top_paths = [dict(r) for r in cur.fetchall()]

        # 유입 경로 — SEO 성과를 보는 핵심 지표
        cur.execute(
            f"SELECT COALESCE(referrer_host,'(직접/북마크)') host, COUNT(*) pv, "
            f"COUNT(DISTINCT visitor_hash) uv FROM pageviews WHERE day >= ?{bot_clause} "
            f"GROUP BY host ORDER BY pv DESC LIMIT 20",
            (start,),
        )
        top_referrers = [dict(r) for r in cur.fetchall()]

        # 봇 트래픽 — 크롤러가 실제로 오는지 (SEO 관점에서 정보)
        cur.execute(
            "SELECT COUNT(*) pv FROM pageviews WHERE day >= ? AND is_bot = 1", (start,)
        )
        bot_pv = cur.fetchone()["pv"] or 0

        return {
            "range_days": days,
            "today": today,
            "last_7d": window(7),
            "last_30d": window(30),
            "daily": daily,
            "top_paths": top_paths,
            "top_referrers": top_referrers,
            "bot_pageviews": bot_pv,
            "generated_at": datetime.now(KST).isoformat(),
        }
    finally:
        conn.close()


def prune(keep_days: int = 400) -> int:
    """오래된 원본 로그 정리. 디스크가 10GB 라 여유는 있지만 무한 증가는 막는다."""
    cutoff = (datetime.now(KST) - timedelta(days=keep_days)).strftime("%Y-%m-%d")
    conn = _connect()
    try:
        cur = conn.execute("DELETE FROM pageviews WHERE day < ?", (cutoff,))
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()
