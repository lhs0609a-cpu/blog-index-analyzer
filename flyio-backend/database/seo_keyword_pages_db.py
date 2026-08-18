"""
프로그래매틱 SEO — 키워드 상세 페이지 캐시.

왜 필요한가:
"블로그 관련 무엇을 쳐도 우리가 나온다"는 설정으로 되는 게 아니라 페이지 수로 된다.
검색엔진은 쿼리 하나에 페이지 하나를 매칭하므로, 공개 페이지 21개로는 21개
쿼리군밖에 못 먹는다. 키워드마다 실측 데이터를 담은 페이지를 만들어야 한다.

왜 캐시가 필수인가:
페이지에 들어갈 데이터를 라이브로 만들면 키워드 1개당 21~26초가 걸린다
(serp-difficulty 21s + competition 26s, 프로덕션 실측). SSR 로는 불가능하고,
ISR revalidate 로도 첫 방문자가 그 시간을 다 기다린다. 게다가 1 CPU 머신에서
SERP 파싱은 이벤트루프를 굶겨 /health 까지 밀어버린다
(winner_keywords 가 이 방식으로 서비스를 멈춘 전례가 있다).
→ worker 가 미리 재서 여기 쌓고, API 는 읽기만 한다.

⚠️ 여기 담기는 내용은 전부 **사용자에게 보이는 본문**이다. 숨긴 텍스트로 쓰면
클로킹이 되어 색인에서 통째로 빠진다. 페이지마다 실제로 다른 실측값이 들어가야
구글의 scaled content abuse 정책에도 걸리지 않는다.
"""
import json
import logging
import os
import re
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

if sys.platform == "win32":
    _DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "seo_keyword_pages.db")
else:
    _DEFAULT_PATH = "/data/seo_keyword_pages.db"

SEO_PAGES_DB_PATH = os.environ.get("SEO_PAGES_DB_PATH", _DEFAULT_PATH)

KST = timezone(timedelta(hours=9))

# 이 기간이 지나면 다시 잰다. SERP 는 매일 바뀌므로 오래된 값을 그대로
# 페이지에 박아두면 "실측"이라는 주장 자체가 거짓이 된다.
FRESH_DAYS = 30

# 페이지로 내보낼 최소 기준. 이걸 못 넘긴 키워드는 색인시키지 않는다
# (얇은 페이지 대량 = scaled content abuse).
MIN_COMPETITORS_FOR_PUBLISH = 5

# 이 검색량 미만이면 아예 측정하지 않는다(state='skipped').
# 네이버 keywordstool 은 월 10회 미만을 "< 10" 문자열로 주고, 코드가 그걸 5 로
# 환산한다. 즉 10 미만 = 사실상 수요 없음. 키워드당 53초를 거기에 쓸 이유가 없다.
MIN_QUEUE_VOLUME = 10


def _connect() -> sqlite3.Connection:
    d = os.path.dirname(SEO_PAGES_DB_PATH)
    if d and not os.path.exists(d):
        os.makedirs(d, exist_ok=True)
    conn = sqlite3.connect(SEO_PAGES_DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def make_slug(keyword: str) -> str:
    """
    키워드 → URL 슬러그.

    한글을 그대로 쓴다. 네이버·구글 모두 한글 URL 을 정상 처리하고,
    한국어 쿼리에서는 로마자 변환보다 한글이 매칭에 유리하다.
    공백만 하이픈으로 바꾸고, URL 에서 의미가 겹치는 문자만 제거한다.
    """
    s = (keyword or "").strip()
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[/?#&%+.]", "", s)
    return s


def init_seo_pages_db() -> None:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS seo_keyword_pages (
                slug TEXT PRIMARY KEY,
                keyword TEXT NOT NULL UNIQUE,
                category TEXT,
                category_label TEXT,
                search_volume INTEGER,
                difficulty_score REAL,
                difficulty_label TEXT,
                competitors_scanned INTEGER,
                alive_ratio REAL,
                median_vitality REAL,
                top10_avg_score REAL,
                top10_min_score REAL,
                top10_max_score REAL,
                top10_avg_c_rank REAL,
                top10_avg_dia REAL,
                top10_avg_posts INTEGER,
                competitors_json TEXT,
                tab_ratio_json TEXT,
                related_json TEXT,
                tips_json TEXT,
                published INTEGER NOT NULL DEFAULT 0,
                measured_at TIMESTAMP NOT NULL
            )
        """)
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_seo_pages_published "
            "ON seo_keyword_pages(published, measured_at DESC)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_seo_pages_volume "
            "ON seo_keyword_pages(search_volume DESC)"
        )

        # 발굴 프론티어. 자동완성으로 확장한 후보를 여기 쌓고 worker 가 꺼내 잰다.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS seo_keyword_queue (
                keyword TEXT PRIMARY KEY,
                source TEXT,
                depth INTEGER NOT NULL DEFAULT 0,
                state TEXT NOT NULL DEFAULT 'pending',
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                added_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP
            )
        """)
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_seo_queue_state "
            "ON seo_keyword_queue(state, depth, added_at)"
        )

        # 검색량 계층 (2026-08-18 추가).
        # 자동완성 확장은 '블로그 종류'·'블로그 효과'처럼 아무도 안 찾는 조합을
        # 대량으로 만든다. 키워드당 53초를 쓰는 SERP 측정을 그런 데 쓰면
        # 수요 없는 페이지만 쌓이고, 그게 곧 구글의 scaled content abuse 다.
        # keywordstool 은 1콜(약 2초)에 100개 키워드+검색량을 주므로,
        # 비싼 측정 전에 싼 검색량으로 먼저 줄을 세운다.
        for ddl in (
            "ALTER TABLE seo_keyword_queue ADD COLUMN search_volume INTEGER",
            "ALTER TABLE seo_keyword_queue ADD COLUMN volume_checked_at TIMESTAMP",
        ):
            try:
                cur.execute(ddl)
            except sqlite3.OperationalError:
                pass  # 이미 있음
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_seo_queue_volume "
            "ON seo_keyword_queue(state, search_volume DESC)"
        )
        conn.commit()
        logger.info(f"[seo_pages_db] initialized at {SEO_PAGES_DB_PATH}")
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# 큐 (발굴 프론티어)
# ─────────────────────────────────────────────────────────────

def enqueue_keywords(keywords: List[str], source: str = "manual", depth: int = 0) -> int:
    """후보 키워드를 큐에 넣는다. 이미 있으면 건드리지 않는다(중복 재측정 방지)."""
    now = datetime.now(KST).isoformat()
    conn = _connect()
    added = 0
    try:
        cur = conn.cursor()
        for kw in keywords:
            kw = (kw or "").strip()
            if not kw or len(kw) < 2:
                continue
            cur.execute(
                "INSERT OR IGNORE INTO seo_keyword_queue "
                "(keyword, source, depth, state, added_at) VALUES (?,?,?,'pending',?)",
                (kw, source, depth, now),
            )
            added += cur.rowcount
        conn.commit()
    finally:
        conn.close()
    return added


def take_pending(limit: int = 20) -> List[Dict[str, Any]]:
    """
    측정할 키워드를 꺼낸다. **검색량이 큰 것부터.**

    예전엔 depth 순(= 사실상 무작위)이었다. 그러면 자동완성이 만들어낸
    '블로그 종류'·'블로그 효과' 같은 수요 0 짜리에 키워드당 53초를 써버린다.
    지금은 검색량이 확인된 것만, 큰 순서로 꺼낸다. 검색량 확인이 안 된 키워드는
    아직 대상이 아니다 — enrich_volumes 가 먼저 채워야 한다(build_batch 가 자동 호출).

    꺼내면서 바로 'running' 으로 바꾼다 — worker 가 중간에 죽어도 같은 키워드를
    무한 반복하지 않게 하기 위함. 대신 attempts 로 재시도 횟수를 제한한다.
    """
    now = datetime.now(KST).isoformat()
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT keyword, source, depth, attempts, search_volume FROM seo_keyword_queue "
            "WHERE state = 'pending' AND attempts < 3 "
            "  AND volume_checked_at IS NOT NULL AND search_volume >= ? "
            "ORDER BY search_volume DESC, added_at ASC LIMIT ?",
            (MIN_QUEUE_VOLUME, limit),
        )
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            cur.execute(
                "UPDATE seo_keyword_queue SET state='running', attempts=attempts+1, "
                "updated_at=? WHERE keyword=?",
                (now, r["keyword"]),
            )
        conn.commit()
        return rows
    finally:
        conn.close()


def pending_without_volume(limit: int = 200) -> List[str]:
    """검색량을 아직 안 재본 대기 키워드. 얕은 깊이부터(시드에 가까울수록 유망)."""
    conn = _connect()
    try:
        cur = conn.execute(
            "SELECT keyword FROM seo_keyword_queue "
            "WHERE state = 'pending' AND volume_checked_at IS NULL "
            "ORDER BY depth ASC, added_at ASC LIMIT ?",
            (limit,),
        )
        return [r["keyword"] for r in cur.fetchall()]
    finally:
        conn.close()


def set_queue_volumes(volumes: Dict[str, int]) -> Dict[str, int]:
    """
    검색량을 기록하고, 기준 미달은 'skipped' 로 내린다.

    ⚠️ 응답에 없는 키워드는 0 으로 기록해야 한다. 그냥 두면 volume_checked_at 이
    NULL 로 남아 매 배치마다 같은 키워드를 다시 조회하게 되고 큐가 영원히 안 준다.
    네이버는 검색량이 없는 키워드를 아예 응답에서 빼기 때문에 이 경우가 흔하다.
    """
    now = datetime.now(KST).isoformat()
    conn = _connect()
    kept = skipped = 0
    try:
        cur = conn.cursor()
        for kw, vol in volumes.items():
            vol = int(vol or 0)
            state = "pending" if vol >= MIN_QUEUE_VOLUME else "skipped"
            if state == "skipped":
                skipped += 1
            else:
                kept += 1
            cur.execute(
                "UPDATE seo_keyword_queue SET search_volume=?, volume_checked_at=?, "
                "state=CASE WHEN state='pending' THEN ? ELSE state END, updated_at=? "
                "WHERE keyword=?",
                (vol, now, state, now, kw),
            )
        conn.commit()
    finally:
        conn.close()
    return {"kept": kept, "skipped": skipped}


def volume_ready_count() -> int:
    """측정 대상(검색량 확인 완료 + 기준 통과) 개수."""
    conn = _connect()
    try:
        cur = conn.execute(
            "SELECT COUNT(*) n FROM seo_keyword_queue "
            "WHERE state='pending' AND attempts < 3 "
            "  AND volume_checked_at IS NOT NULL AND search_volume >= ?",
            (MIN_QUEUE_VOLUME,),
        )
        return int(cur.fetchone()["n"])
    finally:
        conn.close()


def mark_queue(keyword: str, state: str, error: Optional[str] = None) -> None:
    now = datetime.now(KST).isoformat()
    conn = _connect()
    try:
        conn.execute(
            "UPDATE seo_keyword_queue SET state=?, last_error=?, updated_at=? WHERE keyword=?",
            (state, (error or "")[:300] or None, now, keyword),
        )
        conn.commit()
    finally:
        conn.close()


def requeue_stuck(older_than_minutes: int = 30) -> int:
    """
    'running' 인 채로 오래 방치된 것을 pending 으로 되돌린다.
    프로세스가 재시작되면 running 이 영원히 남아 큐가 마르는 것처럼 보인다.
    """
    cutoff = (datetime.now(KST) - timedelta(minutes=older_than_minutes)).isoformat()
    conn = _connect()
    try:
        cur = conn.execute(
            "UPDATE seo_keyword_queue SET state='pending' "
            "WHERE state='running' AND (updated_at IS NULL OR updated_at < ?)",
            (cutoff,),
        )
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# 페이지 캐시
# ─────────────────────────────────────────────────────────────

def upsert_page(data: Dict[str, Any]) -> None:
    """
    측정 결과를 저장한다.

    published 는 여기서 결정한다 — 경쟁자를 충분히 못 긁었으면(=본문이 얇으면)
    색인 대상에서 뺀다. 얇은 자동생성 페이지를 대량으로 내보내는 건
    구글의 scaled content abuse 에 해당한다.
    """
    keyword = data["keyword"].strip()
    slug = make_slug(keyword)
    competitors = data.get("competitors") or []
    published = 1 if len(competitors) >= MIN_COMPETITORS_FOR_PUBLISH else 0

    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO seo_keyword_pages (
                slug, keyword, category, category_label, search_volume,
                difficulty_score, difficulty_label, competitors_scanned,
                alive_ratio, median_vitality,
                top10_avg_score, top10_min_score, top10_max_score,
                top10_avg_c_rank, top10_avg_dia, top10_avg_posts,
                competitors_json, tab_ratio_json, related_json, tips_json,
                published, measured_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(slug) DO UPDATE SET
                keyword=excluded.keyword,
                category=excluded.category,
                category_label=excluded.category_label,
                search_volume=excluded.search_volume,
                difficulty_score=excluded.difficulty_score,
                difficulty_label=excluded.difficulty_label,
                competitors_scanned=excluded.competitors_scanned,
                alive_ratio=excluded.alive_ratio,
                median_vitality=excluded.median_vitality,
                top10_avg_score=excluded.top10_avg_score,
                top10_min_score=excluded.top10_min_score,
                top10_max_score=excluded.top10_max_score,
                top10_avg_c_rank=excluded.top10_avg_c_rank,
                top10_avg_dia=excluded.top10_avg_dia,
                top10_avg_posts=excluded.top10_avg_posts,
                competitors_json=excluded.competitors_json,
                tab_ratio_json=excluded.tab_ratio_json,
                related_json=excluded.related_json,
                tips_json=excluded.tips_json,
                published=excluded.published,
                measured_at=excluded.measured_at
            """,
            (
                slug, keyword, data.get("category"), data.get("category_label"),
                data.get("search_volume"),
                data.get("difficulty_score"), data.get("difficulty_label"),
                data.get("competitors_scanned"),
                data.get("alive_ratio"), data.get("median_vitality"),
                data.get("top10_avg_score"), data.get("top10_min_score"),
                data.get("top10_max_score"), data.get("top10_avg_c_rank"),
                data.get("top10_avg_dia"), data.get("top10_avg_posts"),
                json.dumps(competitors, ensure_ascii=False),
                json.dumps(data.get("tab_ratio") or {}, ensure_ascii=False),
                json.dumps(data.get("related") or [], ensure_ascii=False),
                json.dumps(data.get("tips") or [], ensure_ascii=False),
                published,
                datetime.now(KST).isoformat(),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def _row_to_page(row: sqlite3.Row) -> Dict[str, Any]:
    d = dict(row)
    for key, target in (
        ("competitors_json", "competitors"),
        ("tab_ratio_json", "tab_ratio"),
        ("related_json", "related"),
        ("tips_json", "tips"),
    ):
        raw = d.pop(key, None)
        try:
            d[target] = json.loads(raw) if raw else ([] if target != "tab_ratio" else {})
        except (TypeError, ValueError):
            d[target] = [] if target != "tab_ratio" else {}
    d["published"] = bool(d.get("published"))
    return d


def get_page(slug: str) -> Optional[Dict[str, Any]]:
    conn = _connect()
    try:
        cur = conn.execute(
            "SELECT * FROM seo_keyword_pages WHERE slug = ? AND published = 1", (slug,)
        )
        row = cur.fetchone()
        return _row_to_page(row) if row else None
    finally:
        conn.close()


def list_published_slugs(offset: int = 0, limit: int = 5000) -> List[Dict[str, Any]]:
    """사이트맵용. 검색량 큰 것부터 — 색인 예산을 중요한 페이지에 먼저 쓴다."""
    conn = _connect()
    try:
        cur = conn.execute(
            "SELECT slug, keyword, measured_at FROM seo_keyword_pages "
            "WHERE published = 1 ORDER BY COALESCE(search_volume, 0) DESC, slug ASC "
            "LIMIT ? OFFSET ?",
            (limit, offset),
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def count_published() -> int:
    conn = _connect()
    try:
        cur = conn.execute("SELECT COUNT(*) AS n FROM seo_keyword_pages WHERE published = 1")
        return int(cur.fetchone()["n"])
    finally:
        conn.close()


def related_published(keyword: str, limit: int = 12) -> List[Dict[str, Any]]:
    """
    내부 링크용 — 같은 머리어를 공유하는 다른 발행 페이지.

    프로그래매틱 페이지가 서로 링크되지 않으면 크롤러가 사이트맵으로만
    도달하게 되고, 그런 페이지는 고아 취급되어 색인 우선순위가 떨어진다.
    """
    head = (keyword or "").strip().split(" ")[0]
    if len(head) < 2:
        return []
    conn = _connect()
    try:
        cur = conn.execute(
            "SELECT slug, keyword, search_volume, difficulty_label "
            "FROM seo_keyword_pages WHERE published = 1 AND keyword LIKE ? AND keyword != ? "
            "ORDER BY COALESCE(search_volume, 0) DESC LIMIT ?",
            (f"%{head}%", keyword, limit),
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def stats() -> Dict[str, Any]:
    conn = _connect()
    try:
        cur = conn.cursor()
        out: Dict[str, Any] = {}
        cur.execute("SELECT COUNT(*) n FROM seo_keyword_pages")
        out["pages_total"] = int(cur.fetchone()["n"])
        cur.execute("SELECT COUNT(*) n FROM seo_keyword_pages WHERE published = 1")
        out["pages_published"] = int(cur.fetchone()["n"])
        cur.execute("SELECT state, COUNT(*) n FROM seo_keyword_queue GROUP BY state")
        out["queue"] = {r["state"]: int(r["n"]) for r in cur.fetchall()}
        cur.execute(
            "SELECT COUNT(*) n FROM seo_keyword_queue "
            "WHERE state='pending' AND volume_checked_at IS NULL"
        )
        out["volume_unchecked"] = int(cur.fetchone()["n"])
        out["volume_ready"] = volume_ready_count()
        cur.execute("SELECT MAX(measured_at) m FROM seo_keyword_pages")
        out["last_measured_at"] = cur.fetchone()["m"]
        return out
    finally:
        conn.close()
