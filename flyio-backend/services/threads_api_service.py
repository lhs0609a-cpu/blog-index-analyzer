"""
Threads API 연동 서비스
- OAuth 인증
- 게시물 생성/삭제
- 답글 관리
- 인사이트 조회
"""
import httpx
import logging
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta
from urllib.parse import urlencode

logger = logging.getLogger(__name__)

# Threads API 엔드포인트
THREADS_API_BASE = "https://graph.threads.net"
THREADS_AUTH_URL = "https://threads.net/oauth/authorize"
THREADS_TOKEN_URL = "https://graph.threads.net/oauth/access_token"


class ThreadsAPIService:
    """Threads API 서비스"""

    def __init__(self, app_id: str = None, app_secret: str = None, redirect_uri: str = None):
        from config import settings
        self.app_id = app_id or getattr(settings, 'THREADS_APP_ID', None)
        self.app_secret = app_secret or getattr(settings, 'THREADS_APP_SECRET', None)
        self.redirect_uri = redirect_uri or getattr(settings, 'THREADS_REDIRECT_URI', None)

    # ==================== OAuth 인증 ====================

    def get_authorization_url(self, state: str = None) -> str:
        """OAuth 인증 URL 생성"""
        params = {
            "client_id": self.app_id,
            "redirect_uri": self.redirect_uri,
            "scope": ",".join([
                "threads_basic",
                "threads_content_publish",
                "threads_manage_replies",
                "threads_read_replies",
                "threads_manage_insights",
                "threads_manage_mentions"
            ]),
            "response_type": "code",
        }
        if state:
            params["state"] = state

        return f"{THREADS_AUTH_URL}?{urlencode(params)}"

    async def exchange_code_for_token(self, code: str) -> Dict[str, Any]:
        """인증 코드를 액세스 토큰으로 교환"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                THREADS_TOKEN_URL,
                data={
                    "client_id": self.app_id,
                    "client_secret": self.app_secret,
                    "grant_type": "authorization_code",
                    "redirect_uri": self.redirect_uri,
                    "code": code
                }
            )

            if response.status_code != 200:
                logger.error(f"Token exchange failed: {response.text}")
                raise Exception(f"Token exchange failed: {response.text}")

            return response.json()

    async def get_long_lived_token(self, short_lived_token: str) -> Dict[str, Any]:
        """단기 토큰을 장기 토큰으로 교환 (60일)"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{THREADS_API_BASE}/access_token",
                params={
                    "grant_type": "th_exchange_token",
                    "client_secret": self.app_secret,
                    "access_token": short_lived_token
                }
            )

            if response.status_code != 200:
                logger.error(f"Long-lived token exchange failed: {response.text}")
                raise Exception(f"Long-lived token exchange failed: {response.text}")

            return response.json()

    async def refresh_long_lived_token(self, token: str) -> Dict[str, Any]:
        """장기 토큰 갱신 (만료 전 갱신 가능)"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{THREADS_API_BASE}/refresh_access_token",
                params={
                    "grant_type": "th_refresh_token",
                    "access_token": token
                }
            )

            if response.status_code != 200:
                logger.error(f"Token refresh failed: {response.text}")
                raise Exception(f"Token refresh failed: {response.text}")

            return response.json()

    # ==================== 프로필 ====================

    async def get_user_profile(self, access_token: str, user_id: str = "me") -> Dict[str, Any]:
        """사용자 프로필 조회"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{THREADS_API_BASE}/v1.0/{user_id}",
                params={
                    "fields": "id,username,name,threads_profile_picture_url,threads_biography",
                    "access_token": access_token
                }
            )

            if response.status_code != 200:
                logger.error(f"Get profile failed: {response.text}")
                raise Exception(f"Get profile failed: {response.text}")

            return response.json()

    # ==================== 게시물 생성 ====================

    async def create_text_post(
        self,
        access_token: str,
        user_id: str,
        text: str,
        reply_to_id: str = None
    ) -> Dict[str, Any]:
        """텍스트 게시물 생성 (2단계 프로세스)"""

        # 1단계: 미디어 컨테이너 생성
        container_params = {
            "media_type": "TEXT",
            "text": text,
            "access_token": access_token
        }

        if reply_to_id:
            container_params["reply_to_id"] = reply_to_id

        async with httpx.AsyncClient() as client:
            # 컨테이너 생성
            response = await client.post(
                f"{THREADS_API_BASE}/v1.0/{user_id}/threads",
                data=container_params
            )

            if response.status_code != 200:
                logger.error(f"Create container failed: {response.text}")
                raise Exception(f"Create container failed: {response.text}")

            container_id = response.json().get("id")

            # 2단계: 게시물 발행
            publish_response = await client.post(
                f"{THREADS_API_BASE}/v1.0/{user_id}/threads_publish",
                data={
                    "creation_id": container_id,
                    "access_token": access_token
                }
            )

            if publish_response.status_code != 200:
                logger.error(f"Publish failed: {publish_response.text}")
                raise Exception(f"Publish failed: {publish_response.text}")

            return publish_response.json()

    async def create_image_post(
        self,
        access_token: str,
        user_id: str,
        image_url: str,
        text: str = None
    ) -> Dict[str, Any]:
        """이미지 게시물 생성"""

        container_params = {
            "media_type": "IMAGE",
            "image_url": image_url,
            "access_token": access_token
        }

        if text:
            container_params["text"] = text

        async with httpx.AsyncClient() as client:
            # 컨테이너 생성
            response = await client.post(
                f"{THREADS_API_BASE}/v1.0/{user_id}/threads",
                data=container_params
            )

            if response.status_code != 200:
                logger.error(f"Create image container failed: {response.text}")
                raise Exception(f"Create image container failed: {response.text}")

            container_id = response.json().get("id")

            # 발행
            publish_response = await client.post(
                f"{THREADS_API_BASE}/v1.0/{user_id}/threads_publish",
                data={
                    "creation_id": container_id,
                    "access_token": access_token
                }
            )

            if publish_response.status_code != 200:
                logger.error(f"Publish image failed: {publish_response.text}")
                raise Exception(f"Publish image failed: {publish_response.text}")

            return publish_response.json()

    # ==================== 답글 관리 ====================

    async def get_replies(
        self,
        access_token: str,
        media_id: str,
        reverse: bool = False
    ) -> Dict[str, Any]:
        """게시물의 답글 조회"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{THREADS_API_BASE}/v1.0/{media_id}/replies",
                params={
                    "fields": "id,text,username,timestamp,media_type",
                    "reverse": str(reverse).lower(),
                    "access_token": access_token
                }
            )

            if response.status_code != 200:
                logger.error(f"Get replies failed: {response.text}")
                raise Exception(f"Get replies failed: {response.text}")

            return response.json()

    async def get_conversation(
        self,
        access_token: str,
        media_id: str
    ) -> Dict[str, Any]:
        """대화 스레드 전체 조회"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{THREADS_API_BASE}/v1.0/{media_id}/conversation",
                params={
                    "fields": "id,text,username,timestamp,media_type",
                    "access_token": access_token
                }
            )

            if response.status_code != 200:
                logger.error(f"Get conversation failed: {response.text}")
                raise Exception(f"Get conversation failed: {response.text}")

            return response.json()

    async def reply_to_thread(
        self,
        access_token: str,
        user_id: str,
        reply_to_id: str,
        text: str
    ) -> Dict[str, Any]:
        """스레드에 답글 달기"""
        return await self.create_text_post(
            access_token=access_token,
            user_id=user_id,
            text=text,
            reply_to_id=reply_to_id
        )

    # ==================== 멘션 ====================

    async def get_mentions(
        self,
        access_token: str,
        user_id: str
    ) -> Dict[str, Any]:
        """멘션 조회"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{THREADS_API_BASE}/v1.0/{user_id}/mentions",
                params={
                    "fields": "id,text,username,timestamp,media_type",
                    "access_token": access_token
                }
            )

            if response.status_code != 200:
                logger.error(f"Get mentions failed: {response.text}")
                raise Exception(f"Get mentions failed: {response.text}")

            return response.json()

    # ==================== 인사이트 ====================

    async def get_media_insights(
        self,
        access_token: str,
        media_id: str
    ) -> Dict[str, Any]:
        """게시물 인사이트 조회"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{THREADS_API_BASE}/v1.0/{media_id}/insights",
                params={
                    "metric": "views,likes,replies,reposts,quotes",
                    "access_token": access_token
                }
            )

            if response.status_code != 200:
                logger.error(f"Get insights failed: {response.text}")
                raise Exception(f"Get insights failed: {response.text}")

            return response.json()

    async def get_user_insights(
        self,
        access_token: str,
        user_id: str
    ) -> Dict[str, Any]:
        """사용자 인사이트 조회"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{THREADS_API_BASE}/v1.0/{user_id}/threads_insights",
                params={
                    "metric": "views,likes,replies,reposts,quotes,followers_count",
                    "access_token": access_token
                }
            )

            if response.status_code != 200:
                logger.error(f"Get user insights failed: {response.text}")
                raise Exception(f"Get user insights failed: {response.text}")

            return response.json()

    # ==================== 게시물 삭제 ====================

    async def delete_post(
        self,
        access_token: str,
        media_id: str
    ) -> bool:
        """게시물 삭제"""
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{THREADS_API_BASE}/v1.0/{media_id}",
                params={"access_token": access_token}
            )

            if response.status_code != 200:
                logger.error(f"Delete post failed: {response.text}")
                return False

            return response.json().get("success", False)

    # ==================== 게시물 조회 ====================

    async def get_user_threads(
        self,
        access_token: str,
        user_id: str,
        limit: int = 25
    ) -> Dict[str, Any]:
        """사용자의 게시물 목록 조회"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{THREADS_API_BASE}/v1.0/{user_id}/threads",
                params={
                    "fields": "id,text,timestamp,media_type,permalink",
                    "limit": limit,
                    "access_token": access_token
                }
            )

            if response.status_code != 200:
                logger.error(f"Get threads failed: {response.text}")
                raise Exception(f"Get threads failed: {response.text}")

            return response.json()


# 싱글톤 인스턴스
threads_api_service = ThreadsAPIService()
