from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class UserRegister(BaseModel):
    device_id: str = Field(min_length=1, max_length=128)
    nickname: Optional[str] = Field(default=None, min_length=1, max_length=64)


class EmailPasswordRegister(BaseModel):
    """邮箱密码注册请求。"""

    email: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    nickname: Optional[str] = Field(default=None, min_length=1, max_length=64)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        """验证邮箱格式。"""
        email_regex = re.compile(
            r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        )
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


class EmailPasswordLogin(BaseModel):
    """邮箱密码登录请求。"""

    email: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        """验证邮箱格式。"""
        email_regex = re.compile(
            r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        )
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
