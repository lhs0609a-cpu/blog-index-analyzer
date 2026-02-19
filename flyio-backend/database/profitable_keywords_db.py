"""
Profitable Keywords Database - 수익성 키워드 풀 관리

키워드 풀 + 수익 예측 + 내 레벨 기반 매칭
"""
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
from database.sqlite_db import get_sqlite_client

logger = logging.getLogger(__name__)


def initialize_profitable_keywords_tables():
    """수익성 키워드 테이블 초기화"""
    client = get_sqlite_client()

    queries = [
        # 키워드 풀 (메인 테이블)
        """
        CREATE TABLE IF NOT EXISTS keyword_pool (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword TEXT UNIQUE NOT NULL,
            category TEXT,

            -- 검색 데이터
            monthly_search_volume INTEGER DEFAULT 0,
            search_trend REAL DEFAULT 1.0,

            -- 경쟁 데이터 (실시간 업데이트)
            rank1_blog_level INTEGER DEFAULT 0,
            rank1_blog_score REAL DEFAULT 0,
            rank1_blog_id TEXT,
            rank1_last_post_date TIMESTAMP,
            rank1_inactive_hours INTEGER DEFAULT 0,
            top10_avg_level REAL DEFAULT 0,
            top10_min_level INTEGER DEFAULT 0,
            competition_score INTEGER DEFAULT 50,

            -- 수익 데이터
            estimated_cpc INTEGER DEFAULT 15,
            sponsorship_potential REAL DEFAULT 0.3,
            sponsorship_value INTEGER DEFAULT 50000,
            estimated_monthly_revenue INTEGER DEFAULT 0,

            -- 메타
            source TEXT DEFAULT 'crawled',
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            update_count INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """,

        # 카테고리별 CPC 단가 테이블
        """
        CREATE TABLE IF NOT EXISTS category_cpc (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT UNIQUE NOT NULL,
            avg_cpc INTEGER DEFAULT 20,
            min_cpc INTEGER DEFAULT 10,
            max_cpc INTEGER DEFAULT 50,
            sponsorship_rate REAL DEFAULT 0.3,
            avg_sponsorship_value INTEGER DEFAULT 50000,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """,

        # 사용자별 키워드 관심 설정
        """
        CREATE TABLE IF NOT EXISTS user_keyword_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            blog_id TEXT NOT NULL,

            -- 관심 카테고리 (JSON array)
            categories TEXT DEFAULT '[]',

            -- 알림 설정
            daily_alert_enabled INTEGER DEFAULT 0,
            daily_alert_time TEXT DEFAULT '08:00',
            opportunity_alert_enabled INTEGER DEFAULT 0,

            -- 목표
            monthly_revenue_goal INTEGER DEFAULT 500000,
            posts_per_week_goal INTEGER DEFAULT 3,

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            UNIQUE(user_id, blog_id)
        )
        """,

        # 사용자별 키워드 매칭 캐시
        """
        CREATE TABLE IF NOT EXISTS user_keyword_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            blog_id TEXT NOT NULL,
            blog_level INTEGER NOT NULL,

            keyword_id INTEGER NOT NULL,
            keyword TEXT NOT NULL,

            win_probability INTEGER DEFAULT 0,
            opportunity_score REAL DEFAULT 0,

            cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (keyword_id) REFERENCES keyword_pool(id),
            UNIQUE(user_id, keyword_id)
        )
        """,

        # 키워드 조회 기록 (플랜 제한용)
        """
        CREATE TABLE IF NOT EXISTS keyword_view_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            keyword_id INTEGER NOT NULL,
            viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """,

        # 인덱스
        "CREATE INDEX IF NOT EXISTS idx_kp_rank1_level ON keyword_pool(rank1_blog_level)",
        "CREATE INDEX IF NOT EXISTS idx_kp_category ON keyword_pool(category)",
        "CREATE INDEX IF NOT EXISTS idx_kp_revenue ON keyword_pool(estimated_monthly_revenue DESC)",
        "CREATE INDEX IF NOT EXISTS idx_kp_search_volume ON keyword_pool(monthly_search_volume DESC)",
        "CREATE INDEX IF NOT EXISTS idx_kp_updated ON keyword_pool(last_updated DESC)",
        "CREATE INDEX IF NOT EXISTS idx_ukm_user ON user_keyword_matches(user_id, opportunity_score DESC)",
        "CREATE INDEX IF NOT EXISTS idx_kvl_user_date ON keyword_view_log(user_id, viewed_at)",
    ]

    for query in queries:
        try:
            client.execute_query(query)
        except Exception as e:
            logger.warning(f"Error creating profitable keywords table: {e}")

    # 기존 테이블에 누락된 컬럼 추가 (마이그레이션 — keyword_pool의 모든 컬럼)
    migration_columns = [
        ("keyword_pool", "category", "TEXT"),
        ("keyword_pool", "monthly_search_volume", "INTEGER DEFAULT 0"),
        ("keyword_pool", "search_trend", "REAL DEFAULT 1.0"),
        ("keyword_pool", "rank1_blog_level", "INTEGER DEFAULT 0"),
        ("keyword_pool", "rank1_blog_score", "REAL DEFAULT 0"),
        ("keyword_pool", "rank1_blog_id", "TEXT"),
        ("keyword_pool", "rank1_last_post_date", "TIMESTAMP"),
        ("keyword_pool", "rank1_inactive_hours", "INTEGER DEFAULT 0"),
        ("keyword_pool", "top10_avg_level", "REAL DEFAULT 0"),
        ("keyword_pool", "top10_min_level", "INTEGER DEFAULT 0"),
        ("keyword_pool", "competition_score", "INTEGER DEFAULT 50"),
        ("keyword_pool", "estimated_cpc", "INTEGER DEFAULT 15"),
        ("keyword_pool", "sponsorship_potential", "REAL DEFAULT 0.3"),
        ("keyword_pool", "sponsorship_value", "INTEGER DEFAULT 50000"),
        ("keyword_pool", "estimated_monthly_revenue", "INTEGER DEFAULT 0"),
        ("keyword_pool", "source", "TEXT DEFAULT 'crawled'"),
        ("keyword_pool", "last_updated", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
        ("keyword_pool", "update_count", "INTEGER DEFAULT 0"),
        ("keyword_pool", "is_active", "INTEGER DEFAULT 1"),
    ]
    for table, col, col_type in migration_columns:
        try:
            client.execute_query(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")
        except Exception:
            pass  # 이미 존재하면 무시

    # 기본 카테고리 CPC 데이터 삽입
    _insert_default_category_cpc()

    logger.info("Profitable keywords tables initialized")


def _insert_default_category_cpc():
    """기본 카테고리별 CPC 데이터 삽입"""
    client = get_sqlite_client()

    default_data = [
        ('금융', 100, 50, 200, 0.1, 100000),
        ('보험', 80, 40, 150, 0.1, 80000),
        ('병원', 70, 30, 120, 0.4, 100000),
        ('피부과', 60, 30, 100, 0.5, 80000),
        ('성형', 80, 40, 150, 0.3, 100000),
        ('뷰티', 40, 20, 70, 0.5, 50000),
        ('화장품', 35, 15, 60, 0.6, 40000),
        ('맛집', 20, 10, 35, 0.7, 35000),
        ('카페', 18, 8, 30, 0.6, 30000),
        ('여행', 30, 15, 50, 0.5, 80000),
        ('숙소', 40, 20, 70, 0.4, 100000),
        ('호텔', 50, 25, 80, 0.3, 150000),
        ('육아', 15, 8, 25, 0.5, 40000),
        ('교육', 25, 12, 45, 0.4, 50000),
        ('IT', 30, 15, 50, 0.2, 60000),
        ('가전', 35, 18, 60, 0.3, 50000),
        ('자동차', 50, 25, 100, 0.2, 80000),
        ('부동산', 60, 30, 120, 0.1, 100000),
        ('패션', 25, 12, 45, 0.5, 40000),
        ('인테리어', 35, 18, 60, 0.4, 60000),
        ('운동', 20, 10, 35, 0.4, 40000),
        ('다이어트', 30, 15, 50, 0.5, 50000),
        ('반려동물', 20, 10, 35, 0.5, 35000),
        ('기타', 15, 8, 25, 0.3, 30000),
    ]

    for cat, avg, min_c, max_c, rate, value in default_data:
        try:
            client.execute_query(
                """
                INSERT OR IGNORE INTO category_cpc
                (category, avg_cpc, min_cpc, max_cpc, sponsorship_rate, avg_sponsorship_value)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (cat, avg, min_c, max_c, rate, value)
            )
        except Exception as e:
            logger.debug(f"Category CPC insert skipped: {e}")


# ========== 키워드 풀 CRUD ==========

def add_keyword_to_pool(
    keyword: str,
    category: str,
    monthly_search_volume: int = 0,
    rank1_blog_level: int = 0,
    rank1_blog_score: float = 0,
    competition_score: int = 50,
    source: str = 'crawled'
) -> Optional[int]:
    """키워드 풀에 키워드 추가 또는 업데이트"""
    client = get_sqlite_client()

    # CPC 정보 조회
    cpc_info = get_category_cpc(category)
    estimated_cpc = cpc_info.get('avg_cpc', 15) if cpc_info else 15
    sponsorship_potential = cpc_info.get('sponsorship_rate', 0.3) if cpc_info else 0.3
    sponsorship_value = cpc_info.get('avg_sponsorship_value', 50000) if cpc_info else 50000

    # 예상 월 수익 계산
    estimated_revenue = calculate_estimated_revenue(
        monthly_search_volume, estimated_cpc, sponsorship_potential, sponsorship_value
    )

    try:
        # UPSERT
        client.execute_query(
            """
            INSERT INTO keyword_pool
            (keyword, category, monthly_search_volume, rank1_blog_level, rank1_blog_score,
             competition_score, estimated_cpc, sponsorship_potential, sponsorship_value,
             estimated_monthly_revenue, source, last_updated, update_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
            ON CONFLICT(keyword) DO UPDATE SET
                category = excluded.category,
                monthly_search_volume = excluded.monthly_search_volume,
                rank1_blog_level = excluded.rank1_blog_level,
                rank1_blog_score = excluded.rank1_blog_score,
                competition_score = excluded.competition_score,
                estimated_cpc = excluded.estimated_cpc,
                sponsorship_potential = excluded.sponsorship_potential,
                sponsorship_value = excluded.sponsorship_value,
                estimated_monthly_revenue = excluded.estimated_monthly_revenue,
                last_updated = CURRENT_TIMESTAMP,
                update_count = keyword_pool.update_count + 1
            """,
            (keyword, category, monthly_search_volume, rank1_blog_level, rank1_blog_score,
             competition_score, estimated_cpc, sponsorship_potential, sponsorship_value,
             estimated_revenue, source)
        )

        # ID 조회
        result = client.execute_query(
            "SELECT id FROM keyword_pool WHERE keyword = ?",
            (keyword,)
        )
        return result[0]['id'] if result else None

    except Exception as e:
        logger.error(f"Error adding keyword to pool: {e}")
        return None


def calculate_estimated_revenue(
    search_volume: int,
    cpc: int,
    sponsorship_rate: float,
    sponsorship_value: int
) -> int:
    """예상 월 수익 계산

    수익 = (검색량 × CTR × CPC) + (체험단확률 × 체험단가치 × 월평균건수)
    """
    # 1위 CTR = 28%
    ctr = 0.28

    # 광고 수익
    ad_revenue = search_volume * ctr * cpc

    # 체험단 수익 (월 평균 2건 기준)
    sponsorship_revenue = sponsorship_rate * sponsorship_value * 2

    return int(ad_revenue + sponsorship_revenue)


def get_category_cpc(category: str) -> Optional[Dict]:
    """카테고리별 CPC 정보 조회"""
    client = get_sqlite_client()

    result = client.execute_query(
        "SELECT * FROM category_cpc WHERE category = ?",
        (category,)
    )

    if result:
        return result[0]

    # 기본값
    return {
        'category': category,
        'avg_cpc': 15,
        'min_cpc': 8,
        'max_cpc': 25,
        'sponsorship_rate': 0.3,
        'avg_sponsorship_value': 30000
    }


def update_keyword_competition(
    keyword: str,
    rank1_blog_level: int,
    rank1_blog_score: float,
    rank1_blog_id: str = None,
    top10_avg_level: float = None,
    top10_min_level: int = None,
    competition_score: int = None
):
    """키워드 경쟁 데이터 업데이트"""
    client = get_sqlite_client()

    updates = ["rank1_blog_level = ?", "rank1_blog_score = ?", "last_updated = CURRENT_TIMESTAMP"]
    params = [rank1_blog_level, rank1_blog_score]

    if rank1_blog_id:
        updates.append("rank1_blog_id = ?")
        params.append(rank1_blog_id)

    if top10_avg_level is not None:
        updates.append("top10_avg_level = ?")
        params.append(top10_avg_level)

    if top10_min_level is not None:
        updates.append("top10_min_level = ?")
        params.append(top10_min_level)

    if competition_score is not None:
        updates.append("competition_score = ?")
        params.append(competition_score)

    params.append(keyword)

    try:
        client.execute_query(
            f"UPDATE keyword_pool SET {', '.join(updates)} WHERE keyword = ?",
            tuple(params)
        )
    except Exception as e:
        logger.error(f"Error updating keyword competition: {e}")


# ========== 수익성 키워드 조회 ==========

def get_winnable_keywords(
    blog_level: int,
    category: str = None,
    sort_by: str = 'revenue',
    min_search_volume: int = 500,
    min_win_probability: int = 70,
    limit: int = 10,
    offset: int = 0
) -> List[Dict]:
    """내 레벨로 1위 가능한 키워드 조회

    Args:
        blog_level: 내 블로그 레벨
        category: 카테고리 필터 (None이면 전체)
        sort_by: 정렬 기준 (revenue, probability, search_volume)
        min_search_volume: 최소 검색량
        min_win_probability: 최소 1위 확률
        limit: 조회 개수
        offset: 오프셋

    Returns:
        키워드 목록 (1위 확률, 예상 수익 포함)
    """
    client = get_sqlite_client()

    # 기본 조건: 내 레벨 >= 1위 레벨
    where_clauses = [
        "rank1_blog_level <= ?",
        "monthly_search_volume >= ?",
        "is_active = 1"
    ]
    params = [blog_level, min_search_volume]

    if category:
        where_clauses.append("category = ?")
        params.append(category)

    where_sql = " AND ".join(where_clauses)

    # 정렬
    order_by = {
        'revenue': 'estimated_monthly_revenue DESC',
        'probability': '(? - rank1_blog_level) DESC',
        'search_volume': 'monthly_search_volume DESC',
        'opportunity': '(estimated_monthly_revenue * (100 - competition_score) / 100) DESC'
    }.get(sort_by, 'estimated_monthly_revenue DESC')

    if sort_by == 'probability':
        params.insert(0, blog_level)  # ORDER BY 절에 사용

    query = f"""
        SELECT
            id,
            keyword,
            category,
            monthly_search_volume,
            search_trend,
            rank1_blog_level,
            rank1_blog_score,
            rank1_blog_id,
            rank1_inactive_hours,
            top10_avg_level,
            top10_min_level,
            competition_score,
            estimated_cpc,
            sponsorship_potential,
            sponsorship_value,
            estimated_monthly_revenue,
            last_updated
        FROM keyword_pool
        WHERE {where_sql}
        ORDER BY {order_by}
        LIMIT ? OFFSET ?
    """

    params.extend([limit, offset])

    try:
        results = client.execute_query(query, tuple(params))

        # 1위 확률 계산 추가
        keywords_with_probability = []
        for kw in results:
            level_gap = blog_level - kw['rank1_blog_level']
            win_probability = calculate_win_probability(
                level_gap, kw['competition_score'], kw.get('rank1_inactive_hours', 0)
            )

            if win_probability >= min_win_probability:
                kw['win_probability'] = win_probability
                kw['level_gap'] = level_gap
                kw['opportunity_score'] = kw['estimated_monthly_revenue'] * (win_probability / 100)
                keywords_with_probability.append(kw)

        return keywords_with_probability

    except Exception as e:
        logger.error(f"Error getting winnable keywords: {e}")
        return []


def calculate_win_probability(level_gap: int, competition_score: int, inactive_hours: int = 0) -> int:
    """1위 확률 계산

    Args:
        level_gap: 레벨 차이 (양수면 내가 높음)
        competition_score: 경쟁 점수 (0~100, 낮을수록 좋음)
        inactive_hours: 현재 1위 비활성 시간

    Returns:
        1위 확률 (0~100)
    """
    # 기본 확률 (레벨 기반)
    if level_gap >= 3:
        base_prob = 95
    elif level_gap >= 2:
        base_prob = 85
    elif level_gap >= 1:
        base_prob = 75
    elif level_gap >= 0:
        base_prob = 60
    elif level_gap >= -1:
        base_prob = 40
    elif level_gap >= -2:
        base_prob = 25
    else:
        base_prob = 10

    # 경쟁 점수 반영 (-20 ~ +10)
    competition_modifier = (50 - competition_score) / 5

    # 비활성 보너스 (최대 +15)
    inactive_bonus = min(15, inactive_hours / 24 * 5)

    probability = base_prob + competition_modifier + inactive_bonus

    return max(0, min(100, int(probability)))


def get_winnable_keywords_count(blog_level: int, category: str = None) -> int:
    """1위 가능한 키워드 총 개수"""
    client = get_sqlite_client()

    where_clauses = ["rank1_blog_level <= ?", "is_active = 1"]
    params = [blog_level]

    if category:
        where_clauses.append("category = ?")
        params.append(category)

    result = client.execute_query(
        f"SELECT COUNT(*) as cnt FROM keyword_pool WHERE {' AND '.join(where_clauses)}",
        tuple(params)
    )

    return result[0]['cnt'] if result else 0


def get_total_potential_revenue(blog_level: int, category: str = None) -> int:
    """전체 잠재 수익 합계"""
    client = get_sqlite_client()

    where_clauses = ["rank1_blog_level <= ?", "is_active = 1"]
    params = [blog_level]

    if category:
        where_clauses.append("category = ?")
        params.append(category)

    result = client.execute_query(
        f"SELECT SUM(estimated_monthly_revenue) as total FROM keyword_pool WHERE {' AND '.join(where_clauses)}",
        tuple(params)
    )

    return result[0]['total'] or 0 if result else 0


def get_category_summary(blog_level: int) -> List[Dict]:
    """카테고리별 1위 가능 키워드 요약"""
    client = get_sqlite_client()

    result = client.execute_query(
        """
        SELECT
            category,
            COUNT(*) as count,
            SUM(estimated_monthly_revenue) as total_revenue,
            AVG(competition_score) as avg_competition
        FROM keyword_pool
        WHERE rank1_blog_level <= ? AND is_active = 1
        GROUP BY category
        ORDER BY total_revenue DESC
        """,
        (blog_level,)
    )

    return result


# ========== 기회 감지 ==========

def get_opportunity_keywords(blog_level: int, limit: int = 10) -> List[Dict]:
    """실시간 기회 키워드 조회 (1위 비활성, 트렌드 급상승 등)"""
    client = get_sqlite_client()

    # 1위 비활성 (48시간 이상)
    inactive_keywords = client.execute_query(
        """
        SELECT *, '1위_비활성' as opportunity_type,
               rank1_inactive_hours || '시간째 비활성' as opportunity_reason
        FROM keyword_pool
        WHERE rank1_blog_level <= ?
          AND rank1_inactive_hours >= 48
          AND is_active = 1
        ORDER BY estimated_monthly_revenue DESC
        LIMIT ?
        """,
        (blog_level, limit // 2)
    )

    # 트렌드 급상승 (+50% 이상)
    trending_keywords = client.execute_query(
        """
        SELECT *, '트렌드_급상승' as opportunity_type,
               CAST((search_trend - 1) * 100 AS INTEGER) || '% 급상승' as opportunity_reason
        FROM keyword_pool
        WHERE rank1_blog_level <= ?
          AND search_trend >= 1.5
          AND is_active = 1
        ORDER BY search_trend DESC
        LIMIT ?
        """,
        (blog_level, limit // 2)
    )

    # 합치고 정렬
    all_opportunities = inactive_keywords + trending_keywords

    # 확률 계산 추가
    for kw in all_opportunities:
        level_gap = blog_level - kw['rank1_blog_level']
        kw['win_probability'] = calculate_win_probability(
            level_gap, kw['competition_score'], kw.get('rank1_inactive_hours', 0)
        )
        kw['level_gap'] = level_gap

    return sorted(all_opportunities, key=lambda x: x['estimated_monthly_revenue'], reverse=True)[:limit]


# ========== 플랜 제한 ==========

def get_user_keyword_view_count(user_id: int, period_days: int = 30) -> int:
    """사용자의 키워드 조회 수 (기간 내)"""
    client = get_sqlite_client()

    result = client.execute_query(
        """
        SELECT COUNT(DISTINCT keyword_id) as cnt
        FROM keyword_view_log
        WHERE user_id = ?
          AND viewed_at >= datetime('now', '-' || ? || ' days')
        """,
        (user_id, period_days)
    )

    return result[0]['cnt'] if result else 0


def log_keyword_view(user_id: int, keyword_id: int):
    """키워드 조회 기록"""
    client = get_sqlite_client()

    try:
        client.execute_query(
            "INSERT INTO keyword_view_log (user_id, keyword_id) VALUES (?, ?)",
            (user_id, keyword_id)
        )
    except Exception as e:
        logger.debug(f"Keyword view log error: {e}")


def get_plan_keyword_limit(plan: str) -> int:
    """플랜별 키워드 제한"""
    limits = {
        'free': 10,
        'basic': 50,
        'pro': 200,
        'business': 999999  # 무제한
    }
    return limits.get(plan, 10)


# ========== 벌크 작업 ==========

def bulk_add_keywords(keywords: List[Dict]) -> int:
    """키워드 대량 추가

    Args:
        keywords: [{'keyword': '...', 'category': '...', 'search_volume': 1000, ...}, ...]

    Returns:
        추가된 키워드 수
    """
    added = 0
    for kw in keywords:
        result = add_keyword_to_pool(
            keyword=kw.get('keyword'),
            category=kw.get('category', '기타'),
            monthly_search_volume=kw.get('search_volume', kw.get('monthly_search_volume', 0)),
            rank1_blog_level=kw.get('rank1_blog_level', 5),
            rank1_blog_score=kw.get('rank1_blog_score', 0),
            competition_score=kw.get('competition_score', 50),
            source=kw.get('source', 'bulk_import')
        )
        if result:
            added += 1

    return added


def get_keywords_needing_update(hours_old: int = 24, limit: int = 100) -> List[Dict]:
    """업데이트가 필요한 키워드 목록 (오래된 순)"""
    client = get_sqlite_client()

    result = client.execute_query(
        """
        SELECT id, keyword, category, last_updated
        FROM keyword_pool
        WHERE last_updated < datetime('now', '-' || ? || ' hours')
          AND is_active = 1
        ORDER BY monthly_search_volume DESC, last_updated ASC
        LIMIT ?
        """,
        (hours_old, limit)
    )

    return result
