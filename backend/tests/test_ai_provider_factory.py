from __future__ import annotations

import pytest

from app.core.config import settings
from app.integrations.providers.factory import provider_factory


@pytest.fixture(autouse=True)
def reset_factory():
    provider_factory.reset()
    yield
    provider_factory.reset()


def test_factory_selects_openai_provider() -> None:
    original = settings.ai_provider
    try:
        settings.ai_provider = "openai"
        provider = provider_factory.get_provider(force_reload=True)
        assert provider.provider_name() == "openai"
    finally:
        settings.ai_provider = original


def test_factory_selects_tongyi_provider() -> None:
    original = settings.ai_provider
    try:
        settings.ai_provider = "tongyi"
        provider = provider_factory.get_provider(force_reload=True)
        assert provider.provider_name() == "tongyi"
    finally:
        settings.ai_provider = original


def test_factory_rejects_unknown_provider() -> None:
    original = settings.ai_provider
    try:
        settings.ai_provider = "unknown-provider"
        with pytest.raises(ValueError, match="unsupported_ai_provider"):
            provider_factory.get_provider(force_reload=True)
    finally:
        settings.ai_provider = original
