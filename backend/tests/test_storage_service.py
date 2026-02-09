from __future__ import annotations

from app.services.storage_service import StorageService


def test_resolve_client_url_keeps_non_upload_absolute_url() -> None:
    service = StorageService()
    value = "https://cdn.example.com/photos/abc.jpg"
    assert service.resolve_client_url(value) == value


def test_resolve_client_url_turns_uploads_absolute_into_relative_path() -> None:
    service = StorageService()
    value = "https://example.com/uploads/photos/demo.jpg?x=1"
    assert service.resolve_client_url(value) == "/uploads/photos/demo.jpg?x=1"


def test_resolve_client_url_keeps_relative_upload_path() -> None:
    service = StorageService()
    value = "/uploads/photos/raw.jpg"
    assert service.resolve_client_url(value) == value
