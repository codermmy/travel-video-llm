from __future__ import annotations

import random
from datetime import datetime, timedelta

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
    EmailCodeRequest,
    EmailPasswordLogin,
    EmailPasswordRegister,
    ResetPasswordRequest,
    UserRegister,
    VerifyEmailCodeRequest,
)
from app.services.email_service import send_reset_email, send_verification_email

router = APIRouter()

# 错误码常量
USER_NOT_FOUND = "USER_NOT_FOUND"
INVALID_PASSWORD = "INVALID_PASSWORD"
EMAIL_ALREADY_EXISTS = "EMAIL_ALREADY_EXISTS"
DEVICE_ALREADY_EXISTS = "DEVICE_ALREADY_EXISTS"
INVALID_CODE = "INVALID_CODE"
EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED"

CODE_EXPIRE_MINUTES = 10


def _now_utc() -> datetime:
    return datetime.utcnow()


def _generate_code() -> str:
    return "".join(random.choices("0123456789", k=6))


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
    """设备 ID 注册/登录。如果设备已存在则返回现有用户。"""
    if not payload.device_id.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="device_id is required")

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

    return ApiResponse.ok(_auth_response(user, is_new_user=is_new_user))


@router.post("/send-verification-code", response_model=ApiResponse[dict])
def send_verification_code(
    payload: EmailCodeRequest,
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    """发送邮箱验证码（注册/重置密码）。"""
    stmt = select(User).where(User.email == payload.email.lower())
    user = db.scalar(stmt)

    if payload.purpose == "register":
        if user and user.hashed_password:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": EMAIL_ALREADY_EXISTS, "message": "邮箱已被注册"},
            )

        if not user:
            user = User(
                email=payload.email.lower(),
                auth_type="email",
                email_verified=False,
            )
            db.add(user)

        code = _generate_code()
        user.verification_code = code
        user.verification_expires_at = _now_utc() + timedelta(minutes=CODE_EXPIRE_MINUTES)
        db.commit()

        sent = send_verification_email(payload.email, code)
        if not sent:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"code": "EMAIL_SEND_FAILED", "message": "验证码发送失败"},
            )

        return ApiResponse.ok({"message": "验证码已发送"})

    if not user or not user.hashed_password:
        return ApiResponse.ok({"message": "如果邮箱存在，验证码已发送"})

    code = _generate_code()
    user.reset_code = code
    user.reset_code_expires_at = _now_utc() + timedelta(minutes=CODE_EXPIRE_MINUTES)
    db.commit()

    send_reset_email(payload.email, code)
    return ApiResponse.ok({"message": "如果邮箱存在，验证码已发送"})


@router.post("/verify-email", response_model=ApiResponse[dict])
def verify_email(
    payload: VerifyEmailCodeRequest,
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    """验证邮箱验证码。"""
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": USER_NOT_FOUND, "message": "用户不存在"},
        )

    now = _now_utc()
    if (
        not user.verification_code
        or user.verification_code != payload.code
        or not user.verification_expires_at
        or user.verification_expires_at < now
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": INVALID_CODE, "message": "验证码无效或已过期"},
        )

    user.email_verified = True
    user.verification_code = None
    user.verification_expires_at = None
    db.commit()

    return ApiResponse.ok({"message": "邮箱验证成功"})


@router.post("/register-email", response_model=ApiResponse[AuthResponse])
def register_email(
    payload: EmailPasswordRegister,
    db: Session = Depends(get_db),
) -> ApiResponse[AuthResponse]:
    """邮箱密码注册。注册成功后自动登录。"""
    email = payload.email.lower()
    user = db.scalar(select(User).where(User.email == email))

    now = _now_utc()
    if user and user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": EMAIL_ALREADY_EXISTS, "message": "邮箱已被注册"},
        )

    if (
        not user
        or not user.verification_code
        or user.verification_code != payload.verification_code
        or not user.verification_expires_at
        or user.verification_expires_at < now
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": INVALID_CODE, "message": "验证码无效或已过期"},
        )

    if not user.email_verified:
        user.email_verified = True

    user.hashed_password = hash_password(payload.password)
    user.nickname = payload.nickname or user.nickname
    user.auth_type = "email"
    user.device_id = None
    user.verification_code = None
    user.verification_expires_at = None
    user.reset_code = None
    user.reset_code_expires_at = None

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": EMAIL_ALREADY_EXISTS, "message": "邮箱已被注册"},
        )

    return ApiResponse.ok(_auth_response(user, is_new_user=True))


@router.post("/login", response_model=ApiResponse[AuthResponse])
def login_email(
    payload: EmailPasswordLogin,
    db: Session = Depends(get_db),
) -> ApiResponse[AuthResponse]:
    """邮箱密码登录。"""
    user = db.scalar(select(User).where(User.email == payload.email.lower()))

    if user is None or user.hashed_password is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": USER_NOT_FOUND, "message": "账号不存在"},
        )

    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": INVALID_PASSWORD, "message": "密码错误"},
        )

    return ApiResponse.ok(_auth_response(user, is_new_user=False))


@router.post("/send-reset-code", response_model=ApiResponse[dict])
def send_reset_code(
    payload: EmailCodeRequest,
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    """兼容旧接口：发送密码重置验证码。"""
    reset_payload = EmailCodeRequest(email=payload.email, purpose="reset_password")
    return send_verification_code(payload=reset_payload, db=db)


@router.post("/reset-password", response_model=ApiResponse[dict])
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    """验证码重置密码。"""
    user = db.scalar(select(User).where(User.email == payload.email.lower()))

    if not user or not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": USER_NOT_FOUND, "message": "用户不存在"},
        )

    now = _now_utc()
    if (
        not user.reset_code
        or user.reset_code != payload.code
        or not user.reset_code_expires_at
        or user.reset_code_expires_at < now
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": INVALID_CODE, "message": "验证码无效或已过期"},
        )

    user.hashed_password = hash_password(payload.new_password)
    user.reset_code = None
    user.reset_code_expires_at = None
    user.email_verified = True
    db.commit()

    return ApiResponse.ok({"message": "密码重置成功"})
