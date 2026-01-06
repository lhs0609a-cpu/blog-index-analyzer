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
    import sys
    if sys.platform == "win32":
        default_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    else:
        default_dir = "/data"
    data_dir = getattr(settings, 'DATA_DIR', default_dir)
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

    # 9. 시간대별 입찰 스케줄 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hourly_bid_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform_id TEXT NOT NULL,
            campaign_id TEXT,
            hourly_modifiers TEXT NOT NULL,
            daily_modifiers TEXT NOT NULL,
            special_slots TEXT,
            auto_optimize BOOLEAN DEFAULT 1,
            learning_rate REAL DEFAULT 0.1,
            is_enabled BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, platform_id, campaign_id)
        )
    """)

    # 10. 시간대별 성과 데이터 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hourly_performance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform_id TEXT NOT NULL,
            recorded_at TIMESTAMP NOT NULL,
            hour INTEGER NOT NULL,
            day_of_week INTEGER NOT NULL,
            impressions INTEGER DEFAULT 0,
            clicks INTEGER DEFAULT 0,
            cost REAL DEFAULT 0,
            conversions INTEGER DEFAULT 0,
            revenue REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 11. 이상 징후 알림 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS anomaly_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            alert_id TEXT UNIQUE NOT NULL,
            user_id INTEGER NOT NULL,
            platform_id TEXT NOT NULL,
            campaign_id TEXT,
            keyword_id TEXT,
            anomaly_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            metric_name TEXT NOT NULL,
            current_value REAL NOT NULL,
            baseline_value REAL NOT NULL,
            change_percent REAL NOT NULL,
            z_score REAL,
            detected_at TIMESTAMP NOT NULL,
            resolved_at TIMESTAMP,
            auto_action_taken TEXT,
            is_acknowledged BOOLEAN DEFAULT 0,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 12. 이상 징후 임계값 설정 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS anomaly_thresholds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform_id TEXT NOT NULL,
            anomaly_type TEXT NOT NULL,
            metric TEXT NOT NULL,
            low_threshold REAL NOT NULL,
            medium_threshold REAL NOT NULL,
            high_threshold REAL NOT NULL,
            critical_threshold REAL NOT NULL,
            direction TEXT DEFAULT 'both',
            auto_action TEXT DEFAULT 'none',
            lookback_hours INTEGER DEFAULT 24,
            is_enabled BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, platform_id, anomaly_type)
        )
    """)

    # 13. 메트릭 히스토리 테이블 (이상 징후 탐지용)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS metric_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform_id TEXT NOT NULL,
            entity_id TEXT DEFAULT 'account',
            metric_name TEXT NOT NULL,
            value REAL NOT NULL,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 14. 예산 재분배 계획 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS budget_reallocation_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id TEXT UNIQUE NOT NULL,
            user_id INTEGER NOT NULL,
            strategy TEXT NOT NULL,
            total_budget REAL NOT NULL,
            reallocations_json TEXT NOT NULL,
            expected_roas_improvement REAL,
            expected_cpa_reduction REAL,
            expected_conversion_increase INTEGER,
            is_applied BOOLEAN DEFAULT 0,
            applied_at TIMESTAMP,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 15. 예산 재분배 실행 이력 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS budget_reallocation_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            plan_id TEXT,
            source_platform TEXT NOT NULL,
            target_platform TEXT NOT NULL,
            amount REAL NOT NULL,
            source_old_budget REAL NOT NULL,
            source_new_budget REAL NOT NULL,
            target_old_budget REAL NOT NULL,
            target_new_budget REAL NOT NULL,
            reason TEXT,
            status TEXT DEFAULT 'pending',
            applied_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 16. 플랫폼 우선순위 설정 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS platform_priorities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform_id TEXT NOT NULL,
            priority TEXT DEFAULT 'medium',
            min_budget REAL,
            max_budget REAL,
            is_locked BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, platform_id)
        )
    """)

    # 17. 크리에이티브 성과 데이터 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS creative_performance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            ad_account_id TEXT NOT NULL,
            creative_id TEXT NOT NULL,
            creative_name TEXT,
            creative_type TEXT DEFAULT 'image',
            platform TEXT DEFAULT 'meta',
            impressions INTEGER DEFAULT 0,
            reach INTEGER DEFAULT 0,
            clicks INTEGER DEFAULT 0,
            conversions INTEGER DEFAULT 0,
            spend REAL DEFAULT 0,
            ctr REAL DEFAULT 0,
            cpm REAL DEFAULT 0,
            cpc REAL DEFAULT 0,
            cvr REAL DEFAULT 0,
            frequency REAL DEFAULT 0,
            likes INTEGER DEFAULT 0,
            comments INTEGER DEFAULT 0,
            shares INTEGER DEFAULT 0,
            saves INTEGER DEFAULT 0,
            engagement_rate REAL DEFAULT 0,
            start_date DATE,
            days_running INTEGER DEFAULT 0,
            historical_ctr TEXT,
            historical_cpm TEXT,
            historical_frequency TEXT,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, ad_account_id, creative_id, recorded_at)
        )
    """)

    # 18. 크리에이티브 피로도 분석 결과 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS creative_fatigue_analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            ad_account_id TEXT NOT NULL,
            creative_id TEXT NOT NULL,
            fatigue_level TEXT NOT NULL,
            fatigue_score REAL NOT NULL,
            indicator_scores TEXT,
            issues TEXT,
            recommendations TEXT,
            estimated_days_remaining INTEGER DEFAULT 0,
            replacement_priority INTEGER DEFAULT 1,
            analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 19. 크리에이티브 교체 추천 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS creative_refresh_recommendations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            ad_account_id TEXT NOT NULL,
            creative_id TEXT NOT NULL,
            creative_name TEXT,
            current_type TEXT,
            fatigue_level TEXT,
            recommended_action TEXT NOT NULL,
            urgency TEXT NOT NULL,
            suggested_variations TEXT,
            expected_improvement TEXT,
            budget_impact TEXT,
            is_applied BOOLEAN DEFAULT 0,
            applied_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 20. 네이버 키워드 품질 데이터 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS naver_keyword_quality (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            keyword_id TEXT NOT NULL,
            keyword_text TEXT NOT NULL,
            ad_group_id TEXT,
            ad_group_name TEXT,
            campaign_id TEXT,
            campaign_name TEXT,
            quality_index INTEGER DEFAULT 5,
            ad_relevance_score INTEGER DEFAULT 5,
            landing_page_score INTEGER DEFAULT 5,
            expected_ctr_score INTEGER DEFAULT 5,
            impressions INTEGER DEFAULT 0,
            clicks INTEGER DEFAULT 0,
            conversions INTEGER DEFAULT 0,
            cost REAL DEFAULT 0,
            ctr REAL DEFAULT 0,
            cvr REAL DEFAULT 0,
            cpc REAL DEFAULT 0,
            ad_title TEXT,
            ad_description TEXT,
            display_url TEXT,
            has_sitelinks BOOLEAN DEFAULT 0,
            has_callouts BOOLEAN DEFAULT 0,
            has_phone BOOLEAN DEFAULT 0,
            match_type TEXT DEFAULT 'exact',
            status TEXT DEFAULT 'active',
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, keyword_id, recorded_at)
        )
    """)

    # 21. 네이버 품질지수 분석 결과 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS naver_quality_analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            keyword_id TEXT NOT NULL,
            keyword_text TEXT NOT NULL,
            current_quality INTEGER NOT NULL,
            quality_level TEXT NOT NULL,
            factor_scores TEXT,
            factor_issues TEXT,
            potential_quality INTEGER DEFAULT 5,
            improvement_points INTEGER DEFAULT 0,
            estimated_cpc_reduction REAL DEFAULT 0,
            estimated_rank_improvement INTEGER DEFAULT 0,
            priority INTEGER DEFAULT 3,
            analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 22. 네이버 품질지수 개선 추천 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS naver_quality_recommendations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            keyword_id TEXT NOT NULL,
            keyword_text TEXT NOT NULL,
            recommendation_type TEXT NOT NULL,
            priority INTEGER DEFAULT 3,
            title TEXT NOT NULL,
            description TEXT,
            current_value TEXT,
            suggested_action TEXT,
            suggested_value TEXT,
            expected_improvement INTEGER DEFAULT 0,
            expected_cpc_reduction REAL DEFAULT 0,
            difficulty TEXT DEFAULT 'medium',
            is_applied BOOLEAN DEFAULT 0,
            applied_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 23. 네이버 품질지수 히스토리 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS naver_quality_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            keyword_id TEXT NOT NULL,
            quality_index INTEGER NOT NULL,
            ad_relevance_score INTEGER,
            landing_page_score INTEGER,
            expected_ctr_score INTEGER,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 24. 캠페인 예산 정보 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS campaign_budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            campaign_id TEXT NOT NULL,
            campaign_name TEXT,
            platform TEXT NOT NULL,
            daily_budget REAL NOT NULL DEFAULT 0,
            monthly_budget REAL NOT NULL DEFAULT 0,
            spent_today REAL DEFAULT 0,
            spent_this_month REAL DEFAULT 0,
            pacing_strategy TEXT DEFAULT 'standard',
            is_active BOOLEAN DEFAULT 1,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, campaign_id)
        )
    """)

    # 25. 시간대별 예산 배분 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hourly_budget_allocations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            campaign_id TEXT NOT NULL,
            allocation_date DATE NOT NULL,
            hour INTEGER NOT NULL,
            allocated_budget REAL DEFAULT 0,
            actual_spend REAL DEFAULT 0,
            impressions INTEGER DEFAULT 0,
            clicks INTEGER DEFAULT 0,
            conversions INTEGER DEFAULT 0,
            ctr REAL DEFAULT 0,
            cpc REAL DEFAULT 0,
            roas REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, campaign_id, allocation_date, hour)
        )
    """)

    # 26. 예산 페이싱 분석 결과 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS budget_pacing_analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            campaign_id TEXT NOT NULL,
            analysis_date DATE NOT NULL,
            analysis_hour INTEGER NOT NULL,
            daily_budget REAL,
            spent_so_far REAL,
            expected_spend REAL,
            actual_vs_expected REAL,
            pacing_status TEXT,
            burn_rate_per_hour REAL,
            projected_eod_spend REAL,
            budget_utilization REAL,
            recommended_adjustment REAL,
            recommended_hourly_budget REAL,
            confidence_score REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 27. 예산 페이싱 알림 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS budget_pacing_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            campaign_id TEXT NOT NULL,
            campaign_name TEXT,
            platform TEXT,
            alert_type TEXT NOT NULL,
            severity TEXT DEFAULT 'warning',
            message TEXT,
            current_value REAL,
            threshold_value REAL,
            recommended_action TEXT,
            is_resolved BOOLEAN DEFAULT 0,
            resolved_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 28. 예산 페이싱 권장사항 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS budget_pacing_recommendations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            campaign_id TEXT NOT NULL,
            recommendation_type TEXT NOT NULL,
            title TEXT,
            description TEXT,
            current_strategy TEXT,
            recommended_strategy TEXT,
            expected_improvement TEXT,
            priority INTEGER DEFAULT 3,
            hourly_adjustments_json TEXT,
            is_applied BOOLEAN DEFAULT 0,
            applied_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 29. 월간 예산 예측 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS monthly_budget_projections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            campaign_id TEXT NOT NULL,
            projection_date DATE NOT NULL,
            monthly_budget REAL,
            spent_this_month REAL,
            projected_monthly_spend REAL,
            monthly_utilization REAL,
            expected_utilization REAL,
            monthly_status TEXT,
            days_remaining INTEGER,
            daily_avg_spend REAL,
            recommended_daily_budget REAL,
            projected_surplus_deficit REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, campaign_id, projection_date)
        )
    """)

    # 30. 퍼널 캠페인 정보 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS funnel_campaigns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            campaign_id TEXT NOT NULL,
            campaign_name TEXT,
            platform TEXT NOT NULL,
            objective TEXT,
            funnel_stage TEXT NOT NULL,
            bidding_strategy TEXT,
            daily_budget REAL DEFAULT 0,
            impressions INTEGER DEFAULT 0,
            reach INTEGER DEFAULT 0,
            clicks INTEGER DEFAULT 0,
            conversions INTEGER DEFAULT 0,
            spend REAL DEFAULT 0,
            revenue REAL DEFAULT 0,
            cpm REAL DEFAULT 0,
            cpc REAL DEFAULT 0,
            ctr REAL DEFAULT 0,
            cpa REAL DEFAULT 0,
            roas REAL DEFAULT 0,
            conversion_rate REAL DEFAULT 0,
            is_active BOOLEAN DEFAULT 1,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, campaign_id)
        )
    """)

    # 31. 퍼널 단계별 성과 집계 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS funnel_stage_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            stage TEXT NOT NULL,
            analysis_date DATE NOT NULL,
            campaign_count INTEGER DEFAULT 0,
            total_budget REAL DEFAULT 0,
            total_spend REAL DEFAULT 0,
            total_impressions INTEGER DEFAULT 0,
            total_reach INTEGER DEFAULT 0,
            total_clicks INTEGER DEFAULT 0,
            total_conversions INTEGER DEFAULT 0,
            total_revenue REAL DEFAULT 0,
            avg_cpm REAL DEFAULT 0,
            avg_cpc REAL DEFAULT 0,
            avg_ctr REAL DEFAULT 0,
            avg_cpa REAL DEFAULT 0,
            avg_roas REAL DEFAULT 0,
            cpm_vs_benchmark REAL DEFAULT 0,
            cpc_vs_benchmark REAL DEFAULT 0,
            cpa_vs_benchmark REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, stage, analysis_date)
        )
    """)

    # 32. 퍼널 흐름 분석 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS funnel_flow_analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            analysis_date DATE NOT NULL,
            tofu_reach INTEGER DEFAULT 0,
            mofu_clicks INTEGER DEFAULT 0,
            bofu_conversions INTEGER DEFAULT 0,
            tofu_to_mofu_rate REAL DEFAULT 0,
            mofu_to_bofu_rate REAL DEFAULT 0,
            overall_conversion_rate REAL DEFAULT 0,
            cost_per_tofu REAL DEFAULT 0,
            cost_per_mofu REAL DEFAULT 0,
            cost_per_bofu REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, analysis_date)
        )
    """)

    # 33. 퍼널 입찰 권장사항 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS funnel_bidding_recommendations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            campaign_id TEXT NOT NULL,
            campaign_name TEXT,
            funnel_stage TEXT,
            current_strategy TEXT,
            recommended_strategy TEXT,
            reason TEXT,
            expected_improvement TEXT,
            priority INTEGER DEFAULT 3,
            recommended_bid REAL,
            recommended_budget REAL,
            is_applied BOOLEAN DEFAULT 0,
            applied_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 34. 퍼널 예산 배분 계획 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS funnel_budget_allocation (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            allocation_date DATE NOT NULL,
            strategy TEXT DEFAULT 'balanced',
            total_budget REAL DEFAULT 0,
            tofu_budget REAL DEFAULT 0,
            tofu_percentage REAL DEFAULT 0,
            mofu_budget REAL DEFAULT 0,
            mofu_percentage REAL DEFAULT 0,
            bofu_budget REAL DEFAULT 0,
            bofu_percentage REAL DEFAULT 0,
            current_tofu_pct REAL DEFAULT 0,
            current_mofu_pct REAL DEFAULT 0,
            current_bofu_pct REAL DEFAULT 0,
            adjustment_needed BOOLEAN DEFAULT 0,
            recommendation TEXT,
            is_applied BOOLEAN DEFAULT 0,
            applied_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, allocation_date)
        )
    """)

    # 인덱스 생성
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ad_accounts_user ON ad_accounts(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_opt_history_user ON optimization_history(user_id, platform_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_bid_history_user ON bid_change_history(user_id, platform_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_perf_snapshot ON performance_snapshots(user_id, platform_id, snapshot_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_notifications_user ON ad_notifications(user_id, is_read)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_hourly_bid_schedule ON hourly_bid_schedules(user_id, platform_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_hourly_perf ON hourly_performance(user_id, platform_id, hour, day_of_week)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_user ON anomaly_alerts(user_id, platform_id, resolved_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_anomaly_thresholds ON anomaly_thresholds(user_id, platform_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_metric_history ON metric_history(user_id, platform_id, metric_name, recorded_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_budget_plans ON budget_reallocation_plans(user_id, is_applied)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_budget_history ON budget_reallocation_history(user_id, created_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_platform_priorities ON platform_priorities(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_creative_perf ON creative_performance(user_id, ad_account_id, creative_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_creative_fatigue ON creative_fatigue_analysis(user_id, ad_account_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_creative_refresh ON creative_refresh_recommendations(user_id, urgency)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_naver_keyword_quality ON naver_keyword_quality(user_id, keyword_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_naver_quality_analysis ON naver_quality_analysis(user_id, keyword_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_naver_quality_recs ON naver_quality_recommendations(user_id, priority)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_naver_quality_history ON naver_quality_history(user_id, keyword_id, recorded_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_campaign_budgets ON campaign_budgets(user_id, campaign_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_hourly_allocations ON hourly_budget_allocations(user_id, campaign_id, allocation_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pacing_analysis ON budget_pacing_analysis(user_id, campaign_id, analysis_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pacing_alerts ON budget_pacing_alerts(user_id, campaign_id, is_resolved)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pacing_recs ON budget_pacing_recommendations(user_id, campaign_id, is_applied)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_monthly_projections ON monthly_budget_projections(user_id, campaign_id, projection_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_funnel_campaigns ON funnel_campaigns(user_id, funnel_stage)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_funnel_stage_metrics ON funnel_stage_metrics(user_id, stage, analysis_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_funnel_flow ON funnel_flow_analysis(user_id, analysis_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_funnel_recs ON funnel_bidding_recommendations(user_id, campaign_id, is_applied)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_funnel_allocation ON funnel_budget_allocation(user_id, allocation_date)")

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


# ============ 시간대별 입찰 스케줄 ============

def save_hourly_bid_schedule(
    user_id: int,
    platform_id: str,
    schedule_data: Dict[str, Any],
    campaign_id: Optional[str] = None
) -> int:
    """시간대별 입찰 스케줄 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT OR REPLACE INTO hourly_bid_schedules
        (user_id, platform_id, campaign_id, hourly_modifiers, daily_modifiers,
         special_slots, auto_optimize, learning_rate, is_enabled, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    """, (
        user_id,
        platform_id,
        campaign_id,
        json.dumps(schedule_data.get("hourly_modifiers", {})),
        json.dumps(schedule_data.get("daily_modifiers", {})),
        json.dumps(schedule_data.get("special_slots", [])),
        schedule_data.get("auto_optimize", True),
        schedule_data.get("learning_rate", 0.1),
    ))

    schedule_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return schedule_id


def get_hourly_bid_schedule(
    user_id: int,
    platform_id: str,
    campaign_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """시간대별 입찰 스케줄 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    if campaign_id:
        cursor.execute("""
            SELECT * FROM hourly_bid_schedules
            WHERE user_id = ? AND platform_id = ? AND campaign_id = ? AND is_enabled = 1
        """, (user_id, platform_id, campaign_id))
    else:
        cursor.execute("""
            SELECT * FROM hourly_bid_schedules
            WHERE user_id = ? AND platform_id = ? AND campaign_id IS NULL AND is_enabled = 1
        """, (user_id, platform_id))

    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    # JSON 파싱
    hourly_modifiers = json.loads(row["hourly_modifiers"]) if row["hourly_modifiers"] else {}
    daily_modifiers = json.loads(row["daily_modifiers"]) if row["daily_modifiers"] else {}
    special_slots = json.loads(row["special_slots"]) if row["special_slots"] else []

    # int 키로 변환 (JSON은 문자열 키만 지원)
    hourly_modifiers = {int(k): v for k, v in hourly_modifiers.items()}
    daily_modifiers = {int(k): v for k, v in daily_modifiers.items()}

    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "platform_id": row["platform_id"],
        "campaign_id": row["campaign_id"],
        "hourly_modifiers": hourly_modifiers,
        "daily_modifiers": daily_modifiers,
        "special_slots": special_slots,
        "auto_optimize": bool(row["auto_optimize"]),
        "learning_rate": row["learning_rate"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def get_user_hourly_schedules(user_id: int) -> List[Dict[str, Any]]:
    """사용자의 모든 시간대별 스케줄 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM hourly_bid_schedules
        WHERE user_id = ? AND is_enabled = 1
    """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    result = []
    for row in rows:
        hourly_modifiers = json.loads(row["hourly_modifiers"]) if row["hourly_modifiers"] else {}
        daily_modifiers = json.loads(row["daily_modifiers"]) if row["daily_modifiers"] else {}
        special_slots = json.loads(row["special_slots"]) if row["special_slots"] else []

        result.append({
            "id": row["id"],
            "platform_id": row["platform_id"],
            "campaign_id": row["campaign_id"],
            "hourly_modifiers": {int(k): v for k, v in hourly_modifiers.items()},
            "daily_modifiers": {int(k): v for k, v in daily_modifiers.items()},
            "special_slots": special_slots,
            "auto_optimize": bool(row["auto_optimize"]),
            "updated_at": row["updated_at"],
        })

    return result


def delete_hourly_bid_schedule(
    user_id: int,
    platform_id: str,
    campaign_id: Optional[str] = None
) -> bool:
    """시간대별 스케줄 삭제 (soft delete)"""
    conn = get_ad_db()
    cursor = conn.cursor()

    if campaign_id:
        cursor.execute("""
            UPDATE hourly_bid_schedules SET is_enabled = 0
            WHERE user_id = ? AND platform_id = ? AND campaign_id = ?
        """, (user_id, platform_id, campaign_id))
    else:
        cursor.execute("""
            UPDATE hourly_bid_schedules SET is_enabled = 0
            WHERE user_id = ? AND platform_id = ? AND campaign_id IS NULL
        """, (user_id, platform_id))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0


# ============ 시간대별 성과 ============

def save_hourly_performance(
    user_id: int,
    platform_id: str,
    recorded_at: datetime,
    hour: int,
    day_of_week: int,
    impressions: int = 0,
    clicks: int = 0,
    cost: float = 0,
    conversions: int = 0,
    revenue: float = 0
) -> int:
    """시간대별 성과 데이터 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO hourly_performance
        (user_id, platform_id, recorded_at, hour, day_of_week,
         impressions, clicks, cost, conversions, revenue)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, platform_id, recorded_at.isoformat(),
        hour, day_of_week, impressions, clicks, cost, conversions, revenue
    ))

    perf_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return perf_id


def get_hourly_performance_history(
    user_id: int,
    platform_id: str,
    days: int = 14
) -> List[Dict[str, Any]]:
    """시간대별 성과 히스토리 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM hourly_performance
        WHERE user_id = ? AND platform_id = ?
        AND recorded_at >= datetime('now', ?)
        ORDER BY recorded_at DESC
    """, (user_id, platform_id, f"-{days} days"))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_hourly_performance_aggregated(
    user_id: int,
    platform_id: str,
    days: int = 14
) -> Dict[str, Any]:
    """시간대별 성과 집계"""
    conn = get_ad_db()
    cursor = conn.cursor()

    # 시간대별 집계
    cursor.execute("""
        SELECT
            hour,
            SUM(impressions) as total_impressions,
            SUM(clicks) as total_clicks,
            SUM(cost) as total_cost,
            SUM(conversions) as total_conversions,
            SUM(revenue) as total_revenue,
            AVG(CASE WHEN impressions > 0 THEN clicks * 100.0 / impressions END) as avg_ctr,
            AVG(CASE WHEN conversions > 0 THEN cost / conversions END) as avg_cpa,
            AVG(CASE WHEN cost > 0 THEN revenue * 100.0 / cost END) as avg_roas
        FROM hourly_performance
        WHERE user_id = ? AND platform_id = ?
        AND recorded_at >= datetime('now', ?)
        GROUP BY hour
        ORDER BY hour
    """, (user_id, platform_id, f"-{days} days"))

    hourly_data = {row["hour"]: dict(row) for row in cursor.fetchall()}

    # 요일별 집계
    cursor.execute("""
        SELECT
            day_of_week,
            SUM(impressions) as total_impressions,
            SUM(clicks) as total_clicks,
            SUM(cost) as total_cost,
            SUM(conversions) as total_conversions,
            SUM(revenue) as total_revenue,
            AVG(CASE WHEN impressions > 0 THEN clicks * 100.0 / impressions END) as avg_ctr,
            AVG(CASE WHEN conversions > 0 THEN cost / conversions END) as avg_cpa,
            AVG(CASE WHEN cost > 0 THEN revenue * 100.0 / cost END) as avg_roas
        FROM hourly_performance
        WHERE user_id = ? AND platform_id = ?
        AND recorded_at >= datetime('now', ?)
        GROUP BY day_of_week
        ORDER BY day_of_week
    """, (user_id, platform_id, f"-{days} days"))

    daily_data = {row["day_of_week"]: dict(row) for row in cursor.fetchall()}

    conn.close()

    return {
        "hourly": hourly_data,
        "daily": daily_data,
        "period_days": days
    }


def get_best_performing_hours(
    user_id: int,
    platform_id: str,
    metric: str = "conversions",
    top_n: int = 5
) -> List[Dict[str, Any]]:
    """최고 성과 시간대 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    metric_column = {
        "conversions": "SUM(conversions)",
        "roas": "AVG(CASE WHEN cost > 0 THEN revenue * 100.0 / cost END)",
        "ctr": "AVG(CASE WHEN impressions > 0 THEN clicks * 100.0 / impressions END)",
        "revenue": "SUM(revenue)"
    }.get(metric, "SUM(conversions)")

    cursor.execute(f"""
        SELECT
            hour,
            day_of_week,
            SUM(impressions) as impressions,
            SUM(clicks) as clicks,
            SUM(cost) as cost,
            SUM(conversions) as conversions,
            SUM(revenue) as revenue,
            {metric_column} as metric_value
        FROM hourly_performance
        WHERE user_id = ? AND platform_id = ?
        AND recorded_at >= datetime('now', '-14 days')
        GROUP BY hour, day_of_week
        HAVING metric_value > 0
        ORDER BY metric_value DESC
        LIMIT ?
    """, (user_id, platform_id, top_n))

    rows = cursor.fetchall()
    conn.close()

    day_names = ["월", "화", "수", "목", "금", "토", "일"]

    return [
        {
            **dict(row),
            "day_name": day_names[row["day_of_week"]],
            "time_slot": f"{day_names[row['day_of_week']]} {row['hour']}시"
        }
        for row in rows
    ]


# ============ 이상 징후 알림 ============

def save_anomaly_alert(
    alert_id: str,
    user_id: int,
    platform_id: str,
    anomaly_type: str,
    severity: str,
    metric_name: str,
    current_value: float,
    baseline_value: float,
    change_percent: float,
    detected_at: datetime,
    z_score: Optional[float] = None,
    campaign_id: Optional[str] = None,
    keyword_id: Optional[str] = None,
    auto_action_taken: Optional[str] = None
) -> int:
    """이상 징후 알림 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT OR REPLACE INTO anomaly_alerts
        (alert_id, user_id, platform_id, campaign_id, keyword_id,
         anomaly_type, severity, metric_name, current_value, baseline_value,
         change_percent, z_score, detected_at, auto_action_taken)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        alert_id, user_id, platform_id, campaign_id, keyword_id,
        anomaly_type, severity, metric_name, current_value, baseline_value,
        change_percent, z_score, detected_at.isoformat(), auto_action_taken
    ))

    row_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return row_id


def get_active_anomaly_alerts(
    user_id: int,
    platform_id: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """미해결 이상 징후 알림 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    query = """
        SELECT * FROM anomaly_alerts
        WHERE user_id = ? AND resolved_at IS NULL
    """
    params = [user_id]

    if platform_id:
        query += " AND platform_id = ?"
        params.append(platform_id)

    if severity:
        query += " AND severity = ?"
        params.append(severity)

    query += " ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, detected_at DESC"
    query += " LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_anomaly_alert_history(
    user_id: int,
    platform_id: Optional[str] = None,
    days: int = 30,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """이상 징후 알림 히스토리 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    query = """
        SELECT * FROM anomaly_alerts
        WHERE user_id = ?
        AND detected_at >= datetime('now', ?)
    """
    params = [user_id, f"-{days} days"]

    if platform_id:
        query += " AND platform_id = ?"
        params.append(platform_id)

    query += " ORDER BY detected_at DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def acknowledge_anomaly_alert(alert_id: str, user_id: int) -> bool:
    """이상 징후 알림 확인 처리"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE anomaly_alerts SET is_acknowledged = 1
        WHERE alert_id = ? AND user_id = ?
    """, (alert_id, user_id))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0


def resolve_anomaly_alert(alert_id: str, user_id: int, notes: Optional[str] = None) -> bool:
    """이상 징후 알림 해결 처리"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE anomaly_alerts
        SET resolved_at = CURRENT_TIMESTAMP, notes = ?
        WHERE alert_id = ? AND user_id = ?
    """, (notes, alert_id, user_id))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0


def get_anomaly_summary(user_id: int) -> Dict[str, Any]:
    """이상 징후 요약"""
    conn = get_ad_db()
    cursor = conn.cursor()

    # 미해결 알림 집계
    cursor.execute("""
        SELECT
            severity,
            COUNT(*) as count
        FROM anomaly_alerts
        WHERE user_id = ? AND resolved_at IS NULL
        GROUP BY severity
    """, (user_id,))

    by_severity = {row["severity"]: row["count"] for row in cursor.fetchall()}

    # 플랫폼별 집계
    cursor.execute("""
        SELECT
            platform_id,
            COUNT(*) as count
        FROM anomaly_alerts
        WHERE user_id = ? AND resolved_at IS NULL
        GROUP BY platform_id
    """, (user_id,))

    by_platform = {row["platform_id"]: row["count"] for row in cursor.fetchall()}

    # 유형별 집계
    cursor.execute("""
        SELECT
            anomaly_type,
            COUNT(*) as count
        FROM anomaly_alerts
        WHERE user_id = ? AND resolved_at IS NULL
        GROUP BY anomaly_type
    """, (user_id,))

    by_type = {row["anomaly_type"]: row["count"] for row in cursor.fetchall()}

    # 전체 미해결 수
    cursor.execute("""
        SELECT COUNT(*) as total FROM anomaly_alerts
        WHERE user_id = ? AND resolved_at IS NULL
    """, (user_id,))

    total = cursor.fetchone()["total"]

    conn.close()

    return {
        "total_active": total,
        "by_severity": by_severity,
        "by_platform": by_platform,
        "by_type": by_type,
        "critical_count": by_severity.get("critical", 0),
        "high_count": by_severity.get("high", 0),
        "needs_attention": by_severity.get("critical", 0) + by_severity.get("high", 0) > 0
    }


# ============ 이상 징후 임계값 설정 ============

def save_anomaly_threshold(
    user_id: int,
    platform_id: str,
    anomaly_type: str,
    metric: str,
    low_threshold: float,
    medium_threshold: float,
    high_threshold: float,
    critical_threshold: float,
    direction: str = "both",
    auto_action: str = "none",
    lookback_hours: int = 24
) -> int:
    """이상 징후 임계값 설정 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT OR REPLACE INTO anomaly_thresholds
        (user_id, platform_id, anomaly_type, metric,
         low_threshold, medium_threshold, high_threshold, critical_threshold,
         direction, auto_action, lookback_hours, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (
        user_id, platform_id, anomaly_type, metric,
        low_threshold, medium_threshold, high_threshold, critical_threshold,
        direction, auto_action, lookback_hours
    ))

    threshold_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return threshold_id


def get_anomaly_thresholds(
    user_id: int,
    platform_id: str
) -> List[Dict[str, Any]]:
    """사용자의 이상 징후 임계값 설정 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM anomaly_thresholds
        WHERE user_id = ? AND platform_id = ? AND is_enabled = 1
    """, (user_id, platform_id))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


# ============ 메트릭 히스토리 (이상 징후 탐지용) ============

def save_metric_history(
    user_id: int,
    platform_id: str,
    metric_name: str,
    value: float,
    entity_id: str = "account",
    recorded_at: Optional[datetime] = None
) -> int:
    """메트릭 히스토리 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO metric_history
        (user_id, platform_id, entity_id, metric_name, value, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        user_id, platform_id, entity_id, metric_name, value,
        (recorded_at or datetime.now()).isoformat()
    ))

    history_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return history_id


def get_metric_history(
    user_id: int,
    platform_id: str,
    metric_name: str,
    entity_id: str = "account",
    hours: int = 168  # 7일
) -> List[Dict[str, Any]]:
    """메트릭 히스토리 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM metric_history
        WHERE user_id = ? AND platform_id = ? AND entity_id = ? AND metric_name = ?
        AND recorded_at >= datetime('now', ?)
        ORDER BY recorded_at DESC
    """, (user_id, platform_id, entity_id, metric_name, f"-{hours} hours"))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def cleanup_old_metric_history(days: int = 30) -> int:
    """오래된 메트릭 히스토리 정리"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        DELETE FROM metric_history
        WHERE recorded_at < datetime('now', ?)
    """, (f"-{days} days",))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected


# ============ 예산 재분배 계획 ============

def save_reallocation_plan(
    plan_id: str,
    user_id: int,
    strategy: str,
    total_budget: float,
    reallocations: List[Dict[str, Any]],
    expected_roas_improvement: float = 0,
    expected_cpa_reduction: float = 0,
    expected_conversion_increase: int = 0
) -> int:
    """예산 재분배 계획 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO budget_reallocation_plans
        (plan_id, user_id, strategy, total_budget, reallocations_json,
         expected_roas_improvement, expected_cpa_reduction, expected_conversion_increase)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        plan_id, user_id, strategy, total_budget,
        json.dumps(reallocations, ensure_ascii=False),
        expected_roas_improvement, expected_cpa_reduction, expected_conversion_increase
    ))

    row_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return row_id


def get_reallocation_plan(plan_id: str, user_id: int) -> Optional[Dict[str, Any]]:
    """예산 재분배 계획 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM budget_reallocation_plans
        WHERE plan_id = ? AND user_id = ?
    """, (plan_id, user_id))

    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    result = dict(row)
    if result.get("reallocations_json"):
        result["reallocations"] = json.loads(result["reallocations_json"])

    return result


def get_reallocation_plans(
    user_id: int,
    include_applied: bool = True,
    limit: int = 20
) -> List[Dict[str, Any]]:
    """예산 재분배 계획 목록 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    query = "SELECT * FROM budget_reallocation_plans WHERE user_id = ?"
    params = [user_id]

    if not include_applied:
        query += " AND is_applied = 0"

    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    results = []
    for row in rows:
        item = dict(row)
        if item.get("reallocations_json"):
            item["reallocations"] = json.loads(item["reallocations_json"])
        results.append(item)

    return results


def apply_reallocation_plan(plan_id: str, user_id: int, notes: Optional[str] = None) -> bool:
    """예산 재분배 계획 적용 표시"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE budget_reallocation_plans
        SET is_applied = 1, applied_at = CURRENT_TIMESTAMP, notes = ?
        WHERE plan_id = ? AND user_id = ?
    """, (notes, plan_id, user_id))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0


# ============ 예산 재분배 실행 이력 ============

def save_reallocation_history(
    user_id: int,
    source_platform: str,
    target_platform: str,
    amount: float,
    source_old_budget: float,
    source_new_budget: float,
    target_old_budget: float,
    target_new_budget: float,
    reason: str = None,
    plan_id: str = None,
    status: str = "pending"
) -> int:
    """예산 재분배 실행 이력 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO budget_reallocation_history
        (user_id, plan_id, source_platform, target_platform, amount,
         source_old_budget, source_new_budget, target_old_budget, target_new_budget,
         reason, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, plan_id, source_platform, target_platform, amount,
        source_old_budget, source_new_budget, target_old_budget, target_new_budget,
        reason, status
    ))

    history_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return history_id


def get_reallocation_history(
    user_id: int,
    days: int = 30,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """예산 재분배 이력 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM budget_reallocation_history
        WHERE user_id = ?
        AND created_at >= datetime('now', ?)
        ORDER BY created_at DESC LIMIT ?
    """, (user_id, f"-{days} days", limit))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def update_reallocation_status(history_id: int, status: str) -> bool:
    """재분배 상태 업데이트"""
    conn = get_ad_db()
    cursor = conn.cursor()

    applied_at = datetime.now().isoformat() if status == "applied" else None

    cursor.execute("""
        UPDATE budget_reallocation_history
        SET status = ?, applied_at = ?
        WHERE id = ?
    """, (status, applied_at, history_id))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0


# ============ 플랫폼 우선순위 ============

def save_platform_priority(
    user_id: int,
    platform_id: str,
    priority: str = "medium",
    min_budget: Optional[float] = None,
    max_budget: Optional[float] = None,
    is_locked: bool = False
) -> int:
    """플랫폼 우선순위 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT OR REPLACE INTO platform_priorities
        (user_id, platform_id, priority, min_budget, max_budget, is_locked, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (user_id, platform_id, priority, min_budget, max_budget, is_locked))

    row_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return row_id


def get_platform_priorities(user_id: int) -> List[Dict[str, Any]]:
    """사용자의 플랫폼 우선순위 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM platform_priorities
        WHERE user_id = ?
    """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_platform_priority(user_id: int, platform_id: str) -> Optional[Dict[str, Any]]:
    """특정 플랫폼 우선순위 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM platform_priorities
        WHERE user_id = ? AND platform_id = ?
    """, (user_id, platform_id))

    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


# ============ 크리에이티브 성과 ============

def save_creative_performance(
    user_id: int,
    ad_account_id: str,
    creative_data: Dict[str, Any]
) -> int:
    """크리에이티브 성과 데이터 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO creative_performance
        (user_id, ad_account_id, creative_id, creative_name, creative_type, platform,
         impressions, reach, clicks, conversions, spend, ctr, cpm, cpc, cvr, frequency,
         likes, comments, shares, saves, engagement_rate, start_date, days_running,
         historical_ctr, historical_cpm, historical_frequency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        ad_account_id,
        creative_data.get("creative_id", ""),
        creative_data.get("creative_name", ""),
        creative_data.get("creative_type", "image"),
        creative_data.get("platform", "meta"),
        creative_data.get("impressions", 0),
        creative_data.get("reach", 0),
        creative_data.get("clicks", 0),
        creative_data.get("conversions", 0),
        creative_data.get("spend", 0),
        creative_data.get("ctr", 0),
        creative_data.get("cpm", 0),
        creative_data.get("cpc", 0),
        creative_data.get("cvr", 0),
        creative_data.get("frequency", 0),
        creative_data.get("likes", 0),
        creative_data.get("comments", 0),
        creative_data.get("shares", 0),
        creative_data.get("saves", 0),
        creative_data.get("engagement_rate", 0),
        creative_data.get("start_date"),
        creative_data.get("days_running", 0),
        json.dumps(creative_data.get("historical_ctr", [])),
        json.dumps(creative_data.get("historical_cpm", [])),
        json.dumps(creative_data.get("historical_frequency", [])),
    ))

    perf_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return perf_id


def get_creative_performance(
    user_id: int,
    ad_account_id: str,
    creative_id: Optional[str] = None,
    days: int = 30
) -> List[Dict[str, Any]]:
    """크리에이티브 성과 데이터 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    query = """
        SELECT * FROM creative_performance
        WHERE user_id = ? AND ad_account_id = ?
        AND recorded_at >= datetime('now', ?)
    """
    params = [user_id, ad_account_id, f"-{days} days"]

    if creative_id:
        query += " AND creative_id = ?"
        params.append(creative_id)

    query += " ORDER BY recorded_at DESC"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    results = []
    for row in rows:
        item = dict(row)
        # JSON 필드 파싱
        if item.get("historical_ctr"):
            item["historical_ctr"] = json.loads(item["historical_ctr"])
        if item.get("historical_cpm"):
            item["historical_cpm"] = json.loads(item["historical_cpm"])
        if item.get("historical_frequency"):
            item["historical_frequency"] = json.loads(item["historical_frequency"])
        results.append(item)

    return results


def get_latest_creative_performance(
    user_id: int,
    ad_account_id: str
) -> List[Dict[str, Any]]:
    """각 크리에이티브의 최신 성과 데이터 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT cp.*
        FROM creative_performance cp
        INNER JOIN (
            SELECT creative_id, MAX(recorded_at) as max_recorded
            FROM creative_performance
            WHERE user_id = ? AND ad_account_id = ?
            GROUP BY creative_id
        ) latest ON cp.creative_id = latest.creative_id
            AND cp.recorded_at = latest.max_recorded
        WHERE cp.user_id = ? AND cp.ad_account_id = ?
    """, (user_id, ad_account_id, user_id, ad_account_id))

    rows = cursor.fetchall()
    conn.close()

    results = []
    for row in rows:
        item = dict(row)
        if item.get("historical_ctr"):
            item["historical_ctr"] = json.loads(item["historical_ctr"])
        if item.get("historical_cpm"):
            item["historical_cpm"] = json.loads(item["historical_cpm"])
        if item.get("historical_frequency"):
            item["historical_frequency"] = json.loads(item["historical_frequency"])
        results.append(item)

    return results


# ============ 크리에이티브 피로도 분석 ============

def save_fatigue_analysis(
    user_id: int,
    ad_account_id: str,
    creative_id: str,
    fatigue_level: str,
    fatigue_score: float,
    indicator_scores: str,
    issues: str,
    recommendations: str,
    estimated_days_remaining: int,
    replacement_priority: int
) -> int:
    """크리에이티브 피로도 분석 결과 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO creative_fatigue_analysis
        (user_id, ad_account_id, creative_id, fatigue_level, fatigue_score,
         indicator_scores, issues, recommendations, estimated_days_remaining,
         replacement_priority)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, ad_account_id, creative_id, fatigue_level, fatigue_score,
        indicator_scores, issues, recommendations, estimated_days_remaining,
        replacement_priority
    ))

    analysis_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return analysis_id


def get_fatigue_analysis(
    user_id: int,
    ad_account_id: str,
    creative_id: Optional[str] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """크리에이티브 피로도 분석 결과 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    query = """
        SELECT * FROM creative_fatigue_analysis
        WHERE user_id = ? AND ad_account_id = ?
    """
    params = [user_id, ad_account_id]

    if creative_id:
        query += " AND creative_id = ?"
        params.append(creative_id)

    query += " ORDER BY analyzed_at DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    results = []
    for row in rows:
        item = dict(row)
        if item.get("indicator_scores"):
            item["indicator_scores"] = json.loads(item["indicator_scores"])
        if item.get("issues"):
            item["issues"] = json.loads(item["issues"])
        if item.get("recommendations"):
            item["recommendations"] = json.loads(item["recommendations"])
        results.append(item)

    return results


def get_latest_fatigue_analysis(
    user_id: int,
    ad_account_id: str
) -> List[Dict[str, Any]]:
    """각 크리에이티브의 최신 피로도 분석 결과 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT cfa.*
        FROM creative_fatigue_analysis cfa
        INNER JOIN (
            SELECT creative_id, MAX(analyzed_at) as max_analyzed
            FROM creative_fatigue_analysis
            WHERE user_id = ? AND ad_account_id = ?
            GROUP BY creative_id
        ) latest ON cfa.creative_id = latest.creative_id
            AND cfa.analyzed_at = latest.max_analyzed
        WHERE cfa.user_id = ? AND cfa.ad_account_id = ?
        ORDER BY cfa.replacement_priority DESC, cfa.fatigue_score DESC
    """, (user_id, ad_account_id, user_id, ad_account_id))

    rows = cursor.fetchall()
    conn.close()

    results = []
    for row in rows:
        item = dict(row)
        if item.get("indicator_scores"):
            item["indicator_scores"] = json.loads(item["indicator_scores"])
        if item.get("issues"):
            item["issues"] = json.loads(item["issues"])
        if item.get("recommendations"):
            item["recommendations"] = json.loads(item["recommendations"])
        results.append(item)

    return results


def get_fatigue_summary(user_id: int, ad_account_id: str) -> Dict[str, Any]:
    """크리에이티브 피로도 요약"""
    conn = get_ad_db()
    cursor = conn.cursor()

    # 최신 분석 기준 피로도 레벨 분포
    cursor.execute("""
        SELECT cfa.fatigue_level, COUNT(*) as count
        FROM creative_fatigue_analysis cfa
        INNER JOIN (
            SELECT creative_id, MAX(analyzed_at) as max_analyzed
            FROM creative_fatigue_analysis
            WHERE user_id = ? AND ad_account_id = ?
            GROUP BY creative_id
        ) latest ON cfa.creative_id = latest.creative_id
            AND cfa.analyzed_at = latest.max_analyzed
        WHERE cfa.user_id = ? AND cfa.ad_account_id = ?
        GROUP BY cfa.fatigue_level
    """, (user_id, ad_account_id, user_id, ad_account_id))

    level_dist = {row["fatigue_level"]: row["count"] for row in cursor.fetchall()}

    # 평균 피로도 점수
    cursor.execute("""
        SELECT AVG(cfa.fatigue_score) as avg_score, COUNT(*) as total
        FROM creative_fatigue_analysis cfa
        INNER JOIN (
            SELECT creative_id, MAX(analyzed_at) as max_analyzed
            FROM creative_fatigue_analysis
            WHERE user_id = ? AND ad_account_id = ?
            GROUP BY creative_id
        ) latest ON cfa.creative_id = latest.creative_id
            AND cfa.analyzed_at = latest.max_analyzed
        WHERE cfa.user_id = ? AND cfa.ad_account_id = ?
    """, (user_id, ad_account_id, user_id, ad_account_id))

    row = cursor.fetchone()
    avg_score = row["avg_score"] or 0
    total = row["total"] or 0

    # 긴급 교체 필요 크리에이티브 수
    cursor.execute("""
        SELECT COUNT(*) as urgent_count
        FROM creative_fatigue_analysis cfa
        INNER JOIN (
            SELECT creative_id, MAX(analyzed_at) as max_analyzed
            FROM creative_fatigue_analysis
            WHERE user_id = ? AND ad_account_id = ?
            GROUP BY creative_id
        ) latest ON cfa.creative_id = latest.creative_id
            AND cfa.analyzed_at = latest.max_analyzed
        WHERE cfa.user_id = ? AND cfa.ad_account_id = ?
        AND cfa.replacement_priority >= 4
    """, (user_id, ad_account_id, user_id, ad_account_id))

    urgent_count = cursor.fetchone()["urgent_count"] or 0

    conn.close()

    return {
        "total_creatives": total,
        "average_fatigue_score": round(avg_score, 1),
        "level_distribution": level_dist,
        "urgent_replacement_needed": urgent_count,
        "fresh_count": level_dist.get("fresh", 0),
        "good_count": level_dist.get("good", 0),
        "moderate_count": level_dist.get("moderate", 0),
        "tired_count": level_dist.get("tired", 0),
        "exhausted_count": level_dist.get("exhausted", 0),
        "needs_attention": (level_dist.get("tired", 0) + level_dist.get("exhausted", 0)) > 0
    }


# ============ 크리에이티브 교체 추천 ============

def save_refresh_recommendation(
    user_id: int,
    ad_account_id: str,
    recommendation: Dict[str, Any]
) -> int:
    """크리에이티브 교체 추천 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO creative_refresh_recommendations
        (user_id, ad_account_id, creative_id, creative_name, current_type,
         fatigue_level, recommended_action, urgency, suggested_variations,
         expected_improvement, budget_impact)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        ad_account_id,
        recommendation.get("creative_id", ""),
        recommendation.get("creative_name", ""),
        recommendation.get("current_type", ""),
        recommendation.get("fatigue_level", ""),
        recommendation.get("recommended_action", ""),
        recommendation.get("urgency", ""),
        json.dumps(recommendation.get("suggested_variations", []), ensure_ascii=False),
        json.dumps(recommendation.get("expected_improvement", {})),
        recommendation.get("budget_impact", ""),
    ))

    rec_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return rec_id


def get_refresh_recommendations(
    user_id: int,
    ad_account_id: str,
    urgency: Optional[str] = None,
    include_applied: bool = False,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """크리에이티브 교체 추천 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    query = """
        SELECT * FROM creative_refresh_recommendations
        WHERE user_id = ? AND ad_account_id = ?
    """
    params = [user_id, ad_account_id]

    if not include_applied:
        query += " AND is_applied = 0"

    if urgency:
        query += " AND urgency = ?"
        params.append(urgency)

    query += " ORDER BY CASE urgency WHEN 'immediate' THEN 0 WHEN 'within_week' THEN 1 ELSE 2 END, created_at DESC"
    query += " LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    results = []
    for row in rows:
        item = dict(row)
        if item.get("suggested_variations"):
            item["suggested_variations"] = json.loads(item["suggested_variations"])
        if item.get("expected_improvement"):
            item["expected_improvement"] = json.loads(item["expected_improvement"])
        results.append(item)

    return results


def apply_refresh_recommendation(recommendation_id: int, user_id: int) -> bool:
    """교체 추천 적용 처리"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE creative_refresh_recommendations
        SET is_applied = 1, applied_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
    """, (recommendation_id, user_id))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0


# ============ 광고 최적화 DB 클래스 ============

class AdOptimizationDB:
    """광고 최적화 DB 래퍼 클래스"""

    def get_creative_performance(self, user_id: int, ad_account_id: str) -> List[Dict[str, Any]]:
        """크리에이티브 성과 조회"""
        return get_latest_creative_performance(user_id, ad_account_id)

    def save_fatigue_analysis(self, **kwargs):
        """피로도 분석 저장"""
        return save_fatigue_analysis(**kwargs)

    def get_fatigue_summary(self, user_id: int, ad_account_id: str) -> Dict[str, Any]:
        """피로도 요약 조회"""
        return get_fatigue_summary(user_id, ad_account_id)


# ============ 네이버 품질지수 ============

def save_keyword_quality(
    user_id: int,
    keyword_data: Dict[str, Any]
) -> int:
    """키워드 품질 데이터 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO naver_keyword_quality
        (user_id, keyword_id, keyword_text, ad_group_id, ad_group_name,
         campaign_id, campaign_name, quality_index, ad_relevance_score,
         landing_page_score, expected_ctr_score, impressions, clicks,
         conversions, cost, ctr, cvr, cpc, ad_title, ad_description,
         display_url, has_sitelinks, has_callouts, has_phone, match_type, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        keyword_data.get("keyword_id", ""),
        keyword_data.get("keyword_text", ""),
        keyword_data.get("ad_group_id", ""),
        keyword_data.get("ad_group_name", ""),
        keyword_data.get("campaign_id", ""),
        keyword_data.get("campaign_name", ""),
        keyword_data.get("quality_index", 5),
        keyword_data.get("ad_relevance_score", 5),
        keyword_data.get("landing_page_score", 5),
        keyword_data.get("expected_ctr_score", 5),
        keyword_data.get("impressions", 0),
        keyword_data.get("clicks", 0),
        keyword_data.get("conversions", 0),
        keyword_data.get("cost", 0),
        keyword_data.get("ctr", 0),
        keyword_data.get("cvr", 0),
        keyword_data.get("cpc", 0),
        keyword_data.get("ad_title", ""),
        keyword_data.get("ad_description", ""),
        keyword_data.get("display_url", ""),
        keyword_data.get("has_sitelinks", False),
        keyword_data.get("has_callouts", False),
        keyword_data.get("has_phone", False),
        keyword_data.get("match_type", "exact"),
        keyword_data.get("status", "active"),
    ))

    quality_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return quality_id


def get_keyword_quality_list(
    user_id: int,
    campaign_id: Optional[str] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """키워드 품질 데이터 목록 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    query = """
        SELECT nkq.*
        FROM naver_keyword_quality nkq
        INNER JOIN (
            SELECT keyword_id, MAX(recorded_at) as max_recorded
            FROM naver_keyword_quality
            WHERE user_id = ?
            GROUP BY keyword_id
        ) latest ON nkq.keyword_id = latest.keyword_id
            AND nkq.recorded_at = latest.max_recorded
        WHERE nkq.user_id = ?
    """
    params = [user_id, user_id]

    if campaign_id:
        query += " AND nkq.campaign_id = ?"
        params.append(campaign_id)

    query += " ORDER BY nkq.quality_index ASC, nkq.cost DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def save_quality_analysis(
    user_id: int,
    analysis_data: Dict[str, Any]
) -> int:
    """품질지수 분석 결과 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO naver_quality_analysis
        (user_id, keyword_id, keyword_text, current_quality, quality_level,
         factor_scores, factor_issues, potential_quality, improvement_points,
         estimated_cpc_reduction, estimated_rank_improvement, priority)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        analysis_data.get("keyword_id", ""),
        analysis_data.get("keyword_text", ""),
        analysis_data.get("current_quality", 5),
        analysis_data.get("quality_level", "average"),
        json.dumps(analysis_data.get("factor_scores", {})),
        json.dumps(analysis_data.get("factor_issues", {})),
        analysis_data.get("potential_quality", 5),
        analysis_data.get("improvement_points", 0),
        analysis_data.get("estimated_cpc_reduction", 0),
        analysis_data.get("estimated_rank_improvement", 0),
        analysis_data.get("priority", 3),
    ))

    analysis_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return analysis_id


def get_quality_analysis_list(
    user_id: int,
    keyword_id: Optional[str] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """품질지수 분석 결과 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    if keyword_id:
        cursor.execute("""
            SELECT * FROM naver_quality_analysis
            WHERE user_id = ? AND keyword_id = ?
            ORDER BY analyzed_at DESC LIMIT ?
        """, (user_id, keyword_id, limit))
    else:
        cursor.execute("""
            SELECT nqa.*
            FROM naver_quality_analysis nqa
            INNER JOIN (
                SELECT keyword_id, MAX(analyzed_at) as max_analyzed
                FROM naver_quality_analysis
                WHERE user_id = ?
                GROUP BY keyword_id
            ) latest ON nqa.keyword_id = latest.keyword_id
                AND nqa.analyzed_at = latest.max_analyzed
            WHERE nqa.user_id = ?
            ORDER BY nqa.priority DESC, nqa.improvement_points DESC
            LIMIT ?
        """, (user_id, user_id, limit))

    rows = cursor.fetchall()
    conn.close()

    results = []
    for row in rows:
        item = dict(row)
        if item.get("factor_scores"):
            item["factor_scores"] = json.loads(item["factor_scores"])
        if item.get("factor_issues"):
            item["factor_issues"] = json.loads(item["factor_issues"])
        results.append(item)

    return results


def get_quality_summary(user_id: int) -> Dict[str, Any]:
    """품질지수 요약"""
    conn = get_ad_db()
    cursor = conn.cursor()

    # 최신 분석 기준 품질 레벨 분포
    cursor.execute("""
        SELECT nqa.quality_level, COUNT(*) as count
        FROM naver_quality_analysis nqa
        INNER JOIN (
            SELECT keyword_id, MAX(analyzed_at) as max_analyzed
            FROM naver_quality_analysis
            WHERE user_id = ?
            GROUP BY keyword_id
        ) latest ON nqa.keyword_id = latest.keyword_id
            AND nqa.analyzed_at = latest.max_analyzed
        WHERE nqa.user_id = ?
        GROUP BY nqa.quality_level
    """, (user_id, user_id))

    level_dist = {row["quality_level"]: row["count"] for row in cursor.fetchall()}

    # 평균 품질지수
    cursor.execute("""
        SELECT AVG(nqa.current_quality) as avg_quality, COUNT(*) as total,
               SUM(nqa.improvement_points) as total_improvement,
               SUM(nqa.estimated_cpc_reduction) as total_cpc_reduction
        FROM naver_quality_analysis nqa
        INNER JOIN (
            SELECT keyword_id, MAX(analyzed_at) as max_analyzed
            FROM naver_quality_analysis
            WHERE user_id = ?
            GROUP BY keyword_id
        ) latest ON nqa.keyword_id = latest.keyword_id
            AND nqa.analyzed_at = latest.max_analyzed
        WHERE nqa.user_id = ?
    """, (user_id, user_id))

    row = cursor.fetchone()
    avg_quality = row["avg_quality"] or 0
    total = row["total"] or 0
    total_improvement = row["total_improvement"] or 0
    total_cpc_reduction = row["total_cpc_reduction"] or 0

    conn.close()

    return {
        "total_keywords": total,
        "average_quality_index": round(avg_quality, 1),
        "quality_distribution": level_dist,
        "excellent_count": level_dist.get("excellent", 0),
        "good_count": level_dist.get("good", 0),
        "average_count": level_dist.get("average", 0),
        "poor_count": level_dist.get("poor", 0),
        "total_improvement_potential": total_improvement,
        "estimated_total_cpc_reduction": round(total_cpc_reduction, 0),
        "needs_attention": level_dist.get("poor", 0) > 0
    }


def save_quality_recommendation(
    user_id: int,
    recommendation: Dict[str, Any]
) -> int:
    """품질지수 개선 추천 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO naver_quality_recommendations
        (user_id, keyword_id, keyword_text, recommendation_type, priority,
         title, description, current_value, suggested_action, suggested_value,
         expected_improvement, expected_cpc_reduction, difficulty)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        recommendation.get("keyword_id", ""),
        recommendation.get("keyword_text", ""),
        recommendation.get("recommendation_type", ""),
        recommendation.get("priority", 3),
        recommendation.get("title", ""),
        recommendation.get("description", ""),
        recommendation.get("current_value", ""),
        recommendation.get("suggested_action", ""),
        recommendation.get("suggested_value", ""),
        recommendation.get("expected_improvement", 0),
        recommendation.get("expected_cpc_reduction", 0),
        recommendation.get("difficulty", "medium"),
    ))

    rec_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return rec_id


def get_quality_recommendations(
    user_id: int,
    keyword_id: Optional[str] = None,
    include_applied: bool = False,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """품질지수 개선 추천 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    query = "SELECT * FROM naver_quality_recommendations WHERE user_id = ?"
    params = [user_id]

    if keyword_id:
        query += " AND keyword_id = ?"
        params.append(keyword_id)

    if not include_applied:
        query += " AND is_applied = 0"

    query += " ORDER BY priority DESC, expected_cpc_reduction DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def apply_quality_recommendation(recommendation_id: int, user_id: int) -> bool:
    """품질지수 개선 추천 적용 처리"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE naver_quality_recommendations
        SET is_applied = 1, applied_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
    """, (recommendation_id, user_id))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0


def save_quality_history(
    user_id: int,
    keyword_id: str,
    quality_index: int,
    ad_relevance_score: int = None,
    landing_page_score: int = None,
    expected_ctr_score: int = None
) -> int:
    """품질지수 히스토리 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO naver_quality_history
        (user_id, keyword_id, quality_index, ad_relevance_score,
         landing_page_score, expected_ctr_score)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        user_id, keyword_id, quality_index,
        ad_relevance_score, landing_page_score, expected_ctr_score
    ))

    history_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return history_id


def get_quality_history(
    user_id: int,
    keyword_id: str,
    days: int = 30
) -> List[Dict[str, Any]]:
    """품질지수 히스토리 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM naver_quality_history
        WHERE user_id = ? AND keyword_id = ?
        AND recorded_at >= datetime('now', ?)
        ORDER BY recorded_at ASC
    """, (user_id, keyword_id, f"-{days} days"))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


# ============ Budget Pacing 관련 함수 ============

def save_campaign_budget(
    user_id: int,
    campaign_id: str,
    campaign_name: str,
    platform: str,
    daily_budget: float,
    monthly_budget: float = 0,
    pacing_strategy: str = "standard"
) -> int:
    """캠페인 예산 정보 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT OR REPLACE INTO campaign_budgets
        (user_id, campaign_id, campaign_name, platform, daily_budget,
         monthly_budget, pacing_strategy, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (user_id, campaign_id, campaign_name, platform, daily_budget,
          monthly_budget, pacing_strategy))

    budget_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return budget_id


def get_campaign_budgets(user_id: int, platform: str = None) -> List[Dict[str, Any]]:
    """캠페인 예산 목록 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    if platform:
        cursor.execute("""
            SELECT * FROM campaign_budgets
            WHERE user_id = ? AND platform = ? AND is_active = 1
            ORDER BY daily_budget DESC
        """, (user_id, platform))
    else:
        cursor.execute("""
            SELECT * FROM campaign_budgets
            WHERE user_id = ? AND is_active = 1
            ORDER BY daily_budget DESC
        """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def update_campaign_spend(
    user_id: int,
    campaign_id: str,
    spent_today: float,
    spent_this_month: float
) -> bool:
    """캠페인 지출 업데이트"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE campaign_budgets
        SET spent_today = ?, spent_this_month = ?, last_updated = CURRENT_TIMESTAMP
        WHERE user_id = ? AND campaign_id = ?
    """, (spent_today, spent_this_month, user_id, campaign_id))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0


def save_hourly_allocation(
    user_id: int,
    campaign_id: str,
    allocation_date: str,
    hour: int,
    allocated_budget: float,
    actual_spend: float = 0,
    impressions: int = 0,
    clicks: int = 0,
    conversions: int = 0
) -> int:
    """시간대별 예산 배분 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    ctr = (clicks / impressions * 100) if impressions > 0 else 0
    cpc = (actual_spend / clicks) if clicks > 0 else 0

    cursor.execute("""
        INSERT OR REPLACE INTO hourly_budget_allocations
        (user_id, campaign_id, allocation_date, hour, allocated_budget,
         actual_spend, impressions, clicks, conversions, ctr, cpc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, campaign_id, allocation_date, hour, allocated_budget,
          actual_spend, impressions, clicks, conversions, ctr, cpc))

    alloc_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return alloc_id


def get_hourly_allocations(
    user_id: int,
    campaign_id: str,
    date: str = None
) -> List[Dict[str, Any]]:
    """시간대별 예산 배분 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    if date:
        cursor.execute("""
            SELECT * FROM hourly_budget_allocations
            WHERE user_id = ? AND campaign_id = ? AND allocation_date = ?
            ORDER BY hour ASC
        """, (user_id, campaign_id, date))
    else:
        cursor.execute("""
            SELECT * FROM hourly_budget_allocations
            WHERE user_id = ? AND campaign_id = ?
            AND allocation_date >= date('now', '-7 days')
            ORDER BY allocation_date DESC, hour ASC
        """, (user_id, campaign_id))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def save_pacing_analysis(
    user_id: int,
    campaign_id: str,
    analysis_date: str,
    analysis_hour: int,
    daily_budget: float,
    spent_so_far: float,
    expected_spend: float,
    actual_vs_expected: float,
    pacing_status: str,
    burn_rate_per_hour: float,
    projected_eod_spend: float,
    budget_utilization: float,
    recommended_adjustment: float = 0,
    recommended_hourly_budget: float = 0,
    confidence_score: float = 0
) -> int:
    """페이싱 분석 결과 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO budget_pacing_analysis
        (user_id, campaign_id, analysis_date, analysis_hour, daily_budget,
         spent_so_far, expected_spend, actual_vs_expected, pacing_status,
         burn_rate_per_hour, projected_eod_spend, budget_utilization,
         recommended_adjustment, recommended_hourly_budget, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, campaign_id, analysis_date, analysis_hour, daily_budget,
          spent_so_far, expected_spend, actual_vs_expected, pacing_status,
          burn_rate_per_hour, projected_eod_spend, budget_utilization,
          recommended_adjustment, recommended_hourly_budget, confidence_score))

    analysis_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return analysis_id


def get_pacing_analyses(
    user_id: int,
    campaign_id: str = None,
    date: str = None
) -> List[Dict[str, Any]]:
    """페이싱 분석 결과 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    if campaign_id and date:
        cursor.execute("""
            SELECT * FROM budget_pacing_analysis
            WHERE user_id = ? AND campaign_id = ? AND analysis_date = ?
            ORDER BY analysis_hour ASC
        """, (user_id, campaign_id, date))
    elif campaign_id:
        cursor.execute("""
            SELECT * FROM budget_pacing_analysis
            WHERE user_id = ? AND campaign_id = ?
            ORDER BY analysis_date DESC, analysis_hour DESC
            LIMIT 48
        """, (user_id, campaign_id))
    else:
        cursor.execute("""
            SELECT * FROM budget_pacing_analysis
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 100
        """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def save_pacing_alert(
    user_id: int,
    campaign_id: str,
    campaign_name: str,
    platform: str,
    alert_type: str,
    severity: str,
    message: str,
    current_value: float,
    threshold_value: float,
    recommended_action: str
) -> int:
    """페이싱 알림 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO budget_pacing_alerts
        (user_id, campaign_id, campaign_name, platform, alert_type,
         severity, message, current_value, threshold_value, recommended_action)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, campaign_id, campaign_name, platform, alert_type,
          severity, message, current_value, threshold_value, recommended_action))

    alert_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return alert_id


def get_pacing_alerts(
    user_id: int,
    include_resolved: bool = False
) -> List[Dict[str, Any]]:
    """페이싱 알림 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    if include_resolved:
        cursor.execute("""
            SELECT * FROM budget_pacing_alerts
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 100
        """, (user_id,))
    else:
        cursor.execute("""
            SELECT * FROM budget_pacing_alerts
            WHERE user_id = ? AND is_resolved = 0
            ORDER BY
                CASE severity
                    WHEN 'critical' THEN 1
                    WHEN 'warning' THEN 2
                    ELSE 3
                END,
                created_at DESC
        """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def resolve_pacing_alert(user_id: int, alert_id: int) -> bool:
    """페이싱 알림 해결 처리"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE budget_pacing_alerts
        SET is_resolved = 1, resolved_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
    """, (alert_id, user_id))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0


def save_pacing_recommendation(
    user_id: int,
    campaign_id: str,
    recommendation_type: str,
    title: str,
    description: str,
    current_strategy: str,
    recommended_strategy: str,
    expected_improvement: str,
    priority: int = 3,
    hourly_adjustments: Dict[int, float] = None
) -> int:
    """페이싱 권장사항 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    hourly_json = json.dumps(hourly_adjustments) if hourly_adjustments else None

    cursor.execute("""
        INSERT INTO budget_pacing_recommendations
        (user_id, campaign_id, recommendation_type, title, description,
         current_strategy, recommended_strategy, expected_improvement,
         priority, hourly_adjustments_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, campaign_id, recommendation_type, title, description,
          current_strategy, recommended_strategy, expected_improvement,
          priority, hourly_json))

    rec_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return rec_id


def get_pacing_recommendations(
    user_id: int,
    include_applied: bool = False
) -> List[Dict[str, Any]]:
    """페이싱 권장사항 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    if include_applied:
        cursor.execute("""
            SELECT * FROM budget_pacing_recommendations
            WHERE user_id = ?
            ORDER BY priority ASC, created_at DESC
        """, (user_id,))
    else:
        cursor.execute("""
            SELECT * FROM budget_pacing_recommendations
            WHERE user_id = ? AND is_applied = 0
            ORDER BY priority ASC, created_at DESC
        """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    results = []
    for row in rows:
        row_dict = dict(row)
        if row_dict.get('hourly_adjustments_json'):
            row_dict['hourly_adjustments'] = json.loads(row_dict['hourly_adjustments_json'])
        results.append(row_dict)

    return results


def apply_pacing_recommendation(user_id: int, recommendation_id: int) -> bool:
    """페이싱 권장사항 적용"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE budget_pacing_recommendations
        SET is_applied = 1, applied_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
    """, (recommendation_id, user_id))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0


def save_monthly_projection(
    user_id: int,
    campaign_id: str,
    projection_date: str,
    monthly_budget: float,
    spent_this_month: float,
    projected_monthly_spend: float,
    monthly_utilization: float,
    expected_utilization: float,
    monthly_status: str,
    days_remaining: int,
    daily_avg_spend: float,
    recommended_daily_budget: float,
    projected_surplus_deficit: float
) -> int:
    """월간 예산 예측 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT OR REPLACE INTO monthly_budget_projections
        (user_id, campaign_id, projection_date, monthly_budget, spent_this_month,
         projected_monthly_spend, monthly_utilization, expected_utilization,
         monthly_status, days_remaining, daily_avg_spend, recommended_daily_budget,
         projected_surplus_deficit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, campaign_id, projection_date, monthly_budget, spent_this_month,
          projected_monthly_spend, monthly_utilization, expected_utilization,
          monthly_status, days_remaining, daily_avg_spend, recommended_daily_budget,
          projected_surplus_deficit))

    proj_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return proj_id


def get_monthly_projections(
    user_id: int,
    campaign_id: str = None
) -> List[Dict[str, Any]]:
    """월간 예산 예측 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    if campaign_id:
        cursor.execute("""
            SELECT * FROM monthly_budget_projections
            WHERE user_id = ? AND campaign_id = ?
            ORDER BY projection_date DESC
            LIMIT 30
        """, (user_id, campaign_id))
    else:
        cursor.execute("""
            SELECT * FROM monthly_budget_projections
            WHERE user_id = ?
            AND projection_date = date('now')
            ORDER BY monthly_budget DESC
        """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


# ============ Funnel Bidding 관련 함수 ============

def save_funnel_campaign(
    user_id: int,
    campaign_id: str,
    campaign_name: str,
    platform: str,
    objective: str,
    funnel_stage: str,
    bidding_strategy: str,
    daily_budget: float,
    impressions: int = 0,
    reach: int = 0,
    clicks: int = 0,
    conversions: int = 0,
    spend: float = 0,
    revenue: float = 0
) -> int:
    """퍼널 캠페인 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    # 지표 계산
    cpm = (spend / impressions * 1000) if impressions > 0 else 0
    cpc = (spend / clicks) if clicks > 0 else 0
    ctr = (clicks / impressions * 100) if impressions > 0 else 0
    cpa = (spend / conversions) if conversions > 0 else 0
    roas = (revenue / spend * 100) if spend > 0 else 0
    conversion_rate = (conversions / clicks * 100) if clicks > 0 else 0

    cursor.execute("""
        INSERT OR REPLACE INTO funnel_campaigns
        (user_id, campaign_id, campaign_name, platform, objective, funnel_stage,
         bidding_strategy, daily_budget, impressions, reach, clicks, conversions,
         spend, revenue, cpm, cpc, ctr, cpa, roas, conversion_rate, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (user_id, campaign_id, campaign_name, platform, objective, funnel_stage,
          bidding_strategy, daily_budget, impressions, reach, clicks, conversions,
          spend, revenue, cpm, cpc, ctr, cpa, roas, conversion_rate))

    campaign_id_result = cursor.lastrowid
    conn.commit()
    conn.close()

    return campaign_id_result


def get_funnel_campaigns(
    user_id: int,
    funnel_stage: str = None,
    platform: str = None
) -> List[Dict[str, Any]]:
    """퍼널 캠페인 목록 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    query = "SELECT * FROM funnel_campaigns WHERE user_id = ? AND is_active = 1"
    params = [user_id]

    if funnel_stage:
        query += " AND funnel_stage = ?"
        params.append(funnel_stage)
    if platform:
        query += " AND platform = ?"
        params.append(platform)

    query += " ORDER BY daily_budget DESC"
    cursor.execute(query, params)

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def save_funnel_stage_metrics(
    user_id: int,
    stage: str,
    analysis_date: str,
    campaign_count: int,
    total_budget: float,
    total_spend: float,
    total_impressions: int,
    total_reach: int,
    total_clicks: int,
    total_conversions: int,
    total_revenue: float,
    avg_cpm: float = 0,
    avg_cpc: float = 0,
    avg_ctr: float = 0,
    avg_cpa: float = 0,
    avg_roas: float = 0,
    cpm_vs_benchmark: float = 0,
    cpc_vs_benchmark: float = 0,
    cpa_vs_benchmark: float = 0
) -> int:
    """퍼널 단계별 성과 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT OR REPLACE INTO funnel_stage_metrics
        (user_id, stage, analysis_date, campaign_count, total_budget, total_spend,
         total_impressions, total_reach, total_clicks, total_conversions, total_revenue,
         avg_cpm, avg_cpc, avg_ctr, avg_cpa, avg_roas,
         cpm_vs_benchmark, cpc_vs_benchmark, cpa_vs_benchmark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, stage, analysis_date, campaign_count, total_budget, total_spend,
          total_impressions, total_reach, total_clicks, total_conversions, total_revenue,
          avg_cpm, avg_cpc, avg_ctr, avg_cpa, avg_roas,
          cpm_vs_benchmark, cpc_vs_benchmark, cpa_vs_benchmark))

    metrics_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return metrics_id


def get_funnel_stage_metrics(
    user_id: int,
    stage: str = None,
    date: str = None
) -> List[Dict[str, Any]]:
    """퍼널 단계별 성과 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    if stage and date:
        cursor.execute("""
            SELECT * FROM funnel_stage_metrics
            WHERE user_id = ? AND stage = ? AND analysis_date = ?
        """, (user_id, stage, date))
    elif stage:
        cursor.execute("""
            SELECT * FROM funnel_stage_metrics
            WHERE user_id = ? AND stage = ?
            ORDER BY analysis_date DESC LIMIT 30
        """, (user_id, stage))
    elif date:
        cursor.execute("""
            SELECT * FROM funnel_stage_metrics
            WHERE user_id = ? AND analysis_date = ?
        """, (user_id, date))
    else:
        cursor.execute("""
            SELECT * FROM funnel_stage_metrics
            WHERE user_id = ? AND analysis_date = date('now')
        """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def save_funnel_flow_analysis(
    user_id: int,
    analysis_date: str,
    tofu_reach: int,
    mofu_clicks: int,
    bofu_conversions: int,
    tofu_to_mofu_rate: float,
    mofu_to_bofu_rate: float,
    overall_conversion_rate: float,
    cost_per_tofu: float,
    cost_per_mofu: float,
    cost_per_bofu: float
) -> int:
    """퍼널 흐름 분석 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT OR REPLACE INTO funnel_flow_analysis
        (user_id, analysis_date, tofu_reach, mofu_clicks, bofu_conversions,
         tofu_to_mofu_rate, mofu_to_bofu_rate, overall_conversion_rate,
         cost_per_tofu, cost_per_mofu, cost_per_bofu)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, analysis_date, tofu_reach, mofu_clicks, bofu_conversions,
          tofu_to_mofu_rate, mofu_to_bofu_rate, overall_conversion_rate,
          cost_per_tofu, cost_per_mofu, cost_per_bofu))

    flow_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return flow_id


def get_funnel_flow_analysis(
    user_id: int,
    days: int = 30
) -> List[Dict[str, Any]]:
    """퍼널 흐름 분석 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM funnel_flow_analysis
        WHERE user_id = ?
        AND analysis_date >= date('now', ?)
        ORDER BY analysis_date DESC
    """, (user_id, f"-{days} days"))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def save_funnel_recommendation(
    user_id: int,
    campaign_id: str,
    campaign_name: str,
    funnel_stage: str,
    current_strategy: str,
    recommended_strategy: str,
    reason: str,
    expected_improvement: str,
    priority: int = 3,
    recommended_bid: float = None,
    recommended_budget: float = None
) -> int:
    """퍼널 입찰 권장사항 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO funnel_bidding_recommendations
        (user_id, campaign_id, campaign_name, funnel_stage, current_strategy,
         recommended_strategy, reason, expected_improvement, priority,
         recommended_bid, recommended_budget)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, campaign_id, campaign_name, funnel_stage, current_strategy,
          recommended_strategy, reason, expected_improvement, priority,
          recommended_bid, recommended_budget))

    rec_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return rec_id


def get_funnel_recommendations(
    user_id: int,
    include_applied: bool = False
) -> List[Dict[str, Any]]:
    """퍼널 입찰 권장사항 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    if include_applied:
        cursor.execute("""
            SELECT * FROM funnel_bidding_recommendations
            WHERE user_id = ?
            ORDER BY priority ASC, created_at DESC
        """, (user_id,))
    else:
        cursor.execute("""
            SELECT * FROM funnel_bidding_recommendations
            WHERE user_id = ? AND is_applied = 0
            ORDER BY priority ASC, created_at DESC
        """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def apply_funnel_recommendation(user_id: int, recommendation_id: int) -> bool:
    """퍼널 권장사항 적용"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE funnel_bidding_recommendations
        SET is_applied = 1, applied_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
    """, (recommendation_id, user_id))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0


def save_funnel_budget_allocation(
    user_id: int,
    allocation_date: str,
    strategy: str,
    total_budget: float,
    tofu_budget: float,
    tofu_percentage: float,
    mofu_budget: float,
    mofu_percentage: float,
    bofu_budget: float,
    bofu_percentage: float,
    current_tofu_pct: float = 0,
    current_mofu_pct: float = 0,
    current_bofu_pct: float = 0,
    adjustment_needed: bool = False,
    recommendation: str = ""
) -> int:
    """퍼널 예산 배분 저장"""
    conn = get_ad_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT OR REPLACE INTO funnel_budget_allocation
        (user_id, allocation_date, strategy, total_budget,
         tofu_budget, tofu_percentage, mofu_budget, mofu_percentage,
         bofu_budget, bofu_percentage, current_tofu_pct, current_mofu_pct,
         current_bofu_pct, adjustment_needed, recommendation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, allocation_date, strategy, total_budget,
          tofu_budget, tofu_percentage, mofu_budget, mofu_percentage,
          bofu_budget, bofu_percentage, current_tofu_pct, current_mofu_pct,
          current_bofu_pct, adjustment_needed, recommendation))

    alloc_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return alloc_id


def get_funnel_budget_allocation(
    user_id: int,
    date: str = None
) -> Optional[Dict[str, Any]]:
    """퍼널 예산 배분 조회"""
    conn = get_ad_db()
    cursor = conn.cursor()

    if date:
        cursor.execute("""
            SELECT * FROM funnel_budget_allocation
            WHERE user_id = ? AND allocation_date = ?
        """, (user_id, date))
    else:
        cursor.execute("""
            SELECT * FROM funnel_budget_allocation
            WHERE user_id = ?
            ORDER BY allocation_date DESC LIMIT 1
        """, (user_id,))

    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


_ad_optimization_db: Optional[AdOptimizationDB] = None


def get_ad_optimization_db() -> AdOptimizationDB:
    """AdOptimizationDB 싱글톤 인스턴스 반환"""
    global _ad_optimization_db
    if _ad_optimization_db is None:
        _ad_optimization_db = AdOptimizationDB()
    return _ad_optimization_db


# 초기화 시 테이블 생성
try:
    init_ad_optimization_tables()
except Exception as e:
    import logging
    logging.getLogger(__name__).warning(f"Failed to initialize ad optimization tables: {e}")
