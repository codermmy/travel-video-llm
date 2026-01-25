from __future__ import annotations

from pydantic import BaseModel, Field


class DeviceRegisterRequest(BaseModel):
    device_id: str = Field(min_length=1, max_length=128)


class DeviceRegisterResponse(BaseModel):
    token: str
    user_id: str
