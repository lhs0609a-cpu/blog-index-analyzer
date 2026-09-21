"""
메일 발송.

⚠️ SMTP 자격증명이 없으면 **조용히 성공한 척하지 않는다.** 보내지 못했다는
사실을 호출부가 알 수 있게 False 를 돌려주고, 보내려던 내용을 로그에 남긴다.
비밀번호 재설정처럼 "메일이 안 오면 사용자가 영영 못 돌아오는" 경로에서는
'보냈다고 우기는 조용한 실패'가 가장 나쁜 결과다.
"""
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from config import get_settings

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    s = get_settings()
    return bool(getattr(s, "SMTP_USER", "") and getattr(s, "SMTP_PASSWORD", ""))


def send_mail(to: str, subject: str, text: str, html: str = None) -> bool:
    """보냈으면 True. 설정이 없거나 실패하면 False (예외를 밖으로 던지지 않는다)."""
    s = get_settings()
    if not is_configured():
        logger.error(
            "[mailer] SMTP 미설정 — 메일을 보내지 못했다. "
            "fly secrets set SMTP_USER=... SMTP_PASSWORD=... SMTP_FROM=... 필요. "
            f"받는이={to} 제목={subject}"
        )
        # 설정 전에도 운영자가 손으로 전달할 수 있게 본문을 남긴다.
        logger.error(f"[mailer] 미발송 본문:\n{text}")
        return False

    msg = EmailMessage()
    from_addr = getattr(s, "SMTP_FROM", "") or s.SMTP_USER
    msg["From"] = formataddr(("블스피", from_addr))
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")

    try:
        context = ssl.create_default_context()
        port = int(getattr(s, "SMTP_PORT", 587) or 587)
        host = getattr(s, "SMTP_HOST", "smtp.gmail.com")
        if port == 465:
            with smtplib.SMTP_SSL(host, port, context=context, timeout=15) as server:
                server.login(s.SMTP_USER, s.SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.starttls(context=context)
                server.login(s.SMTP_USER, s.SMTP_PASSWORD)
                server.send_message(msg)
        logger.info(f"[mailer] 발송 완료: {to} / {subject}")
        return True
    except Exception as e:
        logger.error(f"[mailer] 발송 실패({type(e).__name__}): {e}")
        return False


def send_password_reset(to: str, reset_url: str, ttl_minutes: int) -> bool:
    text = (
        "블스피 비밀번호 재설정\n\n"
        "아래 주소에서 새 비밀번호를 정해주세요.\n"
        f"{reset_url}\n\n"
        f"이 링크는 {ttl_minutes}분 뒤 만료되고 한 번만 쓸 수 있습니다.\n"
        "본인이 요청한 것이 아니라면 이 메일을 무시하시면 됩니다. "
        "링크를 쓰지 않으면 비밀번호는 그대로입니다.\n"
    )
    html = (
        '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px">'
        '<h2 style="margin:0 0 16px">비밀번호 재설정</h2>'
        '<p style="color:#444;line-height:1.6">아래 버튼을 눌러 새 비밀번호를 정해주세요.</p>'
        f'<p style="margin:24px 0"><a href="{reset_url}" '
        'style="display:inline-block;padding:12px 20px;background:#0064FF;color:#fff;'
        'border-radius:10px;text-decoration:none;font-weight:600">새 비밀번호 정하기</a></p>'
        f'<p style="color:#777;font-size:13px;line-height:1.6">이 링크는 {ttl_minutes}분 뒤 '
        '만료되고 한 번만 쓸 수 있습니다.<br>본인이 요청한 것이 아니라면 무시하셔도 됩니다 — '
        '링크를 쓰지 않으면 비밀번호는 그대로입니다.</p>'
        '</div>'
    )
    return send_mail(to, "[블스피] 비밀번호 재설정", text, html)
