from __future__ import annotations

import re
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class UserRegister(BaseModel):
    device_id: str = Field(min_length=1, max_length=128)
    nickname: Optional[str] = Field(default=None, min_length=1, max_length=64)


class EmailPasswordRegister(BaseModel):
    """邮箱密码注册请求。"""

    email: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    verification_code: str = Field(..., min_length=6, max_length=6)
    nickname: Optional[str] = Field(default=None, min_length=1, max_length=64)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        """验证邮箱格式。"""
        email_regex = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
        if not email_regex.match(v):
            raise ValueError("邮箱格式不正确")
        return v.lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        """验证密码强度：至少 8 位，包含字母和数字，不含空格。"""
        if len(v) < 8:
            raise ValueError("密码至少需要 8 位")
        if not re.search(r"[a-zA-Z]", v):
            raise ValueError("密码必须包含字母")
        if not re.search(r"\d", v):
            raise ValueError("密码必须包含数字")
        if " " in v:
            raise ValueError("密码不能包含空格")
        return v

    @field_validator("verification_code")
    @classmethod
    def validate_verification_code(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("验证码必须是 6 位数字")
        return v


class EmailPasswordLogin(BaseModel):
    """邮箱密码登录请求。"""

    email: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        """验证邮箱格式。"""
        email_regex = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
        if not email_regex.match(v):
            raise ValueError("邮箱格式不正确")
        return v.lower()


class AuthResponse(BaseModel):
    token: str
    user_id: str
    device_id: Optional[str]
    email: Optional[str]
    nickname: Optional[str]
    created_at: datetime
    is_new_user: bool
    auth_type: str


class EmailCodeRequest(BaseModel):
    email: str = Field(..., min_length=1, max_length=255)
    purpose: Literal["register", "reset_password"] = "register"

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        email_regex = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
        if not email_regex.match(v):
            raise ValueError("邮箱格式不正确")
        return v.lower()


class VerifyEmailCodeRequest(BaseModel):
    email: str = Field(..., min_length=1, max_length=255)
    code: str = Field(..., min_length=6, max_length=6)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        email_regex = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
        if not email_regex.match(v):
            raise ValueError("邮箱格式不正确")
        return v.lower()

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("验证码必须是 6 位数字")
        return v


class ResetPasswordRequest(BaseModel):
    email: str = Field(..., min_length=1, max_length=255)
    code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        email_regex = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
        if not email_regex.match(v):
            raise ValueError("邮箱格式不正确")
        return v.lower()

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("验证码必须是 6 位数字")
        return v

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("密码至少需要 8 位")
        if not re.search(r"[a-zA-Z]", v):
            raise ValueError("密码必须包含字母")
        if not re.search(r"\d", v):
            raise ValueError("密码必须包含数字")
        if " " in v:
            raise ValueError("密码不能包含空格")
        return v


class UserProfileResponse(BaseModel):
    id: str
    device_id: Optional[str] = None
    email: Optional[str] = None
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    username: Optional[str] = None
    auth_type: str
    created_at: datetime
    updated_at: datetime


class UserUpdateRequest(BaseModel):
    nickname: Optional[str] = Field(default=None, min_length=2, max_length=64)
    avatar_url: Optional[str] = Field(default=None, max_length=512)
    username: Optional[str] = Field(default=None, min_length=2, max_length=64)

    @field_validator("nickname")
    @classmethod
    def validate_nickname(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        value = v.strip()
        if not value:
            raise ValueError("昵称不能为空")
        pattern = re.compile(r"^[\u4e00-\u9fa5A-Za-z0-9_-]{2,64}$")
        if not pattern.match(value):
            raise ValueError("昵称仅支持中文、英文、数字、下划线和连字符")
        return value

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        value = v.strip().lower()
        if not value:
            raise ValueError("用户名不能为空")
        pattern = re.compile(r"^[a-z0-9_-]{2,64}$")
        if not pattern.match(value):
            raise ValueError("用户名仅支持小写字母、数字、下划线和连字符")
        return value


class UserSearchResponse(BaseModel):
    users: list[UserProfileResponse]
    total: int
