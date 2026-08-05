"""
블로그 지수 시계열(스냅샷) 저장소.

왜 따로 만드는가:
- blog_scores 는 blog_id UNIQUE 라 분석할 때마다 덮어쓴다 → 과거가 남지 않는다.
- blog_analysis_history 는 "로그인 사용자가 블로그를 저장했을 때"만 쌓인다
  → 게스트 분석·비저장 블로그는 영원히 기록이 없다.
그래서 blog_id 하나만 키로 하는 순수 시계열 테이블을 둔다.

원칙 두 가지:
1) 하루 1점. 같은 날 여러 번 분석하면 마지막 값으로 갱신한다(점이 뭉치면 추이가 안 보임).
2) scoring_version 을 같이 적재한다. 채점 파이프라인이 바뀌면 과거 점수는 다른 자로 잰
   값이라, 그래프에서 "자가 바뀐 지점"을 표시해야 상승/하락을 오독하지 않는다.
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
    _DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "blog_index_history.db")
else:
    _DEFAULT_PATH = "/data/blog_index_history.db"

INDEX_HISTORY_DB_PATH = os.environ.get("INDEX_HISTORY_DB_PATH", _DEFAULT_PATH)

KST = timezone(timedelta(hours=9))

# scoring_version 을 모르는(백필된) 과거 점수는 0 으로 적재한다.
UNKNOWN_SCORING_VERSION = 0


def _get_scoring_version() -> int:
    try:
        from database.blog_percentile_db import SCORING_VERSION
        return int(SCORING_VERSION)
    except Exception:
        return UNKNOWN_SCORING_VERSION


def _connect() -> sqlite3.Connection:
    db_dir = os.path.dirname(INDEX_HISTORY_DB_PATH)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(INDEX_HISTORY_DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_index_history_db() -> None:
    """테이블 생성 (idempotent)"""
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS blog_index_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                blog_id TEXT NOT NULL,
                day_kst TEXT NOT NULL,
                captured_at TIMESTAMP NOT NULL,
                total_score REAL,
                level INTEGER,
                grade TEXT,
                level_category TEXT,
                percentile REAL,
                c_rank REAL,
                dia REAL,
                content_factors REAL,
                extra_bonus REAL,
                vitality REAL,
                vitality_state TEXT,
                total_posts INTEGER,
                total_visitors INTEGER,
                neighbor_count INTEGER,
                recent_avg_visitors INTEGER,
                days_since_last_post INTEGER,
                scoring_version INTEGER DEFAULT 0,
                source TEXT DEFAULT 'analyze',
                UNIQUE(blog_id, day_kst)
            )
        """)
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_snapshots_blog_day "
            "ON blog_index_snapshots(blog_id, day_kst)"
        )
        # 백필을 블로그당 1회만 돌리기 위한 표식
        cur.execute("""
            CREATE TABLE IF NOT EXISTS backfill_marks (
                blog_id TEXT PRIMARY KEY,
                done_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                imported INTEGER DEFAULT 0
            )
        """)
        conn.commit()
        logger.info("✅ Blog index history table initialized")
    finally:
        conn.close()


def tier_label(level: Optional[int]) -> Optional[str]:
    """레벨 → 화면에 쓰는 등급 이름. 프론트(analyze/page.tsx)와 규칙이 같아야 한다."""
    if level is None:
        return None
    try:
        level = int(level)
    except (TypeError, ValueError):
        return None
    if level <= 1:
        return "일반"
    if level <= 8:
        return f"준최{level - 1}"
    if level <= 11:
        return f"최적{level - 8}"
    return f"최적{level - 11}+"


def _as_float(v: Any) -> Optional[float]:
    try:
        if v is None:
            return None
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def _as_int(v: Any) -> Optional[int]:
    try:
        if v is None:
            return None
        return int(v)
    except (TypeError, ValueError):
        return None


def record_snapshot(
    blog_id: str,
    index: Dict[str, Any],
    stats: Optional[Dict[str, Any]] = None,
    source: str = "analyze",
    scoring_version: Optional[int] = None,
    captured_at: Optional[datetime] = None,
) -> bool:
    """분석 결과 1건을 시계열에 적재. 같은 날 재분석이면 갱신(하루 1점).

    레벨 판정이 불가능했던 결과(level=None)는 적재하지 않는다.
    "측정 불가"를 0점으로 그리면 없던 폭락이 그래프에 생긴다.
    """
    if not blog_id:
        return False

    stats = stats or {}
    total_score = _as_float(index.get("total_score"))
    level = _as_int(index.get("level"))
    if total_score is None or level is None:
        logger.debug(f"[index-history] skip unmeasurable snapshot: {blog_id}")
        return False

    breakdown = index.get("score_breakdown") or {}
    now = captured_at or datetime.now(KST)
    if now.tzinfo is None:
        now = now.replace(tzinfo=KST)
    day_kst = now.astimezone(KST).strftime("%Y-%m-%d")

    row = (
        blog_id,
        day_kst,
        now.astimezone(KST).isoformat(),
        total_score,
        level,
        index.get("grade") or "",
        index.get("level_category") or "",
        _as_float(index.get("percentile")),
        _as_float(breakdown.get("c_rank")),
        _as_float(breakdown.get("dia")),
        _as_float(breakdown.get("content_factors")),
        _as_float(index.get("extra_bonus")),
        _as_float(index.get("vitality")),
        index.get("vitality_state"),
        _as_int(stats.get("total_posts")),
        _as_int(stats.get("total_visitors")),
        _as_int(stats.get("neighbor_count")),
        _as_int(stats.get("recent_avg_visitors")),
        _as_int(index.get("days_since_last_post")),
        scoring_version if scoring_version is not None else _get_scoring_version(),
        source,
    )

    conn = _connect()
    try:
        conn.execute("""
            INSERT INTO blog_index_snapshots
                (blog_id, day_kst, captured_at, total_score, level, grade, level_category,
                 percentile, c_rank, dia, content_factors, extra_bonus, vitality, vitality_state,
                 total_posts, total_visitors, neighbor_count, recent_avg_visitors,
                 days_since_last_post, scoring_version, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(blog_id, day_kst) DO UPDATE SET
                captured_at = excluded.captured_at,
                total_score = excluded.total_score,
                level = excluded.level,
                grade = excluded.grade,
                level_category = excluded.level_category,
                percentile = excluded.percentile,
                c_rank = excluded.c_rank,
                dia = excluded.dia,
                content_factors = excluded.content_factors,
                extra_bonus = excluded.extra_bonus,
                vitality = excluded.vitality,
                vitality_state = excluded.vitality_state,
                total_posts = excluded.total_posts,
                total_visitors = excluded.total_visitors,
                neighbor_count = excluded.neighbor_count,
                recent_avg_visitors = excluded.recent_avg_visitors,
                days_since_last_post = excluded.days_since_last_post,
                scoring_version = excluded.scoring_version,
                source = excluded.source
        """, row)
        conn.commit()
        return True
    except Exception as e:
        logger.warning(f"[index-history] record failed for {blog_id}: {e}")
        return False
    finally:
        conn.close()


def get_snapshots(blog_id: str, days: int = 180, limit: int = 400) -> List[Dict[str, Any]]:
    """오래된 → 최신 순으로 스냅샷 조회"""
    since = (datetime.now(KST) - timedelta(days=days)).strftime("%Y-%m-%d")
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT * FROM blog_index_snapshots
            WHERE blog_id = ? AND day_kst >= ?
            ORDER BY day_kst ASC
            LIMIT ?
        """, (blog_id, since, limit))
        return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        logger.warning(f"[index-history] read failed for {blog_id}: {e}")
        return []
    finally:
        conn.close()


def get_tracked_blog_ids(active_within_days: int = 45, limit: int = 200) -> List[str]:
    """자동 스냅샷 대상 — 최근에 실제로 분석된 적 있는 블로그만."""
    since = (datetime.now(KST) - timedelta(days=active_within_days)).strftime("%Y-%m-%d")
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT blog_id, MAX(day_kst) AS last_day, COUNT(*) AS n
            FROM blog_index_snapshots
            WHERE day_kst >= ?
            GROUP BY blog_id
            ORDER BY n DESC, last_day DESC
            LIMIT ?
        """, (since, limit))
        return [r["blog_id"] for r in cur.fetchall()]
    except Exception as e:
        logger.warning(f"[index-history] tracked list failed: {e}")
        return []
    finally:
        conn.close()


def has_snapshot_today(blog_id: str) -> bool:
    today = datetime.now(KST).strftime("%Y-%m-%d")
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT 1 FROM blog_index_snapshots WHERE blog_id = ? AND day_kst = ? LIMIT 1",
            (blog_id, today),
        )
        return cur.fetchone() is not None
    finally:
        conn.close()


# ===== 백필 =====

def _user_blogs_db_path() -> str:
    if sys.platform == "win32":
        return os.path.join(os.path.dirname(__file__), "..", "data", "user_blogs.db")
    return "/data/user_blogs.db"


def backfill_from_saved_history(blog_id: str) -> int:
    """기존 blog_analysis_history(저장 블로그 이력)를 시계열로 한 번 옮긴다.

    scoring_version 을 알 수 없으므로 0(=다른 자로 잰 값)으로 적재한다.
    블로그당 1회만 수행한다.
    """
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM backfill_marks WHERE blog_id = ?", (blog_id,))
        if cur.fetchone():
            return 0
    finally:
        conn.close()

    imported = 0
    path = _user_blogs_db_path()
    if os.path.exists(path):
        try:
            src = sqlite3.connect(path, timeout=10)
            src.row_factory = sqlite3.Row
            rows = src.execute("""
                SELECT total_score, level, grade, total_posts, total_visitors,
                       neighbor_count, analyzed_at
                FROM blog_analysis_history
                WHERE blog_id = ?
                ORDER BY analyzed_at ASC
            """, (blog_id,)).fetchall()
            src.close()

            for r in rows:
                ts = r["analyzed_at"]
                try:
                    dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                except Exception:
                    continue
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                ok = record_snapshot(
                    blog_id,
                    index={
                        "total_score": r["total_score"],
                        "level": r["level"],
                        "grade": r["grade"],
                    },
                    stats={
                        "total_posts": r["total_posts"],
                        "total_visitors": r["total_visitors"],
                        "neighbor_count": r["neighbor_count"],
                    },
                    source="backfill",
                    scoring_version=UNKNOWN_SCORING_VERSION,
                    captured_at=dt.astimezone(KST),
                )
                if ok:
                    imported += 1
        except Exception as e:
            logger.warning(f"[index-history] backfill failed for {blog_id}: {e}")

    conn = _connect()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO backfill_marks (blog_id, imported) VALUES (?, ?)",
            (blog_id, imported),
        )
        conn.commit()
    finally:
        conn.close()

    if imported:
        logger.info(f"[index-history] backfilled {imported} points for {blog_id}")
    return imported


# ===== 조회용 페이로드 =====

def build_history_payload(blog_id: str, days: int = 180) -> Dict[str, Any]:
    """차트가 그대로 쓸 수 있는 형태로 가공: 점 + 변화 이벤트 + 요약."""
    backfill_from_saved_history(blog_id)
    rows = get_snapshots(blog_id, days=days)
    current_version = _get_scoring_version()

    points: List[Dict[str, Any]] = []
    for r in rows:
        points.append({
            "date": r["day_kst"],
            "captured_at": r["captured_at"],
            "total_score": r["total_score"],
            "level": r["level"],
            "grade": r["grade"],
            "tier": tier_label(r["level"]),
            "percentile": r["percentile"],
            "c_rank": r["c_rank"],
            "dia": r["dia"],
            "content_factors": r["content_factors"],
            "total_posts": r["total_posts"],
            "total_visitors": r["total_visitors"],
            "neighbor_count": r["neighbor_count"],
            "recent_avg_visitors": r["recent_avg_visitors"],
            "scoring_version": r["scoring_version"],
            "source": r["source"],
            # 현재 채점 버전과 다른 점수는 "같은 자로 잰 값"이 아니다
            "comparable": bool(r["scoring_version"] == current_version),
        })

    events: List[Dict[str, Any]] = []
    for prev, cur in zip(points, points[1:]):
        if prev["scoring_version"] != cur["scoring_version"]:
            events.append({
                "date": cur["date"],
                "type": "ruler_change",
                "message": "채점 기준 변경 — 이 지점 앞뒤 점수는 서로 다른 자로 잰 값입니다",
                "from_level": prev["level"],
                "to_level": cur["level"],
                "score_delta": round((cur["total_score"] or 0) - (prev["total_score"] or 0), 1),
            })
            continue
        if cur["level"] != prev["level"]:
            up = (cur["level"] or 0) > (prev["level"] or 0)
            events.append({
                "date": cur["date"],
                "type": "level_up" if up else "level_down",
                "from_level": prev["level"],
                "to_level": cur["level"],
                "from_tier": prev["tier"],
                "to_tier": cur["tier"],
                "score_delta": round((cur["total_score"] or 0) - (prev["total_score"] or 0), 1),
                "message": (
                    f"{prev['tier']} → {cur['tier']} 진입" if up
                    else f"{prev['tier']} → {cur['tier']} 하락"
                ),
            })

    summary: Dict[str, Any] = {
        "count": len(points),
        "first_date": points[0]["date"] if points else None,
        "last_date": points[-1]["date"] if points else None,
        "current_score": points[-1]["total_score"] if points else None,
        "current_level": points[-1]["level"] if points else None,
        "current_tier": points[-1]["tier"] if points else None,
    }
    if points:
        comparable = [p for p in points if p["comparable"]]
        base = comparable[0] if comparable else points[0]
        last = points[-1]
        summary["score_delta"] = round((last["total_score"] or 0) - (base["total_score"] or 0), 1)
        summary["level_delta"] = (last["level"] or 0) - (base["level"] or 0)
        summary["baseline_date"] = base["date"]
        best = max(points, key=lambda p: p["total_score"] or 0)
        summary["best_score"] = best["total_score"]
        summary["best_date"] = best["date"]

    return {
        "blog_id": blog_id,
        "days": days,
        "scoring_version": current_version,
        "has_legacy": any(not p["comparable"] for p in points),
        "points": points,
        "events": events,
        "summary": summary,
    }
