"""
1위 가능 키워드 — SERP 측정 캐시.

왜 필요한가:
기존 구조는 사용자가 요청할 때마다 5개 카테고리를 실시간으로 긁었다. 프로덕션에서
7분을 넘겨도 응답이 없었고, 그동안 /health 조차 28~30초로 밀렸다(1 CPU 머신에서
SERP 파싱이 이벤트루프를 굶긴다). 대시보드 위젯이 자동 호출했으므로 사용자가
접속만 해도 서비스가 멈췄다.

핵심 관찰:
비싼 부분(키워드의 상위 10위 점수·인플루언서 수·검색량)은 **누가 물어보든 같은 값**이다.
블로그마다 달라지는 건 "내 레벨로 저길 이길 수 있나"라는 계산뿐이고, 그건 산수다.
→ SERP 측정은 worker 가 미리 해서 여기 쌓고, API 는 읽어서 산수만 한다.
"""
import json
import logging
import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

if sys.platform == "win32":
    _DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "winner_keywords.db")
else:
    _DEFAULT_PATH = "/data/winner_keywords.db"

WINNER_CACHE_DB_PATH = os.environ.get("WINNER_CACHE_DB_PATH", _DEFAULT_PATH)

KST = timezone(timedelta(hours=9))

# 이 기간이 지난 측정은 낡은 것으로 본다. SERP 는 매일 바뀌므로
# 오래된 값으로 "1위 가능"이라 말하면 그건 추천이 아니라 추측이다.
FRESH_DAYS = 7


def _connect() -> sqlite3.Connection:
    d = os.path.dirname(WINNER_CACHE_DB_PATH)
    if d and not os.path.exists(d):
        os.makedirs(d, exist_ok=True)
    conn = sqlite3.connect(WINNER_CACHE_DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_winner_cache_db() -> None:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS keyword_serp_stats (
                keyword TEXT PRIMARY KEY,
                category TEXT,
                search_volume INTEGER,
                blog_ratio REAL,
                top10_avg_score REAL,
                top10_min_score REAL,
                top10_scores TEXT,
                influencer_count INTEGER,
                high_scorer_count INTEGER,
                safety_score REAL,
                keyword_scope TEXT,
                bos_score REAL,
                measured_at TIMESTAMP NOT NULL
            )
        """)
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_serp_stats_measured "
            "ON keyword_serp_stats(measured_at DESC)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_serp_stats_category "
            "ON keyword_serp_stats(category)"
        )
        # 카테고리별 마지막 수집 시각 — 워커가 돌아가며 갱신하기 위한 것
        cur.execute("""
            CREATE TABLE IF NOT EXISTS category_runs (
                category TEXT PRIMARY KEY,
                last_run_at TIMESTAMP,
                keywords_stored INTEGER DEFAULT 0,
                last_error TEXT
            )
        """)
        # 사용자 블로그의 주제어 — 수집기가 '실제로 필요한 주제'를 학습하는 통로.
        # 씨앗 카테고리(맛집·카페·여행…)는 소비재 블로그 위주라, 대출/의료 같은
        # 주제의 블로그에는 맞는 키워드가 하나도 없다. 그런 요청을 여기 쌓아 둔다.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS requested_topics (
                term TEXT PRIMARY KEY,
                times INTEGER DEFAULT 1,
                first_requested_at TIMESTAMP,
                last_requested_at TIMESTAMP
            )
        """)
        conn.commit()
        logger.info("✅ Winner keyword cache tables initialized")
    finally:
        conn.close()


def record_requested_topics(terms: List[str], limit: int = 3) -> None:
    """캐시에 맞는 키워드가 없던 블로그의 주제어를 적어 둔다 (수집 대상 후보)"""
    terms = [t for t in (terms or []) if t][:limit]
    if not terms:
        return
    now = datetime.now(KST).isoformat()
    conn = _connect()
    try:
        for t in terms:
            conn.execute("""
                INSERT INTO requested_topics (term, times, first_requested_at, last_requested_at)
                VALUES (?, 1, ?, ?)
                ON CONFLICT(term) DO UPDATE SET
                    times = times + 1,
                    last_requested_at = excluded.last_requested_at
            """, (t, now, now))
        conn.commit()
    except Exception as e:
        logger.debug(f"[winner-cache] requested topic 기록 실패: {e}")
    finally:
        conn.close()


def get_requested_topics(limit: int = 10) -> List[str]:
    """많이 요청된 주제어부터. 아직 측정 안 된 것만 돌려준다."""
    conn = _connect()
    try:
        rows = conn.execute("""
            SELECT r.term FROM requested_topics r
            LEFT JOIN category_runs c ON c.category = r.term
            WHERE c.category IS NULL
            ORDER BY r.times DESC, r.last_requested_at DESC
            LIMIT ?
        """, (limit,)).fetchall()
        return [r["term"] for r in rows]
    except Exception:
        return []
    finally:
        conn.close()


def upsert_keyword_stats(rows: List[Dict[str, Any]]) -> int:
    """워커가 측정한 키워드 통계를 저장 (키워드당 1행, 최신값으로 갱신)"""
    if not rows:
        return 0
    now = datetime.now(KST).isoformat()
    conn = _connect()
    try:
        cur = conn.cursor()
        for r in rows:
            cur.execute("""
                INSERT INTO keyword_serp_stats
                    (keyword, category, search_volume, blog_ratio, top10_avg_score,
                     top10_min_score, top10_scores, influencer_count, high_scorer_count,
                     safety_score, keyword_scope, bos_score, measured_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(keyword) DO UPDATE SET
                    category = excluded.category,
                    search_volume = excluded.search_volume,
                    blog_ratio = excluded.blog_ratio,
                    top10_avg_score = excluded.top10_avg_score,
                    top10_min_score = excluded.top10_min_score,
                    top10_scores = excluded.top10_scores,
                    influencer_count = excluded.influencer_count,
                    high_scorer_count = excluded.high_scorer_count,
                    safety_score = excluded.safety_score,
                    keyword_scope = excluded.keyword_scope,
                    bos_score = excluded.bos_score,
                    measured_at = excluded.measured_at
            """, (
                r["keyword"], r.get("category"), r.get("search_volume") or 0,
                r.get("blog_ratio"), r.get("top10_avg_score"), r.get("top10_min_score"),
                json.dumps(r.get("top10_scores") or [], ensure_ascii=False),
                r.get("influencer_count") or 0, r.get("high_scorer_count") or 0,
                r.get("safety_score"), r.get("keyword_scope"), r.get("bos_score"),
                now,
            ))
        conn.commit()
        return len(rows)
    except Exception as e:
        logger.warning(f"[winner-cache] upsert failed: {e}")
        return 0
    finally:
        conn.close()


def get_fresh_stats(
    limit: int = 400,
    max_age_days: int = FRESH_DAYS,
    min_search_volume: int = 0,
) -> List[Dict[str, Any]]:
    """API 가 읽는 경로. 네트워크를 쓰지 않는다."""
    since = (datetime.now(KST) - timedelta(days=max_age_days)).isoformat()
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT * FROM keyword_serp_stats
            WHERE measured_at >= ? AND COALESCE(search_volume, 0) >= ?
            ORDER BY search_volume DESC
            LIMIT ?
        """, (since, min_search_volume, limit))
        out = []
        for row in cur.fetchall():
            d = dict(row)
            try:
                d["top10_scores"] = json.loads(d.get("top10_scores") or "[]")
            except Exception:
                d["top10_scores"] = []
            out.append(d)
        return out
    except Exception as e:
        logger.warning(f"[winner-cache] read failed: {e}")
        return []
    finally:
        conn.close()


def cache_summary() -> Dict[str, Any]:
    """캐시가 실제로 채워져 있는지 — '준비 중'과 '결과 없음'을 구분하기 위한 근거"""
    since = (datetime.now(KST) - timedelta(days=FRESH_DAYS)).isoformat()
    conn = _connect()
    try:
        cur = conn.cursor()
        total = cur.execute("SELECT COUNT(*) c FROM keyword_serp_stats").fetchone()["c"]
        fresh = cur.execute(
            "SELECT COUNT(*) c FROM keyword_serp_stats WHERE measured_at >= ?", (since,)
        ).fetchone()["c"]
        last = cur.execute(
            "SELECT MAX(measured_at) m FROM keyword_serp_stats"
        ).fetchone()["m"]
        cats = cur.execute(
            "SELECT category, COUNT(*) c FROM keyword_serp_stats GROUP BY category "
            "ORDER BY c DESC"
        ).fetchall()
        # 수집기가 돌긴 했는지 / 돌다 실패했는지를 구분할 근거.
        # 이게 없으면 '아직 도는 중'과 '조용히 죽음'을 밖에서 알 수 없다.
        runs = cur.execute(
            "SELECT category, last_run_at, keywords_stored, last_error "
            "FROM category_runs ORDER BY last_run_at DESC LIMIT 20"
        ).fetchall()
        return {
            "total": total,
            "fresh": fresh,
            "last_measured_at": last,
            "categories": {r["category"]: r["c"] for r in cats if r["category"]},
            "runs": [dict(r) for r in runs],
        }
    finally:
        conn.close()


def pick_categories_to_refresh(all_categories: List[str], n: int) -> List[str]:
    """가장 오래 방치된 카테고리부터 n 개. 한 번에 전부 돌리면 워커가 몇 시간 묶인다."""
    conn = _connect()
    try:
        cur = conn.cursor()
        rows = {r["category"]: r["last_run_at"]
                for r in cur.execute("SELECT category, last_run_at FROM category_runs").fetchall()}
    finally:
        conn.close()
    # 한 번도 안 돈 카테고리가 최우선
    never = [c for c in all_categories if c not in rows]
    seen = sorted((c for c in all_categories if c in rows), key=lambda c: rows[c] or "")
    return (never + seen)[:n]


def mark_category_run(category: str, stored: int, error: Optional[str] = None) -> None:
    conn = _connect()
    try:
        conn.execute("""
            INSERT INTO category_runs (category, last_run_at, keywords_stored, last_error)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(category) DO UPDATE SET
                last_run_at = excluded.last_run_at,
                keywords_stored = excluded.keywords_stored,
                last_error = excluded.last_error
        """, (category, datetime.now(KST).isoformat(), stored, error))
        conn.commit()
    finally:
        conn.close()
