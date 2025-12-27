"""
광고 최적화 데이터베이스
- 광고 계정 자격증명 (암호화)
- 최적화 설정
- 최적화 이력
- 성과 추적
"""
import sqlite3
import json
import hashlib
import base64
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from cryptography.fernet import Fernet
import os

from config import settings

# 암호화 키 (실제 운영에서는 환경변수로 관리)
ENCRYPTION_KEY = os.getenv("AD_ENCRYPTION_KEY", Fernet.generate_key().decode())

def get_cipher():
    """암호화 객체 생성"""
    key = ENCRYPTION_KEY.encode() if isinstance(ENCRYPTION_KEY, str) else ENCRYPTION_KEY
    # 키 길이 맞추기
    if len(key) != 44:
        key = base64.urlsafe_b64encode(hashlib.sha256(key).digest())
    return Fernet(key)


def get_ad_db_path():
    """DB 경로"""
    data_dir = getattr(settings, 'DATA_DIR', '/data')
    # 디렉토리가 없으면 생성
    if not os.path.exists(data_dir):
        os.makedirs(data_dir, exist_ok=True)
    return f"{data_dir}/ad_optimization.db"


def get_ad_db():
    """DB 연결"""
    db_path = get_ad_db_path()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_ad_optimization_tables():
    """광고 최적화 테이블 초기화"""
    conn = get_ad_db()
    cursor = conn.cursor()

    # 1. 광고 계정 자격증명 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ad_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform_id TEXT NOT NULL,
            account_name TEXT,
            credentials_encrypted TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 1,
            connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_sync_at TIMESTAMP,
            UNIQUE(user_id, platform_id)
        )
    """)

    # 2. 최적화 설정 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS optimization_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform_id TEXT NOT NULL,
            strategy TEXT DEFAULT 'balanced',
            target_roas REAL DEFAULT 300,
            target_cpa REAL DEFAULT 20000,
            min_bid REAL DEFAULT 70,
            max_bid REAL DEFAULT 100000,
            max_bid_change_ratio REAL DEFAULT 0.2,
            is_auto_enabled BOOLEAN DEFAULT 0,
            optimization_interval INTEGER DEFAULT 60,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, platform_id)
        )
    """)

    # 3. 최적화 실행 이력 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS optimization_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform_id TEXT NOT NULL,
            execution_type TEXT DEFAULT 'auto',
            strategy TEXT,
            total_changes INTEGER DEFAULT 0,
            changes_json TEXT,
            status TEXT DEFAULT 'success',
            error_message TEXT,
            executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 4. 입찰가 변경 이력 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS bid_change_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            entity_name TEXT,
            old_bid REAL NOT NULL,
            new_bid REAL NOT NULL,
            change_reason TEXT,
            applied BOOLEAN DEFAULT 0,
            applied_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 5. 성과 스냅샷 테이블 (일별)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS performance_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform_id TEXT NOT NULL,
            snapshot_date DATE NOT NULL,
            impressions INTEGER DEFAULT 0,
            clicks INTEGER DEFAULT 0,
            cost REAL DEFAULT 0,
            conversions INTEGER DEFAULT 0,
            revenue REAL DEFAULT 0,
            ctr REAL DEFAULT 0,
            cpc REAL DEFAULT 0,
            cpa REAL DEFAULT 0,
            roas REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, platform_id, snapshot_date)
        )
    """)

    # 6. ROI 추적 테이블 (최적화 전/후 비교)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS roi_tracking (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform_id TEXT NOT NULL,
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            before_roas REAL,
            after_roas REAL,
            before_cpa REAL,
            after_cpa REAL,
            before_conversions INTEGER,
            after_conversions INTEGER,
            cost_saved REAL DEFAULT 0,
            revenue_gained REAL DEFAULT 0,
            total_optimizations INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 7. 알림 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ad_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform_id TEXT,
            notification_type TEXT NOT NULL,
            severity TEXT DEFAULT 'info',
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            data_json TEXT,
            is_read BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 8. 예산 배분 이력 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS budget_allocation_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            total_budget REAL NOT NULL,
            allocation_strategy TEXT,
            allocations_json TEXT NOT NULL,
            applied BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 인덱스 생성
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ad_accounts_user ON ad_accounts(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_opt_history_user ON optimization_history(user_id, platform_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_bid_history_user ON bid_change_history(user_id, platform_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_perf_snapshot ON performance_snapshots(user_id, platform_id, snapshot_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_notifications_user ON ad_notifications(user_id, is_read)")

    conn.commit()
    conn.close()


# ============ 계정 관리 ============

def save_ad_account(
    user_id: int,
    platform_id: str,
    credentials: Dict[str, str],
    account_name: Optional[str] = None
) -> int:
    """광고 계정 저장 (암호화)"""
    cipher = get_cipher()
    credentials_json = json.dumps(credentials)
    credentials_encrypted = cipher.encrypt(credentials_json.encode()).decode()

    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT OR REPLACE INTO ad_accounts
        (user_id, platform_id, account_name, credentials_encrypted, connected_at, is_active)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
    """, (user_id, platform_id, account_name, credentials_encrypted))

    account_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return account_id


def get_ad_account(user_id: int, platform_id: str) -> Optional[Dict[str, Any]]:
    """광고 계정 조회 (복호화)"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM ad_accounts
        WHERE user_id = ? AND platform_id = ? AND is_active = 1
    """, (user_id, platform_id))

    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    cipher = get_cipher()
    try:
        credentials_json = cipher.decrypt(row["credentials_encrypted"].encode()).decode()
        credentials = json.loads(credentials_json)
    except:
        credentials = {}

    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "platform_id": row["platform_id"],
        "account_name": row["account_name"],
        "credentials": credentials,
        "is_active": row["is_active"],
        "connected_at": row["connected_at"],
        "last_sync_at": row["last_sync_at"],
    }


def get_user_ad_accounts(user_id: int) -> List[Dict[str, Any]]:
    """사용자의 모든 광고 계정 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, user_id, platform_id, account_name, is_active, connected_at, last_sync_at
        FROM ad_accounts WHERE user_id = ? AND is_active = 1
    """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def delete_ad_account(user_id: int, platform_id: str) -> bool:
    """광고 계정 삭제 (soft delete)"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE ad_accounts SET is_active = 0
        WHERE user_id = ? AND platform_id = ?
    """, (user_id, platform_id))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0


# ============ 최적화 설정 ============

def save_optimization_settings(
    user_id: int,
    platform_id: str,
    settings: Dict[str, Any]
) -> int:
    """최적화 설정 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT OR REPLACE INTO optimization_settings
        (user_id, platform_id, strategy, target_roas, target_cpa,
         min_bid, max_bid, max_bid_change_ratio, is_auto_enabled,
         optimization_interval, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (
        user_id, platform_id,
        settings.get("strategy", "balanced"),
        settings.get("target_roas", 300),
        settings.get("target_cpa", 20000),
        settings.get("min_bid", 70),
        settings.get("max_bid", 100000),
        settings.get("max_bid_change_ratio", 0.2),
        settings.get("is_auto_enabled", False),
        settings.get("optimization_interval", 60),
    ))

    setting_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return setting_id


def get_optimization_settings(user_id: int, platform_id: str) -> Dict[str, Any]:
    """최적화 설정 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM optimization_settings
        WHERE user_id = ? AND platform_id = ?
    """, (user_id, platform_id))

    row = cursor.fetchone()
    conn.close()

    if not row:
        return {
            "strategy": "balanced",
            "target_roas": 300,
            "target_cpa": 20000,
            "min_bid": 70,
            "max_bid": 100000,
            "max_bid_change_ratio": 0.2,
            "is_auto_enabled": False,
            "optimization_interval": 60,
        }

    return dict(row)


def get_auto_optimization_accounts() -> List[Dict[str, Any]]:
    """자동 최적화가 활성화된 모든 계정 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            a.user_id, a.platform_id, a.credentials_encrypted, a.account_name,
            s.strategy, s.target_roas, s.target_cpa, s.min_bid, s.max_bid,
            s.max_bid_change_ratio, s.optimization_interval
        FROM ad_accounts a
        JOIN optimization_settings s ON a.user_id = s.user_id AND a.platform_id = s.platform_id
        WHERE a.is_active = 1 AND s.is_auto_enabled = 1
    """)

    rows = cursor.fetchall()
    conn.close()

    cipher = get_cipher()
    accounts = []

    for row in rows:
        try:
            credentials_json = cipher.decrypt(row["credentials_encrypted"].encode()).decode()
            credentials = json.loads(credentials_json)
        except:
            credentials = {}

        accounts.append({
            "user_id": row["user_id"],
            "platform_id": row["platform_id"],
            "account_name": row["account_name"],
            "credentials": credentials,
            "settings": {
                "strategy": row["strategy"],
                "target_roas": row["target_roas"],
                "target_cpa": row["target_cpa"],
                "min_bid": row["min_bid"],
                "max_bid": row["max_bid"],
                "max_bid_change_ratio": row["max_bid_change_ratio"],
            },
            "optimization_interval": row["optimization_interval"],
        })

    return accounts


# ============ 최적화 이력 ============

def save_optimization_history(
    user_id: int,
    platform_id: str,
    execution_type: str,
    strategy: str,
    changes: List[Dict[str, Any]],
    status: str = "success",
    error_message: Optional[str] = None
) -> int:
    """최적화 실행 이력 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO optimization_history
        (user_id, platform_id, execution_type, strategy, total_changes, changes_json, status, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, platform_id, execution_type, strategy,
        len(changes), json.dumps(changes, ensure_ascii=False),
        status, error_message
    ))

    history_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return history_id


def get_optimization_history(
    user_id: int,
    platform_id: Optional[str] = None,
    days: int = 30,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """최적화 이력 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    query = """
        SELECT * FROM optimization_history
        WHERE user_id = ?
        AND executed_at >= datetime('now', ?)
    """
    params = [user_id, f"-{days} days"]

    if platform_id:
        query += " AND platform_id = ?"
        params.append(platform_id)

    query += " ORDER BY executed_at DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    result = []
    for row in rows:
        item = dict(row)
        if item.get("changes_json"):
            item["changes"] = json.loads(item["changes_json"])
        result.append(item)

    return result


# ============ 입찰가 변경 이력 ============

def save_bid_change(
    user_id: int,
    platform_id: str,
    entity_type: str,
    entity_id: str,
    entity_name: str,
    old_bid: float,
    new_bid: float,
    reason: str,
    applied: bool = False
) -> int:
    """입찰가 변경 이력 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO bid_change_history
        (user_id, platform_id, entity_type, entity_id, entity_name,
         old_bid, new_bid, change_reason, applied, applied_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, platform_id, entity_type, entity_id, entity_name,
        old_bid, new_bid, reason, applied,
        datetime.now().isoformat() if applied else None
    ))

    change_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return change_id


def get_bid_change_history(
    user_id: int,
    platform_id: Optional[str] = None,
    days: int = 7
) -> List[Dict[str, Any]]:
    """입찰가 변경 이력 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    query = """
        SELECT * FROM bid_change_history
        WHERE user_id = ?
        AND created_at >= datetime('now', ?)
    """
    params = [user_id, f"-{days} days"]

    if platform_id:
        query += " AND platform_id = ?"
        params.append(platform_id)

    query += " ORDER BY created_at DESC"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


# ============ 성과 스냅샷 ============

def save_performance_snapshot(
    user_id: int,
    platform_id: str,
    snapshot_date: str,
    metrics: Dict[str, Any]
) -> int:
    """성과 스냅샷 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT OR REPLACE INTO performance_snapshots
        (user_id, platform_id, snapshot_date, impressions, clicks, cost,
         conversions, revenue, ctr, cpc, cpa, roas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, platform_id, snapshot_date,
        metrics.get("impressions", 0),
        metrics.get("clicks", 0),
        metrics.get("cost", 0),
        metrics.get("conversions", 0),
        metrics.get("revenue", 0),
        metrics.get("ctr", 0),
        metrics.get("cpc", 0),
        metrics.get("cpa", 0),
        metrics.get("roas", 0),
    ))

    snapshot_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return snapshot_id


def get_performance_history(
    user_id: int,
    platform_id: Optional[str] = None,
    days: int = 30
) -> List[Dict[str, Any]]:
    """성과 히스토리 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    query = """
        SELECT * FROM performance_snapshots
        WHERE user_id = ?
        AND snapshot_date >= date('now', ?)
    """
    params = [user_id, f"-{days} days"]

    if platform_id:
        query += " AND platform_id = ?"
        params.append(platform_id)

    query += " ORDER BY snapshot_date DESC"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


# ============ ROI 추적 ============

def save_roi_tracking(
    user_id: int,
    platform_id: str,
    period_start: str,
    period_end: str,
    before_metrics: Dict[str, Any],
    after_metrics: Dict[str, Any],
    total_optimizations: int
) -> int:
    """ROI 추적 데이터 저장"""
    cost_saved = max(0, before_metrics.get("cpa", 0) - after_metrics.get("cpa", 0)) * after_metrics.get("conversions", 0)
    revenue_gained = after_metrics.get("revenue", 0) - before_metrics.get("revenue", 0)

    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO roi_tracking
        (user_id, platform_id, period_start, period_end,
         before_roas, after_roas, before_cpa, after_cpa,
         before_conversions, after_conversions,
         cost_saved, revenue_gained, total_optimizations)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, platform_id, period_start, period_end,
        before_metrics.get("roas", 0), after_metrics.get("roas", 0),
        before_metrics.get("cpa", 0), after_metrics.get("cpa", 0),
        before_metrics.get("conversions", 0), after_metrics.get("conversions", 0),
        cost_saved, revenue_gained, total_optimizations
    ))

    roi_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return roi_id


def get_roi_summary(user_id: int, days: int = 30) -> Dict[str, Any]:
    """ROI 요약 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            SUM(cost_saved) as total_cost_saved,
            SUM(revenue_gained) as total_revenue_gained,
            SUM(total_optimizations) as total_optimizations,
            AVG(after_roas - before_roas) as avg_roas_improvement,
            AVG(before_cpa - after_cpa) as avg_cpa_reduction
        FROM roi_tracking
        WHERE user_id = ?
        AND created_at >= datetime('now', ?)
    """, (user_id, f"-{days} days"))

    row = cursor.fetchone()
    conn.close()

    if row:
        return {
            "total_cost_saved": row["total_cost_saved"] or 0,
            "total_revenue_gained": row["total_revenue_gained"] or 0,
            "total_optimizations": row["total_optimizations"] or 0,
            "avg_roas_improvement": row["avg_roas_improvement"] or 0,
            "avg_cpa_reduction": row["avg_cpa_reduction"] or 0,
        }

    return {
        "total_cost_saved": 0,
        "total_revenue_gained": 0,
        "total_optimizations": 0,
        "avg_roas_improvement": 0,
        "avg_cpa_reduction": 0,
    }


# ============ 알림 ============

def create_notification(
    user_id: int,
    notification_type: str,
    title: str,
    message: str,
    platform_id: Optional[str] = None,
    severity: str = "info",
    data: Optional[Dict[str, Any]] = None
) -> int:
    """알림 생성"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO ad_notifications
        (user_id, platform_id, notification_type, severity, title, message, data_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, platform_id, notification_type, severity,
        title, message, json.dumps(data) if data else None
    ))

    notification_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return notification_id


def get_notifications(
    user_id: int,
    unread_only: bool = False,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """알림 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    query = "SELECT * FROM ad_notifications WHERE user_id = ?"
    params = [user_id]

    if unread_only:
        query += " AND is_read = 0"

    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    result = []
    for row in rows:
        item = dict(row)
        if item.get("data_json"):
            item["data"] = json.loads(item["data_json"])
        result.append(item)

    return result


def mark_notification_read(notification_id: int) -> bool:
    """알림 읽음 처리"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE ad_notifications SET is_read = 1 WHERE id = ?
    """, (notification_id,))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0


# ============ 키워드별 성과 비교 ============

def get_keyword_performance_comparison(
    user_id: int,
    platform_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """키워드별 최적화 전/후 성과 비교"""
    conn = get_ad_db()
    cursor = conn.cursor()

    # 입찰가 변경 이력이 있는 키워드 조회
    query = """
        SELECT
            b.entity_id as keyword_id,
            b.entity_name as keyword_text,
            b.platform_id,
            MIN(b.old_bid) as first_bid,
            MAX(b.new_bid) as latest_bid,
            MIN(b.created_at) as first_change,
            MAX(b.created_at) as last_optimized,
            COUNT(*) as optimization_count
        FROM bid_change_history b
        WHERE b.user_id = ?
        AND b.entity_type = 'keyword'
        AND b.applied = 1
    """
    params = [user_id]

    if platform_id:
        query += " AND b.platform_id = ?"
        params.append(platform_id)

    query += " GROUP BY b.entity_id, b.entity_name, b.platform_id"
    query += " ORDER BY b.created_at DESC LIMIT 50"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    # 실제 입찰가 변경 이력만 반환 (더미 성과 데이터 없음)
    result = []
    for row in rows:
        item = dict(row)

        # 실제 입찰가 데이터만 포함 - 성과 데이터는 API에서 별도 조회 필요
        result.append({
            "keyword_id": item["keyword_id"],
            "keyword_text": item["keyword_text"],
            "platform_id": item["platform_id"],
            "before": {
                "bid": item["first_bid"],
                "roas": None,  # 실제 API 조회 필요
                "cpa": None,
                "conversions": None,
                "cost": None,
                "revenue": None,
                "impressions": None,
                "clicks": None,
            },
            "after": {
                "bid": item["latest_bid"],
                "roas": None,  # 실제 API 조회 필요
                "cpa": None,
                "conversions": None,
                "cost": None,
                "revenue": None,
                "impressions": None,
                "clicks": None,
            },
            "changes": {
                "bid_change": item["latest_bid"] - item["first_bid"],
                "bid_change_percent": ((item["latest_bid"] - item["first_bid"]) / item["first_bid"] * 100) if item["first_bid"] > 0 else 0,
            },
            "first_change": item["first_change"],
            "last_optimized": item["last_optimized"],
            "optimization_count": item["optimization_count"],
            "data_available": False,  # 실제 성과 데이터 미제공 표시
        })

    return result


def get_daily_performance_trends(
    user_id: int,
    days: int = 14
) -> List[Dict[str, Any]]:
    """일별 성과 추이"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            snapshot_date as date,
            SUM(impressions) as impressions,
            SUM(clicks) as clicks,
            SUM(cost) as cost,
            SUM(conversions) as conversions,
            SUM(revenue) as revenue,
            AVG(roas) as roas,
            AVG(cpa) as cpa,
            AVG(ctr) as ctr,
            AVG(cpc) as cpc
        FROM performance_snapshots
        WHERE user_id = ?
        AND snapshot_date >= date('now', ?)
        GROUP BY snapshot_date
        ORDER BY snapshot_date ASC
    """, (user_id, f"-{days} days"))

    rows = cursor.fetchall()
    conn.close()

    # 데이터가 없으면 빈 배열 반환 (더미 데이터 사용 안함)
    if not rows:
        return []

    return [dict(row) for row in rows]


def generate_estimated_trends(days: int = 14) -> List[Dict[str, Any]]:
    """[DEPRECATED] 추정 성과 추이 생성 - 더 이상 사용하지 않음"""
    # 더미 데이터 생성 함수는 더 이상 사용하지 않음
    # 실제 데이터가 없으면 빈 배열 반환
    return []


def _deprecated_generate_estimated_trends(days: int = 14) -> List[Dict[str, Any]]:
    """[DEPRECATED] 이전 버전 호환용 - 더미 데이터 생성"""
    from datetime import datetime, timedelta

    trends = []
    base_date = datetime.now()

    for i in range(days):
        date = base_date - timedelta(days=days - i - 1)

        # 시간에 따른 점진적 개선 시뮬레이션
        improvement = 1 + (i * 0.02)  # 하루당 2% 개선

        base_roas = 200
        base_cpa = 18000
        base_conversions = 15

        trends.append({
            "date": date.strftime("%m/%d"),
            "roas": base_roas * improvement + (hash(str(i)) % 30),
            "cpa": base_cpa / improvement + (hash(str(i + 100)) % 2000),
            "conversions": int(base_conversions * improvement) + (hash(str(i + 200)) % 5),
            "cost": (base_conversions * improvement) * (base_cpa / improvement),
            "revenue": (base_conversions * improvement) * (base_cpa / improvement) * (base_roas * improvement / 100),
            "impressions": 5000 + (hash(str(i + 300)) % 2000),
            "clicks": 100 + (hash(str(i + 400)) % 50),
            "ctr": 2.0 + (hash(str(i + 500)) % 10) / 10,
            "cpc": 500 + (hash(str(i + 600)) % 200),
        })

    return trends


# 초기화 시 테이블 생성
try:
    init_ad_optimization_tables()
except Exception as e:
    import logging
    logging.getLogger(__name__).warning(f"Failed to initialize ad optimization tables: {e}")
