from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.user import (
    AuthResponse,
    EmailPasswordLogin,
    EmailPasswordRegister,
    UserRegister,
)

router = APIRouter()

# 错误码常量
USER_NOT_FOUND = "USER_NOT_FOUND"
INVALID_PASSWORD = "INVALID_PASSWORD"
EMAIL_ALREADY_EXISTS = "EMAIL_ALREADY_EXISTS"
DEVICE_ALREADY_EXISTS = "DEVICE_ALREADY_EXISTS"


@router.post("/register", response_model=ApiResponse[AuthResponse])
def register_device(
    payload: UserRegister,
    db: Session = Depends(get_db),
) -> ApiResponse[AuthResponse]:
    """设备 ID 注册/登录。如果设备已存在则返回现有用户。"""
    if not payload.device_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="device_id is required"
        )

    stmt = select(User).where(User.device_id == payload.device_id)
    user = db.scalar(stmt)
    is_new_user = False
    if user is None:
        user = User(device_id=payload.device_id, nickname=payload.nickname, auth_type="device")
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
            is_new_user = True
        except IntegrityError:
            db.rollback()
            user = db.scalar(stmt)
            if user is None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"code": DEVICE_ALREADY_EXISTS, "message": "设备已注册"},
                )
    elif payload.nickname and user.nickname is None:
        user.nickname = payload.nickname
        db.commit()
        db.refresh(user)

    token = create_access_token(subject=user.id)
    return ApiResponse.ok(
        AuthResponse(
            token=token,
            user_id=user.id,
            device_id=user.device_id,
            email=user.email,
            nickname=user.nickname,
            created_at=user.created_at,
            is_new_user=is_new_user,
            auth_type=user.auth_type,
        )
    )


@router.post("/register-email", response_model=ApiResponse[AuthResponse])
def register_email(
    payload: EmailPasswordRegister,
    db: Session = Depends(get_db),
) -> ApiResponse[AuthResponse]:
    """邮箱密码注册。注册成功后自动登录。"""
    # 检查邮箱是否已存在
    stmt = select(User).where(User.email == payload.email.lower())
    existing_user = db.scalar(stmt)
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": EMAIL_ALREADY_EXISTS, "message": "邮箱已被注册"},
        )

    # 创建新用户
    hashed_pwd = hash_password(payload.password)
    user = User(
        email=payload.email.lower(),
        hashed_password=hashed_pwd,
        nickname=payload.nickname,
        auth_type="email",
        device_id=None,
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": EMAIL_ALREADY_EXISTS, "message": "邮箱已被注册"},
        )

    # 自动登录
    token = create_access_token(subject=user.id)
    return ApiResponse.ok(
        AuthResponse(
            token=token,
            user_id=user.id,
            device_id=user.device_id,
            email=user.email,
            nickname=user.nickname,
            created_at=user.created_at,
            is_new_user=True,
            auth_type=user.auth_type,
        )
    )


@router.post("/login", response_model=ApiResponse[AuthResponse])
def login_email(
    payload: EmailPasswordLogin,
    db: Session = Depends(get_db),
) -> ApiResponse[AuthResponse]:
    """邮箱密码登录。"""
    # 查找用户
    stmt = select(User).where(User.email == payload.email.lower())
    user = db.scalar(stmt)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": USER_NOT_FOUND, "message": "账号不存在"},
        )

    if user.hashed_password is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": INVALID_PASSWORD, "message": "密码错误"},
        )

    # 验证密码
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": INVALID_PASSWORD, "message": "密码错误"},
        )

    # 返回 Token
    token = create_access_token(subject=user.id)
    return ApiResponse.ok(
        AuthResponse(
            token=token,
            user_id=user.id,
            device_id=user.device_id,
            email=user.email,
            nickname=user.nickname,
            created_at=user.created_at,
            is_new_user=False,
            auth_type=user.auth_type,
        )
    )
