"""
네이버 광고 최적화 데이터베이스 관리
"""
import sqlite3
import json
import logging
import os
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

# 데이터베이스 파일 경로 - /data 볼륨에 저장 (영속적)
# Windows 로컬 개발환경에서는 ./data 사용
import sys
if sys.platform == "win32":
    DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
else:
    DATA_DIR = os.environ.get("DATA_DIR", "/data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = Path(DATA_DIR) / "naver_ad.db"


def get_connection() -> sqlite3.Connection:
    """데이터베이스 연결"""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_naver_ad_tables():
    """테이블 초기화"""
    conn = get_connection()
    cursor = conn.cursor()

    # 광고 계정 설정 테이블 (API 자격 증명 포함)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ad_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            customer_id VARCHAR(50) NOT NULL,
            api_key VARCHAR(200),
            secret_key VARCHAR(200),
            name VARCHAR(200),
            is_connected BOOLEAN DEFAULT FALSE,
            is_active BOOLEAN DEFAULT TRUE,
            last_sync_at TIMESTAMP,
            connection_error TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, customer_id)
        )
    """)

    # 효율 추적 테이블 - 시간대별 성과 비교
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS efficiency_tracking (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date DATE NOT NULL,
            hour INTEGER DEFAULT 0,
            -- 최적화 전/후 비교
            cost_before INTEGER DEFAULT 0,
            cost_after INTEGER DEFAULT 0,
            cost_saved INTEGER DEFAULT 0,
            -- 성과 지표
            impressions INTEGER DEFAULT 0,
            clicks INTEGER DEFAULT 0,
            conversions INTEGER DEFAULT 0,
            revenue INTEGER DEFAULT 0,
            -- 효율 지표
            ctr_before REAL DEFAULT 0,
            ctr_after REAL DEFAULT 0,
            roas_before REAL DEFAULT 0,
            roas_after REAL DEFAULT 0,
            -- 순위 변화
            avg_position_before REAL DEFAULT 0,
            avg_position_after REAL DEFAULT 0,
            -- 입찰 변경 통계
            bid_changes_count INTEGER DEFAULT 0,
            total_bid_increase INTEGER DEFAULT 0,
            total_bid_decrease INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, date, hour)
        )
    """)

    # 트렌드 키워드 추천 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS trending_keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            keyword VARCHAR(200) NOT NULL,
            category VARCHAR(100),
            -- 검색량 트렌드
            search_volume_current INTEGER DEFAULT 0,
            search_volume_prev_week INTEGER DEFAULT 0,
            search_volume_change_rate REAL DEFAULT 0,
            -- 경쟁도 분석
            competition_level VARCHAR(20),
            competition_index REAL DEFAULT 0,
            suggested_bid INTEGER DEFAULT 0,
            -- 추천 점수
            opportunity_score REAL DEFAULT 0,
            relevance_score REAL DEFAULT 0,
            trend_score REAL DEFAULT 0,
            -- 상태
            is_recommended BOOLEAN DEFAULT TRUE,
            recommendation_reason TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            UNIQUE(user_id, keyword)
        )
    """)

    # 최적화 설정 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS optimization_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            strategy VARCHAR(50) DEFAULT 'balanced',
            target_roas REAL DEFAULT 300,
            target_position INTEGER DEFAULT 3,
            max_bid_change_ratio REAL DEFAULT 0.2,
            min_bid INTEGER DEFAULT 70,
            max_bid INTEGER DEFAULT 100000,
            min_ctr REAL DEFAULT 0.01,
            max_cost_no_conv INTEGER DEFAULT 50000,
            min_quality_score INTEGER DEFAULT 4,
            evaluation_days INTEGER DEFAULT 7,
            optimization_interval INTEGER DEFAULT 60,
            is_auto_optimization BOOLEAN DEFAULT FALSE,
            blacklist_keywords TEXT,
            core_terms TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 키워드 성과 이력 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS keyword_performance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            keyword_id VARCHAR(50) NOT NULL,
            keyword_text VARCHAR(200),
            ad_group_id VARCHAR(50),
            date DATE NOT NULL,
            impressions INTEGER DEFAULT 0,
            clicks INTEGER DEFAULT 0,
            cost INTEGER DEFAULT 0,
            conversions INTEGER DEFAULT 0,
            revenue INTEGER DEFAULT 0,
            avg_position REAL DEFAULT 0,
            ctr REAL DEFAULT 0,
            cpc INTEGER DEFAULT 0,
            cvr REAL DEFAULT 0,
            roas REAL DEFAULT 0,
            quality_score INTEGER DEFAULT 0,
            bid_amt INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, keyword_id, date)
        )
    """)

    # 입찰 변경 이력 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS bid_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            keyword_id VARCHAR(50) NOT NULL,
            keyword_text VARCHAR(200),
            old_bid INTEGER NOT NULL,
            new_bid INTEGER NOT NULL,
            change_amount INTEGER,
            change_ratio REAL,
            reason VARCHAR(500),
            strategy VARCHAR(50),
            changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 제외된 키워드 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS excluded_keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            keyword_id VARCHAR(50),
            keyword_text VARCHAR(200) NOT NULL,
            ad_group_id VARCHAR(50),
            reason VARCHAR(500),
            stats_snapshot TEXT,
            excluded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            restored_at TIMESTAMP,
            is_active BOOLEAN DEFAULT TRUE
        )
    """)

    # 발굴된 키워드 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS discovered_keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            seed_keyword VARCHAR(200),
            keyword VARCHAR(200) NOT NULL,
            monthly_search_count INTEGER DEFAULT 0,
            monthly_pc_search_count INTEGER DEFAULT 0,
            monthly_mobile_search_count INTEGER DEFAULT 0,
            competition_level VARCHAR(20),
            competition_index REAL DEFAULT 0,
            suggested_bid INTEGER DEFAULT 0,
            relevance_score REAL DEFAULT 0,
            potential_score REAL DEFAULT 0,
            status VARCHAR(20) DEFAULT 'pending',
            added_to_ad_group_id VARCHAR(50),
            discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            added_at TIMESTAMP
        )
    """)

    # 일일 최적화 리포트 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS daily_optimization_report (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date DATE NOT NULL,
            total_keywords INTEGER DEFAULT 0,
            optimized_keywords INTEGER DEFAULT 0,
            excluded_keywords INTEGER DEFAULT 0,
            discovered_keywords INTEGER DEFAULT 0,
            total_bid_changes INTEGER DEFAULT 0,
            avg_bid_change REAL DEFAULT 0,
            total_cost INTEGER DEFAULT 0,
            total_conversions INTEGER DEFAULT 0,
            total_revenue INTEGER DEFAULT 0,
            avg_roas REAL DEFAULT 0,
            avg_ctr REAL DEFAULT 0,
            avg_position REAL DEFAULT 0,
            report_data TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, date)
        )
    """)

    # 자동 최적화 로그 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS optimization_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            log_type VARCHAR(50) NOT NULL,
            message TEXT,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 인덱스 생성
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_kp_user_date ON keyword_performance(user_id, date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_kp_keyword ON keyword_performance(keyword_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_bh_user_date ON bid_history(user_id, changed_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ek_user ON excluded_keywords(user_id, is_active)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dk_user ON discovered_keywords(user_id, status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ol_user_type ON optimization_logs(user_id, log_type)")

    conn.commit()
    conn.close()
    logger.info("Naver Ad optimization tables initialized")


# ============ 최적화 설정 ============

def get_optimization_settings(user_id: int) -> Optional[dict]:
    """사용자 최적화 설정 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM optimization_settings WHERE user_id = ?
    """, (user_id,))

    row = cursor.fetchone()
    conn.close()

    if row:
        result = dict(row)
        # JSON 필드 파싱
        if result.get("blacklist_keywords"):
            result["blacklist_keywords"] = json.loads(result["blacklist_keywords"])
        else:
            result["blacklist_keywords"] = []
        if result.get("core_terms"):
            result["core_terms"] = json.loads(result["core_terms"])
        else:
            result["core_terms"] = []
        return result
    return None


def save_optimization_settings(user_id: int, settings: dict) -> dict:
    """최적화 설정 저장"""
    conn = get_connection()
    cursor = conn.cursor()

    # JSON 필드 직렬화
    blacklist = json.dumps(settings.get("blacklist_keywords", []))
    core_terms = json.dumps(settings.get("core_terms", []))

    cursor.execute("""
        INSERT INTO optimization_settings (
            user_id, strategy, target_roas, target_position,
            max_bid_change_ratio, min_bid, max_bid, min_ctr,
            max_cost_no_conv, min_quality_score, evaluation_days,
            optimization_interval, is_auto_optimization,
            blacklist_keywords, core_terms, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            strategy = excluded.strategy,
            target_roas = excluded.target_roas,
            target_position = excluded.target_position,
            max_bid_change_ratio = excluded.max_bid_change_ratio,
            min_bid = excluded.min_bid,
            max_bid = excluded.max_bid,
            min_ctr = excluded.min_ctr,
            max_cost_no_conv = excluded.max_cost_no_conv,
            min_quality_score = excluded.min_quality_score,
            evaluation_days = excluded.evaluation_days,
            optimization_interval = excluded.optimization_interval,
            is_auto_optimization = excluded.is_auto_optimization,
            blacklist_keywords = excluded.blacklist_keywords,
            core_terms = excluded.core_terms,
            updated_at = CURRENT_TIMESTAMP
    """, (
        user_id,
        settings.get("strategy", "balanced"),
        settings.get("target_roas", 300),
        settings.get("target_position", 3),
        settings.get("max_bid_change_ratio", 0.2),
        settings.get("min_bid", 70),
        settings.get("max_bid", 100000),
        settings.get("min_ctr", 0.01),
        settings.get("max_cost_no_conv", 50000),
        settings.get("min_quality_score", 4),
        settings.get("evaluation_days", 7),
        settings.get("optimization_interval", 60),
        settings.get("is_auto_optimization", False),
        blacklist,
        core_terms
    ))

    conn.commit()
    conn.close()

    return get_optimization_settings(user_id)


# ============ 입찰 변경 이력 ============

def save_bid_change(
    user_id: int,
    keyword_id: str,
    keyword_text: str,
    old_bid: int,
    new_bid: int,
    reason: str,
    strategy: str = "balanced"
):
    """입찰 변경 기록 저장"""
    conn = get_connection()
    cursor = conn.cursor()

    change_amount = new_bid - old_bid
    change_ratio = (new_bid - old_bid) / old_bid if old_bid > 0 else 0

    cursor.execute("""
        INSERT INTO bid_history (
            user_id, keyword_id, keyword_text, old_bid, new_bid,
            change_amount, change_ratio, reason, strategy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, keyword_id, keyword_text, old_bid, new_bid,
        change_amount, change_ratio, reason, strategy
    ))

    conn.commit()
    conn.close()


def get_bid_history(user_id: int, limit: int = 100, keyword_id: str = None) -> List[dict]:
    """입찰 변경 이력 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    if keyword_id:
        cursor.execute("""
            SELECT * FROM bid_history
            WHERE user_id = ? AND keyword_id = ?
            ORDER BY changed_at DESC
            LIMIT ?
        """, (user_id, keyword_id, limit))
    else:
        cursor.execute("""
            SELECT * FROM bid_history
            WHERE user_id = ?
            ORDER BY changed_at DESC
            LIMIT ?
        """, (user_id, limit))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_bid_changes_summary(user_id: int, days: int = 7) -> dict:
    """입찰 변경 요약 통계"""
    conn = get_connection()
    cursor = conn.cursor()

    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    cursor.execute("""
        SELECT
            COUNT(*) as total_changes,
            AVG(change_amount) as avg_change_amount,
            AVG(change_ratio) as avg_change_ratio,
            SUM(CASE WHEN change_amount > 0 THEN 1 ELSE 0 END) as increases,
            SUM(CASE WHEN change_amount < 0 THEN 1 ELSE 0 END) as decreases,
            COUNT(DISTINCT keyword_id) as unique_keywords
        FROM bid_history
        WHERE user_id = ? AND changed_at >= ?
    """, (user_id, start_date))

    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else {}


# ============ 키워드 성과 ============

def save_keyword_performance(user_id: int, performance_data: List[dict]):
    """키워드 성과 데이터 저장"""
    conn = get_connection()
    cursor = conn.cursor()

    for data in performance_data:
        cursor.execute("""
            INSERT INTO keyword_performance (
                user_id, keyword_id, keyword_text, ad_group_id, date,
                impressions, clicks, cost, conversions, revenue,
                avg_position, ctr, cpc, cvr, roas, quality_score, bid_amt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, keyword_id, date) DO UPDATE SET
                impressions = excluded.impressions,
                clicks = excluded.clicks,
                cost = excluded.cost,
                conversions = excluded.conversions,
                revenue = excluded.revenue,
                avg_position = excluded.avg_position,
                ctr = excluded.ctr,
                cpc = excluded.cpc,
                cvr = excluded.cvr,
                roas = excluded.roas,
                quality_score = excluded.quality_score,
                bid_amt = excluded.bid_amt
        """, (
            user_id,
            data.get("keyword_id"),
            data.get("keyword_text"),
            data.get("ad_group_id"),
            data.get("date"),
            data.get("impressions", 0),
            data.get("clicks", 0),
            data.get("cost", 0),
            data.get("conversions", 0),
            data.get("revenue", 0),
            data.get("avg_position", 0),
            data.get("ctr", 0),
            data.get("cpc", 0),
            data.get("cvr", 0),
            data.get("roas", 0),
            data.get("quality_score", 0),
            data.get("bid_amt", 0)
        ))

    conn.commit()
    conn.close()


def get_keyword_performance(
    user_id: int,
    start_date: str,
    end_date: str,
    keyword_id: str = None
) -> List[dict]:
    """키워드 성과 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    if keyword_id:
        cursor.execute("""
            SELECT * FROM keyword_performance
            WHERE user_id = ? AND keyword_id = ? AND date BETWEEN ? AND ?
            ORDER BY date DESC
        """, (user_id, keyword_id, start_date, end_date))
    else:
        cursor.execute("""
            SELECT * FROM keyword_performance
            WHERE user_id = ? AND date BETWEEN ? AND ?
            ORDER BY date DESC, cost DESC
        """, (user_id, start_date, end_date))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_performance_summary(user_id: int, days: int = 7) -> dict:
    """성과 요약 통계"""
    conn = get_connection()
    cursor = conn.cursor()

    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    cursor.execute("""
        SELECT
            SUM(impressions) as total_impressions,
            SUM(clicks) as total_clicks,
            SUM(cost) as total_cost,
            SUM(conversions) as total_conversions,
            SUM(revenue) as total_revenue,
            AVG(avg_position) as avg_position,
            COUNT(DISTINCT keyword_id) as active_keywords
        FROM keyword_performance
        WHERE user_id = ? AND date >= ?
    """, (user_id, start_date))

    row = cursor.fetchone()
    result = dict(row) if row else {}

    # CTR, ROAS 계산 (None 값 처리)
    total_impressions = result.get("total_impressions") or 0
    total_clicks = result.get("total_clicks") or 0
    total_cost = result.get("total_cost") or 0
    total_revenue = result.get("total_revenue") or 0

    if total_impressions > 0:
        result["avg_ctr"] = total_clicks / total_impressions
    else:
        result["avg_ctr"] = 0

    if total_cost > 0:
        result["roas"] = (total_revenue / total_cost) * 100
    else:
        result["roas"] = 0

    conn.close()
    return result


# ============ 제외 키워드 ============

def save_excluded_keyword(
    user_id: int,
    keyword_id: str,
    keyword_text: str,
    ad_group_id: str,
    reason: str,
    stats_snapshot: dict = None
):
    """제외된 키워드 저장"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO excluded_keywords (
            user_id, keyword_id, keyword_text, ad_group_id, reason, stats_snapshot
        ) VALUES (?, ?, ?, ?, ?, ?)
    """, (
        user_id, keyword_id, keyword_text, ad_group_id, reason,
        json.dumps(stats_snapshot) if stats_snapshot else None
    ))

    conn.commit()
    conn.close()


def get_excluded_keywords(user_id: int, include_restored: bool = False) -> List[dict]:
    """제외된 키워드 목록 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    if include_restored:
        cursor.execute("""
            SELECT * FROM excluded_keywords
            WHERE user_id = ?
            ORDER BY excluded_at DESC
        """, (user_id,))
    else:
        cursor.execute("""
            SELECT * FROM excluded_keywords
            WHERE user_id = ? AND is_active = TRUE
            ORDER BY excluded_at DESC
        """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    results = []
    for row in rows:
        item = dict(row)
        if item.get("stats_snapshot"):
            item["stats_snapshot"] = json.loads(item["stats_snapshot"])
        results.append(item)

    return results


def restore_excluded_keyword(user_id: int, keyword_id: str):
    """제외된 키워드 복원"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE excluded_keywords
        SET is_active = FALSE, restored_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND keyword_id = ? AND is_active = TRUE
    """, (user_id, keyword_id))

    conn.commit()
    conn.close()


# ============ 발굴 키워드 ============

def save_discovered_keywords(user_id: int, keywords: List[dict], seed_keyword: str = None):
    """발굴된 키워드 저장"""
    conn = get_connection()
    cursor = conn.cursor()

    for kw in keywords:
        cursor.execute("""
            INSERT INTO discovered_keywords (
                user_id, seed_keyword, keyword, monthly_search_count,
                monthly_pc_search_count, monthly_mobile_search_count,
                competition_level, competition_index, suggested_bid,
                relevance_score, potential_score
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            seed_keyword,
            kw.get("keyword"),
            kw.get("monthly_search_count", 0),
            kw.get("monthly_pc_search_count", 0),
            kw.get("monthly_mobile_search_count", 0),
            kw.get("competition_level"),
            kw.get("competition_index", 0),
            kw.get("suggested_bid", 0),
            kw.get("relevance_score", 0),
            kw.get("potential_score", 0)
        ))

    conn.commit()
    conn.close()


def get_discovered_keywords(user_id: int, status: str = None, limit: int = 100) -> List[dict]:
    """발굴된 키워드 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    if status:
        cursor.execute("""
            SELECT * FROM discovered_keywords
            WHERE user_id = ? AND status = ?
            ORDER BY potential_score DESC
            LIMIT ?
        """, (user_id, status, limit))
    else:
        cursor.execute("""
            SELECT * FROM discovered_keywords
            WHERE user_id = ?
            ORDER BY potential_score DESC
            LIMIT ?
        """, (user_id, limit))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def update_discovered_keyword_status(user_id: int, keyword: str, status: str, ad_group_id: str = None):
    """발굴 키워드 상태 업데이트"""
    conn = get_connection()
    cursor = conn.cursor()

    if status == "added" and ad_group_id:
        cursor.execute("""
            UPDATE discovered_keywords
            SET status = ?, added_to_ad_group_id = ?, added_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND keyword = ?
        """, (status, ad_group_id, user_id, keyword))
    else:
        cursor.execute("""
            UPDATE discovered_keywords
            SET status = ?
            WHERE user_id = ? AND keyword = ?
        """, (status, user_id, keyword))

    conn.commit()
    conn.close()


# ============ 일일 리포트 ============

def save_daily_report(user_id: int, date: str, report_data: dict):
    """일일 최적화 리포트 저장"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO daily_optimization_report (
            user_id, date, total_keywords, optimized_keywords,
            excluded_keywords, discovered_keywords, total_bid_changes,
            avg_bid_change, total_cost, total_conversions, total_revenue,
            avg_roas, avg_ctr, avg_position, report_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET
            total_keywords = excluded.total_keywords,
            optimized_keywords = excluded.optimized_keywords,
            excluded_keywords = excluded.excluded_keywords,
            discovered_keywords = excluded.discovered_keywords,
            total_bid_changes = excluded.total_bid_changes,
            avg_bid_change = excluded.avg_bid_change,
            total_cost = excluded.total_cost,
            total_conversions = excluded.total_conversions,
            total_revenue = excluded.total_revenue,
            avg_roas = excluded.avg_roas,
            avg_ctr = excluded.avg_ctr,
            avg_position = excluded.avg_position,
            report_data = excluded.report_data
    """, (
        user_id,
        date,
        report_data.get("total_keywords", 0),
        report_data.get("optimized_keywords", 0),
        report_data.get("excluded_keywords", 0),
        report_data.get("discovered_keywords", 0),
        report_data.get("total_bid_changes", 0),
        report_data.get("avg_bid_change", 0),
        report_data.get("total_cost", 0),
        report_data.get("total_conversions", 0),
        report_data.get("total_revenue", 0),
        report_data.get("avg_roas", 0),
        report_data.get("avg_ctr", 0),
        report_data.get("avg_position", 0),
        json.dumps(report_data)
    ))

    conn.commit()
    conn.close()


def get_daily_reports(user_id: int, days: int = 30) -> List[dict]:
    """일일 리포트 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM daily_optimization_report
        WHERE user_id = ?
        ORDER BY date DESC
        LIMIT ?
    """, (user_id, days))

    rows = cursor.fetchall()
    conn.close()

    results = []
    for row in rows:
        item = dict(row)
        if item.get("report_data"):
            item["report_data"] = json.loads(item["report_data"])
        results.append(item)

    return results


# ============ 로그 ============

def save_optimization_log(user_id: int, log_type: str, message: str, details: dict = None):
    """최적화 로그 저장"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO optimization_logs (user_id, log_type, message, details)
        VALUES (?, ?, ?, ?)
    """, (user_id, log_type, message, json.dumps(details) if details else None))

    conn.commit()
    conn.close()


def get_optimization_logs(user_id: int, log_type: str = None, limit: int = 100) -> List[dict]:
    """최적화 로그 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    if log_type:
        cursor.execute("""
            SELECT * FROM optimization_logs
            WHERE user_id = ? AND log_type = ?
            ORDER BY created_at DESC
            LIMIT ?
        """, (user_id, log_type, limit))
    else:
        cursor.execute("""
            SELECT * FROM optimization_logs
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        """, (user_id, limit))

    rows = cursor.fetchall()
    conn.close()

    results = []
    for row in rows:
        item = dict(row)
        if item.get("details"):
            item["details"] = json.loads(item["details"])
        results.append(item)

    return results


# ============ 대시보드 통계 ============

def get_dashboard_stats(user_id: int) -> dict:
    """대시보드 통계 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    today = datetime.now().strftime("%Y-%m-%d")
    week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

    # 오늘 입찰 변경
    cursor.execute("""
        SELECT COUNT(*) as count FROM bid_history
        WHERE user_id = ? AND DATE(changed_at) = ?
    """, (user_id, today))
    today_changes = cursor.fetchone()["count"]

    # 오늘 제외 키워드
    cursor.execute("""
        SELECT COUNT(*) as count FROM excluded_keywords
        WHERE user_id = ? AND DATE(excluded_at) = ? AND is_active = TRUE
    """, (user_id, today))
    today_excluded = cursor.fetchone()["count"]

    # 활성 키워드 수
    cursor.execute("""
        SELECT COUNT(DISTINCT keyword_id) as count FROM keyword_performance
        WHERE user_id = ? AND date >= ?
    """, (user_id, week_ago))
    active_keywords = cursor.fetchone()["count"]

    # 주간 성과 요약
    performance = get_performance_summary(user_id, 7)

    # 최적화 설정
    settings = get_optimization_settings(user_id)

    conn.close()

    return {
        "today_bid_changes": today_changes,
        "today_excluded": today_excluded,
        "active_keywords": active_keywords,
        "performance": performance,
        "is_auto_optimization": settings.get("is_auto_optimization", False) if settings else False,
        "strategy": settings.get("strategy", "balanced") if settings else "balanced"
    }


# ============ 광고 계정 관리 ============

def save_ad_account(user_id: int, customer_id: str, api_key: str, secret_key: str, name: str = None) -> dict:
    """광고 계정 자격 증명 저장"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO ad_accounts (user_id, customer_id, api_key, secret_key, name, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, customer_id) DO UPDATE SET
            api_key = excluded.api_key,
            secret_key = excluded.secret_key,
            name = excluded.name,
            updated_at = CURRENT_TIMESTAMP
    """, (user_id, customer_id, api_key, secret_key, name or f"광고계정_{customer_id}"))

    conn.commit()
    conn.close()

    return get_ad_account(user_id)


def get_ad_account(user_id: int) -> Optional[dict]:
    """사용자 광고 계정 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM ad_accounts WHERE user_id = ? AND is_active = TRUE
        ORDER BY updated_at DESC LIMIT 1
    """, (user_id,))

    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


def update_ad_account_status(user_id: int, customer_id: str, is_connected: bool, error: str = None):
    """광고 계정 연결 상태 업데이트"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE ad_accounts SET
            is_connected = ?,
            connection_error = ?,
            last_sync_at = CASE WHEN ? = TRUE THEN CURRENT_TIMESTAMP ELSE last_sync_at END,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND customer_id = ?
    """, (is_connected, error, is_connected, user_id, customer_id))

    conn.commit()
    conn.close()


def delete_ad_account(user_id: int, customer_id: str):
    """광고 계정 삭제 (비활성화)"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE ad_accounts SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND customer_id = ?
    """, (user_id, customer_id))

    conn.commit()
    conn.close()


# ============ 효율 추적 ============

def save_efficiency_tracking(user_id: int, data: dict):
    """효율 추적 데이터 저장"""
    conn = get_connection()
    cursor = conn.cursor()

    today = datetime.now().strftime("%Y-%m-%d")
    hour = datetime.now().hour

    cursor.execute("""
        INSERT INTO efficiency_tracking (
            user_id, date, hour,
            cost_before, cost_after, cost_saved,
            impressions, clicks, conversions, revenue,
            ctr_before, ctr_after, roas_before, roas_after,
            avg_position_before, avg_position_after,
            bid_changes_count, total_bid_increase, total_bid_decrease
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, date, hour) DO UPDATE SET
            cost_after = cost_after + excluded.cost_after,
            cost_saved = cost_saved + excluded.cost_saved,
            impressions = impressions + excluded.impressions,
            clicks = clicks + excluded.clicks,
            conversions = conversions + excluded.conversions,
            revenue = revenue + excluded.revenue,
            ctr_after = excluded.ctr_after,
            roas_after = excluded.roas_after,
            avg_position_after = excluded.avg_position_after,
            bid_changes_count = bid_changes_count + excluded.bid_changes_count,
            total_bid_increase = total_bid_increase + excluded.total_bid_increase,
            total_bid_decrease = total_bid_decrease + excluded.total_bid_decrease
    """, (
        user_id, today, hour,
        data.get("cost_before", 0), data.get("cost_after", 0), data.get("cost_saved", 0),
        data.get("impressions", 0), data.get("clicks", 0), data.get("conversions", 0), data.get("revenue", 0),
        data.get("ctr_before", 0), data.get("ctr_after", 0), data.get("roas_before", 0), data.get("roas_after", 0),
        data.get("avg_position_before", 0), data.get("avg_position_after", 0),
        data.get("bid_changes_count", 0), data.get("total_bid_increase", 0), data.get("total_bid_decrease", 0)
    ))

    conn.commit()
    conn.close()


def get_efficiency_summary(user_id: int, days: int = 7) -> dict:
    """효율 개선 요약 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    cursor.execute("""
        SELECT
            SUM(cost_saved) as total_saved,
            SUM(cost_before) as total_cost_before,
            SUM(cost_after) as total_cost_after,
            SUM(impressions) as total_impressions,
            SUM(clicks) as total_clicks,
            SUM(conversions) as total_conversions,
            SUM(revenue) as total_revenue,
            SUM(bid_changes_count) as total_bid_changes,
            AVG(roas_before) as avg_roas_before,
            AVG(roas_after) as avg_roas_after,
            AVG(ctr_before) as avg_ctr_before,
            AVG(ctr_after) as avg_ctr_after,
            AVG(avg_position_before) as avg_position_before,
            AVG(avg_position_after) as avg_position_after
        FROM efficiency_tracking
        WHERE user_id = ? AND date >= ?
    """, (user_id, start_date))

    row = cursor.fetchone()
    conn.close()

    if row and row["total_cost_before"]:
        total_cost_before = row["total_cost_before"] or 1
        return {
            "total_saved": row["total_saved"] or 0,
            "total_cost_before": total_cost_before,
            "total_cost_after": row["total_cost_after"] or 0,
            "savings_rate": round((row["total_saved"] or 0) / total_cost_before * 100, 1),
            "total_impressions": row["total_impressions"] or 0,
            "total_clicks": row["total_clicks"] or 0,
            "total_conversions": row["total_conversions"] or 0,
            "total_revenue": row["total_revenue"] or 0,
            "total_bid_changes": row["total_bid_changes"] or 0,
            "roas_improvement": round((row["avg_roas_after"] or 0) - (row["avg_roas_before"] or 0), 1),
            "ctr_improvement": round(((row["avg_ctr_after"] or 0) - (row["avg_ctr_before"] or 0)) * 100, 2),
            "position_improvement": round((row["avg_position_before"] or 0) - (row["avg_position_after"] or 0), 1),
            "avg_roas_before": round(row["avg_roas_before"] or 0, 1),
            "avg_roas_after": round(row["avg_roas_after"] or 0, 1)
        }

    return {
        "total_saved": 0, "savings_rate": 0,
        "total_bid_changes": 0, "roas_improvement": 0,
        "ctr_improvement": 0, "position_improvement": 0
    }


def get_efficiency_history(user_id: int, days: int = 30) -> List[dict]:
    """일별 효율 추적 이력"""
    conn = get_connection()
    cursor = conn.cursor()

    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    cursor.execute("""
        SELECT
            date,
            SUM(cost_saved) as cost_saved,
            SUM(impressions) as impressions,
            SUM(clicks) as clicks,
            SUM(conversions) as conversions,
            SUM(revenue) as revenue,
            SUM(bid_changes_count) as bid_changes,
            AVG(roas_after) as roas,
            AVG(ctr_after) as ctr
        FROM efficiency_tracking
        WHERE user_id = ? AND date >= ?
        GROUP BY date
        ORDER BY date ASC
    """, (user_id, start_date))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


# ============ 트렌드 키워드 ============

def save_trending_keywords(user_id: int, keywords: List[dict]):
    """트렌드 키워드 저장"""
    conn = get_connection()
    cursor = conn.cursor()

    expires_at = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")

    for kw in keywords:
        cursor.execute("""
            INSERT INTO trending_keywords (
                user_id, keyword, category,
                search_volume_current, search_volume_prev_week, search_volume_change_rate,
                competition_level, competition_index, suggested_bid,
                opportunity_score, relevance_score, trend_score,
                recommendation_reason, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, keyword) DO UPDATE SET
                search_volume_current = excluded.search_volume_current,
                search_volume_change_rate = excluded.search_volume_change_rate,
                opportunity_score = excluded.opportunity_score,
                trend_score = excluded.trend_score,
                recommendation_reason = excluded.recommendation_reason,
                expires_at = excluded.expires_at,
                discovered_at = CURRENT_TIMESTAMP
        """, (
            user_id, kw.get("keyword"), kw.get("category"),
            kw.get("search_volume_current", 0), kw.get("search_volume_prev_week", 0),
            kw.get("search_volume_change_rate", 0),
            kw.get("competition_level"), kw.get("competition_index", 0), kw.get("suggested_bid", 0),
            kw.get("opportunity_score", 0), kw.get("relevance_score", 0), kw.get("trend_score", 0),
            kw.get("recommendation_reason"), expires_at
        ))

    conn.commit()
    conn.close()


def get_trending_keywords(user_id: int, limit: int = 20) -> List[dict]:
    """트렌드 키워드 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM trending_keywords
        WHERE user_id = ? AND is_recommended = TRUE AND status = 'pending'
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        ORDER BY opportunity_score DESC, trend_score DESC
        LIMIT ?
    """, (user_id, limit))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def update_trending_keyword_status(user_id: int, keyword: str, status: str):
    """트렌드 키워드 상태 업데이트"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE trending_keywords SET status = ?
        WHERE user_id = ? AND keyword = ?
    """, (status, user_id, keyword))

    conn.commit()
    conn.close()
