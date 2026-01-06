"""
최적화 이력 데이터베이스
- 모든 최적화 변경 사항 기록
- 실시간 성과 추적
- 사용자에게 투명한 최적화 현황 제공
"""
import sqlite3
import json
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from pathlib import Path

# 데이터 경로
DATA_DIR = Path("/data") if Path("/data").exists() else Path("./data")
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "optimization_history.db"


def get_db_connection():
    """DB 연결"""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_optimization_tables():
    """최적화 관련 테이블 초기화"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 최적화 세션 (배치 단위)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS optimization_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform VARCHAR(50) NOT NULL,
            strategy VARCHAR(50) NOT NULL,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ended_at TIMESTAMP,
            status VARCHAR(20) DEFAULT 'running',
            total_changes INTEGER DEFAULT 0,
            total_saved_cost INTEGER DEFAULT 0,
            settings TEXT,
            summary TEXT
        )
    """)

    # 개별 최적화 액션
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS optimization_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            user_id INTEGER NOT NULL,
            platform VARCHAR(50) NOT NULL,
            action_type VARCHAR(50) NOT NULL,
            target_type VARCHAR(50),
            target_id VARCHAR(100),
            target_name VARCHAR(255),
            old_value TEXT,
            new_value TEXT,
            reason TEXT,
            impact_estimate TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES optimization_sessions(id)
        )
    """)

    # 실시간 성과 스냅샷
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS performance_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform VARCHAR(50) NOT NULL,
            snapshot_date DATE NOT NULL,
            snapshot_hour INTEGER DEFAULT 0,
            impressions INTEGER DEFAULT 0,
            clicks INTEGER DEFAULT 0,
            cost INTEGER DEFAULT 0,
            conversions INTEGER DEFAULT 0,
            revenue INTEGER DEFAULT 0,
            roas REAL DEFAULT 0,
            ctr REAL DEFAULT 0,
            cpc REAL DEFAULT 0,
            cpa REAL DEFAULT 0,
            avg_position REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, platform, snapshot_date, snapshot_hour)
        )
    """)

    # 최적화 알림/인사이트
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS optimization_insights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform VARCHAR(50) NOT NULL,
            insight_type VARCHAR(50) NOT NULL,
            severity VARCHAR(20) DEFAULT 'info',
            title VARCHAR(255) NOT NULL,
            description TEXT,
            recommendation TEXT,
            metric_name VARCHAR(50),
            metric_value REAL,
            metric_change REAL,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 인덱스 생성
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_actions_user ON optimization_actions(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_actions_session ON optimization_actions(session_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_actions_created ON optimization_actions(created_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_user_date ON performance_snapshots(user_id, platform, snapshot_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_insights_user ON optimization_insights(user_id, is_read)")

    conn.commit()
    conn.close()


# ============ 최적화 세션 관리 ============

def create_optimization_session(
    user_id: int,
    platform: str,
    strategy: str,
    settings: dict = None
) -> int:
    """최적화 세션 시작"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO optimization_sessions (user_id, platform, strategy, settings)
        VALUES (?, ?, ?, ?)
    """, (user_id, platform, strategy, json.dumps(settings or {})))
    session_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return session_id


def complete_optimization_session(
    session_id: int,
    total_changes: int,
    total_saved_cost: int = 0,
    summary: dict = None
):
    """최적화 세션 완료"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE optimization_sessions
        SET ended_at = CURRENT_TIMESTAMP,
            status = 'completed',
            total_changes = ?,
            total_saved_cost = ?,
            summary = ?
        WHERE id = ?
    """, (total_changes, total_saved_cost, json.dumps(summary or {}), session_id))
    conn.commit()
    conn.close()


def get_optimization_sessions(
    user_id: int,
    platform: str = None,
    limit: int = 20
) -> List[dict]:
    """최적화 세션 이력 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    if platform:
        cursor.execute("""
            SELECT * FROM optimization_sessions
            WHERE user_id = ? AND platform = ?
            ORDER BY started_at DESC
            LIMIT ?
        """, (user_id, platform, limit))
    else:
        cursor.execute("""
            SELECT * FROM optimization_sessions
            WHERE user_id = ?
            ORDER BY started_at DESC
            LIMIT ?
        """, (user_id, limit))

    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


# ============ 최적화 액션 기록 ============

def log_optimization_action(
    user_id: int,
    platform: str,
    action_type: str,
    target_type: str = None,
    target_id: str = None,
    target_name: str = None,
    old_value: Any = None,
    new_value: Any = None,
    reason: str = None,
    impact_estimate: dict = None,
    session_id: int = None
) -> int:
    """최적화 액션 기록"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO optimization_actions
        (session_id, user_id, platform, action_type, target_type, target_id,
         target_name, old_value, new_value, reason, impact_estimate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        session_id, user_id, platform, action_type, target_type, target_id,
        target_name,
        json.dumps(old_value) if isinstance(old_value, dict) else str(old_value) if old_value else None,
        json.dumps(new_value) if isinstance(new_value, dict) else str(new_value) if new_value else None,
        reason,
        json.dumps(impact_estimate) if impact_estimate else None
    ))
    action_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return action_id


def get_optimization_actions(
    user_id: int,
    platform: str = None,
    action_type: str = None,
    limit: int = 100,
    since: datetime = None
) -> List[dict]:
    """최적화 액션 이력 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM optimization_actions WHERE user_id = ?"
    params = [user_id]

    if platform:
        query += " AND platform = ?"
        params.append(platform)

    if action_type:
        query += " AND action_type = ?"
        params.append(action_type)

    if since:
        query += " AND created_at >= ?"
        params.append(since.isoformat())

    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_action_summary(user_id: int, days: int = 7) -> dict:
    """최적화 액션 요약"""
    conn = get_db_connection()
    cursor = conn.cursor()

    since = (datetime.now() - timedelta(days=days)).isoformat()

    # 플랫폼별 액션 수
    cursor.execute("""
        SELECT platform, action_type, COUNT(*) as count
        FROM optimization_actions
        WHERE user_id = ? AND created_at >= ?
        GROUP BY platform, action_type
    """, (user_id, since))

    by_platform = {}
    for row in cursor.fetchall():
        platform = row['platform']
        if platform not in by_platform:
            by_platform[platform] = {}
        by_platform[platform][row['action_type']] = row['count']

    # 총 변경 수
    cursor.execute("""
        SELECT COUNT(*) as total,
               COUNT(DISTINCT DATE(created_at)) as active_days
        FROM optimization_actions
        WHERE user_id = ? AND created_at >= ?
    """, (user_id, since))
    summary = dict(cursor.fetchone())

    conn.close()

    return {
        "total_actions": summary['total'],
        "active_days": summary['active_days'],
        "by_platform": by_platform,
        "period_days": days
    }


# ============ 성과 스냅샷 ============

def save_performance_snapshot(
    user_id: int,
    platform: str,
    impressions: int = 0,
    clicks: int = 0,
    cost: int = 0,
    conversions: int = 0,
    revenue: int = 0,
    avg_position: float = 0,
    snapshot_hour: int = None
):
    """성과 스냅샷 저장"""
    conn = get_db_connection()
    cursor = conn.cursor()

    now = datetime.now()
    snapshot_date = now.strftime("%Y-%m-%d")
    hour = snapshot_hour if snapshot_hour is not None else now.hour

    # 계산된 지표
    roas = (revenue / cost * 100) if cost > 0 else 0
    ctr = (clicks / impressions * 100) if impressions > 0 else 0
    cpc = cost / clicks if clicks > 0 else 0
    cpa = cost / conversions if conversions > 0 else 0

    cursor.execute("""
        INSERT OR REPLACE INTO performance_snapshots
        (user_id, platform, snapshot_date, snapshot_hour,
         impressions, clicks, cost, conversions, revenue,
         roas, ctr, cpc, cpa, avg_position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, platform, snapshot_date, hour,
        impressions, clicks, cost, conversions, revenue,
        roas, ctr, cpc, cpa, avg_position
    ))
    conn.commit()
    conn.close()


def get_performance_history(
    user_id: int,
    platform: str,
    days: int = 7
) -> List[dict]:
    """성과 이력 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    cursor.execute("""
        SELECT snapshot_date,
               SUM(impressions) as impressions,
               SUM(clicks) as clicks,
               SUM(cost) as cost,
               SUM(conversions) as conversions,
               SUM(revenue) as revenue,
               AVG(roas) as roas,
               AVG(ctr) as ctr,
               AVG(cpc) as cpc,
               AVG(cpa) as cpa,
               AVG(avg_position) as avg_position
        FROM performance_snapshots
        WHERE user_id = ? AND platform = ? AND snapshot_date >= ?
        GROUP BY snapshot_date
        ORDER BY snapshot_date ASC
    """, (user_id, platform, since))

    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_performance_comparison(
    user_id: int,
    platform: str
) -> dict:
    """기간별 성과 비교 (최근 7일 vs 이전 7일)"""
    conn = get_db_connection()
    cursor = conn.cursor()

    today = datetime.now().strftime("%Y-%m-%d")
    week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    two_weeks_ago = (datetime.now() - timedelta(days=14)).strftime("%Y-%m-%d")

    # 최근 7일
    cursor.execute("""
        SELECT
            SUM(impressions) as impressions,
            SUM(clicks) as clicks,
            SUM(cost) as cost,
            SUM(conversions) as conversions,
            SUM(revenue) as revenue
        FROM performance_snapshots
        WHERE user_id = ? AND platform = ? AND snapshot_date >= ?
    """, (user_id, platform, week_ago))
    current = dict(cursor.fetchone())

    # 이전 7일
    cursor.execute("""
        SELECT
            SUM(impressions) as impressions,
            SUM(clicks) as clicks,
            SUM(cost) as cost,
            SUM(conversions) as conversions,
            SUM(revenue) as revenue
        FROM performance_snapshots
        WHERE user_id = ? AND platform = ? AND snapshot_date >= ? AND snapshot_date < ?
    """, (user_id, platform, two_weeks_ago, week_ago))
    previous = dict(cursor.fetchone())

    conn.close()

    def calc_change(curr, prev):
        if not prev or prev == 0:
            return 0
        return ((curr or 0) - prev) / prev * 100

    return {
        "current_period": current,
        "previous_period": previous,
        "changes": {
            "impressions": calc_change(current.get('impressions'), previous.get('impressions')),
            "clicks": calc_change(current.get('clicks'), previous.get('clicks')),
            "cost": calc_change(current.get('cost'), previous.get('cost')),
            "conversions": calc_change(current.get('conversions'), previous.get('conversions')),
            "revenue": calc_change(current.get('revenue'), previous.get('revenue')),
        }
    }


# ============ 인사이트 ============

def create_insight(
    user_id: int,
    platform: str,
    insight_type: str,
    title: str,
    description: str = None,
    recommendation: str = None,
    severity: str = "info",
    metric_name: str = None,
    metric_value: float = None,
    metric_change: float = None
) -> int:
    """인사이트 생성"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO optimization_insights
        (user_id, platform, insight_type, severity, title, description,
         recommendation, metric_name, metric_value, metric_change)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, platform, insight_type, severity, title, description,
        recommendation, metric_name, metric_value, metric_change
    ))
    insight_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return insight_id


def get_insights(
    user_id: int,
    platform: str = None,
    unread_only: bool = False,
    limit: int = 20
) -> List[dict]:
    """인사이트 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM optimization_insights WHERE user_id = ?"
    params = [user_id]

    if platform:
        query += " AND platform = ?"
        params.append(platform)

    if unread_only:
        query += " AND is_read = FALSE"

    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def mark_insights_read(user_id: int, insight_ids: List[int] = None):
    """인사이트 읽음 처리"""
    conn = get_db_connection()
    cursor = conn.cursor()

    if insight_ids:
        placeholders = ','.join(['?' for _ in insight_ids])
        cursor.execute(f"""
            UPDATE optimization_insights
            SET is_read = TRUE
            WHERE user_id = ? AND id IN ({placeholders})
        """, [user_id] + insight_ids)
    else:
        cursor.execute("""
            UPDATE optimization_insights
            SET is_read = TRUE
            WHERE user_id = ?
        """, (user_id,))

    conn.commit()
    conn.close()


# 초기화
init_optimization_tables()
