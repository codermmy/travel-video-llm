from __future__ import annotations

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "postgresql+psycopg://localhost/travel_album_dev"
    jwt_secret_key: str = "change-me"
    jwt_expires_minutes: int = 60 * 24 * 30
    cors_origins: list[str] = []
    upload_dir: str = "./uploads"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, v):
        if v is None:
            return []
        if isinstance(v, str):
            parts = [p.strip() for p in v.split(",")]
            return [p for p in parts if p]
        return v


settings = Settings()
