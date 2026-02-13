"""
자격증명 암호화/복호화 유틸리티
Fernet 대칭키 암호화를 사용하여 플랫폼 API 키를 안전하게 저장합니다.
"""
import base64
import hashlib
import json
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

try:
    from cryptography.fernet import Fernet
    HAS_CRYPTOGRAPHY = True
except ImportError:
    HAS_CRYPTOGRAPHY = False
    logger.warning("cryptography 패키지가 설치되지 않았습니다. 자격증명 암호화가 비활성화됩니다.")


def _get_fernet_key() -> Optional[bytes]:
    """
    SECRET_KEY에서 Fernet 호환 키를 파생합니다.
    Fernet은 32바이트 base64 인코딩 키가 필요합니다.
    """
    try:
        from config import get_settings
        settings = get_settings()
        # SECRET_KEY를 SHA256으로 해시하여 32바이트 키 생성
        key_bytes = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
        return base64.urlsafe_b64encode(key_bytes)
    except Exception as e:
        logger.error(f"Failed to derive encryption key: {e}")
        return None


def encrypt_credentials(credentials: Dict[str, str]) -> str:
    """
    자격증명 딕셔너리를 암호화된 문자열로 변환합니다.
    cryptography 패키지가 없으면 base64 인코딩만 수행합니다.
    """
    json_str = json.dumps(credentials, ensure_ascii=False)

    if HAS_CRYPTOGRAPHY:
        key = _get_fernet_key()
        if key:
            try:
                f = Fernet(key)
                encrypted = f.encrypt(json_str.encode())
                return f"enc:{encrypted.decode()}"
            except Exception as e:
                logger.error(f"Encryption failed, falling back to base64: {e}")

    # 폴백: base64 인코딩 (암호화 없음, 난독화만)
    encoded = base64.b64encode(json_str.encode()).decode()
    return f"b64:{encoded}"


def decrypt_credentials(encrypted_str: str) -> Dict[str, str]:
    """
    암호화된 자격증명 문자열을 딕셔너리로 복호화합니다.
    """
    if not encrypted_str:
        return {}

    if encrypted_str.startswith("enc:"):
        if not HAS_CRYPTOGRAPHY:
            logger.error("Cannot decrypt: cryptography package not installed")
            return {}
        key = _get_fernet_key()
        if not key:
            return {}
        try:
            f = Fernet(key)
            data = encrypted_str[4:]  # "enc:" 접두사 제거
            decrypted = f.decrypt(data.encode())
            return json.loads(decrypted.decode())
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            return {}

    elif encrypted_str.startswith("b64:"):
        try:
            data = encrypted_str[4:]  # "b64:" 접두사 제거
            decoded = base64.b64decode(data).decode()
            return json.loads(decoded)
        except Exception as e:
            logger.error(f"Base64 decode failed: {e}")
            return {}

    else:
        # 레거시: 평문 JSON (마이그레이션 전 데이터)
        try:
            return json.loads(encrypted_str)
        except Exception:
            return {}
