from __future__ import annotations

from typing import List

from pydantic import AliasChoices
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="",
    )

    database_url: str = Field(default="sqlite:///./travel_album.db")
    redis_url: str = Field(default="redis://localhost:6379/0")

    jwt_secret_key: str = Field(default="change-me")
    jwt_expires_minutes: int = Field(default=60 * 24 * 30)
    cors_origins: str = Field(default="")
    upload_dir: str = Field(default="./uploads")

    # Optional admin key for privileged maintenance endpoints.
    admin_api_key: str = Field(default="")

    # Public URL used to convert relative `/uploads/...` paths into absolute URLs.
    backend_public_base_url: str = Field(default="")

    # External integrations
    amap_api_key: str = Field(default="")

    # AI provider config
    ai_provider: str = Field(default="openai")

    # OpenAI-compatible provider
    openai_base_url: str = Field(default="http://api.yescode.cloud/v1")
    openai_api_key: str = Field(default="")
    openai_vision_model: str = Field(default="gpt-5.1-codex")
    openai_story_model: str = Field(default="gpt-5.1-codex")
    openai_timeout_seconds: int = Field(default=30)

    # Aliyun DashScope / Tongyi
    dashscope_api_key: str = Field(
        default="",
        validation_alias=AliasChoices(
            "DASHSCOPE_API_KEY",
            "dashscope_api_key",
            "DASHSCOPE_KEY",
        ),
    )
    tongyi_api_key: str = Field(
        default="",
        validation_alias=AliasChoices(
            "TONGYI_API_KEY",
            "tongyi_api_key",
        ),
    )

    # Aliyun OSS
    oss_endpoint: str = Field(default="")
    oss_bucket: str = Field(default="")
    oss_access_key_id: str = Field(default="")
    oss_access_key_secret: str = Field(default="")
    # Optional direct public base URL, e.g. `https://cdn.example.com`.
    oss_public_base_url: str = Field(default="")

    # Clustering
    clustering_time_threshold_hours: int = Field(default=48)
    clustering_distance_threshold_km: int = Field(default=50)
    clustering_min_photos_per_event: int = Field(default=5)

    # Celery
    celery_timezone: str = Field(default="Asia/Shanghai")
    celery_task_time_limit: int = Field(default=3600)

    @property
    def cors_origins_list(self) -> List[str]:
        if not self.cors_origins:
            return []
        parts = [p.strip() for p in self.cors_origins.split(",")]
        return [p for p in parts if p]

    @property
    def backend_public_base_url_normalized(self) -> str:
        return self.backend_public_base_url.rstrip("/")

    @property
    def oss_public_base_url_normalized(self) -> str:
        return self.oss_public_base_url.rstrip("/")

    @property
    def openai_base_url_normalized(self) -> str:
        return self.openai_base_url.rstrip("/")

    @property
    def normalized_ai_provider(self) -> str:
        return self.ai_provider.strip().lower()

    @property
    def oss_enabled(self) -> bool:
        return bool(
            self.oss_endpoint
            and self.oss_bucket
            and self.oss_access_key_id
            and self.oss_access_key_secret
        )


settings = Settings()
