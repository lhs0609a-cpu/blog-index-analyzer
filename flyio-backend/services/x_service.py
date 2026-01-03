"""
X (Twitter) API 서비스
OAuth 2.0 인증 및 트윗 게시
"""
import os
import httpx
import logging
import hashlib
import base64
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from urllib.parse import urlencode

logger = logging.getLogger(__name__)

# X API 설정
X_CLIENT_ID = os.environ.get("X_CLIENT_ID", "")
X_CLIENT_SECRET = os.environ.get("X_CLIENT_SECRET", "")
X_REDIRECT_URI = os.environ.get("X_REDIRECT_URI", "https://naverpay-delivery-tracker.fly.dev/api/x/auth/callback")

X_AUTH_URL = "https://twitter.com/i/oauth2/authorize"
X_TOKEN_URL = "https://api.twitter.com/2/oauth2/token"
X_API_BASE = "https://api.twitter.com/2"

# PKCE 코드 저장 (실제로는 Redis 등 사용 권장)
_pkce_store: Dict[str, str] = {}


def generate_pkce() -> tuple[str, str]:
    """PKCE code_verifier와 code_challenge 생성"""
    code_verifier = secrets.token_urlsafe(32)
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode()).digest()
    ).rstrip(b'=').decode()
    return code_verifier, code_challenge


def get_auth_url(state: str) -> str:
    """X OAuth 2.0 인증 URL 생성"""
    code_verifier, code_challenge = generate_pkce()
    _pkce_store[state] = code_verifier

    params = {
        "response_type": "code",
        "client_id": X_CLIENT_ID,
        "redirect_uri": X_REDIRECT_URI,
        "scope": "tweet.read tweet.write users.read offline.access",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256"
    }

    return f"{X_AUTH_URL}?{urlencode(params)}"


async def exchange_code_for_token(code: str, state: str) -> Optional[Dict]:
    """인증 코드를 액세스 토큰으로 교환"""
    code_verifier = _pkce_store.pop(state, None)
    if not code_verifier:
        logger.error("PKCE code_verifier not found for state")
        return None

    async with httpx.AsyncClient() as client:
        try:
            # Basic Auth 헤더
            credentials = base64.b64encode(
                f"{X_CLIENT_ID}:{X_CLIENT_SECRET}".encode()
            ).decode()

            response = await client.post(
                X_TOKEN_URL,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization": f"Basic {credentials}"
                },
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": X_REDIRECT_URI,
                    "code_verifier": code_verifier
                }
            )

            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Token exchange failed: {response.status_code} - {response.text}")
                return None

        except Exception as e:
            logger.error(f"Token exchange error: {e}")
            return None


async def refresh_access_token(refresh_token: str) -> Optional[Dict]:
    """리프레시 토큰으로 새 액세스 토큰 발급"""
    async with httpx.AsyncClient() as client:
        try:
            credentials = base64.b64encode(
                f"{X_CLIENT_ID}:{X_CLIENT_SECRET}".encode()
            ).decode()

            response = await client.post(
                X_TOKEN_URL,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization": f"Basic {credentials}"
                },
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token
                }
            )

            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Token refresh failed: {response.status_code}")
                return None

        except Exception as e:
            logger.error(f"Token refresh error: {e}")
            return None


async def get_user_info(access_token: str) -> Optional[Dict]:
    """현재 사용자 정보 조회"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{X_API_BASE}/users/me",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"user.fields": "id,name,username,profile_image_url"}
            )

            if response.status_code == 200:
                return response.json().get("data")
            else:
                logger.error(f"Get user info failed: {response.status_code}")
                return None

        except Exception as e:
            logger.error(f"Get user info error: {e}")
            return None


async def post_tweet(access_token: str, text: str, reply_to: Optional[str] = None) -> Optional[Dict]:
    """트윗 게시"""
    async with httpx.AsyncClient() as client:
        try:
            payload = {"text": text}
            if reply_to:
                payload["reply"] = {"in_reply_to_tweet_id": reply_to}

            response = await client.post(
                f"{X_API_BASE}/tweets",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json=payload
            )

            if response.status_code in [200, 201]:
                return response.json().get("data")
            else:
                logger.error(f"Post tweet failed: {response.status_code} - {response.text}")
                return None

        except Exception as e:
            logger.error(f"Post tweet error: {e}")
            return None


async def post_thread(access_token: str, tweets: List[str]) -> List[Dict]:
    """스레드 (연속 트윗) 게시"""
    results = []
    reply_to = None

    for tweet_text in tweets:
        result = await post_tweet(access_token, tweet_text, reply_to)
        if result:
            results.append(result)
            reply_to = result.get("id")
        else:
            break

    return results


async def delete_tweet(access_token: str, tweet_id: str) -> bool:
    """트윗 삭제"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.delete(
                f"{X_API_BASE}/tweets/{tweet_id}",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            return response.status_code == 200

        except Exception as e:
            logger.error(f"Delete tweet error: {e}")
            return False


class XContentGenerator:
    """X 콘텐츠 생성기"""

    # 콘텐츠 유형별 비율 (4-3-2-1 법칙)
    CONTENT_TYPES = {
        "value": 0.4,      # 40% - 가치 제공 (팁, 정보)
        "engagement": 0.3,  # 30% - 참여 유도 (질문, 투표)
        "story": 0.2,       # 20% - 스토리 (일상, 비하인드)
        "promotion": 0.1    # 10% - 프로모션 (홍보)
    }

    # 요일별 최적 게시 시간
    POSTING_TIMES = {
        0: ["09:00", "12:00", "18:00"],  # 월요일
        1: ["09:00", "12:00", "18:00"],  # 화요일
        2: ["09:00", "12:00", "18:00", "21:00"],  # 수요일
        3: ["09:00", "12:00", "18:00"],  # 목요일
        4: ["09:00", "12:00", "18:00", "21:00"],  # 금요일
        5: ["10:00", "14:00", "20:00"],  # 토요일
        6: ["10:00", "14:00", "20:00"],  # 일요일
    }

    @classmethod
    def generate_campaign_content(
        cls,
        brand_name: str,
        brand_description: str,
        target_audience: str,
        final_goal: str,
        duration_days: int = 90,
        content_style: str = "casual"
    ) -> List[Dict]:
        """캠페인 콘텐츠 생성 (AI 없이 템플릿 기반)"""
        posts = []
        start_date = datetime.now()

        # 콘텐츠 템플릿
        value_templates = [
            f"💡 {brand_name} 팁 공유\n\n오늘도 도움이 되는 정보를 가져왔어요.\n\n#팁 #정보공유",
            f"📚 알아두면 좋은 {brand_name} 이야기\n\n{brand_description[:50] if brand_description else '유용한 정보'}...\n\n#인사이트",
            f"✨ {target_audience or '여러분'}을 위한 꿀팁!\n\n오늘의 추천 정보입니다.\n\n#추천 #꿀팁",
        ]

        engagement_templates = [
            f"🤔 여러분은 어떻게 생각하세요?\n\n{brand_name}에 대한 의견을 들려주세요!\n\n#의견 #소통",
            f"📊 투표 시간!\n\n{brand_name}, 어떤 점이 가장 좋으세요?\n\n#투표 #참여",
            f"💬 궁금한 점이 있으신가요?\n\n댓글로 질문해주세요, 답변드릴게요!\n\n#QnA #질문",
        ]

        story_templates = [
            f"📝 오늘의 {brand_name} 이야기\n\n일상 속 작은 발견을 공유합니다.\n\n#일상 #브랜드스토리",
            f"🎬 비하인드 스토리\n\n{brand_name}의 숨겨진 이야기\n\n#비하인드 #스토리",
            f"☀️ 좋은 아침이에요!\n\n오늘 하루도 {brand_name}과 함께해요.\n\n#굿모닝 #일상",
        ]

        promotion_templates = [
            f"🎉 {brand_name} 소식!\n\n{final_goal or '새로운 소식'}을 전해드려요.\n\n#신상 #소식",
            f"⭐ {brand_name}을 소개합니다\n\n{brand_description[:80] if brand_description else '특별한 브랜드'}...\n\n#브랜드",
            f"🔥 지금 확인하세요!\n\n{brand_name}의 특별한 혜택\n\n#이벤트 #혜택",
        ]

        all_templates = {
            "value": value_templates,
            "engagement": engagement_templates,
            "story": story_templates,
            "promotion": promotion_templates
        }

        # 게시물 생성
        current_date = start_date
        post_count = 0
        total_posts = duration_days * 3  # 하루 평균 3개

        while post_count < total_posts:
            weekday = current_date.weekday()
            times = cls.POSTING_TIMES.get(weekday, ["12:00"])

            for time_str in times:
                if post_count >= total_posts:
                    break

                # 콘텐츠 타입 선택 (비율에 따라)
                import random
                rand = random.random()
                cumulative = 0
                content_type = "value"

                for ctype, ratio in cls.CONTENT_TYPES.items():
                    cumulative += ratio
                    if rand <= cumulative:
                        content_type = ctype
                        break

                # 템플릿 선택
                templates = all_templates[content_type]
                template = random.choice(templates)

                # 약간의 변형 추가
                variations = [
                    template,
                    template.replace("!", "~"),
                    template.replace("여러분", "팔로워분들"),
                ]
                content = random.choice(variations)

                # 게시 시간 설정
                hour, minute = map(int, time_str.split(":"))
                scheduled_at = current_date.replace(
                    hour=hour, minute=minute, second=0, microsecond=0
                )

                posts.append({
                    "content": content,
                    "content_type": content_type,
                    "scheduled_at": scheduled_at.isoformat(),
                    "hashtags": [brand_name.replace(" ", ""), "자동화", "마케팅"]
                })

                post_count += 1

            current_date += timedelta(days=1)

        return posts
