from __future__ import annotations

import logging
import os
from typing import Any, Optional

import httpx

from app.core.config import settings
from app.integrations.providers.base import detect_emotion_from_text, parse_story_json_payload

logger = logging.getLogger(__name__)


class OpenAIResponsesProvider:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        vision_model: Optional[str] = None,
        story_model: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        self.api_key = (
            api_key
            if api_key is not None
            else (settings.openai_api_key or os.getenv("OPENAI_API_KEY", ""))
        )
        self.base_url = (base_url or settings.openai_base_url_normalized).rstrip("/")
        self.vision_model = vision_model or settings.openai_vision_model
        self.story_model = story_model or settings.openai_story_model
        self.timeout_seconds = timeout_seconds or settings.openai_timeout_seconds
        self._last_error_code: Optional[str] = None

    def provider_name(self) -> str:
        return "openai"

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def configuration_error_code(self) -> str:
        return "openai_api_key_not_configured"

    def current_models(self) -> dict[str, str]:
        return {
            "vision_model": self.vision_model,
            "story_model": self.story_model,
        }

    def get_last_error_code(self) -> Optional[str]:
        return self._last_error_code

    def _set_error(self, code: Optional[str]) -> None:
        self._last_error_code = code

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _post_responses(
        self, model: str, input_payload: list[dict[str, Any]]
    ) -> dict[str, Any] | None:
        if not self.is_configured():
            self._set_error(self.configuration_error_code())
            return None

        url = f"{self.base_url}/responses"
        payload = {
            "model": model,
            "input": input_payload,
        }

        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                response = client.post(url, json=payload, headers=self._headers())
                response.raise_for_status()
                data = response.json()
                if isinstance(data, dict):
                    self._set_error(None)
                    return data

            self._set_error("openai_response_parse_failed")
            return None
        except httpx.HTTPError as exc:
            self._set_error("openai_http_error")
            logger.error("OpenAI-compatible responses API failed: %s", exc)
            return None
        except Exception as exc:
            self._set_error("openai_http_error")
            logger.error("OpenAI-compatible provider unexpected error: %s", exc)
            return None

    @staticmethod
    def _extract_output_text(data: dict[str, Any]) -> str | None:
        output_text = data.get("output_text")
        if isinstance(output_text, str) and output_text.strip():
            return output_text.strip()

        chunks: list[str] = []

        output = data.get("output")
        if isinstance(output, list):
            for item in output:
                if not isinstance(item, dict):
                    continue
                if item.get("type") == "message":
                    content = item.get("content")
                    if isinstance(content, list):
                        for part in content:
                            if not isinstance(part, dict):
                                continue
                            part_type = part.get("type")
                            if part_type in {"output_text", "text"}:
                                text = part.get("text")
                                if isinstance(text, str) and text.strip():
                                    chunks.append(text.strip())
                    elif isinstance(content, str) and content.strip():
                        chunks.append(content.strip())
                elif item.get("type") in {"output_text", "text"}:
                    text = item.get("text")
                    if isinstance(text, str) and text.strip():
                        chunks.append(text.strip())

        if chunks:
            return "\n".join(chunks)

        choices = data.get("choices")
        if isinstance(choices, list) and choices:
            first = choices[0]
            if isinstance(first, dict):
                message = first.get("message")
                if isinstance(message, dict):
                    content = message.get("content")
                    if isinstance(content, str) and content.strip():
                        return content.strip()

        return None

    def analyze_image(
        self,
        image_url: str,
        prompt: str = "请描述这张照片的内容，包括场景、物体、情感基调。",
    ) -> dict[str, Any] | None:
        data = self._post_responses(
            model=self.vision_model,
            input_payload=[
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {"type": "input_image", "image_url": image_url},
                    ],
                }
            ],
        )
        if not data:
            return None

        text = self._extract_output_text(data)
        if not text:
            self._set_error("openai_response_parse_failed")
            return None

        self._set_error(None)
        return {
            "description": text,
            "tags": [],
            "emotion": detect_emotion_from_text(text),
        }

    def generate_story(self, prompt: str, max_tokens: int = 800) -> str | None:
        data = self._post_responses(
            model=self.story_model,
            input_payload=[
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                    ],
                }
            ],
        )
        if not data:
            return None

        text = self._extract_output_text(data)
        if not text:
            self._set_error("openai_response_parse_failed")
            return None

        self._set_error(None)
        _ = max_tokens
        return text

    def generate_event_story(
        self,
        location: str,
        date_range: str,
        photo_descriptions: list[str],
    ) -> dict[str, Any] | None:
        desc_text = "\n".join([f"- {d}" for d in photo_descriptions])
        prompt = f"""请根据以下信息生成一个简短的旅行故事：

地点：{location}
时间：{date_range}
照片描述：
{desc_text}

要求：
1. 100-200字
2. 情感基调：宁静、放松
3. 包含地点信息
4. 语言优美，有故事感

请以 JSON 格式返回：
{{
  \"title\": \"事件标题\",
  \"story\": \"故事内容\",
  \"emotion\": \"情感标签（Happy/Calm/Epic/Romantic）\"
}}
"""

        response_text = self.generate_story(prompt, max_tokens=800)
        if not response_text:
            if self.get_last_error_code() is None:
                self._set_error("openai_story_generation_failed")
            return None

        story = parse_story_json_payload(response_text=response_text, location=location)
        self._set_error(None)
        return story
