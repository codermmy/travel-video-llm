"""通义千问/万相 API 集成"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from app.core.config import settings
from app.integrations.providers.base import detect_emotion_from_text, parse_story_json_payload

logger = logging.getLogger(__name__)


class TongyiClient:
    """通义千问/万相 API 客户端

    封装阿里云通义千问（文本生成）和通义万相（图像理解）API 调用。
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1",
        timeout: int = 30,
        vision_model: str = "qwen-vl-max",
        story_model: str = "qwen-plus",
    ) -> None:
        """初始化客户端

        Args:
            api_key: DashScope API Key，为 None 时从环境变量读取
            base_url: API 基础 URL
            timeout: 请求超时时间（秒）
        """
        import os

        if api_key is not None:
            self.api_key = api_key
        else:
            self.api_key = (
                settings.dashscope_api_key
                or settings.tongyi_api_key
                or os.getenv("DASHSCOPE_API_KEY", "")
                or os.getenv("TONGYI_API_KEY", "")
            )
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.vision_model = vision_model
        self.story_model = story_model
        self._last_error_code: Optional[str] = None

    def _set_error(self, code: Optional[str]) -> None:
        self._last_error_code = code

    def get_last_error_code(self) -> Optional[str]:
        return self._last_error_code

    def _get_headers(self) -> dict[str, str]:
        """获取请求头"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def is_configured(self) -> bool:
        """检查是否已配置 API Key"""
        return bool(self.api_key)

    def analyze_image(
        self,
        image_url: str,
        prompt: str = "请描述这张照片的内容，包括场景、物体、情感基调。",
    ) -> dict[str, Any] | None:
        """图像内容分析（通义万相）

        Args:
            image_url: 图片 URL
            prompt: 提示词

        Returns:
            分析结果，包含 description、tags、emotion
        """
        if not self.is_configured():
            self._set_error("tongyi_api_key_not_configured")
            logger.warning("DASHSCOPE_API_KEY 未配置，跳过图像分析")
            return None

        url = f"{self.base_url}/chat/completions"

        payload = {
            "model": self.vision_model,
            "messages": [
                {
                    "role": "system",
                    "content": "你是一个专业的图像分析助手。",
                },
                {
                    "role": "user",
                    "content": [
                        {"image": image_url},
                        {"text": prompt},
                    ],
                },
            ],
        }

        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(url, json=payload, headers=self._get_headers())
                response.raise_for_status()

                data = response.json()

                if data.get("choices"):
                    content = data["choices"][0]["message"]["content"]
                    self._set_error(None)
                    return self._parse_image_result(content)

                self._set_error("tongyi_response_parse_failed")
                return None

        except httpx.HTTPError as e:
            self._set_error("tongyi_http_error")
            logger.error("通义万相 API 请求失败: %s", e)
            return None
        except Exception as e:
            self._set_error("tongyi_http_error")
            logger.error("图像分析失败: %s", e)
            return None

    def _parse_image_result(self, content: str) -> dict[str, Any]:
        """解析图像分析结果

        Args:
            content: AI 返回的文本内容

        Returns:
            包含 description、tags、emotion 的字典
        """
        return {
            "description": content,
            "tags": [],
            "emotion": self._detect_emotion(content),
        }

    def _detect_emotion(self, text: str) -> str:
        """从文本中检测情感标签

        Args:
            text: 待分析的文本

        Returns:
            情感标签：Happy/Calm/Epic/Romantic
        """
        return detect_emotion_from_text(text)

    def generate_story(
        self,
        prompt: str,
        max_tokens: int = 500,
        temperature: float = 0.7,
    ) -> str | None:
        """文本生成（通义千问）

        Args:
            prompt: 提示词
            max_tokens: 最大 token 数
            temperature: 温度参数

        Returns:
            生成的文本
        """
        if not self.is_configured():
            self._set_error("tongyi_api_key_not_configured")
            logger.warning("DASHSCOPE_API_KEY 未配置，跳过文本生成")
            return None

        url = f"{self.base_url}/chat/completions"

        payload = {
            "model": self.story_model,
            "messages": [
                {
                    "role": "system",
                    "content": "你是一个旅行故事创作助手。",
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(url, json=payload, headers=self._get_headers())
                response.raise_for_status()

                data = response.json()

                if data.get("choices"):
                    self._set_error(None)
                    return data["choices"][0]["message"]["content"]

                self._set_error("tongyi_response_parse_failed")
                return None

        except httpx.HTTPError as e:
            self._set_error("tongyi_http_error")
            logger.error("通义千问 API 请求失败: %s", e)
            return None
        except Exception as e:
            self._set_error("tongyi_http_error")
            logger.error("文本生成失败: %s", e)
            return None

    def generate_event_story(
        self,
        location: str,
        date_range: str,
        photo_descriptions: list[str],
        detailed_location: str = "",
        location_tags: str = "",
    ) -> dict[str, Any] | None:
        """生成事件故事

        Args:
            location: 地点
            date_range: 时间范围
            photo_descriptions: 照片描述列表

        Returns:
            故事生成结果 {title, story, emotion}
        """
        desc_text = "\n".join([f"- {d}" for d in photo_descriptions])

        prompt = f"""请根据以下信息创作旅行故事：

地点：{detailed_location or location}
时间：{date_range}
地点特色：{location_tags or '根据画面判断'}
照片描述：
{desc_text}

要求：
1. 200-300字
2. 贴近真实旅行，包含2-3个具体场景
3. 情感自然流露，不要固定基调
4. 文风细腻、流畅、有画面感

请以 JSON 格式返回：
{{
  "title": "事件标题",
  "full_story": "故事内容",
  "emotion": "情感标签（Joyful/Exciting/Adventurous/Epic/Romantic/Peaceful/Nostalgic/Thoughtful/Melancholic/Solitary）"
}}
"""

        response_text = self.generate_story(prompt, max_tokens=800)

        if not response_text:
            if self.get_last_error_code() is None:
                self._set_error("story_generation_failed")
            return None

        story = parse_story_json_payload(response_text=response_text, location=location)
        if "full_story" not in story and "story" in story:
            story["full_story"] = story["story"]
        if "story" not in story and "full_story" in story:
            story["story"] = story["full_story"]
        self._set_error(None)
        return story


_tongyi_client: Optional[TongyiClient] = None


def get_tongyi_client() -> TongyiClient:
    """获取 TongyiClient 单例"""
    global _tongyi_client
    if _tongyi_client is None:
        _tongyi_client = TongyiClient()
    return _tongyi_client


tongyi_client = get_tongyi_client()
