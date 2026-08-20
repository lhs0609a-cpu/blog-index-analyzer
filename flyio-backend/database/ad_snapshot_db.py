"""
광고 계정 스냅샷 — 성과 시계열 + 엔티티 상태 + 변경 이력.

왜 필요한가:
지금까지 광고 데이터는 **읽고 버려졌다**. /stats 는 화면을 그릴 때만 호출되고
어디에도 남지 않아, "어제보다 나빠졌나"·"누가 언제 바꿨나"·"광고가 언제부터
멈췄나" 같은 질문에 답할 과거가 존재하지 않았다. 실제로 소재 반려로 광고가
멈춘 것을 8일 뒤에야 사람이 발견한 사고가 있었다.

⚠️ 오늘부터 쌓지 않으면 한 달 뒤에도 비교할 과거가 없다. 그래서 화면보다
수집이 먼저다.

테이블 셋의 역할 분담:
  ad_daily_stats     — 일자별 성과. 전환(ccnt)·전환매출을 **반드시** 함께 저장한다.
  ad_entity_state    — 엔티티의 현재 상태 1행. 엔티티 수만큼만 커진다.
  ad_entity_changes  — 상태가 실제로 바뀐 것만 append. 변경 이력·사고 감시의 근거.
  ad_collect_runs    — 수집이 돌았는지 자체의 기록.

⚠️ 용량 설계: 해울 계정은 키워드가 10만 개다. 매일 전 엔티티를 새 행으로
쌓으면 연 3,600만 행이 된다. 그래서 상태는 **현재값 1행 + 변경분만 append**
구조로 두고, 성과는 노출이 발생한 엔티티만 저장한다.
"""
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

from database.naver_ad_db import get_connection

logger = logging.getLogger(__name__)

# 상태 스냅샷에서 "바뀌었다"고 볼 필드. 여기 없는 필드가 흔들려도 이력을 만들지 않는다
# (네이버는 editTm·regTm 같은 값을 조회할 때마다 바꿔 보내기도 한다).
# status_reason 은 사고 감시의 최고 신호다. 네이버는 여기에
# ADGROUP_NO_AD(소재 없음)·CAMPAIGN_BUDGET_LIMIT(예산 소진) 같은
# "왜 안 나가는지" 를 담아 준다. status 만 보면 ELIGIBLE 로 멀쩡해 보인다.
TRACKED_FIELDS = (
    "name", "status", "status_reason", "enabled", "daily_budget",
    "bid_amt", "use_group_bid", "inspect_status", "landing_url",
)

# 전환은 사후에 붙는다 — 네이버가 며칠 뒤 값을 올려준다.
# 그래서 최근 N일은 매번 다시 수집해 덮어쓴다.
CONVERSION_BACKFILL_DAYS = 14


def init_ad_snapshot_tables() -> None:
    conn = get_connection()
    cur = conn.cursor()

    # ── 일자별 성과 ─────────────────────────────────────────
    # entity_type: CAMPAIGN | ADGROUP | KEYWORD | AD | EXPKEYWORD
    # EXPKEYWORD 는 키워드확장으로 발생한 실제 검색어 — 키워드 통계에 안 잡히는
    # 지출의 정체다(한 계정은 클릭의 57%가 여기였다).
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ad_daily_stats (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id   TEXT    NOT NULL,
            entity_type   TEXT    NOT NULL,
            entity_id     TEXT    NOT NULL,
            stat_date     TEXT    NOT NULL,
            impressions   INTEGER DEFAULT 0,
            clicks        INTEGER DEFAULT 0,
            cost          REAL    DEFAULT 0,
            ctr           REAL    DEFAULT 0,
            cpc           REAL    DEFAULT 0,
            avg_rank      REAL    DEFAULT 0,
            conversions   REAL    DEFAULT 0,
            conv_amount   REAL    DEFAULT 0,
            conv_rate     REAL    DEFAULT 0,
            roas          REAL    DEFAULT 0,
            label         TEXT,
            parent_id     TEXT,
            collected_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(customer_id, entity_type, entity_id, stat_date)
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ads_cust_date "
                "ON ad_daily_stats(customer_id, stat_date)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ads_entity "
                "ON ad_daily_stats(customer_id, entity_type, entity_id)")

    # ── 엔티티 현재 상태 ────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ad_entity_state (
            customer_id    TEXT NOT NULL,
            entity_type    TEXT NOT NULL,
            entity_id      TEXT NOT NULL,
            parent_id      TEXT,
            name           TEXT,
            status         TEXT,
            status_reason  TEXT,
            enabled        INTEGER,
            daily_budget   INTEGER,
            bid_amt        INTEGER,
            use_group_bid  INTEGER,
            inspect_status TEXT,
            landing_url    TEXT,
            extra          TEXT,
            first_seen     TEXT DEFAULT CURRENT_TIMESTAMP,
            last_seen      TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (customer_id, entity_type, entity_id)
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_aes_parent "
                "ON ad_entity_state(customer_id, parent_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_aes_status "
                "ON ad_entity_state(customer_id, entity_type, status)")

    # ── 변경 이력 (실제로 바뀐 것만) ────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ad_entity_changes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id   TEXT NOT NULL,
            entity_name TEXT,
            field       TEXT NOT NULL,
            old_value   TEXT,
            new_value   TEXT,
            change_kind TEXT,
            detected_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_aec_cust_time "
                "ON ad_entity_changes(customer_id, detected_at)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_aec_entity "
                "ON ad_entity_changes(customer_id, entity_type, entity_id)")

    # ── 수집 실행 기록 ──────────────────────────────────────
    # "어제 수집이 아예 안 돌았다" 와 "돌았는데 0건이었다" 는 완전히 다른 사건이다.
    # 이걸 구분 못 하면 사고 감시가 침묵을 정상으로 오해한다.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ad_collect_runs (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id  TEXT NOT NULL,
            kind         TEXT NOT NULL,
            status       TEXT NOT NULL,
            rows_written INTEGER DEFAULT 0,
            changes      INTEGER DEFAULT 0,
            covered_from TEXT,
            covered_to   TEXT,
            error        TEXT,
            started_at   TEXT DEFAULT CURRENT_TIMESTAMP,
            finished_at  TEXT
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_acr_cust_time "
                "ON ad_collect_runs(customer_id, started_at)")

    conn.commit()
    conn.close()


# ─────────────────────────────────────────────────────────────
# 성과
# ─────────────────────────────────────────────────────────────

def save_daily_stats(customer_id: str, rows: Iterable[Dict[str, Any]]) -> int:
    """일자별 성과 upsert.

    같은 (엔티티, 날짜)를 다시 수집하면 덮어쓴다 — 전환이 사후에 붙기 때문에
    덮어쓰기가 정상 동작이다. 옛 값을 남기면 전환수가 이중 계상된다.
    """
    conn = get_connection()
    cur = conn.cursor()
    n = 0
    for r in rows:
        eid = r.get("entity_id")
        date = r.get("stat_date")
        if not eid or not date:
            continue
        cur.execute("""
            INSERT INTO ad_daily_stats (
                customer_id, entity_type, entity_id, stat_date,
                impressions, clicks, cost, ctr, cpc, avg_rank,
                conversions, conv_amount, conv_rate, roas, label, parent_id,
                collected_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(customer_id, entity_type, entity_id, stat_date) DO UPDATE SET
                impressions = excluded.impressions,
                clicks      = excluded.clicks,
                cost        = excluded.cost,
                ctr         = excluded.ctr,
                cpc         = excluded.cpc,
                avg_rank    = excluded.avg_rank,
                conversions = excluded.conversions,
                conv_amount = excluded.conv_amount,
                conv_rate   = excluded.conv_rate,
                roas        = excluded.roas,
                label       = COALESCE(excluded.label, ad_daily_stats.label),
                parent_id   = COALESCE(excluded.parent_id, ad_daily_stats.parent_id),
                collected_at= CURRENT_TIMESTAMP
        """, (
            customer_id, r.get("entity_type", "KEYWORD"), eid, date,
            int(r.get("impressions") or 0), int(r.get("clicks") or 0),
            float(r.get("cost") or 0), float(r.get("ctr") or 0),
            float(r.get("cpc") or 0), float(r.get("avg_rank") or 0),
            float(r.get("conversions") or 0), float(r.get("conv_amount") or 0),
            float(r.get("conv_rate") or 0), float(r.get("roas") or 0),
            r.get("label"), r.get("parent_id"),
        ))
        n += 1
    conn.commit()
    conn.close()
    return n


def get_daily_totals(customer_id: str, since: str, until: str,
                     entity_type: str = "CAMPAIGN") -> List[Dict[str, Any]]:
    """일자별 계정 합계. 사고 감시의 '어제 대비' 기준선."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT stat_date,
               SUM(impressions) AS impressions,
               SUM(clicks)      AS clicks,
               SUM(cost)        AS cost,
               SUM(conversions) AS conversions,
               SUM(conv_amount) AS conv_amount,
               COUNT(*)         AS entities
        FROM ad_daily_stats
        WHERE customer_id = ? AND entity_type = ?
          AND stat_date BETWEEN ? AND ?
        GROUP BY stat_date
        ORDER BY stat_date
    """, (customer_id, entity_type, since, until))
    out = [dict(r) for r in cur.fetchall()]
    conn.close()
    return out


def get_entity_series(customer_id: str, entity_type: str, entity_id: str,
                      since: str, until: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT * FROM ad_daily_stats
        WHERE customer_id = ? AND entity_type = ? AND entity_id = ?
          AND stat_date BETWEEN ? AND ?
        ORDER BY stat_date
    """, (customer_id, entity_type, entity_id, since, until))
    out = [dict(r) for r in cur.fetchall()]
    conn.close()
    return out


def get_top_spend(customer_id: str, entity_type: str, since: str, until: str,
                  limit: int = 50) -> List[Dict[str, Any]]:
    """돈이 실제로 어디로 나갔는지 — 비용 상위 N.

    이름은 두 곳에서 온다. 검색어(SEARCHTERM)는 행 자체가 label 로 실제 검색어를
    들고 있고, 키워드/그룹/캠페인은 상태 테이블에 이름이 있다. 둘 다 없으면
    entity_id 를 그대로 보여준다 — 이름을 못 찾았다고 행을 감추면 "우리 계정엔
    그런 지출이 없다" 는 오해를 만든다.
    """
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT d.entity_id, d.label, e.name AS state_name, e.status,
               SUM(d.impressions) AS impressions, SUM(d.clicks) AS clicks,
               SUM(d.cost) AS cost, SUM(d.conversions) AS conversions
          FROM ad_daily_stats d
          LEFT JOIN ad_entity_state e
                 ON e.customer_id = d.customer_id
                AND e.entity_type = d.entity_type
                AND e.entity_id   = d.entity_id
         WHERE d.customer_id = ? AND d.entity_type = ?
           AND d.stat_date BETWEEN ? AND ?
         GROUP BY d.entity_id
         ORDER BY cost DESC, clicks DESC
         LIMIT ?
    """, (customer_id, entity_type, since, until, int(limit)))
    out = []
    for r in cur.fetchall():
        r = dict(r)
        out.append({
            "entity_id": r["entity_id"],
            "name": r["label"] or r["state_name"] or r["entity_id"],
            "named": bool(r["label"] or r["state_name"]),
            "status": r["status"],
            "impressions": int(r["impressions"] or 0),
            "clicks": int(r["clicks"] or 0),
            "cost": round(r["cost"] or 0),
            "conversions": r["conversions"] or 0,
            "cpc": round((r["cost"] or 0) / r["clicks"]) if r["clicks"] else 0,
        })
    conn.close()
    return out


def backfill_window(today: Optional[str] = None) -> Tuple[str, str]:
    """다시 수집해 덮어써야 하는 날짜 구간. 전환 지연을 흡수한다."""
    end = datetime.strptime(today, "%Y-%m-%d") if today else datetime.now()
    start = end - timedelta(days=CONVERSION_BACKFILL_DAYS)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


# ─────────────────────────────────────────────────────────────
# 상태 + 변경 이력
# ─────────────────────────────────────────────────────────────

def _norm(v: Any) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, bool):
        return "1" if v else "0"
    return str(v)


def sync_entity_states(customer_id: str, entities: Iterable[Dict[str, Any]],
                       entity_type: str,
                       detect_removed: bool = True) -> Dict[str, int]:
    """현재 상태를 반영하고, **실제로 바뀐 필드만** 이력에 남긴다.

    detect_removed 는 이번 수집이 해당 타입의 전수일 때만 켠다.
    부분 수집에 켜면 안 넘어온 엔티티가 전부 '삭제됨'으로 기록된다.
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT entity_id, name, status, status_reason, enabled, daily_budget,
               bid_amt, use_group_bid, inspect_status, landing_url
        FROM ad_entity_state WHERE customer_id = ? AND entity_type = ?
    """, (customer_id, entity_type))
    prev = {r["entity_id"]: dict(r) for r in cur.fetchall()}

    seen = set()
    added = changed = 0
    change_rows: List[tuple] = []

    for e in entities:
        eid = e.get("entity_id")
        if not eid:
            continue
        seen.add(eid)
        cur_vals = {f: e.get(f) for f in TRACKED_FIELDS}
        old = prev.get(eid)

        if old is None:
            added += 1
            change_rows.append((customer_id, entity_type, eid, e.get("name"),
                                "__entity__", None, "created", "created"))
        else:
            for f in TRACKED_FIELDS:
                a, b = _norm(old.get(f)), _norm(cur_vals.get(f))
                if a != b:
                    changed += 1
                    change_rows.append((customer_id, entity_type, eid,
                                        e.get("name"), f, a, b, "updated"))

        cur.execute("""
            INSERT INTO ad_entity_state (
                customer_id, entity_type, entity_id, parent_id, name, status,
                status_reason, enabled, daily_budget, bid_amt, use_group_bid,
                inspect_status, landing_url, extra, first_seen, last_seen
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
            ON CONFLICT(customer_id, entity_type, entity_id) DO UPDATE SET
                parent_id      = excluded.parent_id,
                name           = excluded.name,
                status         = excluded.status,
                status_reason  = excluded.status_reason,
                enabled        = excluded.enabled,
                daily_budget   = excluded.daily_budget,
                bid_amt        = excluded.bid_amt,
                use_group_bid  = excluded.use_group_bid,
                inspect_status = excluded.inspect_status,
                landing_url    = excluded.landing_url,
                extra          = excluded.extra,
                last_seen      = CURRENT_TIMESTAMP
        """, (
            customer_id, entity_type, eid, e.get("parent_id"), e.get("name"),
            e.get("status"), e.get("status_reason"),
            None if e.get("enabled") is None else int(bool(e.get("enabled"))),
            e.get("daily_budget"), e.get("bid_amt"),
            None if e.get("use_group_bid") is None else int(bool(e.get("use_group_bid"))),
            e.get("inspect_status"), e.get("landing_url"),
            json.dumps(e.get("extra"), ensure_ascii=False) if e.get("extra") else None,
        ))

    removed = 0
    if detect_removed:
        gone = [eid for eid in prev if eid not in seen]
        for eid in gone:
            removed += 1
            change_rows.append((customer_id, entity_type, eid,
                                prev[eid].get("name"), "__entity__",
                                "present", "removed", "removed"))
        if gone:
            cur.executemany(
                "DELETE FROM ad_entity_state WHERE customer_id=? AND entity_type=? AND entity_id=?",
                [(customer_id, entity_type, eid) for eid in gone])

    if change_rows:
        cur.executemany("""
            INSERT INTO ad_entity_changes (
                customer_id, entity_type, entity_id, entity_name,
                field, old_value, new_value, change_kind
            ) VALUES (?,?,?,?,?,?,?,?)
        """, change_rows)

    conn.commit()
    conn.close()
    return {"seen": len(seen), "added": added, "changed": changed, "removed": removed}


def get_recent_changes(customer_id: str, hours: int = 24,
                       limit: int = 500,
                       entity_type: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    q = ("SELECT * FROM ad_entity_changes WHERE customer_id = ? "
         "AND detected_at >= datetime('now', ?)")
    args: List[Any] = [customer_id, f"-{int(hours)} hours"]
    if entity_type:
        q += " AND entity_type = ?"
        args.append(entity_type)
    q += " ORDER BY detected_at DESC, id DESC LIMIT ?"
    args.append(int(limit))
    cur.execute(q, args)
    out = [dict(r) for r in cur.fetchall()]
    conn.close()
    return out


def count_recent_changes(customer_id: str, hours: int = 24) -> Dict[str, int]:
    """대량 변경 감지용 — 대행사가 일괄 입찰을 밀어 넣은 경우를 잡는다."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT field, COUNT(*) AS n FROM ad_entity_changes
        WHERE customer_id = ? AND detected_at >= datetime('now', ?)
        GROUP BY field ORDER BY n DESC
    """, (customer_id, f"-{int(hours)} hours"))
    out = {r["field"]: r["n"] for r in cur.fetchall()}
    conn.close()
    return out


def prioritize_groups_for_ad_scan(customer_id: str, group_ids: List[str],
                                  limit: int,
                                  since: Optional[str] = None) -> List[str]:
    """소재를 확인할 광고그룹을 고른다 — 한 번에 다 못 볼 때의 순서 문제.

    소재 조회는 그룹당 1콜이라 큰 계정은 한 실행에 전수가 불가능하다. 매번
    앞에서부터 자르면 **뒤쪽 그룹은 영원히 안 보인다**. 그래서 회전시킨다:

      1) 아직 한 번도 소재를 못 본 그룹        (모르는 것부터)
      2) 마지막으로 본 지 가장 오래된 그룹      (오래된 것부터)
      각 묶음 안에서는 최근 광고비가 큰 순      (손실 규모가 큰 쪽부터)

    이렇게 하면 상한이 낮아도 며칠 안에 전 그룹이 한 번씩 커버된다.
    """
    if limit <= 0 or not group_ids:
        return []
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT parent_id AS gid, MIN(last_seen) AS seen
        FROM ad_entity_state
        WHERE customer_id = ? AND entity_type = 'AD' AND parent_id IS NOT NULL
        GROUP BY parent_id
    """, (customer_id,))
    seen = {r["gid"]: r["seen"] for r in cur.fetchall()}

    if since is None:
        since = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    cur.execute("""
        SELECT entity_id, SUM(cost) AS cost FROM ad_daily_stats
        WHERE customer_id = ? AND entity_type = 'ADGROUP' AND stat_date >= ?
        GROUP BY entity_id
    """, (customer_id, since))
    spend = {r["entity_id"]: (r["cost"] or 0) for r in cur.fetchall()}
    conn.close()

    def key(gid: str):
        # (본 적 있나, 마지막으로 본 시각, -광고비)
        s = seen.get(gid)
        return (1 if s else 0, s or "", -spend.get(gid, 0))

    return sorted(group_ids, key=key)[:limit]


def get_entity_states(customer_id: str, entity_type: str,
                      status: Optional[str] = None,
                      limit: int = 100000) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    q = "SELECT * FROM ad_entity_state WHERE customer_id = ? AND entity_type = ?"
    args: List[Any] = [customer_id, entity_type]
    if status:
        q += " AND status = ?"
        args.append(status)
    q += " LIMIT ?"
    args.append(int(limit))
    cur.execute(q, args)
    out = [dict(r) for r in cur.fetchall()]
    conn.close()
    return out


# ─────────────────────────────────────────────────────────────
# 수집 실행 기록
# ─────────────────────────────────────────────────────────────

def start_run(customer_id: str, kind: str) -> int:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("INSERT INTO ad_collect_runs (customer_id, kind, status) "
                "VALUES (?,?,'running')", (customer_id, kind))
    rid = cur.lastrowid
    conn.commit()
    conn.close()
    return rid


def finish_run(run_id: int, status: str, rows_written: int = 0, changes: int = 0,
               covered_from: Optional[str] = None, covered_to: Optional[str] = None,
               error: Optional[str] = None) -> None:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        UPDATE ad_collect_runs
        SET status=?, rows_written=?, changes=?, covered_from=?, covered_to=?,
            error=?, finished_at=CURRENT_TIMESTAMP
        WHERE id=?
    """, (status, int(rows_written), int(changes), covered_from, covered_to,
          (error or "")[:1000] or None, run_id))
    conn.commit()
    conn.close()


def last_run(customer_id: str, kind: Optional[str] = None) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    if kind:
        cur.execute("SELECT * FROM ad_collect_runs WHERE customer_id=? AND kind=? "
                    "ORDER BY id DESC LIMIT 1", (customer_id, kind))
    else:
        cur.execute("SELECT * FROM ad_collect_runs WHERE customer_id=? "
                    "ORDER BY id DESC LIMIT 1", (customer_id,))
    r = cur.fetchone()
    conn.close()
    return dict(r) if r else None
