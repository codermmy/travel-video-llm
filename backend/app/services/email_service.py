from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)


def _is_email_configured() -> bool:
    return bool(settings.smtp_username and settings.smtp_password)


def _send_email(to_email: str, subject: str, body: str) -> bool:
    if not _is_email_configured():
        logger.warning("SMTP not configured, skip sending email to %s", to_email)
        logger.info("[EmailPreview] subject=%s body=%s", subject, body)
        return True

    msg = MIMEMultipart()
    msg["From"] = settings.smtp_username
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "html", "utf-8"))

    try:
        with smtplib.SMTP(settings.smtp_server, settings.smtp_port, timeout=10) as server:
            if settings.smtp_use_tls:
                server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(msg)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to_email)
        return False


def send_verification_email(email: str, code: str) -> bool:
    subject = "Travel Album - 邮箱验证码"
    body = (
        "<p>您好，</p>"
        f"<p>您的注册验证码是：<strong>{code}</strong>，10分钟内有效。</p>"
        "<p>如果这不是您的操作，请忽略此邮件。</p>"
        "<p>Travel Album 团队</p>"
    )
    return _send_email(email, subject, body)


def send_reset_email(email: str, code: str) -> bool:
    subject = "Travel Album - 密码重置验证码"
    body = (
        "<p>您好，</p>"
        f"<p>您的密码重置验证码是：<strong>{code}</strong>，10分钟内有效。</p>"
        "<p>如果这不是您的操作，请忽略此邮件。</p>"
        "<p>Travel Album 团队</p>"
    )
    return _send_email(email, subject, body)
