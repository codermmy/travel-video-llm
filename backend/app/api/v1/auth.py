"""Device-only authentication router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import OptionalUserIdDep
from app.core.security import create_access_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.user import AuthResponse, DeviceBootstrapRequest

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


def _normalize_device_id(device_id: str) -> str:
    return device_id.strip()


def _apply_default_nickname(user: User, nickname: str | None) -> None:
    if nickname and not user.nickname:
        user.nickname = nickname


@router.post("/bootstrap", response_model=ApiResponse[AuthResponse])
def bootstrap_device_session(
    payload: DeviceBootstrapRequest,
    current_user_id: OptionalUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[AuthResponse]:
    """设备静默引导。如果设备已存在则返回现有用户。

    当前默认认证方式：无感设备引导，基于稳定设备 ID 自动恢复或创建会话。
    """
    device_id = _normalize_device_id(payload.device_id)
    if not device_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="device_id is required")

    stmt = select(User).where(User.device_id == device_id)
    user = db.scalar(stmt)
    is_new_user = False

    if current_user_id:
        current_user = db.scalar(select(User).where(User.id == current_user_id))
        if current_user is not None:
            if user is not None and user.id != current_user.id:
                _apply_default_nickname(user, payload.nickname)
                db.commit()
                db.refresh(user)
                return ApiResponse.ok(_auth_response(user, is_new_user=False))

            if current_user.device_id != device_id:
                current_user.device_id = device_id

            _apply_default_nickname(current_user, payload.nickname)
            db.commit()
            db.refresh(current_user)
            return ApiResponse.ok(_auth_response(current_user, is_new_user=False))

    if user is None:
        # 新用户，创建设备账号
        user = User(
            device_id=device_id,
            nickname=payload.nickname or f"用户_{device_id[:8]}",
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
                    detail="设备引导失败，请稍后重试",
                )
    elif payload.nickname and not user.nickname:
        user.nickname = payload.nickname
        db.commit()
        db.refresh(user)

    return ApiResponse.ok(_auth_response(user, is_new_user=is_new_user))
