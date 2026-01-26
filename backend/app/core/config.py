from __future__ import annotations

from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="",  # 无前缀
    )

    database_url: str = Field(default="sqlite:///./travel_album.db")
    redis_url: str = Field(default="redis://localhost:6379/0")

    jwt_secret_key: str = Field(default="change-me")
    jwt_expires_minutes: int = Field(default=60 * 24 * 30)
    cors_origins: str = Field(default="")  # 改为字符串，在使用时解析
    upload_dir: str = Field(default="./uploads")

    # External integrations
    amap_api_key: str = Field(default="")

    # Clustering
    clustering_time_threshold_hours: int = Field(default=48)
    clustering_distance_threshold_km: int = Field(default=50)
    clustering_min_photos_per_event: int = Field(default=5)

    # Celery
    celery_timezone: str = Field(default="Asia/Shanghai")
    celery_task_time_limit: int = Field(default=3600)

    @property
    def cors_origins_list(self) -> List[str]:
        """将 CORS_ORIGINS 字符串解析为列表"""
        if not self.cors_origins or self.cors_origins == "":
            return []
        parts = [p.strip() for p in self.cors_origins.split(",")]
        return [p for p in parts if p]


settings = Settings()
