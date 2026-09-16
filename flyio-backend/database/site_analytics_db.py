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
import json
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
        # 퍼널 이벤트.
        #
        # 페이지뷰만으로는 "가입 페이지까지 왔는데 왜 안 했는지"를 영원히 알 수 없다.
        # 눌렀는지·제출했는지·무엇 때문에 실패했는지는 페이지 이동을 남기지 않기 때문이다.
        # reason 을 별도 칼럼으로 뽑아둔 이유: 실패 사유별 집계가 이 테이블의 존재 이유라
        # JSON 안에 묻어두면 매번 파싱해야 한다.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                day TEXT NOT NULL,             -- KST 기준 YYYY-MM-DD
                ts TIMESTAMP NOT NULL,
                name TEXT NOT NULL,            -- signup_submit, checkout_start ...
                path TEXT,
                visitor_hash TEXT NOT NULL,    -- pageviews 와 같은 규칙 (날짜별 소금)
                user_id TEXT,
                device TEXT,
                is_bot INTEGER NOT NULL DEFAULT 0,
                reason TEXT,                   -- 실패 사유 코드 (성공 이벤트면 NULL)
                props TEXT                     -- 부가 정보 JSON
            )
        """)
        for ddl in (
            "CREATE INDEX IF NOT EXISTS idx_pv_day ON pageviews(day)",
            "CREATE INDEX IF NOT EXISTS idx_pv_day_visitor ON pageviews(day, visitor_hash)",
            "CREATE INDEX IF NOT EXISTS idx_pv_path ON pageviews(day, path)",
            "CREATE INDEX IF NOT EXISTS idx_pv_ref ON pageviews(day, referrer_host)",
            "CREATE INDEX IF NOT EXISTS idx_ev_day_name ON events(day, name)",
            "CREATE INDEX IF NOT EXISTS idx_ev_day_name_visitor ON events(day, name, visitor_hash)",
            "CREATE INDEX IF NOT EXISTS idx_ev_reason ON events(day, name, reason)",
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
    _ensure_tables()
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


# 테이블이 있는지 프로세스당 한 번만 보장한다.
#
# 왜 필요한가: init_analytics_db 는 지금까지 summary() 안에서만 불렸다. 즉 새 볼륨에
# 배포하면 관리자가 통계 화면을 한 번 열기 전까지 기록이 통째로 버려졌다(라우터가
# 예외를 삼키므로 조용히). events 테이블은 기존 DB 에 나중에 추가된 것이라 같은
# 문제를 그대로 물려받는다. 기록 경로에서 한 번 보장하면 둘 다 없어진다.
_tables_ready = False


def _ensure_tables() -> None:
    global _tables_ready
    if _tables_ready:
        return
    init_analytics_db()
    _tables_ready = True


# 받아줄 이벤트 이름. 화이트리스트인 이유: /event 는 인증 없이 열려 있어서
# 아무 문자열이나 받으면 테이블이 쓰레기로 차고 집계가 의미를 잃는다.
FUNNEL_EVENTS = {
    # 가입
    "signup_form_start",      # 첫 입력칸에 커서를 놓은 순간 (폼을 '보기만' 한 사람과 가른다)
    "signup_submit",
    "signup_success",
    "signup_fail",
    "login_submit",
    "login_success",
    "login_fail",
    # 활성화
    "activation_first_run",   # 가입 후 첫 분석 실행 — 가치를 한 번이라도 본 시점
    # 한도 — 가입·결제를 만들어내는 자리
    #
    # 이 두 칸이 없어서 "무료 한도에 부딪힌 사람이 몇이고 그중 몇이 요금제로
    # 갔는가"를 물어볼 수단 자체가 없었다(UpgradeModal 에는 track 이 0개였다).
    # limit_hit 은 서버(middleware/usage_limit)가 남긴다 — 프런트가 무엇을
    # 빠뜨리든 분모는 남아야 한다. reason = guest | free | basic ...
    "limit_hit",
    "limit_cta_click",        # 한도 안내에서 가입/요금제 버튼을 실제로 누른 경우
    # 결제
    "pricing_plan_click",
    "checkout_blocked_anonymous",  # 비로그인 상태로 요금제 버튼을 눌러 로그인으로 튕긴 경우
    "checkout_consent_open",  # 체험 동의 모달이 열림
    "checkout_start",         # 동의하고 결제 화면으로 넘어감
    "payment_widget_open",    # 토스 결제창 호출
    "payment_widget_error",   # 결제창 자체가 안 뜸
    "payment_return_fail",    # 토스가 failUrl 로 돌려보냄 (reason = 토스 code)
    "payment_register_fail",  # 빌링키 등록/첫 결제가 서버에서 실패
    "payment_success",
}


def record_event(
    name: str,
    ip: str,
    user_agent: str,
    path: Optional[str] = None,
    user_id: Optional[str] = None,
    device: Optional[str] = None,
    reason: Optional[str] = None,
    props: Optional[Dict[str, Any]] = None,
) -> bool:
    """퍼널 이벤트 1건 기록. 화이트리스트에 없는 이름은 조용히 버린다."""
    if name not in FUNNEL_EVENTS:
        return False
    _ensure_tables()
    now = datetime.now(KST)
    day = now.strftime("%Y-%m-%d")
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO events (day, ts, name, path, visitor_hash, user_id, device, is_bot, reason, props) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                day,
                now.isoformat(),
                name,
                ((path or "").split("?")[0][:200] or None),
                visitor_hash(ip, user_agent, day),
                (user_id or None),
                (device or None),
                1 if is_bot(user_agent) else 0,
                (str(reason)[:200] if reason else None),
                json.dumps(props, ensure_ascii=False)[:1000] if props else None,
            ),
        )
        conn.commit()
        return True
    finally:
        conn.close()


def count_visitors(days: int, path_prefix: Optional[str] = None) -> int:
    """기간 내 고유 방문자 수(봇 제외). path_prefix 를 주면 그 경로를 본 사람만."""
    _ensure_tables()
    start = _range_days(days)[0]
    conn = _connect()
    try:
        if path_prefix:
            cur = conn.execute(
                "SELECT COUNT(DISTINCT visitor_hash) c FROM pageviews "
                "WHERE day >= ? AND is_bot = 0 AND path LIKE ?",
                (start, f"{path_prefix}%"),
            )
        else:
            cur = conn.execute(
                "SELECT COUNT(DISTINCT visitor_hash) c FROM pageviews WHERE day >= ? AND is_bot = 0",
                (start,),
            )
        return cur.fetchone()["c"] or 0
    finally:
        conn.close()


def count_event_visitors(days: int, names: List[str]) -> Dict[str, int]:
    """이벤트별 고유 방문자 수. 없는 이벤트도 0 으로 채워 돌려준다."""
    _ensure_tables()
    start = _range_days(days)[0]
    out = {n: 0 for n in names}
    if not names:
        return out
    placeholders = ",".join("?" for _ in names)
    conn = _connect()
    try:
        cur = conn.execute(
            f"SELECT name, COUNT(DISTINCT visitor_hash) c FROM events "
            f"WHERE day >= ? AND is_bot = 0 AND name IN ({placeholders}) GROUP BY name",
            (start, *names),
        )
        for r in cur.fetchall():
            out[r["name"]] = r["c"] or 0
        return out
    finally:
        conn.close()


def failure_reasons(days: int, name: str, limit: int = 12) -> List[Dict[str, Any]]:
    """실패 이벤트의 사유별 건수 — '왜 안 되는지'에 직접 답하는 유일한 데이터."""
    _ensure_tables()
    start = _range_days(days)[0]
    conn = _connect()
    try:
        cur = conn.execute(
            "SELECT COALESCE(reason,'(사유 미기록)') reason, COUNT(*) n, "
            "COUNT(DISTINCT visitor_hash) people FROM events "
            "WHERE day >= ? AND is_bot = 0 AND name = ? GROUP BY reason ORDER BY n DESC LIMIT ?",
            (start, name, limit),
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def event_daily(days: int, names: List[str]) -> List[Dict[str, Any]]:
    """일별 이벤트 추이 — 점수가 언제 꺾였는지 보려면 추세가 있어야 한다."""
    _ensure_tables()
    day_list = _range_days(days)
    start = day_list[0]
    if not names:
        return []
    placeholders = ",".join("?" for _ in names)
    conn = _connect()
    try:
        cur = conn.execute(
            f"SELECT day, name, COUNT(DISTINCT visitor_hash) c FROM events "
            f"WHERE day >= ? AND is_bot = 0 AND name IN ({placeholders}) GROUP BY day, name",
            (start, *names),
        )
        table: Dict[str, Dict[str, int]] = {}
        for r in cur.fetchall():
            table.setdefault(r["day"], {})[r["name"]] = r["c"] or 0
        return [
            {"day": d, **{n: table.get(d, {}).get(n, 0) for n in names}} for d in day_list
        ]
    finally:
        conn.close()


def device_split(days: int, names: List[str]) -> Dict[str, Dict[str, int]]:
    """기기별 이벤트 수. 모바일에서만 결제가 깨지는 경우를 잡아내려면 필요하다."""
    _ensure_tables()
    start = _range_days(days)[0]
    out: Dict[str, Dict[str, int]] = {n: {"mobile": 0, "desktop": 0} for n in names}
    if not names:
        return out
    placeholders = ",".join("?" for _ in names)
    conn = _connect()
    try:
        cur = conn.execute(
            f"SELECT name, COALESCE(device,'desktop') device, COUNT(DISTINCT visitor_hash) c "
            f"FROM events WHERE day >= ? AND is_bot = 0 AND name IN ({placeholders}) "
            f"GROUP BY name, device",
            (start, *names),
        )
        for r in cur.fetchall():
            bucket = "mobile" if r["device"] == "mobile" else "desktop"
            out.setdefault(r["name"], {"mobile": 0, "desktop": 0})[bucket] = r["c"] or 0
        return out
    finally:
        conn.close()


def pageview_device_split(days: int) -> Dict[str, int]:
    _ensure_tables()
    start = _range_days(days)[0]
    conn = _connect()
    try:
        cur = conn.execute(
            "SELECT COALESCE(device,'desktop') device, COUNT(DISTINCT visitor_hash) c "
            "FROM pageviews WHERE day >= ? AND is_bot = 0 GROUP BY device",
            (start,),
        )
        out = {"mobile": 0, "desktop": 0}
        for r in cur.fetchall():
            out["mobile" if r["device"] == "mobile" else "desktop"] = r["c"] or 0
        return out
    finally:
        conn.close()


def events_collected_since() -> Optional[str]:
    """이벤트 수집을 언제부터 했는지. 이전 기간 숫자를 0 으로 오해하지 않기 위해 필요."""
    _ensure_tables()
    conn = _connect()
    try:
        cur = conn.execute("SELECT MIN(day) d FROM events")
        row = cur.fetchone()
        return row["d"] if row else None
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
    _ensure_tables()
    cutoff = (datetime.now(KST) - timedelta(days=keep_days)).strftime("%Y-%m-%d")
    conn = _connect()
    try:
        n = conn.execute("DELETE FROM pageviews WHERE day < ?", (cutoff,)).rowcount
        n += conn.execute("DELETE FROM events WHERE day < ?", (cutoff,)).rowcount
        conn.commit()
        return n
    finally:
        conn.close()
