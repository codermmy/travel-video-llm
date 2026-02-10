from __future__ import annotations

from typing import Any, Optional

from app.integrations.tongyi import TongyiClient


class TongyiProvider:
    def __init__(self, client: Optional[TongyiClient] = None) -> None:
        self.client = client or TongyiClient()
        self._last_error_code: Optional[str] = None

    def provider_name(self) -> str:
        return "tongyi"

    def is_configured(self) -> bool:
        return self.client.is_configured()

    def configuration_error_code(self) -> str:
        return "tongyi_api_key_not_configured"

    def current_models(self) -> dict[str, str]:
        return {
            "vision_model": self.client.vision_model,
            "story_model": self.client.story_model,
        }

    def get_last_error_code(self) -> Optional[str]:
        client_error = getattr(self.client, "get_last_error_code", None)
        if callable(client_error):
            code = client_error()
            if code:
                return code
        return self._last_error_code

    def _set_error(self, code: Optional[str]) -> None:
        self._last_error_code = code

    def analyze_image(
        self,
        image_url: str,
        prompt: str = "请描述这张照片的内容，包括场景、物体、情感基调。",
    ) -> dict[str, Any] | None:
        if not self.is_configured():
            self._set_error(self.configuration_error_code())
            return None

        result = self.client.analyze_image(image_url=image_url, prompt=prompt)
        if result is None:
            self._set_error(self.client.get_last_error_code() or "tongyi_http_error")
            return None

        self._set_error(None)
        return result

    def generate_event_story(
        self,
        location: str,
        date_range: str,
        photo_descriptions: list[str],
        detailed_location: str = "",
        location_tags: str = "",
    ) -> dict[str, Any] | None:
        if not self.is_configured():
            self._set_error(self.configuration_error_code())
            return None

        result = self.client.generate_event_story(
            location=location,
            date_range=date_range,
            photo_descriptions=photo_descriptions,
            detailed_location=detailed_location,
            location_tags=location_tags,
        )
        if result is None:
            self._set_error(self.client.get_last_error_code() or "tongyi_response_parse_failed")
            return None

        self._set_error(None)
        return result
