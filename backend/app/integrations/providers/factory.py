from __future__ import annotations

from typing import Optional

from app.core.config import settings
from app.integrations.providers.base import AIProvider
from app.integrations.providers.openai_responses import OpenAIResponsesProvider
from app.integrations.providers.tongyi_provider import TongyiProvider


class AIProviderFactory:
    def __init__(self) -> None:
        self._provider: Optional[AIProvider] = None

    def get_provider(self, force_reload: bool = False) -> AIProvider:
        if force_reload or self._provider is None:
            self._provider = self._create_provider(settings.normalized_ai_provider)
        return self._provider

    def reset(self) -> None:
        self._provider = None

    @staticmethod
    def _create_provider(provider_name: str) -> AIProvider:
        if provider_name == "openai":
            return OpenAIResponsesProvider()
        if provider_name == "tongyi":
            return TongyiProvider()
        raise ValueError(f"unsupported_ai_provider:{provider_name}")


provider_factory = AIProviderFactory()
