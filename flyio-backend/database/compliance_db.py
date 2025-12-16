"""
Legal Compliance Database
Tracks usage of potentially risky features for legal compliance
"""
import sqlite3
import json
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from enum import Enum
from pathlib import Path

# Database path
DATA_DIR = Path("/app/data") if Path("/app/data").exists() else Path("./data")
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "compliance.db"


class RiskLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class FeatureCategory(str, Enum):
    CRAWLING = "crawling"
    PERSONAL_DATA = "personal_data"
    API_USAGE = "api_usage"
    CONTENT_COPY = "content_copy"
    AUTOMATION = "automation"


# Legal risk definitions for features
FEATURE_RISKS: Dict[str, Dict[str, Any]] = {
    # High Risk
    "clone": {
        "name": "경쟁 블로그 분석",
        "risk_level": RiskLevel.HIGH,
        "category": FeatureCategory.CRAWLING,
        "legal_issues": ["저작권법", "크롤링 이슈", "네이버 이용약관"],
        "problems": [
            "타인의 콘텐츠 무단 수집 가능성",
            "robots.txt 위반 시 법적 문제",
            "개인정보 포함 데이터 수집 위험"
        ],
        "safe_implementation": [
            "공개 API 기반 데이터만 사용",
            "robots.txt 준수 필수",
            "수집 데이터 최소화 (통계 데이터만)",
            "타인 콘텐츠 전문 저장 금지",
            "사용자 동의 후 진행"
        ],
        "monitoring_required": True,
        "user_consent_required": True
    },
    "influencer": {
        "name": "인플루언서 분석",
        "risk_level": RiskLevel.HIGH,
        "category": FeatureCategory.PERSONAL_DATA,
        "legal_issues": ["개인정보보호법", "정보통신망법"],
        "problems": [
            "타인의 활동 데이터 수집",
            "프로파일링 이슈",
            "동의 없는 개인정보 처리"
        ],
        "safe_implementation": [
            "공개 정보만 집계 (팔로워 수, 게시물 수 등)",
            "개인 식별 정보 최소화",
            "분석 대상자 동의 권장",
            "데이터 보관 기간 제한 (30일)"
        ],
        "monitoring_required": True,
        "user_consent_required": True
    },
    "backup": {
        "name": "블로그 백업",
        "risk_level": RiskLevel.HIGH,
        "category": FeatureCategory.CONTENT_COPY,
        "legal_issues": ["저작권법", "복제권"],
        "problems": [
            "타인 콘텐츠 무단 복제 가능성",
            "저작권 침해 위험"
        ],
        "safe_implementation": [
            "본인 블로그만 백업 허용",
            "블로그 소유권 인증 필수",
            "백업 데이터 암호화",
            "제3자 공유 금지"
        ],
        "monitoring_required": True,
        "user_consent_required": False
    },

    # Medium Risk
    "algorithm": {
        "name": "알고리즘 변화 감지",
        "risk_level": RiskLevel.MEDIUM,
        "category": FeatureCategory.CRAWLING,
        "legal_issues": ["플랫폼 이용약관", "역공학 금지 조항"],
        "problems": [
            "네이버 이용약관 위반 가능성",
            "과도한 요청으로 서비스 부하"
        ],
        "safe_implementation": [
            "공개 검색 결과만 분석",
            "요청 빈도 제한 (시간당 60회 이하)",
            "캐싱 적극 활용",
            "네이버 API 우선 사용"
        ],
        "monitoring_required": True,
        "user_consent_required": False
    },
    "ranktrack": {
        "name": "키워드 순위 추적",
        "risk_level": RiskLevel.MEDIUM,
        "category": FeatureCategory.CRAWLING,
        "legal_issues": ["과도한 크롤링", "서비스 방해"],
        "problems": [
            "빈번한 검색 요청",
            "IP 차단 위험",
            "서비스 부하 유발"
        ],
        "safe_implementation": [
            "Rate limiting 적용 (분당 10회)",
            "결과 캐싱 (최소 1시간)",
            "배치 처리로 요청 분산",
            "실패 시 재시도 제한"
        ],
        "monitoring_required": True,
        "user_consent_required": False
    },
    "secretkw": {
        "name": "비밀 키워드 발굴",
        "risk_level": RiskLevel.MEDIUM,
        "category": FeatureCategory.API_USAGE,
        "legal_issues": ["네이버 광고 API 이용약관"],
        "problems": [
            "API 호출 제한 위반 가능",
            "상업적 목적 사용 제한"
        ],
        "safe_implementation": [
            "API 호출 제한 준수",
            "일일 한도 모니터링",
            "결과 캐싱 활용",
            "사용 목적 기록"
        ],
        "monitoring_required": True,
        "user_consent_required": False
    },
    "shopping": {
        "name": "쇼핑 키워드 분석",
        "risk_level": RiskLevel.MEDIUM,
        "category": FeatureCategory.CRAWLING,
        "legal_issues": ["네이버 쇼핑 이용약관"],
        "problems": [
            "상품 데이터 무단 수집",
            "가격 정보 스크래핑"
        ],
        "safe_implementation": [
            "네이버 쇼핑 API 사용",
            "키워드 통계만 수집",
            "개별 상품 데이터 저장 금지"
        ],
        "monitoring_required": True,
        "user_consent_required": False
    },
    "place": {
        "name": "플레이스 분석",
        "risk_level": RiskLevel.MEDIUM,
        "category": FeatureCategory.CRAWLING,
        "legal_issues": ["네이버 플레이스 이용약관", "업체 정보 수집"],
        "problems": [
            "업체 정보 무단 수집",
            "리뷰 데이터 저작권"
        ],
        "safe_implementation": [
            "네이버 플레이스 API 사용",
            "통계 데이터만 활용",
            "개별 리뷰 저장 금지"
        ],
        "monitoring_required": True,
        "user_consent_required": False
    },

    # Low Risk
    "title": {
        "name": "AI 제목 생성",
        "risk_level": RiskLevel.LOW,
        "category": FeatureCategory.AUTOMATION,
        "legal_issues": ["AI 생성 콘텐츠 표시"],
        "problems": [
            "AI 생성 콘텐츠 미표시 시 기만 가능"
        ],
        "safe_implementation": [
            "AI 생성 콘텐츠임을 명시 권장",
            "사용자 편집 후 게시 권장"
        ],
        "monitoring_required": False,
        "user_consent_required": False
    },
    "writing": {
        "name": "글쓰기 가이드",
        "risk_level": RiskLevel.LOW,
        "category": FeatureCategory.AUTOMATION,
        "legal_issues": [],
        "problems": [],
        "safe_implementation": [
            "사용자 본인 콘텐츠 분석",
            "가이드 제공 목적"
        ],
        "monitoring_required": False,
        "user_consent_required": False
    },
    "hashtag": {
        "name": "해시태그 추천",
        "risk_level": RiskLevel.LOW,
        "category": FeatureCategory.AUTOMATION,
        "legal_issues": [],
        "problems": [],
        "safe_implementation": [
            "공개 데이터 기반 추천"
        ],
        "monitoring_required": False,
        "user_consent_required": False
    }
}


def init_compliance_tables():
    """Initialize compliance tracking tables"""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    # Feature usage log table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS feature_usage_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            feature_name TEXT NOT NULL,
            risk_level TEXT NOT NULL,
            action TEXT NOT NULL,
            target_data TEXT,
            ip_address TEXT,
            user_agent TEXT,
            consent_given BOOLEAN DEFAULT FALSE,
            additional_info TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Risk alerts table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS risk_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            feature_name TEXT NOT NULL,
            alert_type TEXT NOT NULL,
            alert_message TEXT NOT NULL,
            severity TEXT NOT NULL,
            resolved BOOLEAN DEFAULT FALSE,
            resolved_at TIMESTAMP,
            resolved_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # User consent log
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_consent_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            feature_name TEXT NOT NULL,
            consent_type TEXT NOT NULL,
            consent_given BOOLEAN NOT NULL,
            consent_text TEXT,
            ip_address TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Daily usage summary
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS daily_usage_summary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            feature_name TEXT NOT NULL,
            total_uses INTEGER DEFAULT 0,
            unique_users INTEGER DEFAULT 0,
            high_risk_actions INTEGER DEFAULT 0,
            alerts_generated INTEGER DEFAULT 0,
            UNIQUE(date, feature_name)
        )
    ''')

    conn.commit()
    conn.close()


def log_feature_usage(
    user_id: Optional[int],
    feature_name: str,
    action: str,
    target_data: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    consent_given: bool = False,
    additional_info: Optional[dict] = None
) -> int:
    """Log feature usage for compliance tracking"""
    risk_info = FEATURE_RISKS.get(feature_name, {})
    risk_level = risk_info.get("risk_level", RiskLevel.LOW).value if risk_info else "low"

    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO feature_usage_log
        (user_id, feature_name, risk_level, action, target_data, ip_address, user_agent, consent_given, additional_info)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        user_id,
        feature_name,
        risk_level,
        action,
        target_data,
        ip_address,
        user_agent,
        consent_given,
        json.dumps(additional_info) if additional_info else None
    ))

    log_id = cursor.lastrowid
    conn.commit()
    conn.close()

    # Check if alert should be generated
    if risk_level == "high":
        _check_and_generate_alert(user_id, feature_name, action)

    return log_id


def _check_and_generate_alert(user_id: Optional[int], feature_name: str, action: str):
    """Check usage patterns and generate alerts if needed"""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    # Check recent usage count
    cursor.execute('''
        SELECT COUNT(*) FROM feature_usage_log
        WHERE feature_name = ? AND user_id = ?
        AND created_at > datetime('now', '-1 hour')
    ''', (feature_name, user_id))

    recent_count = cursor.fetchone()[0]

    # Generate alert if usage is excessive
    if recent_count > 10:
        cursor.execute('''
            INSERT INTO risk_alerts (user_id, feature_name, alert_type, alert_message, severity)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            user_id,
            feature_name,
            "excessive_usage",
            f"1시간 내 {recent_count}회 사용 감지",
            "warning"
        ))

    conn.commit()
    conn.close()


def log_user_consent(
    user_id: int,
    feature_name: str,
    consent_type: str,
    consent_given: bool,
    consent_text: Optional[str] = None,
    ip_address: Optional[str] = None
):
    """Log user consent for risky features"""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO user_consent_log
        (user_id, feature_name, consent_type, consent_given, consent_text, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (user_id, feature_name, consent_type, consent_given, consent_text, ip_address))

    conn.commit()
    conn.close()


def get_usage_logs(
    feature_name: Optional[str] = None,
    risk_level: Optional[str] = None,
    user_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 100
) -> List[Dict]:
    """Get feature usage logs with filters"""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    query = "SELECT * FROM feature_usage_log WHERE 1=1"
    params = []

    if feature_name:
        query += " AND feature_name = ?"
        params.append(feature_name)

    if risk_level:
        query += " AND risk_level = ?"
        params.append(risk_level)

    if user_id:
        query += " AND user_id = ?"
        params.append(user_id)

    if start_date:
        query += " AND created_at >= ?"
        params.append(start_date)

    if end_date:
        query += " AND created_at <= ?"
        params.append(end_date)

    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    logs = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return logs


def get_risk_alerts(
    resolved: Optional[bool] = None,
    severity: Optional[str] = None,
    limit: int = 50
) -> List[Dict]:
    """Get risk alerts"""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    query = "SELECT * FROM risk_alerts WHERE 1=1"
    params = []

    if resolved is not None:
        query += " AND resolved = ?"
        params.append(resolved)

    if severity:
        query += " AND severity = ?"
        params.append(severity)

    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    alerts = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return alerts


def resolve_alert(alert_id: int, admin_id: int) -> bool:
    """Mark an alert as resolved"""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE risk_alerts
        SET resolved = TRUE, resolved_at = CURRENT_TIMESTAMP, resolved_by = ?
        WHERE id = ?
    ''', (admin_id, alert_id))

    success = cursor.rowcount > 0
    conn.commit()
    conn.close()

    return success


def get_compliance_stats() -> Dict:
    """Get compliance statistics for dashboard"""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    stats = {}

    # Total usage by risk level (last 7 days)
    cursor.execute('''
        SELECT risk_level, COUNT(*) as count
        FROM feature_usage_log
        WHERE created_at > datetime('now', '-7 days')
        GROUP BY risk_level
    ''')
    stats['usage_by_risk'] = {row[0]: row[1] for row in cursor.fetchall()}

    # Top used risky features
    cursor.execute('''
        SELECT feature_name, COUNT(*) as count
        FROM feature_usage_log
        WHERE risk_level IN ('high', 'medium')
        AND created_at > datetime('now', '-7 days')
        GROUP BY feature_name
        ORDER BY count DESC
        LIMIT 10
    ''')
    stats['top_risky_features'] = [
        {"feature": row[0], "count": row[1]}
        for row in cursor.fetchall()
    ]

    # Unresolved alerts count
    cursor.execute('''
        SELECT COUNT(*) FROM risk_alerts WHERE resolved = FALSE
    ''')
    stats['unresolved_alerts'] = cursor.fetchone()[0]

    # Total high risk usage today
    cursor.execute('''
        SELECT COUNT(*) FROM feature_usage_log
        WHERE risk_level = 'high'
        AND date(created_at) = date('now')
    ''')
    stats['high_risk_today'] = cursor.fetchone()[0]

    conn.close()

    return stats


def get_feature_risks() -> Dict[str, Dict]:
    """Get all feature risk definitions"""
    return FEATURE_RISKS


def check_user_consent(user_id: int, feature_name: str) -> bool:
    """Check if user has given consent for a feature"""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    cursor.execute('''
        SELECT consent_given FROM user_consent_log
        WHERE user_id = ? AND feature_name = ?
        ORDER BY created_at DESC
        LIMIT 1
    ''', (user_id, feature_name))

    result = cursor.fetchone()
    conn.close()

    return result[0] if result else False
