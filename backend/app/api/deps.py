from __future__ import annotations

from typing import Annotated, Optional

import jwt
from fastapi import Depends, Header, HTTPException, status

from app.core.security import verify_token


def _parse_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    if authorization.startswith("Bearer "):
        token = authorization[7:]
    else:
        token = authorization
    token = token.strip()
    return token if token else None


def get_current_user_id(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> str:
    token = _parse_bearer_token(authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return verify_token(token)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_optional_user_id(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Optional[str]:
    token = _parse_bearer_token(authorization)
    if not token:
        return None
    try:
        return verify_token(token)
    except jwt.PyJWTError:
        return None


CurrentUserIdDep = Annotated[str, Depends(get_current_user_id)]
OptionalUserIdDep = Annotated[Optional[str], Depends(get_optional_user_id)]
