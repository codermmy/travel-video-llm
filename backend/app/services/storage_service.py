from __future__ import annotations

from pathlib import Path
from typing import BinaryIO

from app.core.config import settings


class StorageService:
    def __init__(self, base_dir: str | None = None):
        self.base_dir = Path(base_dir or settings.upload_dir) / "photos"
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def get_photo_path(self, photo_id: str, extension: str = "jpg") -> Path:
        return self.base_dir / f"{photo_id}.{extension}"

    def save_photo(self, photo_id: str, file: BinaryIO, extension: str = "jpg") -> tuple[str, int]:
        target = self.get_photo_path(photo_id, extension)
        with open(target, "wb") as f:
            content = file.read()
            f.write(content)
        return str(target), len(content)

    def delete_photo(self, photo_id: str, extension: str = "jpg") -> bool:
        target = self.get_photo_path(photo_id, extension)
        if target.exists():
            target.unlink()
            return True
        return False

    def get_photo_url(self, photo_id: str, extension: str = "jpg") -> str:
        return f"/uploads/photos/{photo_id}.{extension}"


storage_service = StorageService()
