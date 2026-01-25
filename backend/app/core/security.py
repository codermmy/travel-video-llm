from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.core.config import settings

ALGORITHM = "HS256"

# 密码加密上下文，bcrypt 工作因子 12
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(password: str) -> str:
    """使用 bcrypt 加密密码。

    Args:
        password: 明文密码

    Returns:
        加密后的密码哈希
    """
    # bcrypt 有 72 字节的限制，超过部分需要截断
    # 这是一个已知的 bcrypt 限制，截断是安全的做法
    # 截断字符串（不是字节），这样 passlib 会正确处理
    truncated = password[:72]
    return pwd_context.hash(truncated)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码是否匹配。

    Args:
        plain_password: 明文密码
        hashed_password: 加密后的密码哈希

    Returns:
        密码是否匹配
    """
    truncated = plain_password[:72]
    return pwd_context.verify(truncated, hashed_password)


def create_access_token(subject: str) -> str:
    now = datetime.now(tz=timezone.utc)
    exp = now + timedelta(minutes=settings.jwt_expires_minutes)
    payload = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=ALGORITHM)


def create_refresh_token(subject: str) -> str:
    return create_access_token(subject)


def verify_token(token: str) -> str:
    payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM])
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub:
        raise jwt.InvalidTokenError("missing sub")
    return sub
