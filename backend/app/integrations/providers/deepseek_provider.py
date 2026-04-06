from __future__ import annotations

import logging
import os
from typing import Any, Optional

import httpx

from app.core.config import settings
from app.integrations.providers.base import parse_story_json_payload

logger = logging.getLogger(__name__)


class DeepSeekProvider:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        story_model: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        self.api_key = (
            api_key
            if api_key is not None
            else (settings.deepseek_api_key or os.getenv("DEEPSEEK_API_KEY", ""))
        )
        self.base_url = (base_url or settings.deepseek_base_url_normalized).rstrip("/")
        self.story_model = story_model or settings.deepseek_story_model
        self.timeout_seconds = timeout_seconds or settings.deepseek_timeout_seconds
        self._last_error_code: Optional[str] = None

    def provider_name(self) -> str:
        return "deepseek"

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def configuration_error_code(self) -> str:
        return "deepseek_api_key_not_configured"

    def current_models(self) -> dict[str, str]:
        return {
            "vision_model": "not-supported",
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

    def _post_chat_completions(
        self,
        *,
        messages: list[dict[str, Any]],
        max_tokens: Optional[int] = None,
        response_format: Optional[dict[str, str]] = None,
    ) -> dict[str, Any] | None:
        if not self.is_configured():
            self._set_error(self.configuration_error_code())
            return None

        payload: dict[str, Any] = {
            "model": self.story_model,
            "messages": messages,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        if response_format:
            payload["response_format"] = response_format

        url = f"{self.base_url}/chat/completions"
        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                response = client.post(url, json=payload, headers=self._headers())
                response.raise_for_status()
                data = response.json()
                if isinstance(data, dict):
                    self._set_error(None)
                    return data
            self._set_error("deepseek_response_parse_failed")
            return None
        except httpx.HTTPError as exc:
            self._set_error("deepseek_http_error")
            logger.error("DeepSeek chat completions request failed: %s", exc)
            return None
        except Exception as exc:
            self._set_error("deepseek_http_error")
            logger.error("DeepSeek provider unexpected error: %s", exc)
            return None

    @staticmethod
    def _extract_text(data: dict[str, Any]) -> str | None:
        choices = data.get("choices")
        if not isinstance(choices, list) or not choices:
            return None

        first = choices[0]
        if not isinstance(first, dict):
            return None

        message = first.get("message")
        if not isinstance(message, dict):
            return None

        content = message.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()
        if isinstance(content, list):
            chunks: list[str] = []
            for item in content:
                if not isinstance(item, dict):
                    continue
                text = item.get("text")
                if isinstance(text, str) and text.strip():
                    chunks.append(text.strip())
            if chunks:
                return "\n".join(chunks)
        return None

    def analyze_image(
        self,
        image_url: str,
        prompt: str = "请描述这张照片的内容，包括场景、物体、情感基调。",
    ) -> dict[str, Any] | None:
        _ = image_url
        _ = prompt
        self._set_error("deepseek_vision_not_supported")
        logger.warning(
            "DeepSeek provider does not support cloud image analysis in current flow"
        )
        return None

    def generate_story(self, prompt: str, max_tokens: int = 800) -> str | None:
        data = self._post_chat_completions(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            max_tokens=max_tokens,
        )
        if not data:
            return None

        text = self._extract_text(data)
        if not text:
            self._set_error("deepseek_response_parse_failed")
            return None

        self._set_error(None)
        return text

    def generate_event_story(
        self,
        location: str,
        date_range: str,
        photo_descriptions: list[str],
        detailed_location: str = "",
        location_tags: str = "",
        structured_summary: str = "",
        timeline_clues: Optional[list[str]] = None,
    ) -> dict[str, Any] | None:
        desc_text = "\n".join([f"- {item}" for item in photo_descriptions])
        timeline_text = "\n".join([f"- {item}" for item in (timeline_clues or [])])
        prompt = f"""你是一位专业旅行写作者，请根据素材创作一段用于事件详情页展示的事件总览。

【旅行信息】
地点：{detailed_location or location}
时间：{date_range}
地点特色：{location_tags or "根据结构化线索判断"}
结构化摘要：
{structured_summary or "暂无结构化摘要"}
时间线索：
{timeline_text or "- 暂无时间线索"}

【照片结构化线索】
{desc_text}

【要求】
1. title：16字以内，用于事件标题，清晰概括地点和活动
2. full_story：100-140字中文，写成事件整体概览，不要逐图展开，不要写成长篇故事
3. hero_title：18字以内，用于视频面板标题，要更文艺、更凝练，可点明月份、地点或时间感，不要直接复述 title
4. hero_summary：30-40字中文，用于视频面板短文案，要比 full_story 更短更轻，不要重复完整故事
5. 情感自然流露，不要固定基调
6. 必须以时间、地点、活动、情绪和地点氛围为主线，不要假设服务端看到了图片
7. 输入中可能存在 OCR、英文字母、数字、原始坐标、碎片化或低关联脏数据；对于难以理解、无法自然连接、关联性低、没有叙事价值的信息，可以直接忽略
8. 优先使用重复出现或相互印证的线索，不要强行使用所有输入
9. 可以包含 1-2 个具体场景细节，但细节只能来自结构化线索
10. 语言自然、真实、克制，不空泛，不编造
11. 视频文案风格锚点：hero_title 可参考“秋水照见归途”，hero_summary 可参考“这一程不急着抵达，只让江岸与晚风把心绪放慢。” 要有画面感、回望感和更轻的情绪入口

请严格返回 JSON：
{{
  "title": "事件标题",
  "full_story": "完整故事",
  "hero_title": "视频面板标题",
  "hero_summary": "视频面板短文案",
  "emotion": "情感标签（Joyful/Exciting/Adventurous/Epic/Romantic/Peaceful/Nostalgic/Thoughtful/Melancholic/Solitary）"
}}
"""

        data = self._post_chat_completions(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
            response_format={"type": "json_object"},
        )
        if not data:
            return None

        response_text = self._extract_text(data)
        if not response_text:
            self._set_error("deepseek_response_parse_failed")
            return None

        story = parse_story_json_payload(response_text=response_text, location=location)
        if "full_story" not in story and "story" in story:
            story["full_story"] = story["story"]
        if "story" not in story and "full_story" in story:
            story["story"] = story["full_story"]
        self._set_error(None)
        return story
