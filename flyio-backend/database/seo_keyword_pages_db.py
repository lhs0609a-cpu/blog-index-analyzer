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
#
# ⚠️ 처음엔 10 으로 잡았는데 실측에서 200개 중 9개(4%)만 걸러졌다. 자동완성이
# 만든 '블로그종류' 같은 조합도 월 10~50 은 나와서 통과해버린 것이다. 월 30회짜리
# 페이지는 만들어봐야 유입이 없고, 그런 게 수천 개면 scaled content abuse 로 보인다.
# 100 으로 올려 실제로 수요가 있는 것만 남긴다.
MIN_QUEUE_VOLUME = 100

# 이 검색량 이상인 키워드에서만 연관 키워드로 큐를 확장한다.
# 확장을 무제한 허용하면 측정 1건당 연관 28개가 들어와 큐가 영원히 안 줄고
# (실측: 15분에 3개 측정하는 동안 큐 +77), 깊이가 깊어질수록 도메인에서
# 멀어져 질이 떨어진다. 수요가 큰 키워드의 이웃만 캔다.
EXPAND_MIN_VOLUME = 1000


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
        # 난이도 눈금 버전 (2026-08-25 추가).
        # 공식이 바뀌면 예전 점수와 같은 선에 놓을 수 없다. 어느 눈금으로 잰
        # 값인지 행마다 남긴다. 버전이 없는 행 = v1(활동성 단일축, 천장 포화).
        for ddl in (
            "ALTER TABLE seo_keyword_pages ADD COLUMN difficulty_version INTEGER",
            "ALTER TABLE seo_keyword_pages ADD COLUMN difficulty_breakdown_json TEXT",
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


# 도메인 판정 토큰.
#
# ⚠️ 넓은 토큰을 쓰면 안 된다. 처음엔 '검색'·'지수'·'이웃'·'최적화' 같은 것을
# 넣었다가 '이미지검색'·'지도검색'(네이버 기능), '물가지수'·'코스피지수',
# '이웃사촌' 이 전부 통과해 무관한 페이지가 만들어졌다.
# (같은 함정: 지역토큰 '곡성' 이 '도곡성장' 을 삼킨 사례)
#
# STRONG  하나만 있어도 우리 도메인이다.
# WEAK    혼자서는 부족하고, STRONG 이나 다른 WEAK 와 같이 있어야 인정한다.
DOMAIN_TOKENS_STRONG = (
    "블로그", "포스팅", "애드포스트", "인플루언서", "티스토리",
    "저품질", "상위노출", "서로이웃", "체험단", "씨랭크", "c랭크",
)
DOMAIN_TOKENS_WEAK = (
    "네이버", "검색", "키워드", "seo", "노출", "지수",
    "방문자", "글쓰기", "협찬", "최적화", "포스트",
)

# 강한 토큰이 있어도 이게 붙으면 제외한다 — 네이버 기능/타 서비스 이름.
DOMAIN_EXCLUDE = ("지도검색", "이미지검색", "쇼핑검색", "통합검색", "카페", "지식인", "지식iN")


def in_domain(keyword: str) -> bool:
    k = (keyword or "").lower()
    if any(x.lower() in k for x in DOMAIN_EXCLUDE):
        return False
    if any(t.lower() in k for t in DOMAIN_TOKENS_STRONG):
        return True
    # 약한 토큰은 2개 이상 겹쳐야 인정 ('네이버 키워드 검색' 은 통과, '이미지검색' 은 탈락)
    weak_hits = sum(1 for t in DOMAIN_TOKENS_WEAK if t.lower() in k)
    return weak_hits >= 2


# 하위호환 (기존 참조가 있을 경우)
DOMAIN_TOKENS = DOMAIN_TOKENS_STRONG + DOMAIN_TOKENS_WEAK


def enqueue_with_volume(items: Dict[str, int], source: str = "keywordstool", depth: int = 1) -> int:
    """
    검색량을 이미 아는 키워드를 큐에 넣는다 — 바로 측정 대상이 된다.

    keywordstool 은 힌트 5개당 최대 100개의 연관 키워드를 **검색량과 함께**
    돌려준다. 지금까지는 힌트 5개 값만 쓰고 나머지 95개를 버리고 있었다.
    자동완성이 뽑아낸 키워드는 실측 결과 거의 전부 월 10회 미만(placeholder)
    이었던 반면, 이쪽은 네이버가 실제 검색량을 보증하는 목록이다.
    """
    now = datetime.now(KST).isoformat()
    conn = _connect()
    added = 0
    try:
        cur = conn.cursor()
        for kw, vol in items.items():
            kw = (kw or "").strip()
            vol = int(vol or 0)
            if not kw or len(kw) < 2 or vol < MIN_QUEUE_VOLUME:
                continue
            if not in_domain(kw):
                continue
            cur.execute(
                "INSERT OR IGNORE INTO seo_keyword_queue "
                "(keyword, source, depth, state, added_at, search_volume, volume_checked_at) "
                "VALUES (?,?,?,'pending',?,?,?)",
                (kw, source, depth, now, vol, now),
            )
            added += cur.rowcount
        conn.commit()
    finally:
        conn.close()
    return added


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


def unpublish_off_domain_pages() -> List[str]:
    """
    이미 만들어진 페이지 중 도메인 밖인 것을 비공개(published=0)로 내린다.

    도메인 판정을 좁히기 전에 만들어진 페이지가 남아 있다('이미지검색',
    '지도검색' 등). 지우지 않고 비공개로만 돌린다 — 측정값은 나중에 판정
    기준이 또 바뀔 때 재활용할 수 있고, 사이트맵/RSS 에서는 published=1 만
    나가므로 색인 대상에서는 즉시 빠진다.
    """
    conn = _connect()
    try:
        cur = conn.execute("SELECT slug, keyword FROM seo_keyword_pages WHERE published = 1")
        bad = [(r["slug"], r["keyword"]) for r in cur.fetchall() if not in_domain(r["keyword"])]
        for slug, _ in bad:
            conn.execute("UPDATE seo_keyword_pages SET published = 0 WHERE slug = ?", (slug,))
        conn.commit()
        return [kw for _, kw in bad]
    finally:
        conn.close()


def skip_off_domain() -> int:
    """
    큐에 남아 있는 **도메인 밖** 키워드를 'skipped' 로 내린다.

    ⚠️ 검색량 우선 정렬로 바꾸면서 드러난 문제다. 도메인 필터가 없던 시절
    자동완성으로 쌓인 '쇼핑몰'·'택배기사'·'전자책' 같은 일반 상업 키워드는
    검색량이 크기 때문에 정렬하면 **맨 앞으로 올라온다**. 즉 우선순위 도입이
    오히려 쓰레기를 먼저 측정하게 만들었다(실측: 배치 3건이 전부 이런 키워드).
    enqueue_with_volume 은 필터를 타지만 예전 데이터는 안 탔으므로 여기서 청소한다.
    """
    conn = _connect()
    try:
        cur = conn.execute(
            "SELECT keyword FROM seo_keyword_queue WHERE state='pending'"
        )
        bad = [r["keyword"] for r in cur.fetchall() if not in_domain(r["keyword"])]
        for kw in bad:
            conn.execute(
                "UPDATE seo_keyword_queue SET state='skipped', last_error='off_domain' "
                "WHERE keyword=? AND state='pending'",
                (kw,),
            )
        conn.commit()
        return len(bad)
    finally:
        conn.close()


def reclassify_by_volume() -> int:
    """
    MIN_QUEUE_VOLUME 을 올렸을 때 이미 통과 처리된 행을 다시 걸러낸다.
    기준만 바꾸고 이걸 안 돌리면 예전 기준으로 통과한 저볼륨 키워드가
    계속 측정 대상으로 남는다. 멱등이라 매번 호출해도 안전하다.
    """
    conn = _connect()
    try:
        cur = conn.execute(
            "UPDATE seo_keyword_queue SET state='skipped' "
            "WHERE state='pending' AND volume_checked_at IS NOT NULL AND search_volume < ?",
            (MIN_QUEUE_VOLUME,),
        )
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


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
                difficulty_version, difficulty_breakdown_json,
                published, measured_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
                difficulty_version=excluded.difficulty_version,
                difficulty_breakdown_json=excluded.difficulty_breakdown_json,
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
                data.get("difficulty_version"),
                json.dumps(data.get("difficulty_breakdown") or {}, ensure_ascii=False),
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
        ("difficulty_breakdown_json", "difficulty_breakdown"),
    ):
        raw = d.pop(key, None)
        try:
            empty = {} if target in ("tab_ratio", "difficulty_breakdown") else []
            d[target] = json.loads(raw) if raw else empty
        except (TypeError, ValueError):
            d[target] = {} if target in ("tab_ratio", "difficulty_breakdown") else []
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


def list_published_slugs(
    offset: int = 0, limit: int = 5000, order: str = "volume"
) -> List[Dict[str, Any]]:
    """
    사이트맵/RSS 용 목록.

    order="volume"  검색량 큰 것부터 — 사이트맵. 색인 예산을 중요한 페이지에 먼저.
    order="recent"  최근 측정순 — RSS. RSS 는 '새로 생긴 것'을 알리는 채널이라
                    검색량이 아니라 신선도로 정렬해야 의미가 있다.
    """
    order_by = (
        "measured_at DESC, slug ASC"
        if order == "recent"
        else "COALESCE(search_volume, 0) DESC, slug ASC"
    )
    conn = _connect()
    try:
        # RSS 는 '본문 전체' 제공이 권장이라(네이버 웹마스터 가이드) 요약을
        # 만들 수 있을 만큼의 필드를 함께 준다. 페이지당 추가 조회 없이
        # 한 쿼리로 끝내기 위함이다.
        cur = conn.execute(
            "SELECT slug, keyword, measured_at, search_volume, difficulty_label, "
            "       difficulty_score, competitors_scanned, alive_ratio, "
            "       top10_avg_score, top10_min_score, category_label, "
            "       difficulty_version "
            "FROM seo_keyword_pages WHERE published = 1 "
            f"ORDER BY {order_by} LIMIT ? OFFSET ?",
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
            "SELECT slug, keyword, search_volume, difficulty_label, difficulty_score "
            "FROM seo_keyword_pages WHERE published = 1 AND keyword LIKE ? AND keyword != ? "
            "ORDER BY COALESCE(search_volume, 0) DESC LIMIT ?",
            (f"%{head}%", keyword, limit),
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def recompute_difficulty(only_stale: bool = True) -> Dict[str, Any]:
    """
    저장된 값만으로 난이도를 다시 계산한다. **네트워크 호출 0.**

    난이도의 재료(top10_min_score / top10_avg_score / median_vitality /
    search_volume)는 이미 전부 행에 들어 있다. 눈금 공식만 바뀌었으므로
    SERP 를 다시 긁을 필요가 없다 — 340개 재측정이면 키워드당 155초,
    약 15시간이 든다. 여기서는 몇 초면 끝난다.

    only_stale=True  현재 버전이 아닌 행만 (기본)
    only_stale=False 전부 다시
    """
    from services.seo_difficulty import DIFFICULTY_VERSION, compute_difficulty

    conn = _connect()
    changed = 0
    became_unknown = 0
    dist: Dict[str, int] = {}
    try:
        where = (
            "WHERE COALESCE(difficulty_version, 1) != ?"
            if only_stale else "WHERE 1=1 AND ? IS NOT NULL"
        )
        cur = conn.execute(
            "SELECT slug, difficulty_score, difficulty_label, top10_min_score, "
            "       top10_avg_score, median_vitality, search_volume "
            f"FROM seo_keyword_pages {where}",
            (DIFFICULTY_VERSION,),
        )
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            score, label, breakdown = compute_difficulty(
                top10_min_score=r["top10_min_score"],
                top10_avg_score=r["top10_avg_score"],
                median_vitality=r["median_vitality"],
                search_volume=r["search_volume"],
            )
            dist[label] = dist.get(label, 0) + 1
            if label == "unknown":
                became_unknown += 1
            conn.execute(
                "UPDATE seo_keyword_pages SET difficulty_score=?, difficulty_label=?, "
                "difficulty_version=?, difficulty_breakdown_json=? WHERE slug=?",
                (
                    score, label, DIFFICULTY_VERSION,
                    json.dumps(breakdown, ensure_ascii=False), r["slug"],
                ),
            )
            changed += 1
        conn.commit()
    finally:
        conn.close()
    logger.info(f"[seo_pages_db] recompute_difficulty: {changed} rows -> {dist}")
    return {
        "version": DIFFICULTY_VERSION,
        "recomputed": changed,
        "unknown": became_unknown,
        "label_distribution": dist,
    }


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
        # 난이도 분포. 한 라벨에 몰려 있으면 눈금이 고장난 것이다
        # (v1 은 340개 중 338개가 very_hard 였다).
        cur.execute(
            "SELECT COALESCE(difficulty_label,'unknown') l, COUNT(*) n "
            "FROM seo_keyword_pages WHERE published = 1 GROUP BY l"
        )
        out["difficulty_distribution"] = {r["l"]: int(r["n"]) for r in cur.fetchall()}
        cur.execute(
            "SELECT COALESCE(difficulty_version, 1) v, COUNT(*) n "
            "FROM seo_keyword_pages GROUP BY v"
        )
        out["difficulty_versions"] = {str(r["v"]): int(r["n"]) for r in cur.fetchall()}
        out["volume_ready"] = volume_ready_count()
        cur.execute("SELECT MAX(measured_at) m FROM seo_keyword_pages")
        out["last_measured_at"] = cur.fetchone()["m"]
        return out
    finally:
        conn.close()
