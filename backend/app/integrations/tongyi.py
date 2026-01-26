"""通义千问/万相 API 集成"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

import httpx

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
    ) -> None:
        """初始化客户端

        Args:
            api_key: DashScope API Key，为 None 时从环境变量读取
            base_url: API 基础 URL
            timeout: 请求超时时间（秒）
        """
        import os

        self.api_key = api_key or os.getenv("DASHSCOPE_API_KEY", "")
        self.base_url = base_url
        self.timeout = timeout

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
            logger.warning("DASHSCOPE_API_KEY 未配置，跳过图像分析")
            return None

        url = f"{self.base_url}/chat/completions"

        payload = {
            "model": "qwen-vl-max",
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
                    return self._parse_image_result(content)

                return None

        except httpx.HTTPError as e:
            logger.error(f"通义万相 API 请求失败: {e}")
            return None
        except Exception as e:
            logger.error(f"图像分析失败: {e}")
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
        text_lower = text.lower()

        # 关键词匹配
        emotion_keywords = {
            "Happy": ["开心", "快乐", "笑容", "欢笑", "欢乐", "愉快", "幸福", "喜悦"],
            "Calm": ["宁静", "安静", "平静", "悠闲", "舒适", "放松", "平和", "恬静"],
            "Epic": ["壮观", "宏大", "雄伟", "震撼", "气势", "宏伟", "辽阔", "壮丽"],
            "Romantic": [
                "浪漫",
                "温馨",
                "甜蜜",
                "温柔",
                "夕阳",
                "花朵",
                "美丽",
                "柔美",
            ],
        }

        scores = {}
        for emotion, keywords in emotion_keywords.items():
            score = sum(1 for kw in keywords if kw in text_lower)
            if score > 0:
                scores[emotion] = score

        if not scores:
            return "Calm"  # 默认

        return max(scores.keys(), key=lambda k: scores[k])

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
            logger.warning("DASHSCOPE_API_KEY 未配置，跳过文本生成")
            return None

        url = f"{self.base_url}/chat/completions"

        payload = {
            "model": "qwen-plus",
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
                    return data["choices"][0]["message"]["content"]

                return None

        except httpx.HTTPError as e:
            logger.error(f"通义千问 API 请求失败: {e}")
            return None
        except Exception as e:
            logger.error(f"文本生成失败: {e}")
            return None

    def generate_event_story(
        self,
        location: str,
        date_range: str,
        photo_descriptions: list[str],
    ) -> dict[str, Any] | None:
        """生成事件故事

        Args:
            location: 地点
            date_range: 时间范围
            photo_descriptions: 照片描述列表

        Returns:
            故事生成结果 {title, story, emotion}
        """
        # 构建提示词
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
  "title": "事件标题",
  "story": "故事内容",
  "emotion": "情感标签（Happy/Calm/Epic/Romantic）"
}}
"""

        response_text = self.generate_story(prompt, max_tokens=800)

        if not response_text:
            return None

        # 尝试解析 JSON
        try:
            # 提取 JSON 部分
            if "```json" in response_text:
                json_start = response_text.index("```json") + 7
                json_end = response_text.index("```", json_start)
                json_str = response_text[json_start:json_end].strip()
            elif "{" in response_text:
                json_start = response_text.index("{")
                json_end = response_text.rindex("}") + 1
                json_str = response_text[json_start:json_end]
            else:
                raise ValueError("No JSON found")

            result = json.loads(json_str)
            return result

        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(f"JSON 解析失败: {e}")

        # 解析失败，返回默认格式
        return {
            "title": f"{location}之旅",
            "story": response_text[:200] if len(response_text) > 200 else response_text,
            "emotion": "Calm",
        }


# 导出单例
_tongyi_client: Optional[TongyiClient] = None


def get_tongyi_client() -> TongyiClient:
    """获取 TongyiClient 单例"""
    global _tongyi_client
    if _tongyi_client is None:
        _tongyi_client = TongyiClient()
    return _tongyi_client


tongyi_client = get_tongyi_client()
