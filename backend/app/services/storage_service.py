from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Optional
from urllib.parse import urlparse

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class StorageUploadResult:
    local_path: str
    public_url: str
    storage_provider: str
    object_key: Optional[str] = None


class LocalStorageProvider:
    def __init__(self) -> None:
        self.upload_dir = Path(settings.upload_dir) / "photos"
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    def get_local_path(self, file_hash: str) -> Path:
        return self.upload_dir / f"{file_hash}.jpg"

    def save_file(self, file_hash: str, file_obj: BinaryIO) -> Path:
        target = self.get_local_path(file_hash)
        with open(target, "wb") as out:
            while True:
                chunk = file_obj.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
        return target

    def build_public_url(self, file_hash: str) -> str:
        relative = f"/uploads/photos/{file_hash}.jpg"
        base = settings.backend_public_base_url_normalized
        if base:
            return f"{base}{relative}"
        return relative


class OssStorageProvider:
    def __init__(self) -> None:
        self.endpoint = settings.oss_endpoint.strip()
        self.bucket_name = settings.oss_bucket.strip()

    @staticmethod
    def build_object_key(file_hash: str) -> str:
        return f"photos/{file_hash}.jpg"

    def _build_bucket(self):
        try:
            import oss2  # type: ignore
        except Exception as exc:  # pragma: no cover - only hit when dependency missing
            raise RuntimeError("oss2 is required when OSS is enabled") from exc

        auth = oss2.Auth(settings.oss_access_key_id, settings.oss_access_key_secret)
        return oss2.Bucket(auth, self.endpoint, self.bucket_name)

    def upload_file(self, local_path: str, object_key: str) -> None:
        bucket = self._build_bucket()
        bucket.put_object_from_file(object_key, local_path)

    def build_public_base_url(self) -> str:
        if settings.oss_public_base_url_normalized:
            return settings.oss_public_base_url_normalized

        endpoint = self.endpoint
        endpoint = endpoint.replace("https://", "").replace("http://", "").strip("/")
        return f"https://{self.bucket_name}.{endpoint}"

    def build_public_url(self, object_key: str) -> str:
        return f'{self.build_public_base_url()}/{object_key.lstrip("/")}'


class StorageService:
    def __init__(self) -> None:
        self.local = LocalStorageProvider()
        self.oss = OssStorageProvider() if settings.oss_enabled else None

    def upload_photo_file(self, file_hash: str, file_obj: BinaryIO) -> StorageUploadResult:
        local_path = self.local.save_file(file_hash=file_hash, file_obj=file_obj)

        if self.oss is None:
            public_url = self.local.build_public_url(file_hash)
            return StorageUploadResult(
                local_path=str(local_path),
                public_url=public_url,
                storage_provider="local",
                object_key=None,
            )

        object_key = self.oss.build_object_key(file_hash)
        self.oss.upload_file(local_path=str(local_path), object_key=object_key)
        public_url = self.oss.build_public_url(object_key)
        return StorageUploadResult(
            local_path=str(local_path),
            public_url=public_url,
            storage_provider="oss",
            object_key=object_key,
        )

    def build_public_photo_url(self, file_hash: str) -> tuple[str, str, Optional[str]]:
        if self.oss is not None:
            object_key = self.oss.build_object_key(file_hash)
            return self.oss.build_public_url(object_key), "oss", object_key
        return self.local.build_public_url(file_hash), "local", None

    def resolve_public_url(self, value: Optional[str]) -> Optional[str]:
        if not value:
            return None

        stripped = value.strip()
        if not stripped:
            return None

        if stripped.startswith("http://") or stripped.startswith("https://"):
            return stripped

        if stripped.startswith("/"):
            base = settings.backend_public_base_url_normalized
            if base:
                return f"{base}{stripped}"
            return None

        # Unknown relative path style
        base = settings.backend_public_base_url_normalized
        if base:
            return f'{base}/{stripped.lstrip("/")}'
        return None

    def resolve_client_url(self, value: Optional[str]) -> Optional[str]:
        """Resolve URL for API responses consumed by mobile/web clients.

        For local file storage, absolute tunnel/CDN URLs may become stale.
        If the path points to `/uploads/...`, return a relative path so clients
        can use their current API origin.
        """

        if not value:
            return None

        stripped = value.strip()
        if not stripped:
            return None

        if stripped.startswith("/"):
            return stripped

        if stripped.startswith("http://") or stripped.startswith("https://"):
            parsed = urlparse(stripped)
            if parsed.path.startswith("/uploads/"):
                suffix = ""
                if parsed.query:
                    suffix += f"?{parsed.query}"
                if parsed.fragment:
                    suffix += f"#{parsed.fragment}"
                return f"{parsed.path}{suffix}"
            return stripped

        # Unknown relative path style, keep as relative.
        return stripped


storage_service = StorageService()
