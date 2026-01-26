"""AI 服务"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from app.integrations.tongyi import tongyi_client
from app.utils.cache import simple_cache

logger = logging.getLogger(__name__)


class AIService:
    """AI 服务

    提供图像分析和故事生成的业务层封装，包含缓存机制。
    """

    def __init__(self) -> None:
        """初始化 AI 服务"""
        self.client = tongyi_client
        self.cache_ttl = 86400  # 缓存 24 小时

    def _get_cache_key(self, prefix: str, identifier: str) -> str:
        """生成缓存键

        Args:
            prefix: 缓存前缀
            identifier: 唯一标识符

        Returns:
            缓存键
        """
        return f"ai:{prefix}:{identifier}"

    def generate_event_story(
        self,
        event_id: str,
        location: str,
        start_time: str,
        end_time: str,
        photo_descriptions: list[str],
    ) -> dict[str, Any] | None:
        """为事件生成故事

        Args:
            event_id: 事件 ID
            location: 地点
            start_time: 开始时间
            end_time: 结束时间
            photo_descriptions: 照片描述

        Returns:
            生成结果 {title, story, emotion}
        """
        # 检查缓存
        cache_key = self._get_cache_key("story", str(event_id))
        cached = simple_cache(cache_key)
        if isinstance(cached, dict):
            logger.info(f"从缓存获取事件 {event_id} 的故事")
            return cached

        # 格式化时间范围
        try:
            start = datetime.fromisoformat(start_time)
            end = datetime.fromisoformat(end_time)
            date_range = f"{start.strftime('%m月%d日')} - {end.strftime('%m月%d日')}"
        except ValueError:
            date_range = start_time

        # 调用 API
        result = self.client.generate_event_story(
            location=location,
            date_range=date_range,
            photo_descriptions=photo_descriptions,
        )

        if result:
            # 缓存结果
            simple_cache(cache_key, result, self.cache_ttl)
            logger.info(f"事件 {event_id} 故事生成成功并已缓存")

        return result

    def analyze_photo_batch(
        self,
        photo_urls: list[str],
        prompt: str = "请描述这张照片的内容",
    ) -> list[dict[str, Any] | None]:
        """批量分析照片

        Args:
            photo_urls: 照片 URL 列表
            prompt: 提示词

        Returns:
            分析结果列表
        """
        results = []

        for url in photo_urls:
            result = self.client.analyze_image(url, prompt)
            results.append(result)

        return results

    def select_photos_for_analysis(
        self,
        photo_urls: list[str],
        photo_count: int,
    ) -> list[str]:
        """选择用于 AI 分析的代表性照片

        采样策略：
        - 照片数量 >= 10：取第 1、5、10 张
        - 照片数量 < 10：取首、中、尾

        Args:
            photo_urls: 所有照片 URL 列表
            photo_count: 照片总数

        Returns:
            选中的照片 URL 列表
        """
        if not photo_urls:
            return []

        if photo_count >= 10:
            # 取第 1、5、10 张（索引 0, 4, 9）
            indices = [0, 4, 9]
        else:
            # 取首、中、尾
            indices = [0, photo_count // 2, photo_count - 1]

        selected = []
        for idx in indices:
            if idx < len(photo_urls):
                selected.append(photo_urls[idx])

        return list(dict.fromkeys(selected))  # 去重

    def analyze_event_photos(
        self,
        event_id: str,
        photo_urls: list[str],
        location: str,
    ) -> dict[str, Any]:
        """分析事件照片，生成描述和情感标签

        Args:
            event_id: 事件 ID
            photo_urls: 照片 URL 列表
            location: 地点

        Returns:
            分析结果 {descriptions, emotion}
        """
        # 检查缓存
        cache_key = self._get_cache_key("photo_analysis", str(event_id))
        cached = simple_cache(cache_key)
        if isinstance(cached, dict):
            return cached

        # 选择代表性照片
        selected_urls = self.select_photos_for_analysis(photo_urls, len(photo_urls))

        # 批量分析
        results = self.analyze_photo_batch(selected_urls)

        # 提取描述
        descriptions = []
        emotion_scores = {"Happy": 0, "Calm": 0, "Epic": 0, "Romantic": 0}

        for result in results:
            if result:
                desc = result.get("description", "")
                if desc:
                    descriptions.append(desc[:100])  # 截断过长描述

                emotion = result.get("emotion", "Calm")
                if emotion in emotion_scores:
                    emotion_scores[emotion] += 1

        # 确定主导情感
        dominant_emotion = max(emotion_scores.keys(), key=lambda k: emotion_scores[k])

        result = {
            "descriptions": descriptions,
            "emotion": dominant_emotion,
        }

        # 缓存结果
        simple_cache(cache_key, result, self.cache_ttl)

        return result


# 导出服务实例
ai_service = AIService()
