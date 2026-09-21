"""
비밀번호 재설정 토큰 저장소.

왜 필요했나: 재설정 경로가 프런트·백엔드 어디에도 없었다. 비밀번호를 잊은
사람은 영구히 잠긴다 — 문의 메일을 보내 관리자가 DB 를 직접 고치지 않는 한
돌아올 방법이 없었다. 실측(2026-09-15~21) 로그인 실패 6건 중 1건이
password_rejected 였고, 그 사람에게 줄 수 있는 것이 아무것도 없었다.

설계:
- **토큰 원문을 저장하지 않는다.** DB 가 새면 그 순간 전 계정의 비밀번호를
  바꿀 수 있는 열쇠 꾸러미가 된다. sha256 해시만 넣고 대조도 해시로 한다.
- 1회용. 쓴 토큰은 used_at 을 찍어 재사용을 막는다.
- 만료 30분. 메일함이 털렸을 때의 노출 창을 좁힌다.
- 새 토큰을 내면 그 사용자의 기존 미사용 토큰을 전부 무효화한다. 여러 개가
  동시에 살아 있으면 가장 오래된 링크로도 바꿀 수 있게 된다.
"""
import hashlib
import logging
import os
import secrets
import sqlite3
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# users 와 **같은 파일**을 쓴다. 다른 파일에 두면 사용자를 지웠을 때 토큰이
# 남아 사라진 계정의 비밀번호를 바꿀 수 있는 링크가 살아남는다.
from database.user_db import DATABASE_PATH as DB_PATH

# 30분. 사람이 메일함을 열고 링크를 누르기엔 넉넉하고, 링크가 방치될 시간은 짧다.
TOKEN_TTL_MINUTES = 30
# 같은 사람이 재설정 메일을 연달아 요청하는 것을 막는 간격(초).
RESEND_COOLDOWN_SECONDS = 60


def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def init_password_reset_table() -> None:
    conn = _connect()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS password_resets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                used_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id)"
        )
        conn.commit()
        logger.info("✅ password_resets table ready")
    except Exception as e:
        logger.warning(f"password_resets 초기화 실패: {e}")
    finally:
        conn.close()


def recently_requested(user_id: int) -> bool:
    """직전 요청이 쿨다운 안이면 True. 메일 폭탄과 토큰 남발을 막는다."""
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT created_at FROM password_resets WHERE user_id = ? "
            "ORDER BY id DESC LIMIT 1",
            (user_id,),
        ).fetchone()
        if not row or not row["created_at"]:
            return False
        try:
            last = datetime.fromisoformat(str(row["created_at"]))
        except ValueError:
            return False
        return (datetime.now() - last).total_seconds() < RESEND_COOLDOWN_SECONDS
    except Exception:
        return False
    finally:
        conn.close()


def create_token(user_id: int) -> str:
    """새 토큰을 만들고 **원문**을 돌려준다. 원문은 메일에만 실린다."""
    init_password_reset_table()
    token = secrets.token_urlsafe(32)
    expires = datetime.now() + timedelta(minutes=TOKEN_TTL_MINUTES)

    conn = _connect()
    try:
        # 살아 있는 이전 링크를 먼저 죽인다.
        conn.execute(
            "UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL",
            (datetime.now().isoformat(), user_id),
        )
        conn.execute(
            "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
            (user_id, _hash(token), expires.isoformat()),
        )
        conn.commit()
    finally:
        conn.close()
    return token


def consume_token(token: str) -> Optional[int]:
    """
    토큰을 써서 user_id 를 돌려준다. 유효하지 않으면 None.

    검증과 소진을 한 함수에 두는 이유: 둘을 나누면 "확인은 했는데 소진을
    잊은" 경로가 생기고, 그 순간 링크 하나로 비밀번호를 몇 번이든 바꿀 수 있다.
    """
    init_password_reset_table()
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT id, user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?",
            (_hash(token),),
        ).fetchone()
        if not row or row["used_at"]:
            return None
        try:
            if datetime.fromisoformat(str(row["expires_at"])) < datetime.now():
                return None
        except ValueError:
            return None

        conn.execute(
            "UPDATE password_resets SET used_at = ? WHERE id = ? AND used_at IS NULL",
            (datetime.now().isoformat(), row["id"]),
        )
        conn.commit()
        return int(row["user_id"])
    finally:
        conn.close()
