"""Device-only authentication router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.user import AuthResponse, UserRegister

router = APIRouter()

def _auth_response(user: User, *, is_new_user: bool) -> AuthResponse:
    token = create_access_token(subject=user.id)
    return AuthResponse(
        token=token,
        user_id=user.id,
        device_id=user.device_id,
        email=user.email,
        nickname=user.nickname,
        created_at=user.created_at,
        is_new_user=is_new_user,
        auth_type=user.auth_type,
    )


@router.post("/register", response_model=ApiResponse[AuthResponse])
def register_device(
    payload: UserRegister,
    db: Session = Depends(get_db),
) -> ApiResponse[AuthResponse]:
    """设备 ID 注册/登录。如果设备已存在则返回现有用户。

    当前默认认证方式：无感登录，基于设备 ID 自动注册
    """
    if not payload.device_id.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="device_id is required")

    stmt = select(User).where(User.device_id == payload.device_id)
    user = db.scalar(stmt)
    is_new_user = False

    if user is None:
        # 新用户，创建设备账号
        user = User(
            device_id=payload.device_id,
            nickname=payload.nickname or f"用户_{payload.device_id[:8]}",
            auth_type="device",
        )
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
            is_new_user = True
        except IntegrityError:
            db.rollback()
            # 并发情况下可能被其他请求先创建，返回现有用户
            user = db.scalar(stmt)
            if user is None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="设备注册失败，请稍后重试",
                )
    elif payload.nickname and not user.nickname:
        user.nickname = payload.nickname
        db.commit()
        db.refresh(user)

    return ApiResponse.ok(_auth_response(user, is_new_user=is_new_user))
