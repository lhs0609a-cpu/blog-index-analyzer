"""
X (Twitter) 자동 게시 서비스
스케줄된 게시물을 자동으로 트윗합니다.
"""
import asyncio
import logging
from datetime import datetime
from typing import Optional

from database import x_db
from services import x_service

logger = logging.getLogger(__name__)

# 자동 게시 실행 상태
_auto_poster_running = False
_auto_poster_task: Optional[asyncio.Task] = None


async def process_pending_posts():
    """대기 중인 게시물 처리"""
    pending_posts = x_db.get_pending_x_posts()

    if not pending_posts:
        return 0

    posted_count = 0

    for post in pending_posts:
        try:
            access_token = post.get("access_token")
            if not access_token:
                logger.warning(f"No access token for post {post['id']}")
                x_db.update_x_post_status(
                    post["id"],
                    status="failed",
                    error_message="액세스 토큰이 없습니다."
                )
                continue

            # 트윗 게시
            result = await x_service.post_tweet(
                access_token=access_token,
                text=post["content"]
            )

            if result:
                x_db.update_x_post_status(
                    post["id"],
                    status="posted",
                    x_tweet_id=result.get("id")
                )
                posted_count += 1
                logger.info(f"Posted tweet for post {post['id']}: {result.get('id')}")
            else:
                x_db.update_x_post_status(
                    post["id"],
                    status="failed",
                    error_message="트윗 게시 실패"
                )
                logger.error(f"Failed to post tweet for post {post['id']}")

            # Rate limit 방지를 위한 딜레이
            await asyncio.sleep(2)

        except Exception as e:
            logger.error(f"Error posting tweet {post['id']}: {e}")
            x_db.update_x_post_status(
                post["id"],
                status="failed",
                error_message=str(e)
            )

    return posted_count


async def auto_poster_loop():
    """자동 게시 루프"""
    global _auto_poster_running

    logger.info("X Auto Poster started")

    while _auto_poster_running:
        try:
            posted = await process_pending_posts()
            if posted > 0:
                logger.info(f"X Auto Poster: Posted {posted} tweets")
        except Exception as e:
            logger.error(f"X Auto Poster error: {e}")

        # 5분마다 체크 (메모리 절약)
        await asyncio.sleep(300)

    logger.info("X Auto Poster stopped")


def start_auto_poster():
    """자동 게시 서비스 시작"""
    global _auto_poster_running, _auto_poster_task

    if _auto_poster_running:
        logger.warning("X Auto Poster is already running")
        return False

    _auto_poster_running = True
    _auto_poster_task = asyncio.create_task(auto_poster_loop())
    logger.info("X Auto Poster service started")
    return True


def stop_auto_poster():
    """자동 게시 서비스 중지"""
    global _auto_poster_running, _auto_poster_task

    if not _auto_poster_running:
        logger.warning("X Auto Poster is not running")
        return False

    _auto_poster_running = False

    if _auto_poster_task:
        _auto_poster_task.cancel()
        _auto_poster_task = None

    logger.info("X Auto Poster service stopped")
    return True


def is_auto_poster_running() -> bool:
    """자동 게시 서비스 실행 상태 확인"""
    return _auto_poster_running


async def refresh_expired_tokens():
    """만료된 토큰 갱신"""
    accounts = x_db.get_x_accounts()
    refreshed = 0

    for account in accounts:
        try:
            token_expires = account.get("token_expires_at")
            if not token_expires:
                continue

            # 문자열인 경우 datetime으로 변환
            if isinstance(token_expires, str):
                token_expires = datetime.fromisoformat(token_expires.replace("Z", "+00:00"))

            # 만료 30분 전이면 갱신
            if datetime.now() > token_expires:
                full_account = x_db.get_x_account(account["id"])
                refresh_token = full_account.get("refresh_token")

                if not refresh_token:
                    logger.warning(f"No refresh token for account {account['id']}")
                    continue

                new_tokens = await x_service.refresh_access_token(refresh_token)
                if new_tokens:
                    from database.x_db import get_connection
                    conn = get_connection()
                    try:
                        cursor = conn.cursor()
                        new_expires = datetime.now().timestamp() + new_tokens.get("expires_in", 7200)
                        cursor.execute("""
                            UPDATE x_accounts
                            SET access_token = ?, refresh_token = ?,
                                token_expires_at = ?, updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        """, (
                            new_tokens.get("access_token"),
                            new_tokens.get("refresh_token", refresh_token),
                            datetime.fromtimestamp(new_expires),
                            account["id"]
                        ))
                        conn.commit()
                    finally:
                        conn.close()
                    refreshed += 1
                    logger.info(f"Refreshed token for account {account['id']}")

        except Exception as e:
            logger.error(f"Error refreshing token for account {account.get('id')}: {e}")

    return refreshed


# 통계 조회
def get_auto_poster_stats() -> dict:
    """자동 게시 서비스 통계"""
    from database.x_db import get_connection

    conn = get_connection()
    try:
        cursor = conn.cursor()

        # 오늘 게시된 트윗 수
        cursor.execute("""
            SELECT COUNT(*) FROM x_posts
            WHERE status = 'posted'
            AND date(posted_at) = date('now')
        """)
        today_posted = cursor.fetchone()[0]

        # 대기 중인 게시물 수
        cursor.execute("""
            SELECT COUNT(*) FROM x_posts
            WHERE status = 'pending'
            AND scheduled_at <= datetime('now')
        """)
        pending = cursor.fetchone()[0]

        # 활성 캠페인 수
        cursor.execute("""
            SELECT COUNT(*) FROM x_campaigns
            WHERE status = 'active'
        """)
        active_campaigns = cursor.fetchone()[0]

        # 연결된 계정 수
        cursor.execute("SELECT COUNT(*) FROM x_accounts")
        total_accounts = cursor.fetchone()[0]
    finally:
        conn.close()

    return {
        "running": _auto_poster_running,
        "today_posted": today_posted,
        "pending_posts": pending,
        "active_campaigns": active_campaigns,
        "total_accounts": total_accounts
    }
