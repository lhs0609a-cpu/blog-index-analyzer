"""
Threads 자동 게시 스케줄러
- 예약된 게시물 자동 발행
- 토큰 자동 갱신
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional
import threading

from database.threads_db import (
    get_campaign_posts, get_campaign, update_post,
    get_user_threads_accounts, get_accounts_needing_refresh,
    save_threads_account, get_threads_account
)
from services.threads_api_service import ThreadsAPIService
from config import settings

logger = logging.getLogger(__name__)


class ThreadsAutoPoster:
    """Threads 자동 게시 스케줄러"""

    def __init__(self):
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._interval = 60  # 1분마다 체크

    def start(self, interval_seconds: int = 60):
        """스케줄러 시작"""
        if self._running:
            logger.warning("Threads auto poster already running")
            return

        self._interval = interval_seconds
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info(f"Threads auto poster started (interval: {interval_seconds}s)")

    def stop(self):
        """스케줄러 중지"""
        self._running = False
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("Threads auto poster stopped")

    def _run_loop(self):
        """메인 루프 - 단일 이벤트 루프 재사용"""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            while self._running:
                try:
                    loop.run_until_complete(self._check_and_post())
                    loop.run_until_complete(self._check_token_refresh())
                except Exception as e:
                    logger.error(f"Auto poster error: {e}")

                # 대기 (1초 단위로 _running 체크)
                for _ in range(self._interval):
                    if not self._running:
                        break
                    self._stop_event.wait(1)
        finally:
            loop.close()

    async def _check_and_post(self):
        """예약된 게시물 확인 및 발행"""
        from database.threads_db import get_db_connection

        conn = get_db_connection()
        cursor = conn.cursor()

        # 현재 시간 기준으로 발행해야 할 게시물 조회
        now = datetime.now().isoformat()

        cursor.execute("""
            SELECT p.*, c.user_id, c.status as campaign_status
            FROM content_posts p
            JOIN campaigns c ON p.campaign_id = c.id
            WHERE p.status = 'scheduled'
            AND p.scheduled_at <= ?
            AND c.status = 'active'
            ORDER BY p.scheduled_at ASC
            LIMIT 10
        """, (now,))

        posts = cursor.fetchall()
        conn.close()

        for post in posts:
            post_dict = dict(post)
            await self._publish_post(post_dict)

    def _get_api_service(self) -> Optional[ThreadsAPIService]:
        """서비스 레벨 ThreadsAPIService 인스턴스"""
        if not settings.THREADS_APP_ID or not settings.THREADS_APP_SECRET:
            return None
        return ThreadsAPIService()

    async def _publish_post(self, post: dict):
        """게시물 발행"""
        try:
            user_id = post.get('user_id', 'default')

            # API 서비스 확인
            api_service = self._get_api_service()
            if not api_service:
                logger.warning("Threads API not configured")
                update_post(post['id'], status='failed')
                return

            # 연결된 계정 찾기
            accounts = get_user_threads_accounts(user_id)
            if not accounts:
                logger.warning(f"No Threads account for user {user_id}")
                update_post(post['id'], status='failed')
                return

            account = accounts[0]

            # 토큰 만료 확인
            if account.get('token_expires_at'):
                expires = datetime.fromisoformat(account['token_expires_at'])
                if expires < datetime.now():
                    logger.warning(f"Token expired for account {account['id']}")
                    update_post(post['id'], status='failed')
                    return

            # Threads에 게시
            result = await api_service.create_text_post(
                access_token=account['access_token'],
                user_id=account['threads_user_id'],
                text=post['content']
            )

            # 성공
            update_post(
                post['id'],
                status='posted',
                threads_post_id=result.get('id'),
                posted_at=datetime.now().isoformat()
            )
            logger.info(f"Auto-posted: {post['id']} -> {result.get('id')}")

        except Exception as e:
            logger.error(f"Failed to auto-post {post['id']}: {e}")
            update_post(post['id'], status='failed')

    async def _check_token_refresh(self):
        """토큰 갱신 필요한 계정 체크"""
        accounts = get_accounts_needing_refresh()

        api_service = self._get_api_service()
        if not api_service:
            logger.warning("Threads API not configured, skipping token refresh")
            return

        for account in accounts:
            try:
                new_token_data = await api_service.refresh_long_lived_token(
                    account['access_token']
                )
                new_token = new_token_data.get('access_token')
                expires_in = new_token_data.get('expires_in', 5184000)

                save_threads_account(
                    user_id=account['user_id'],
                    threads_user_id=account['threads_user_id'],
                    username=account['username'],
                    access_token=new_token,
                    token_expires_at=datetime.now() + timedelta(seconds=expires_in)
                )
                logger.info(f"Token refreshed for {account['username']}")

            except Exception as e:
                logger.error(f"Token refresh failed for {account['id']}: {e}")


# 싱글톤 인스턴스
threads_auto_poster = ThreadsAutoPoster()
