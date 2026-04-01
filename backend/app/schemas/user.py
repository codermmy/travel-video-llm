from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class UserRegister(BaseModel):
    device_id: str = Field(min_length=1, max_length=128)
    nickname: Optional[str] = Field(default=None, min_length=1, max_length=64)

class AuthResponse(BaseModel):
    token: str
    user_id: str
    device_id: Optional[str]
    email: Optional[str]
    nickname: Optional[str]
    created_at: datetime
    is_new_user: bool
    auth_type: str

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
