"""
카카오·네이버 소셜 로그인.

왜: 30일 방문자 2,027 → 가입 48 (2.4%). 가입이 이름·이메일·비밀번호·확인 4칸이고
소셜 로그인이 없었다. 한도에 막힌 사람에게 "가입하면 이어서 한다"고 말해도
그 자리에서 폼 4칸은 높은 벽이다.

흐름: /start → 제공자 동의 화면 → /callback → 우리 JWT 발급 →
프론트 /auth/social#token=… 로 돌려보낸다(토큰은 해시에 실어 서버 로그·Referer 에 안 남게).

키가 설정된 제공자만 켜진다(/providers). 키가 없으면 화면에 버튼이 안 보인다.
  KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET(선택)
  NAVER_LOGIN_CLIENT_ID, NAVER_LOGIN_CLIENT_SECRET  (검색 API 용 NAVER_CLIENT_ID 와 따로 — 같은 이름을 쓰면 로그인 권한 없는 검색 앱 키로 버튼이 켜진다)
  OAUTH_BACKEND_URL (기본 https://blog-index-analyzer.fly.dev)
  OAUTH_FRONTEND_URL (기본 https://www.blrank.co.kr)

계정 연결 규칙(계정 탈취 방지):
  1) 같은 (제공자, 제공자 ID) 연결이 있으면 그 회원으로 로그인
  2) 제공자가 **검증한** 이메일이 기존 회원과 같으면 그 회원에 연결
  3) 아니면 새 회원 — 검증된 이메일이 없으면 내부용 주소를 만든다
"""
import logging
import os
import secrets
from datetime import datetime, timedelta
from typing import Dict, Optional
from urllib.parse import urlencode, quote

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt

from config import get_settings
from database.user_db import get_user_db
from routers.auth import create_access_token, get_password_hash

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()

_NONCE_COOKIE = "oauth_nonce"


def _backend_url() -> str:
    return os.getenv("OAUTH_BACKEND_URL", "https://blog-index-analyzer.fly.dev").rstrip("/")


def _frontend_url() -> str:
    return os.getenv("OAUTH_FRONTEND_URL", "https://www.blrank.co.kr").rstrip("/")


def _configured() -> Dict[str, bool]:
    return {
        "kakao": bool(os.getenv("KAKAO_REST_API_KEY")),
        "naver": bool(os.getenv("NAVER_LOGIN_CLIENT_ID") and os.getenv("NAVER_LOGIN_CLIENT_SECRET")),
    }


def _redirect_uri(provider: str) -> str:
    return f"{_backend_url()}/api/auth/oauth/{provider}/callback"


def _safe_next(raw: Optional[str]) -> str:
    # 프론트 safeNextPath 와 같은 규칙 — 같은 출처의 경로만.
    if not raw or not raw.startswith("/") or raw.startswith("//"):
        return "/dashboard"
    if raw.startswith("/login") or raw.startswith("/register"):
        return "/dashboard"
    return raw


def _fail(reason: str) -> RedirectResponse:
    return RedirectResponse(f"{_frontend_url()}/login?social_error={quote(reason)}", status_code=302)


def _ensure_social_table(conn) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS social_accounts (
            provider          TEXT NOT NULL,
            provider_user_id  TEXT NOT NULL,
            user_id           INTEGER NOT NULL,
            created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (provider, provider_user_id)
        )
    """)


@router.get("/oauth/providers")
async def oauth_providers():
    """화면이 어떤 소셜 버튼을 보여줄지 정한다."""
    return _configured()


@router.get("/oauth/{provider}/start")
async def oauth_start(provider: str, next: Optional[str] = None):
    if not _configured().get(provider):
        raise HTTPException(status_code=404, detail="지원하지 않는 로그인 방식입니다.")
    nonce = secrets.token_urlsafe(16)
    state = jwt.encode(
        {"p": provider, "n": nonce, "next": _safe_next(next),
         "exp": datetime.utcnow() + timedelta(minutes=10)},
        settings.SECRET_KEY, algorithm=settings.ALGORITHM,
    )
    if provider == "kakao":
        url = "https://kauth.kakao.com/oauth/authorize?" + urlencode({
            "client_id": os.getenv("KAKAO_REST_API_KEY"),
            "redirect_uri": _redirect_uri("kakao"),
            "response_type": "code",
            "state": state,
        })
    else:
        url = "https://nid.naver.com/oauth2.0/authorize?" + urlencode({
            "client_id": os.getenv("NAVER_LOGIN_CLIENT_ID"),
            "redirect_uri": _redirect_uri("naver"),
            "response_type": "code",
            "state": state,
        })
    resp = RedirectResponse(url, status_code=302)
    # state 위조(CSRF) 방지: 같은 브라우저가 시작한 흐름인지 쿠키로 확인한다.
    resp.set_cookie(_NONCE_COOKIE, nonce, max_age=600, httponly=True, secure=True, samesite="lax")
    return resp


async def _kakao_profile(code: str) -> Dict:
    data = {
        "grant_type": "authorization_code",
        "client_id": os.getenv("KAKAO_REST_API_KEY"),
        "redirect_uri": _redirect_uri("kakao"),
        "code": code,
    }
    if os.getenv("KAKAO_CLIENT_SECRET"):
        data["client_secret"] = os.getenv("KAKAO_CLIENT_SECRET")
    async with httpx.AsyncClient(timeout=10) as c:
        tok = (await c.post("https://kauth.kakao.com/oauth/token", data=data)).json()
        access = tok.get("access_token")
        if not access:
            raise ValueError(f"token: {tok.get('error')}")
        me = (await c.get("https://kapi.kakao.com/v2/user/me",
                          headers={"Authorization": f"Bearer {access}"})).json()
    acc = me.get("kakao_account") or {}
    verified = bool(acc.get("email") and acc.get("is_email_verified") and acc.get("is_email_valid"))
    return {
        "id": str(me.get("id") or ""),
        "email": (acc.get("email") or "").lower().strip() if verified else None,
        "name": (acc.get("profile") or {}).get("nickname") or (me.get("properties") or {}).get("nickname"),
    }


async def _naver_profile(code: str, state: str) -> Dict:
    async with httpx.AsyncClient(timeout=10) as c:
        tok = (await c.post("https://nid.naver.com/oauth2.0/token", data={
            "grant_type": "authorization_code",
            "client_id": os.getenv("NAVER_LOGIN_CLIENT_ID"),
            "client_secret": os.getenv("NAVER_LOGIN_CLIENT_SECRET"),
            "code": code,
            "state": state,
        })).json()
        access = tok.get("access_token")
        if not access:
            raise ValueError(f"token: {tok.get('error')}")
        me = (await c.get("https://openapi.naver.com/v1/nid/me",
                          headers={"Authorization": f"Bearer {access}"})).json()
    r = me.get("response") or {}
    # 네이버 로그인 이메일은 네이버가 확인한 연락처 이메일이다.
    return {
        "id": str(r.get("id") or ""),
        "email": (r.get("email") or "").lower().strip() or None,
        "name": r.get("nickname") or r.get("name"),
    }


def _find_or_create_user(provider: str, profile: Dict) -> (int, bool):
    """(user_id, 새로 가입했는지)"""
    user_db = get_user_db()
    # 연결을 열어 둔 채 create_user(자기 연결로 쓰기)를 부르면 SQLite 잠금에 걸린다.
    # 조회 연결은 먼저 닫는다.
    with user_db.get_connection() as conn:
        _ensure_social_table(conn)
        row = conn.execute(
            "SELECT user_id FROM social_accounts WHERE provider = ? AND provider_user_id = ?",
            (provider, profile["id"]),
        ).fetchone()
    if row and user_db.get_user_by_id(row[0]):
        return row[0], False

    is_new = False
    user = user_db.get_user_by_email(profile["email"]) if profile.get("email") else None
    if user:
        user_id = user["id"]
    else:
        email = profile.get("email") or f"{provider}_{profile['id']}@social.blrank.local"
        existing = user_db.get_user_by_email(email)
        if existing:
            user_id = existing["id"]
        else:
            user_id = user_db.create_user(
                email=email,
                # 비밀번호 로그인은 쓰지 않는다 — 아무도 모르는 값으로 채운다.
                hashed_password=get_password_hash(secrets.token_urlsafe(32)),
                name=profile.get("name") or None,
            )
            is_new = True
    with user_db.get_connection() as conn:
        _ensure_social_table(conn)
        conn.execute(
            "INSERT OR REPLACE INTO social_accounts (provider, provider_user_id, user_id) VALUES (?, ?, ?)",
            (provider, profile["id"], user_id),
        )
    return user_id, is_new


@router.get("/oauth/{provider}/callback")
async def oauth_callback(
    provider: str, request: Request,
    code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None,
):
    if error or not code or not state:
        # 사용자가 동의 화면에서 취소한 경우도 여기로 온다.
        return _fail("cancelled" if error else "invalid")
    if not _configured().get(provider):
        return _fail("unsupported")
    try:
        claims = jwt.decode(state, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return _fail("expired")
    if claims.get("p") != provider or claims.get("n") != request.cookies.get(_NONCE_COOKIE):
        return _fail("state")

    try:
        profile = await (_kakao_profile(code) if provider == "kakao" else _naver_profile(code, state))
        if not profile.get("id"):
            raise ValueError("no provider id")
        user_id, is_new = _find_or_create_user(provider, profile)
    except Exception as e:
        logger.warning(f"[oauth] {provider} 로그인 실패: {e}")
        return _fail("provider")

    token = create_access_token(data={"sub": str(user_id)})
    logger.info(f"[oauth] {provider} {'가입' if is_new else '로그인'} user_id={user_id}")
    frag = urlencode({"token": token, "next": claims.get("next") or "/dashboard",
                      "new": "1" if is_new else "0", "provider": provider})
    resp = RedirectResponse(f"{_frontend_url()}/auth/social#{frag}", status_code=302)
    resp.delete_cookie(_NONCE_COOKIE)
    return resp
