"""
Marketplace Database - 블로그 상위노출 마켓플레이스

업체-블로거 매칭, 의뢰, 입찰, 계약, 검증, 정산 관리
"""
import json
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
from enum import Enum
from database.sqlite_db import get_sqlite_client

logger = logging.getLogger(__name__)


# ========== Enums ==========

class GigRequestStatus(str, Enum):
    OPEN = 'open'                    # 입찰 진행 중
    BIDDING = 'bidding'              # 입찰자 있음
    MATCHED = 'matched'              # 블로거 선택됨
    IN_PROGRESS = 'in_progress'      # 진행 중
    VERIFYING = 'verifying'          # 순위 검증 중
    COMPLETED = 'completed'          # 완료
    FAILED = 'failed'                # 실패
    CANCELLED = 'cancelled'          # 취소됨
    EXPIRED = 'expired'              # 입찰 마감


class GigBidStatus(str, Enum):
    PENDING = 'pending'              # 대기 중
    SELECTED = 'selected'            # 선택됨
    REJECTED = 'rejected'            # 거절됨
    WITHDRAWN = 'withdrawn'          # 철회됨


class ContractStatus(str, Enum):
    PENDING_PAYMENT = 'pending_payment'  # 결제 대기
    PAID = 'paid'                        # 결제 완료 (에스크로)
    WRITING = 'writing'                  # 글 작성 중
    PUBLISHED = 'published'              # 발행 완료
    VERIFYING = 'verifying'              # 순위 검증 중
    SUCCESS = 'success'                  # 성공 (정산 대기)
    FAILED = 'failed'                    # 실패
    DISPUTED = 'disputed'                # 분쟁 중
    SETTLED = 'settled'                  # 정산 완료


class SettlementStatus(str, Enum):
    PENDING = 'pending'              # 대기
    PROCESSING = 'processing'        # 처리 중
    COMPLETED = 'completed'          # 완료
    FAILED = 'failed'                # 실패


def initialize_marketplace_tables():
    """마켓플레이스 테이블 초기화"""
    client = get_sqlite_client()

    queries = [
        # 의뢰 (업체가 등록)
        """
        CREATE TABLE IF NOT EXISTS gig_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            -- 의뢰자 정보
            client_id INTEGER NOT NULL,
            client_type TEXT DEFAULT 'business',
            business_name TEXT,
            contact_email TEXT,
            contact_phone TEXT,

            -- 키워드 & 조건
            keyword TEXT NOT NULL,
            category TEXT,
            target_rank_min INTEGER DEFAULT 1,
            target_rank_max INTEGER DEFAULT 5,
            maintain_days INTEGER DEFAULT 14,

            -- 예산
            budget_min INTEGER,
            budget_max INTEGER,

            -- 기본 요구사항
            content_requirements TEXT,
            photo_count INTEGER DEFAULT 5,
            min_word_count INTEGER DEFAULT 1500,
            special_requests TEXT,

            -- 상세 가이드라인
            photo_source TEXT DEFAULT 'blogger_takes',  -- business_provided, blogger_takes, mixed
            visit_required INTEGER DEFAULT 0,           -- 방문 필수 여부
            product_provided INTEGER DEFAULT 0,         -- 제품/서비스 제공 여부

            -- 키워드 가이드
            required_keywords TEXT,    -- JSON: 필수 포함 키워드
            prohibited_keywords TEXT,  -- JSON: 금지 키워드

            -- 톤앤매너
            tone_manner TEXT DEFAULT 'friendly',  -- friendly, professional, informative, casual
            writing_style TEXT,        -- 글쓰기 스타일 상세 설명

            -- 사진 가이드
            required_shots TEXT,       -- JSON: 필수 촬영 컷 (exterior, interior, food, product, before_after, etc.)
            photo_instructions TEXT,   -- 사진 촬영 상세 지침

            -- 참고자료
            reference_urls TEXT,       -- JSON: 참고 포스트 URL
            reference_images TEXT,     -- JSON: 참고 이미지 URL
            brand_guidelines TEXT,     -- 브랜드 가이드라인

            -- 글 구성
            structure_type TEXT DEFAULT 'free',  -- free, visit_review, product_review, information
            required_sections TEXT,    -- JSON: 필수 섹션 (intro, menu_info, price_info, location, cta 등)

            -- 추가 지침
            dos_and_donts TEXT,        -- JSON: { dos: [], donts: [] }
            additional_instructions TEXT,

            -- 상태
            status TEXT DEFAULT 'open',

            -- 분석 데이터 (자동 계산)
            keyword_difficulty INTEGER,
            recommended_level INTEGER,
            current_rank1_level INTEGER,
            estimated_success_rate INTEGER,
            market_price_min INTEGER,
            market_price_max INTEGER,

            -- 통계
            view_count INTEGER DEFAULT 0,
            bid_count INTEGER DEFAULT 0,

            -- 시간
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """,

        # 입찰 (블로거가 등록)
        """
        CREATE TABLE IF NOT EXISTS gig_bids (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            request_id INTEGER NOT NULL,
            blogger_id INTEGER NOT NULL,
            blog_id TEXT NOT NULL,

            -- 입찰 내용
            bid_amount INTEGER NOT NULL,
            estimated_days INTEGER DEFAULT 7,
            message TEXT,

            -- 블로거 자격
            blog_level INTEGER,
            blog_score REAL,
            keyword_win_probability INTEGER,

            -- 포트폴리오 (JSON)
            similar_works TEXT,
            total_success_count INTEGER DEFAULT 0,
            success_rate REAL DEFAULT 0,

            -- 상태
            status TEXT DEFAULT 'pending',

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (request_id) REFERENCES gig_requests(id)
        )
        """,

        # 계약 (매칭 완료 후)
        """
        CREATE TABLE IF NOT EXISTS gig_contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            request_id INTEGER NOT NULL,
            bid_id INTEGER NOT NULL,
            client_id INTEGER NOT NULL,
            blogger_id INTEGER NOT NULL,
            blog_id TEXT NOT NULL,

            -- 계약 내용
            agreed_amount INTEGER NOT NULL,
            platform_fee INTEGER DEFAULT 0,
            blogger_payout INTEGER DEFAULT 0,

            keyword TEXT NOT NULL,
            target_rank_min INTEGER DEFAULT 1,
            target_rank_max INTEGER DEFAULT 5,
            maintain_days INTEGER DEFAULT 14,

            -- 요구사항
            content_requirements TEXT,
            photo_count INTEGER,
            min_word_count INTEGER,

            -- 상세 가이드라인 (의뢰에서 복사)
            guidelines_json TEXT,  -- 전체 가이드라인 JSON으로 저장

            -- 일정
            writing_deadline DATE,
            verification_start DATE,
            verification_end DATE,

            -- 상태
            status TEXT DEFAULT 'pending_payment',

            -- 발행 정보
            post_url TEXT,
            post_title TEXT,
            published_at TIMESTAMP,

            -- 결제 정보
            payment_id TEXT,
            paid_at TIMESTAMP,

            -- 검증 결과
            verification_result TEXT,
            final_rank_blog INTEGER,
            final_rank_view INTEGER,
            success_days INTEGER DEFAULT 0,

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (request_id) REFERENCES gig_requests(id),
            FOREIGN KEY (bid_id) REFERENCES gig_bids(id)
        )
        """,

        # 순위 검증 기록
        """
        CREATE TABLE IF NOT EXISTS gig_verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contract_id INTEGER NOT NULL,

            checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            blog_tab_rank INTEGER,
            view_tab_rank INTEGER,

            is_target_met INTEGER DEFAULT 0,
            consecutive_days INTEGER DEFAULT 0,

            raw_data TEXT,

            FOREIGN KEY (contract_id) REFERENCES gig_contracts(id)
        )
        """,

        # 정산
        """
        CREATE TABLE IF NOT EXISTS gig_settlements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contract_id INTEGER NOT NULL,
            blogger_id INTEGER NOT NULL,

            gross_amount INTEGER NOT NULL,
            platform_fee INTEGER NOT NULL,
            net_amount INTEGER NOT NULL,

            status TEXT DEFAULT 'pending',

            -- 입금 정보
            bank_name TEXT,
            account_number TEXT,
            account_holder TEXT,

            -- 처리 정보
            requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            processed_at TIMESTAMP,
            settled_at TIMESTAMP,

            transaction_id TEXT,
            notes TEXT,

            FOREIGN KEY (contract_id) REFERENCES gig_contracts(id)
        )
        """,

        # 리뷰
        """
        CREATE TABLE IF NOT EXISTS gig_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contract_id INTEGER NOT NULL,

            -- 업체 → 블로거 리뷰
            client_to_blogger_rating INTEGER,
            client_to_blogger_review TEXT,
            client_reviewed_at TIMESTAMP,

            -- 블로거 → 업체 리뷰
            blogger_to_client_rating INTEGER,
            blogger_to_client_review TEXT,
            blogger_reviewed_at TIMESTAMP,

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (contract_id) REFERENCES gig_contracts(id),
            UNIQUE(contract_id)
        )
        """,

        # 블로거 프로필 (마켓플레이스용)
        """
        CREATE TABLE IF NOT EXISTS blogger_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            blog_id TEXT NOT NULL,

            -- 프로필
            display_name TEXT,
            bio TEXT,
            profile_image TEXT,
            categories TEXT,

            -- 통계
            blog_level INTEGER DEFAULT 0,
            blog_score REAL DEFAULT 0,
            total_gigs INTEGER DEFAULT 0,
            completed_gigs INTEGER DEFAULT 0,
            success_rate REAL DEFAULT 0,
            avg_rating REAL DEFAULT 0,
            total_reviews INTEGER DEFAULT 0,
            total_earnings INTEGER DEFAULT 0,

            -- 인증
            is_verified INTEGER DEFAULT 0,
            is_pro INTEGER DEFAULT 0,
            verified_at TIMESTAMP,

            -- 설정
            is_available INTEGER DEFAULT 1,
            min_price INTEGER DEFAULT 50000,
            response_time_hours INTEGER DEFAULT 24,

            -- 계좌 정보
            bank_name TEXT,
            account_number TEXT,
            account_holder TEXT,

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """,

        # 업체 프로필
        """
        CREATE TABLE IF NOT EXISTS client_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,

            -- 프로필
            business_name TEXT,
            business_type TEXT,
            business_number TEXT,
            contact_name TEXT,
            contact_email TEXT,
            contact_phone TEXT,

            -- 통계
            total_requests INTEGER DEFAULT 0,
            completed_requests INTEGER DEFAULT 0,
            total_spent INTEGER DEFAULT 0,
            avg_rating REAL DEFAULT 0,
            total_reviews INTEGER DEFAULT 0,

            -- 인증
            is_verified INTEGER DEFAULT 0,
            verified_at TIMESTAMP,

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """,

        # 알림
        """
        CREATE TABLE IF NOT EXISTS marketplace_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,

            title TEXT NOT NULL,
            message TEXT,
            link TEXT,

            -- 관련 데이터
            request_id INTEGER,
            bid_id INTEGER,
            contract_id INTEGER,

            is_read INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """,

        # 인덱스
        "CREATE INDEX IF NOT EXISTS idx_gr_status ON gig_requests(status)",
        "CREATE INDEX IF NOT EXISTS idx_gr_client ON gig_requests(client_id)",
        "CREATE INDEX IF NOT EXISTS idx_gr_keyword ON gig_requests(keyword)",
        "CREATE INDEX IF NOT EXISTS idx_gr_expires ON gig_requests(expires_at)",

        "CREATE INDEX IF NOT EXISTS idx_gb_request ON gig_bids(request_id)",
        "CREATE INDEX IF NOT EXISTS idx_gb_blogger ON gig_bids(blogger_id)",
        "CREATE INDEX IF NOT EXISTS idx_gb_status ON gig_bids(status)",

        "CREATE INDEX IF NOT EXISTS idx_gc_client ON gig_contracts(client_id)",
        "CREATE INDEX IF NOT EXISTS idx_gc_blogger ON gig_contracts(blogger_id)",
        "CREATE INDEX IF NOT EXISTS idx_gc_status ON gig_contracts(status)",

        "CREATE INDEX IF NOT EXISTS idx_gv_contract ON gig_verifications(contract_id)",
        "CREATE INDEX IF NOT EXISTS idx_gs_blogger ON gig_settlements(blogger_id)",
        "CREATE INDEX IF NOT EXISTS idx_gs_status ON gig_settlements(status)",

        "CREATE INDEX IF NOT EXISTS idx_mn_user ON marketplace_notifications(user_id, is_read)",
    ]

    for query in queries:
        try:
            client.execute_query(query)
        except Exception as e:
            logger.warning(f"Error creating marketplace table: {e}")

    logger.info("Marketplace tables initialized")


# ========== 의뢰 (Gig Requests) ==========

def create_gig_request(
    client_id: int,
    keyword: str,
    budget_min: int,
    budget_max: int,
    target_rank_min: int = 1,
    target_rank_max: int = 5,
    maintain_days: int = 14,
    content_requirements: str = None,
    photo_count: int = 5,
    min_word_count: int = 1500,
    business_name: str = None,
    category: str = None,
    expires_hours: int = 72,
    # 상세 가이드라인
    photo_source: str = 'blogger_takes',
    visit_required: bool = False,
    product_provided: bool = False,
    required_keywords: str = None,
    prohibited_keywords: str = None,
    tone_manner: str = 'friendly',
    writing_style: str = None,
    required_shots: str = None,
    photo_instructions: str = None,
    reference_urls: str = None,
    reference_images: str = None,
    brand_guidelines: str = None,
    structure_type: str = 'free',
    required_sections: str = None,
    dos_and_donts: str = None,
    additional_instructions: str = None
) -> Optional[int]:
    """의뢰 생성"""
    client = get_sqlite_client()

    expires_at = datetime.now() + timedelta(hours=expires_hours)

    try:
        return client.insert('gig_requests', {
            'client_id': client_id,
            'keyword': keyword,
            'category': category,
            'budget_min': budget_min,
            'budget_max': budget_max,
            'target_rank_min': target_rank_min,
            'target_rank_max': target_rank_max,
            'maintain_days': maintain_days,
            'content_requirements': content_requirements,
            'photo_count': photo_count,
            'min_word_count': min_word_count,
            'business_name': business_name,
            'expires_at': expires_at.isoformat(),
            'status': GigRequestStatus.OPEN.value,
            # 상세 가이드라인
            'photo_source': photo_source,
            'visit_required': 1 if visit_required else 0,
            'product_provided': 1 if product_provided else 0,
            'required_keywords': required_keywords,
            'prohibited_keywords': prohibited_keywords,
            'tone_manner': tone_manner,
            'writing_style': writing_style,
            'required_shots': required_shots,
            'photo_instructions': photo_instructions,
            'reference_urls': reference_urls,
            'reference_images': reference_images,
            'brand_guidelines': brand_guidelines,
            'structure_type': structure_type,
            'required_sections': required_sections,
            'dos_and_donts': dos_and_donts,
            'additional_instructions': additional_instructions
        })
    except Exception as e:
        logger.error(f"Error creating gig request: {e}")
        return None


def get_gig_request(request_id: int) -> Optional[Dict]:
    """의뢰 상세 조회"""
    client = get_sqlite_client()

    result = client.execute_query(
        "SELECT * FROM gig_requests WHERE id = ?",
        (request_id,)
    )
    return result[0] if result else None


def get_open_requests(
    category: str = None,
    min_budget: int = None,
    max_level_required: int = None,
    limit: int = 20,
    offset: int = 0
) -> List[Dict]:
    """열린 의뢰 목록 조회 (블로거용)"""
    client = get_sqlite_client()

    where_clauses = [
        "r.status = 'open'",
        "r.expires_at > datetime('now')"
    ]
    params = []

    if category:
        where_clauses.append("r.category = ?")
        params.append(category)

    if min_budget:
        where_clauses.append("r.budget_max >= ?")
        params.append(min_budget)

    if max_level_required:
        where_clauses.append("(r.recommended_level IS NULL OR r.recommended_level <= ?)")
        params.append(max_level_required)

    params.extend([limit, offset])

    return client.execute_query(
        f"""
        SELECT r.*, COUNT(b.id) as bid_count
        FROM gig_requests r
        LEFT JOIN gig_bids b ON r.id = b.request_id AND b.status = 'pending'
        WHERE {' AND '.join(where_clauses)}
        GROUP BY r.id
        ORDER BY r.budget_max DESC, r.created_at DESC
        LIMIT ? OFFSET ?
        """,
        tuple(params)
    )


def get_my_requests(client_id: int, status: str = None) -> List[Dict]:
    """내 의뢰 목록 조회 (업체용)"""
    client = get_sqlite_client()

    where_clauses = ["r.client_id = ?"]
    params = [client_id]

    if status:
        where_clauses.append("r.status = ?")
        params.append(status)

    return client.execute_query(
        f"""
        SELECT r.*, COUNT(b.id) as bid_count
        FROM gig_requests r
        LEFT JOIN gig_bids b ON r.id = b.request_id AND b.status = 'pending'
        WHERE {' AND '.join(where_clauses)}
        GROUP BY r.id
        ORDER BY r.created_at DESC
        """,
        tuple(params)
    )


def update_request_status(request_id: int, status: str):
    """의뢰 상태 업데이트"""
    client = get_sqlite_client()

    client.execute_query(
        "UPDATE gig_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (status, request_id)
    )


def update_request_analysis(
    request_id: int,
    keyword_difficulty: int,
    recommended_level: int,
    current_rank1_level: int,
    estimated_success_rate: int,
    market_price_min: int,
    market_price_max: int
):
    """의뢰 분석 데이터 업데이트"""
    client = get_sqlite_client()

    client.execute_query(
        """
        UPDATE gig_requests SET
            keyword_difficulty = ?,
            recommended_level = ?,
            current_rank1_level = ?,
            estimated_success_rate = ?,
            market_price_min = ?,
            market_price_max = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (keyword_difficulty, recommended_level, current_rank1_level,
         estimated_success_rate, market_price_min, market_price_max, request_id)
    )


# ========== 입찰 (Gig Bids) ==========

def create_bid(
    request_id: int,
    blogger_id: int,
    blog_id: str,
    bid_amount: int,
    estimated_days: int = 7,
    message: str = None,
    blog_level: int = 0,
    blog_score: float = 0,
    keyword_win_probability: int = 0,
    similar_works: str = None,
    success_rate: float = 0
) -> Optional[int]:
    """입찰 생성"""
    client = get_sqlite_client()

    # 중복 입찰 체크
    existing = client.execute_query(
        "SELECT id FROM gig_bids WHERE request_id = ? AND blogger_id = ? AND status = 'pending'",
        (request_id, blogger_id)
    )

    if existing:
        logger.warning(f"Duplicate bid attempt: request={request_id}, blogger={blogger_id}")
        return None

    try:
        bid_id = client.insert('gig_bids', {
            'request_id': request_id,
            'blogger_id': blogger_id,
            'blog_id': blog_id,
            'bid_amount': bid_amount,
            'estimated_days': estimated_days,
            'message': message,
            'blog_level': blog_level,
            'blog_score': blog_score,
            'keyword_win_probability': keyword_win_probability,
            'similar_works': similar_works,
            'success_rate': success_rate,
            'status': GigBidStatus.PENDING.value
        })

        # 의뢰 상태 업데이트
        update_request_status(request_id, GigRequestStatus.BIDDING.value)

        # 의뢰자에게 알림
        request = get_gig_request(request_id)
        if request:
            create_notification(
                user_id=request['client_id'],
                type='new_bid',
                title='새로운 입찰이 도착했습니다',
                message=f"'{request['keyword']}' 의뢰에 새 입찰이 있습니다.",
                request_id=request_id,
                bid_id=bid_id
            )

        return bid_id
    except Exception as e:
        logger.error(f"Error creating bid: {e}")
        return None


def get_bids_for_request(request_id: int) -> List[Dict]:
    """의뢰에 대한 입찰 목록"""
    client = get_sqlite_client()

    return client.execute_query(
        """
        SELECT b.*, bp.display_name, bp.avg_rating, bp.total_reviews, bp.is_verified, bp.is_pro
        FROM gig_bids b
        LEFT JOIN blogger_profiles bp ON b.blogger_id = bp.user_id
        WHERE b.request_id = ? AND b.status = 'pending'
        ORDER BY b.keyword_win_probability DESC, b.bid_amount ASC
        """,
        (request_id,)
    )


def get_my_bids(blogger_id: int, status: str = None) -> List[Dict]:
    """내 입찰 목록 (블로거용)"""
    client = get_sqlite_client()

    where_clauses = ["b.blogger_id = ?"]
    params = [blogger_id]

    if status:
        where_clauses.append("b.status = ?")
        params.append(status)

    return client.execute_query(
        f"""
        SELECT b.*, r.keyword, r.budget_min, r.budget_max, r.status as request_status,
               r.business_name, r.expires_at
        FROM gig_bids b
        JOIN gig_requests r ON b.request_id = r.id
        WHERE {' AND '.join(where_clauses)}
        ORDER BY b.created_at DESC
        """,
        tuple(params)
    )


def select_bid(bid_id: int) -> Optional[int]:
    """입찰 선택 (계약 생성)"""
    client = get_sqlite_client()

    # 입찰 정보 조회
    bid = client.execute_query("SELECT * FROM gig_bids WHERE id = ?", (bid_id,))
    if not bid:
        return None
    bid = bid[0]

    # 의뢰 정보 조회
    request = get_gig_request(bid['request_id'])
    if not request:
        return None

    # 플랫폼 수수료 계산 (10%)
    platform_fee = int(bid['bid_amount'] * 0.1)
    blogger_payout = bid['bid_amount'] - platform_fee

    # 상세 가이드라인 JSON으로 묶기
    guidelines = {
        'photo_source': request.get('photo_source', 'blogger_takes'),
        'visit_required': bool(request.get('visit_required', 0)),
        'product_provided': bool(request.get('product_provided', 0)),
        'required_keywords': json.loads(request['required_keywords']) if request.get('required_keywords') else [],
        'prohibited_keywords': json.loads(request['prohibited_keywords']) if request.get('prohibited_keywords') else [],
        'tone_manner': request.get('tone_manner', 'friendly'),
        'writing_style': request.get('writing_style'),
        'required_shots': json.loads(request['required_shots']) if request.get('required_shots') else [],
        'photo_instructions': request.get('photo_instructions'),
        'reference_urls': json.loads(request['reference_urls']) if request.get('reference_urls') else [],
        'reference_images': json.loads(request['reference_images']) if request.get('reference_images') else [],
        'brand_guidelines': request.get('brand_guidelines'),
        'structure_type': request.get('structure_type', 'free'),
        'required_sections': json.loads(request['required_sections']) if request.get('required_sections') else [],
        'dos_and_donts': json.loads(request['dos_and_donts']) if request.get('dos_and_donts') else {'dos': [], 'donts': []},
        'additional_instructions': request.get('additional_instructions')
    }

    try:
        # 계약 생성
        contract_id = client.insert('gig_contracts', {
            'request_id': request['id'],
            'bid_id': bid_id,
            'client_id': request['client_id'],
            'blogger_id': bid['blogger_id'],
            'blog_id': bid['blog_id'],
            'agreed_amount': bid['bid_amount'],
            'platform_fee': platform_fee,
            'blogger_payout': blogger_payout,
            'keyword': request['keyword'],
            'target_rank_min': request['target_rank_min'],
            'target_rank_max': request['target_rank_max'],
            'maintain_days': request['maintain_days'],
            'content_requirements': request['content_requirements'],
            'photo_count': request['photo_count'],
            'min_word_count': request['min_word_count'],
            'guidelines_json': json.dumps(guidelines, ensure_ascii=False),
            'status': ContractStatus.PENDING_PAYMENT.value
        })

        # 입찰 상태 업데이트
        client.execute_query(
            "UPDATE gig_bids SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (GigBidStatus.SELECTED.value, bid_id)
        )

        # 다른 입찰 거절 처리
        client.execute_query(
            """
            UPDATE gig_bids SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE request_id = ? AND id != ? AND status = 'pending'
            """,
            (GigBidStatus.REJECTED.value, request['id'], bid_id)
        )

        # 의뢰 상태 업데이트
        update_request_status(request['id'], GigRequestStatus.MATCHED.value)

        # 블로거에게 알림
        create_notification(
            user_id=bid['blogger_id'],
            type='bid_selected',
            title='입찰이 선택되었습니다!',
            message=f"'{request['keyword']}' 의뢰에 선택되었습니다. 결제 완료 후 작업을 시작해주세요.",
            request_id=request['id'],
            bid_id=bid_id,
            contract_id=contract_id
        )

        return contract_id

    except Exception as e:
        logger.error(f"Error selecting bid: {e}")
        return None


# ========== 계약 (Contracts) ==========

def get_contract(contract_id: int) -> Optional[Dict]:
    """계약 상세 조회"""
    client = get_sqlite_client()

    result = client.execute_query(
        "SELECT * FROM gig_contracts WHERE id = ?",
        (contract_id,)
    )
    return result[0] if result else None


def get_my_contracts(user_id: int, role: str = 'blogger', status: str = None) -> List[Dict]:
    """내 계약 목록

    Args:
        user_id: 사용자 ID
        role: 'blogger' 또는 'client'
        status: 필터링할 상태
    """
    client = get_sqlite_client()

    id_field = 'blogger_id' if role == 'blogger' else 'client_id'
    where_clauses = [f"{id_field} = ?"]
    params = [user_id]

    if status:
        where_clauses.append("status = ?")
        params.append(status)

    return client.execute_query(
        f"""
        SELECT c.*,
               r.business_name, r.budget_min, r.budget_max,
               bp.display_name as blogger_name, bp.blog_level
        FROM gig_contracts c
        JOIN gig_requests r ON c.request_id = r.id
        LEFT JOIN blogger_profiles bp ON c.blogger_id = bp.user_id
        WHERE {' AND '.join(where_clauses)}
        ORDER BY c.created_at DESC
        """,
        tuple(params)
    )


def update_contract_status(contract_id: int, status: str, **kwargs):
    """계약 상태 업데이트"""
    client = get_sqlite_client()

    updates = ["status = ?", "updated_at = CURRENT_TIMESTAMP"]
    params = [status]

    for key, value in kwargs.items():
        updates.append(f"{key} = ?")
        params.append(value)

    params.append(contract_id)

    client.execute_query(
        f"UPDATE gig_contracts SET {', '.join(updates)} WHERE id = ?",
        tuple(params)
    )


def update_contract_payment(contract_id: int, payment_id: str):
    """결제 정보 업데이트"""
    update_contract_status(
        contract_id,
        ContractStatus.PAID.value,
        payment_id=payment_id,
        paid_at=datetime.now().isoformat()
    )

    # 의뢰 상태 업데이트
    contract = get_contract(contract_id)
    if contract:
        update_request_status(contract['request_id'], GigRequestStatus.IN_PROGRESS.value)


def update_contract_published(contract_id: int, post_url: str, post_title: str = None):
    """글 발행 정보 업데이트"""
    update_contract_status(
        contract_id,
        ContractStatus.PUBLISHED.value,
        post_url=post_url,
        post_title=post_title,
        published_at=datetime.now().isoformat()
    )


def start_verification(contract_id: int):
    """순위 검증 시작"""
    contract = get_contract(contract_id)
    if not contract:
        return

    verification_end = datetime.now() + timedelta(days=contract['maintain_days'])

    update_contract_status(
        contract_id,
        ContractStatus.VERIFYING.value,
        verification_start=datetime.now().date().isoformat(),
        verification_end=verification_end.date().isoformat()
    )

    # 의뢰 상태 업데이트
    update_request_status(contract['request_id'], GigRequestStatus.VERIFYING.value)


# ========== 순위 검증 ==========

def add_verification_record(
    contract_id: int,
    blog_tab_rank: int,
    view_tab_rank: int,
    is_target_met: bool,
    consecutive_days: int
):
    """검증 기록 추가"""
    client = get_sqlite_client()

    client.insert('gig_verifications', {
        'contract_id': contract_id,
        'blog_tab_rank': blog_tab_rank,
        'view_tab_rank': view_tab_rank,
        'is_target_met': 1 if is_target_met else 0,
        'consecutive_days': consecutive_days
    })

    # 계약의 성공 일수 업데이트
    if is_target_met:
        client.execute_query(
            "UPDATE gig_contracts SET success_days = ? WHERE id = ?",
            (consecutive_days, contract_id)
        )


def get_verification_history(contract_id: int) -> List[Dict]:
    """검증 기록 조회"""
    client = get_sqlite_client()

    return client.execute_query(
        "SELECT * FROM gig_verifications WHERE contract_id = ? ORDER BY checked_at DESC",
        (contract_id,)
    )


def check_verification_complete(contract_id: int) -> Dict:
    """검증 완료 여부 확인"""
    contract = get_contract(contract_id)
    if not contract:
        return {'complete': False, 'success': False}

    # 최신 검증 기록
    client = get_sqlite_client()
    latest = client.execute_query(
        """
        SELECT * FROM gig_verifications
        WHERE contract_id = ?
        ORDER BY checked_at DESC LIMIT 1
        """,
        (contract_id,)
    )

    if not latest:
        return {'complete': False, 'success': False}

    latest = latest[0]

    # 목표 달성 기간 확인
    if latest['consecutive_days'] >= contract['maintain_days']:
        return {'complete': True, 'success': True, 'days': latest['consecutive_days']}

    # 검증 기간 종료 확인
    if contract['verification_end']:
        end_date = datetime.fromisoformat(contract['verification_end'])
        if datetime.now() > end_date:
            success = latest['consecutive_days'] >= contract['maintain_days']
            return {'complete': True, 'success': success, 'days': latest['consecutive_days']}

    return {'complete': False, 'success': False, 'days': latest['consecutive_days']}


# ========== 정산 ==========

def create_settlement(contract_id: int) -> Optional[int]:
    """정산 생성"""
    contract = get_contract(contract_id)
    if not contract:
        return None

    # 블로거 계좌 정보 조회
    client = get_sqlite_client()
    profile = client.execute_query(
        "SELECT bank_name, account_number, account_holder FROM blogger_profiles WHERE user_id = ?",
        (contract['blogger_id'],)
    )

    bank_info = profile[0] if profile else {}

    try:
        return client.insert('gig_settlements', {
            'contract_id': contract_id,
            'blogger_id': contract['blogger_id'],
            'gross_amount': contract['agreed_amount'],
            'platform_fee': contract['platform_fee'],
            'net_amount': contract['blogger_payout'],
            'bank_name': bank_info.get('bank_name'),
            'account_number': bank_info.get('account_number'),
            'account_holder': bank_info.get('account_holder'),
            'status': SettlementStatus.PENDING.value
        })
    except Exception as e:
        logger.error(f"Error creating settlement: {e}")
        return None


def get_pending_settlements(blogger_id: int = None) -> List[Dict]:
    """대기 중인 정산 목록"""
    client = get_sqlite_client()

    where_clauses = ["s.status = 'pending'"]
    params = []

    if blogger_id:
        where_clauses.append("s.blogger_id = ?")
        params.append(blogger_id)

    return client.execute_query(
        f"""
        SELECT s.*, c.keyword, c.agreed_amount, c.post_url
        FROM gig_settlements s
        JOIN gig_contracts c ON s.contract_id = c.id
        WHERE {' AND '.join(where_clauses)}
        ORDER BY s.requested_at ASC
        """,
        tuple(params)
    )


def process_settlement(settlement_id: int, transaction_id: str = None):
    """정산 처리 완료"""
    client = get_sqlite_client()

    client.execute_query(
        """
        UPDATE gig_settlements SET
            status = ?,
            processed_at = CURRENT_TIMESTAMP,
            settled_at = CURRENT_TIMESTAMP,
            transaction_id = ?
        WHERE id = ?
        """,
        (SettlementStatus.COMPLETED.value, transaction_id, settlement_id)
    )

    # 정산 정보 조회
    settlement = client.execute_query(
        "SELECT * FROM gig_settlements WHERE id = ?",
        (settlement_id,)
    )

    if settlement:
        settlement = settlement[0]

        # 계약 상태 업데이트
        update_contract_status(settlement['contract_id'], ContractStatus.SETTLED.value)

        # 의뢰 상태 업데이트
        contract = get_contract(settlement['contract_id'])
        if contract:
            update_request_status(contract['request_id'], GigRequestStatus.COMPLETED.value)

        # 블로거 프로필 통계 업데이트
        update_blogger_stats(settlement['blogger_id'])


# ========== 리뷰 ==========

def create_review(
    contract_id: int,
    reviewer_role: str,
    rating: int,
    review: str
):
    """리뷰 작성

    Args:
        contract_id: 계약 ID
        reviewer_role: 'client' 또는 'blogger'
        rating: 1~5
        review: 리뷰 내용
    """
    client = get_sqlite_client()

    # 기존 리뷰 확인
    existing = client.execute_query(
        "SELECT id FROM gig_reviews WHERE contract_id = ?",
        (contract_id,)
    )

    if reviewer_role == 'client':
        rating_field = 'client_to_blogger_rating'
        review_field = 'client_to_blogger_review'
        reviewed_field = 'client_reviewed_at'
    else:
        rating_field = 'blogger_to_client_rating'
        review_field = 'blogger_to_client_review'
        reviewed_field = 'blogger_reviewed_at'

    if existing:
        client.execute_query(
            f"""
            UPDATE gig_reviews SET
                {rating_field} = ?,
                {review_field} = ?,
                {reviewed_field} = CURRENT_TIMESTAMP
            WHERE contract_id = ?
            """,
            (rating, review, contract_id)
        )
    else:
        client.insert('gig_reviews', {
            'contract_id': contract_id,
            rating_field: rating,
            review_field: review,
            reviewed_field: datetime.now().isoformat()
        })

    # 프로필 통계 업데이트
    contract = get_contract(contract_id)
    if contract:
        if reviewer_role == 'client':
            update_blogger_stats(contract['blogger_id'])
        else:
            update_client_stats(contract['client_id'])


# ========== 프로필 ==========

def get_blogger_profile(user_id: int) -> Optional[Dict]:
    """블로거 프로필 조회"""
    client = get_sqlite_client()

    result = client.execute_query(
        "SELECT * FROM blogger_profiles WHERE user_id = ?",
        (user_id,)
    )
    return result[0] if result else None


def upsert_blogger_profile(user_id: int, blog_id: str, **kwargs) -> int:
    """블로거 프로필 생성/업데이트"""
    client = get_sqlite_client()

    existing = get_blogger_profile(user_id)

    if existing:
        updates = ["updated_at = CURRENT_TIMESTAMP"]
        params = []

        for key, value in kwargs.items():
            updates.append(f"{key} = ?")
            params.append(value)

        params.append(user_id)

        client.execute_query(
            f"UPDATE blogger_profiles SET {', '.join(updates)} WHERE user_id = ?",
            tuple(params)
        )
        return existing['id']
    else:
        data = {
            'user_id': user_id,
            'blog_id': blog_id,
            **kwargs
        }
        return client.insert('blogger_profiles', data)


def update_blogger_stats(blogger_id: int):
    """블로거 통계 업데이트"""
    client = get_sqlite_client()

    # 완료된 계약 통계
    stats = client.execute_query(
        """
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'settled' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'settled' THEN blogger_payout ELSE 0 END) as earnings
        FROM gig_contracts
        WHERE blogger_id = ?
        """,
        (blogger_id,)
    )

    # 리뷰 통계
    reviews = client.execute_query(
        """
        SELECT
            AVG(client_to_blogger_rating) as avg_rating,
            COUNT(client_to_blogger_rating) as total_reviews
        FROM gig_reviews r
        JOIN gig_contracts c ON r.contract_id = c.id
        WHERE c.blogger_id = ? AND client_to_blogger_rating IS NOT NULL
        """,
        (blogger_id,)
    )

    if stats:
        stats = stats[0]
        reviews = reviews[0] if reviews else {}

        success_rate = (stats['completed'] / stats['total'] * 100) if stats['total'] > 0 else 0

        client.execute_query(
            """
            UPDATE blogger_profiles SET
                total_gigs = ?,
                completed_gigs = ?,
                success_rate = ?,
                total_earnings = ?,
                avg_rating = ?,
                total_reviews = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            """,
            (
                stats['total'],
                stats['completed'],
                success_rate,
                stats['earnings'] or 0,
                reviews.get('avg_rating') or 0,
                reviews.get('total_reviews') or 0,
                blogger_id
            )
        )


def update_client_stats(client_id: int):
    """업체 통계 업데이트"""
    client = get_sqlite_client()

    # 완료된 의뢰 통계
    stats = client.execute_query(
        """
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'completed' THEN agreed_amount ELSE 0 END) as spent
        FROM gig_contracts
        WHERE client_id = ?
        """,
        (client_id,)
    )

    # 리뷰 통계
    reviews = client.execute_query(
        """
        SELECT
            AVG(blogger_to_client_rating) as avg_rating,
            COUNT(blogger_to_client_rating) as total_reviews
        FROM gig_reviews r
        JOIN gig_contracts c ON r.contract_id = c.id
        WHERE c.client_id = ? AND blogger_to_client_rating IS NOT NULL
        """,
        (client_id,)
    )

    if stats:
        stats = stats[0]
        reviews = reviews[0] if reviews else {}

        client.execute_query(
            """
            UPDATE client_profiles SET
                total_requests = ?,
                completed_requests = ?,
                total_spent = ?,
                avg_rating = ?,
                total_reviews = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            """,
            (
                stats['total'],
                stats['completed'],
                stats['spent'] or 0,
                reviews.get('avg_rating') or 0,
                reviews.get('total_reviews') or 0,
                client_id
            )
        )


# ========== 알림 ==========

def create_notification(
    user_id: int,
    type: str,
    title: str,
    message: str = None,
    link: str = None,
    request_id: int = None,
    bid_id: int = None,
    contract_id: int = None
):
    """알림 생성"""
    client = get_sqlite_client()

    try:
        client.insert('marketplace_notifications', {
            'user_id': user_id,
            'type': type,
            'title': title,
            'message': message,
            'link': link,
            'request_id': request_id,
            'bid_id': bid_id,
            'contract_id': contract_id
        })
    except Exception as e:
        logger.error(f"Error creating notification: {e}")


def get_notifications(user_id: int, unread_only: bool = False, limit: int = 20) -> List[Dict]:
    """알림 목록 조회"""
    client = get_sqlite_client()

    where_clauses = ["user_id = ?"]
    params = [user_id]

    if unread_only:
        where_clauses.append("is_read = 0")

    params.append(limit)

    return client.execute_query(
        f"""
        SELECT * FROM marketplace_notifications
        WHERE {' AND '.join(where_clauses)}
        ORDER BY created_at DESC
        LIMIT ?
        """,
        tuple(params)
    )


def mark_notifications_read(user_id: int, notification_ids: List[int] = None):
    """알림 읽음 처리"""
    client = get_sqlite_client()

    if notification_ids:
        placeholders = ','.join(['?' for _ in notification_ids])
        client.execute_query(
            f"UPDATE marketplace_notifications SET is_read = 1 WHERE user_id = ? AND id IN ({placeholders})",
            (user_id, *notification_ids)
        )
    else:
        client.execute_query(
            "UPDATE marketplace_notifications SET is_read = 1 WHERE user_id = ?",
            (user_id,)
        )
