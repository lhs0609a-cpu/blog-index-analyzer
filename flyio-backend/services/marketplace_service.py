"""
Marketplace Service - 블로그 상위노출 마켓플레이스 서비스

업체-블로거 매칭, 의뢰, 입찰, 계약, 검증, 정산 관리
"""
import logging
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, field

from database.marketplace_db import (
    initialize_marketplace_tables,
    # 의뢰
    create_gig_request,
    get_gig_request,
    get_open_requests,
    get_my_requests,
    update_request_status,
    update_request_analysis,
    # 입찰
    create_bid,
    get_bids_for_request,
    get_my_bids,
    select_bid,
    # 계약
    get_contract,
    get_my_contracts,
    update_contract_status,
    update_contract_payment,
    update_contract_published,
    start_verification,
    # 검증
    add_verification_record,
    get_verification_history,
    check_verification_complete,
    # 정산
    create_settlement,
    get_pending_settlements,
    process_settlement,
    # 리뷰
    create_review,
    # 프로필
    get_blogger_profile,
    upsert_blogger_profile,
    # 알림
    create_notification,
    get_notifications,
    mark_notifications_read,
    # Enum
    GigRequestStatus,
    GigBidStatus,
    ContractStatus,
    SettlementStatus
)

logger = logging.getLogger(__name__)


# ========== Data Classes ==========

@dataclass
class GigRequestData:
    """의뢰 데이터"""
    id: int
    client_id: int
    keyword: str
    category: Optional[str]
    budget_min: int
    budget_max: int
    target_rank_min: int
    target_rank_max: int
    maintain_days: int
    content_requirements: Optional[str]
    photo_count: int
    min_word_count: int
    business_name: Optional[str]
    status: str
    bid_count: int
    expires_at: Optional[str]
    created_at: str

    # 분석 데이터
    keyword_difficulty: Optional[int] = None
    recommended_level: Optional[int] = None
    current_rank1_level: Optional[int] = None
    estimated_success_rate: Optional[int] = None
    market_price_min: Optional[int] = None
    market_price_max: Optional[int] = None


@dataclass
class GigBidData:
    """입찰 데이터"""
    id: int
    request_id: int
    blogger_id: int
    blog_id: str
    bid_amount: int
    estimated_days: int
    message: Optional[str]
    blog_level: int
    blog_score: float
    keyword_win_probability: int
    success_rate: float
    status: str
    created_at: str

    # 블로거 프로필
    display_name: Optional[str] = None
    avg_rating: Optional[float] = None
    total_reviews: Optional[int] = None
    is_verified: bool = False
    is_pro: bool = False


@dataclass
class ContractData:
    """계약 데이터"""
    id: int
    request_id: int
    bid_id: int
    client_id: int
    blogger_id: int
    blog_id: str
    keyword: str
    agreed_amount: int
    platform_fee: int
    blogger_payout: int
    target_rank_min: int
    target_rank_max: int
    maintain_days: int
    status: str
    post_url: Optional[str]
    post_title: Optional[str]
    published_at: Optional[str]
    success_days: int
    created_at: str


class MarketplaceService:
    """마켓플레이스 서비스"""

    def __init__(self):
        initialize_marketplace_tables()

    # ========== 의뢰 관리 ==========

    async def create_request(
        self,
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

        # 의뢰 생성
        request_id = create_gig_request(
            client_id=client_id,
            keyword=keyword,
            budget_min=budget_min,
            budget_max=budget_max,
            target_rank_min=target_rank_min,
            target_rank_max=target_rank_max,
            maintain_days=maintain_days,
            content_requirements=content_requirements,
            photo_count=photo_count,
            min_word_count=min_word_count,
            business_name=business_name,
            category=category,
            expires_hours=expires_hours,
            # 상세 가이드라인
            photo_source=photo_source,
            visit_required=visit_required,
            product_provided=product_provided,
            required_keywords=required_keywords,
            prohibited_keywords=prohibited_keywords,
            tone_manner=tone_manner,
            writing_style=writing_style,
            required_shots=required_shots,
            photo_instructions=photo_instructions,
            reference_urls=reference_urls,
            reference_images=reference_images,
            brand_guidelines=brand_guidelines,
            structure_type=structure_type,
            required_sections=required_sections,
            dos_and_donts=dos_and_donts,
            additional_instructions=additional_instructions
        )

        if request_id:
            # 키워드 분석 (비동기로 처리)
            await self._analyze_request_keyword(request_id, keyword)

        return request_id

    async def _analyze_request_keyword(self, request_id: int, keyword: str):
        """의뢰 키워드 분석"""
        try:
            # 키워드 분석 (실제로는 블루오션 서비스 등 활용)
            # 여기서는 간단히 추정값 사용
            from services.blue_ocean_service import get_blue_ocean_service

            service = get_blue_ocean_service()

            # 분석 결과로 업데이트
            # 실제 구현에서는 키워드 검색 결과를 사용
            update_request_analysis(
                request_id=request_id,
                keyword_difficulty=50,  # 추정값
                recommended_level=7,     # 추정값
                current_rank1_level=6,   # 추정값
                estimated_success_rate=75,
                market_price_min=80000,
                market_price_max=150000
            )

        except Exception as e:
            logger.warning(f"Keyword analysis failed: {e}")

    async def get_request(self, request_id: int) -> Optional[Dict]:
        """의뢰 상세 조회"""
        return get_gig_request(request_id)

    async def get_open_requests_for_blogger(
        self,
        blogger_level: int,
        category: str = None,
        min_budget: int = None,
        limit: int = 20,
        offset: int = 0
    ) -> List[Dict]:
        """블로거용 열린 의뢰 목록"""
        requests = get_open_requests(
            category=category,
            min_budget=min_budget,
            max_level_required=blogger_level + 2,  # 레벨 +2까지 도전 가능
            limit=limit,
            offset=offset
        )

        # 각 의뢰에 대해 블로거의 1위 확률 계산
        for req in requests:
            req['my_win_probability'] = self._calculate_win_probability(
                blogger_level,
                req.get('current_rank1_level', 5)
            )

        return requests

    async def get_my_requests(self, client_id: int, status: str = None) -> List[Dict]:
        """업체용 내 의뢰 목록"""
        return get_my_requests(client_id, status)

    def _calculate_win_probability(self, my_level: int, rank1_level: int) -> int:
        """1위 확률 계산"""
        level_gap = my_level - rank1_level

        if level_gap >= 3:
            return 95
        elif level_gap >= 2:
            return 85
        elif level_gap >= 1:
            return 75
        elif level_gap >= 0:
            return 60
        elif level_gap >= -1:
            return 40
        elif level_gap >= -2:
            return 25
        else:
            return 10

    # ========== 입찰 관리 ==========

    async def create_bid(
        self,
        request_id: int,
        blogger_id: int,
        blog_id: str,
        bid_amount: int,
        estimated_days: int = 7,
        message: str = None
    ) -> Optional[int]:
        """입찰 생성"""

        # 블로거 정보 조회
        from services.blog_analyzer import analyze_blog
        blog_data = await analyze_blog(blog_id)

        if not blog_data:
            logger.error(f"Blog not found: {blog_id}")
            return None

        blog_level = blog_data.get('level', 5)
        blog_score = blog_data.get('score', 0)

        # 의뢰 정보 조회
        request = await self.get_request(request_id)
        if not request:
            return None

        # 1위 확률 계산
        win_probability = self._calculate_win_probability(
            blog_level,
            request.get('current_rank1_level', 5)
        )

        # 블로거 프로필에서 성공률 조회
        profile = get_blogger_profile(blogger_id)
        success_rate = profile.get('success_rate', 0) if profile else 0

        return create_bid(
            request_id=request_id,
            blogger_id=blogger_id,
            blog_id=blog_id,
            bid_amount=bid_amount,
            estimated_days=estimated_days,
            message=message,
            blog_level=blog_level,
            blog_score=blog_score,
            keyword_win_probability=win_probability,
            success_rate=success_rate
        )

    async def get_bids_for_request(self, request_id: int) -> List[Dict]:
        """의뢰에 대한 입찰 목록"""
        return get_bids_for_request(request_id)

    async def get_my_bids(self, blogger_id: int, status: str = None) -> List[Dict]:
        """블로거용 내 입찰 목록"""
        return get_my_bids(blogger_id, status)

    async def select_bid(self, bid_id: int, client_id: int) -> Optional[int]:
        """입찰 선택 (계약 생성)"""
        from database.marketplace_db import get_sqlite_client

        # 입찰 정보 조회
        db_client = get_sqlite_client()
        bid = db_client.execute_query("SELECT * FROM gig_bids WHERE id = ?", (bid_id,))
        if not bid:
            logger.error(f"Bid not found: {bid_id}")
            return None
        bid = bid[0]

        # 의뢰 정보 조회 및 권한 확인
        request = await self.get_request(bid['request_id'])
        if not request:
            logger.error(f"Request not found for bid: {bid_id}")
            return None

        if request['client_id'] != client_id:
            logger.error(f"Unauthorized bid selection: client {client_id} tried to select bid {bid_id}")
            return None

        contract_id = select_bid(bid_id)

        if contract_id:
            logger.info(f"Contract created: {contract_id} from bid {bid_id}")

        return contract_id

    # ========== 계약 관리 ==========

    async def get_contract(self, contract_id: int) -> Optional[Dict]:
        """계약 상세 조회"""
        return get_contract(contract_id)

    async def get_my_contracts(
        self,
        user_id: int,
        role: str = 'blogger',
        status: str = None
    ) -> List[Dict]:
        """내 계약 목록"""
        return get_my_contracts(user_id, role, status)

    async def process_payment(self, contract_id: int, payment_id: str) -> bool:
        """결제 처리 (에스크로)"""
        try:
            update_contract_payment(contract_id, payment_id)
            return True
        except Exception as e:
            logger.error(f"Payment processing failed: {e}")
            return False

    async def submit_post(
        self,
        contract_id: int,
        blogger_id: int,
        post_url: str,
        post_title: str = None
    ) -> bool:
        """글 발행 제출"""
        contract = await self.get_contract(contract_id)

        if not contract:
            return False

        if contract['blogger_id'] != blogger_id:
            logger.error(f"Unauthorized post submission: contract {contract_id}")
            return False

        # 계약 상태 검증: 결제 완료 상태에서만 글 제출 가능
        if contract['status'] != ContractStatus.PAID.value:
            logger.error(f"Invalid contract status for post submission: {contract['status']}")
            return False

        try:
            update_contract_published(contract_id, post_url, post_title)

            # 업체에게 알림
            create_notification(
                user_id=contract['client_id'],
                type='post_submitted',
                title='글이 발행되었습니다',
                message=f"'{contract['keyword']}' 의뢰의 글이 발행되었습니다. 확인해주세요.",
                contract_id=contract_id
            )

            return True
        except Exception as e:
            logger.error(f"Post submission failed: {e}")
            return False

    async def start_verification(self, contract_id: int, client_id: int) -> bool:
        """순위 검증 시작 (업체가 글 확인 후)"""
        contract = await self.get_contract(contract_id)

        if not contract:
            return False

        if contract['client_id'] != client_id:
            return False

        # 계약 상태 검증: 발행 완료 상태에서만 검증 시작 가능
        if contract['status'] != ContractStatus.PUBLISHED.value:
            logger.error(f"Invalid contract status for verification: {contract['status']}")
            return False

        try:
            start_verification(contract_id)

            # 블로거에게 알림
            create_notification(
                user_id=contract['blogger_id'],
                type='verification_started',
                title='순위 검증이 시작되었습니다',
                message=f"'{contract['keyword']}' 의뢰의 순위 검증이 시작되었습니다.",
                contract_id=contract_id
            )

            return True
        except Exception as e:
            logger.error(f"Verification start failed: {e}")
            return False

    # ========== 순위 검증 ==========

    async def check_and_record_rank(self, contract_id: int) -> Dict:
        """순위 체크 및 기록 (스케줄러에서 호출)"""
        contract = await self.get_contract(contract_id)

        if not contract or contract['status'] != ContractStatus.VERIFYING.value:
            return {'checked': False, 'reason': 'Invalid contract status'}

        try:
            # 실제 순위 조회 (rank_tracker 서비스 활용)
            from services.rank_tracker_service import check_blog_rank

            blog_rank = await check_blog_rank(
                keyword=contract['keyword'],
                blog_id=contract['blog_id']
            )

            blog_tab_rank = blog_rank.get('blog_tab_rank', 999)
            view_tab_rank = blog_rank.get('view_tab_rank', 999)

            # 목표 달성 여부
            is_target_met = (
                blog_tab_rank <= contract['target_rank_max'] or
                view_tab_rank <= contract['target_rank_max']
            )

            # 연속 달성 일수 계산
            history = get_verification_history(contract_id)
            if history and history[0]['is_target_met'] and is_target_met:
                consecutive_days = history[0]['consecutive_days'] + 1
            elif is_target_met:
                consecutive_days = 1
            else:
                consecutive_days = 0

            # 기록 추가
            add_verification_record(
                contract_id=contract_id,
                blog_tab_rank=blog_tab_rank,
                view_tab_rank=view_tab_rank,
                is_target_met=is_target_met,
                consecutive_days=consecutive_days
            )

            # 완료 여부 확인
            completion = check_verification_complete(contract_id)

            if completion['complete']:
                await self._handle_verification_complete(
                    contract_id,
                    completion['success']
                )

            return {
                'checked': True,
                'blog_tab_rank': blog_tab_rank,
                'view_tab_rank': view_tab_rank,
                'is_target_met': is_target_met,
                'consecutive_days': consecutive_days,
                'complete': completion['complete'],
                'success': completion.get('success', False)
            }

        except Exception as e:
            logger.error(f"Rank check failed: {e}")
            return {'checked': False, 'reason': str(e)}

    async def _handle_verification_complete(self, contract_id: int, success: bool):
        """검증 완료 처리"""
        contract = await self.get_contract(contract_id)

        if not contract:
            return

        if success:
            # 성공: 정산 생성
            update_contract_status(contract_id, ContractStatus.SUCCESS.value)
            settlement_id = create_settlement(contract_id)

            # 양측에 알림
            create_notification(
                user_id=contract['blogger_id'],
                type='verification_success',
                title='🎉 상위노출 성공!',
                message=f"'{contract['keyword']}' 의뢰가 성공적으로 완료되었습니다. 정산이 진행됩니다.",
                contract_id=contract_id
            )

            create_notification(
                user_id=contract['client_id'],
                type='verification_success',
                title='상위노출 달성',
                message=f"'{contract['keyword']}' 의뢰가 성공적으로 완료되었습니다.",
                contract_id=contract_id
            )

        else:
            # 실패: 환불 처리 필요
            update_contract_status(contract_id, ContractStatus.FAILED.value)

            # 양측에 알림
            create_notification(
                user_id=contract['blogger_id'],
                type='verification_failed',
                title='상위노출 미달성',
                message=f"'{contract['keyword']}' 의뢰가 목표 순위에 도달하지 못했습니다.",
                contract_id=contract_id
            )

            create_notification(
                user_id=contract['client_id'],
                type='verification_failed',
                title='상위노출 미달성',
                message=f"'{contract['keyword']}' 의뢰가 목표에 도달하지 못했습니다. 환불이 진행됩니다.",
                contract_id=contract_id
            )

    # ========== 정산 ==========

    async def get_pending_settlements(self, blogger_id: int = None) -> List[Dict]:
        """대기 중인 정산 목록"""
        return get_pending_settlements(blogger_id)

    async def process_settlement(
        self,
        settlement_id: int,
        transaction_id: str = None
    ) -> bool:
        """정산 처리"""
        try:
            process_settlement(settlement_id, transaction_id)
            return True
        except Exception as e:
            logger.error(f"Settlement processing failed: {e}")
            return False

    # ========== 리뷰 ==========

    async def create_review(
        self,
        contract_id: int,
        reviewer_id: int,
        reviewer_role: str,
        rating: int,
        review: str
    ) -> bool:
        """리뷰 작성"""
        contract = await self.get_contract(contract_id)

        if not contract:
            return False

        # 권한 확인
        if reviewer_role == 'client' and contract['client_id'] != reviewer_id:
            return False
        if reviewer_role == 'blogger' and contract['blogger_id'] != reviewer_id:
            return False

        try:
            create_review(contract_id, reviewer_role, rating, review)
            return True
        except Exception as e:
            logger.error(f"Review creation failed: {e}")
            return False

    # ========== 프로필 ==========

    async def get_blogger_profile(self, user_id: int) -> Optional[Dict]:
        """블로거 프로필 조회"""
        return get_blogger_profile(user_id)

    async def update_blogger_profile(
        self,
        user_id: int,
        blog_id: str,
        **kwargs
    ) -> int:
        """블로거 프로필 업데이트"""
        return upsert_blogger_profile(user_id, blog_id, **kwargs)

    # ========== 알림 ==========

    async def get_notifications(
        self,
        user_id: int,
        unread_only: bool = False,
        limit: int = 20
    ) -> List[Dict]:
        """알림 목록"""
        return get_notifications(user_id, unread_only, limit)

    async def mark_notifications_read(
        self,
        user_id: int,
        notification_ids: List[int] = None
    ):
        """알림 읽음 처리"""
        mark_notifications_read(user_id, notification_ids)

    # ========== 통계 ==========

    async def get_marketplace_stats(self) -> Dict:
        """마켓플레이스 통계"""
        from database.sqlite_db import get_sqlite_client
        client = get_sqlite_client()

        # 전체 통계
        total_requests = client.execute_query(
            "SELECT COUNT(*) as cnt FROM gig_requests"
        )[0]['cnt']

        open_requests = client.execute_query(
            "SELECT COUNT(*) as cnt FROM gig_requests WHERE status = 'open'"
        )[0]['cnt']

        total_contracts = client.execute_query(
            "SELECT COUNT(*) as cnt FROM gig_contracts"
        )[0]['cnt']

        completed_contracts = client.execute_query(
            "SELECT COUNT(*) as cnt FROM gig_contracts WHERE status = 'settled'"
        )[0]['cnt']

        total_volume = client.execute_query(
            "SELECT SUM(agreed_amount) as total FROM gig_contracts WHERE status = 'settled'"
        )[0]['total'] or 0

        return {
            'total_requests': total_requests,
            'open_requests': open_requests,
            'total_contracts': total_contracts,
            'completed_contracts': completed_contracts,
            'total_volume': total_volume,
            'success_rate': (completed_contracts / total_contracts * 100) if total_contracts > 0 else 0
        }


# 싱글톤
_service: Optional[MarketplaceService] = None


def get_marketplace_service() -> MarketplaceService:
    """서비스 싱글톤"""
    global _service
    if _service is None:
        _service = MarketplaceService()
    return _service
