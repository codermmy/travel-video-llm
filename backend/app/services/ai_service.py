"""AI 服务"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from app.integrations.providers.base import AIProvider, EMOTION_KEYWORDS
from app.integrations.providers.factory import provider_factory
from app.utils.cache import simple_cache

logger = logging.getLogger(__name__)


class AIService:
    """AI 服务

    提供图像分析和故事生成的业务层封装，包含缓存机制。
    """

    def __init__(self, provider: Optional[AIProvider] = None) -> None:
        """初始化 AI 服务"""
        self.client: AIProvider = provider or provider_factory.get_provider()
        self.cache_ttl = 86400  # 缓存 24 小时
        self.last_error_code: Optional[str] = None

    def _provider_name(self) -> str:
        provider_name = getattr(self.client, "provider_name", None)
        if callable(provider_name):
            value = provider_name()
            if isinstance(value, str) and value:
                return value
        return "unknown"

    def _get_provider_error_code(self) -> Optional[str]:
        get_last_error_code = getattr(self.client, "get_last_error_code", None)
        if callable(get_last_error_code):
            code = get_last_error_code()
            if isinstance(code, str) and code:
                return code
        return None

    def _get_cache_key(self, prefix: str, identifier: str) -> str:
        """生成缓存键"""
        return f"ai:{self._provider_name()}:{prefix}:{identifier}"

    def is_configured(self) -> bool:
        return bool(self.client.is_configured())

    def configuration_error_code(self) -> str:
        return self.client.configuration_error_code()

    def provider_name(self) -> str:
        return self._provider_name()

    def current_models(self) -> dict[str, str]:
        return self.client.current_models()

    def generate_event_story(
        self,
        event_id: str,
        location: str,
        start_time: str,
        end_time: str,
        photo_descriptions: list[str],
        detailed_location: str = "",
        location_tags: str = "",
        structured_summary: str = "",
        timeline_clues: Optional[list[str]] = None,
    ) -> dict[str, Any] | None:
        """为事件生成故事"""
        cache_key = self._get_cache_key("story", str(event_id))
        cached = simple_cache(cache_key)
        if isinstance(cached, dict):
            logger.info("从缓存获取事件 %s 的故事", event_id)
            self.last_error_code = None
            return cached

        try:
            start = datetime.fromisoformat(start_time)
            end = datetime.fromisoformat(end_time)
            date_range = f"{start.strftime('%m月%d日')} - {end.strftime('%m月%d日')}"
        except ValueError:
            date_range = start_time

        result = self.client.generate_event_story(
            location=location,
            date_range=date_range,
            photo_descriptions=photo_descriptions,
            detailed_location=detailed_location,
            location_tags=location_tags,
            structured_summary=structured_summary,
            timeline_clues=timeline_clues,
        )

        self.last_error_code = self._get_provider_error_code()

        if result:
            simple_cache(cache_key, result, self.cache_ttl)
            logger.info("事件 %s 故事生成成功并已缓存", event_id)
            self.last_error_code = None

        return result

    def analyze_photo_batch(
        self,
        photo_urls: list[str],
        prompt: str = "请描述这张照片的内容",
    ) -> list[dict[str, Any] | None]:
        """批量分析照片"""
        results: list[dict[str, Any] | None] = []
        latest_error: Optional[str] = None

        for url in photo_urls:
            result = self.client.analyze_image(url, prompt)
            if result is None:
                provider_error = self._get_provider_error_code()
                if provider_error:
                    latest_error = provider_error
            results.append(result)

        self.last_error_code = latest_error
        return results

    def select_photos_for_analysis(
        self,
        photo_urls: list[str],
        photo_count: int,
    ) -> list[str]:
        """选择用于 AI 分析的代表性照片（时间均匀分布）"""
        if not photo_urls:
            return []

        total = min(photo_count, len(photo_urls))
        if total <= 10:
            target_count = total
        elif total <= 20:
            target_count = max(3, int(total * 0.8))
        elif total <= 50:
            target_count = max(3, int(total * 0.5))
        elif total <= 100:
            target_count = max(3, int(total * 0.3))
        else:
            target_count = min(50, total)

        if total <= target_count:
            return photo_urls[:total]

        selected_indices = [0]
        if total > 1:
            selected_indices.append(total - 1)

        remaining = target_count - len(selected_indices)
        if remaining > 0 and total > 2:
            step = (total - 1) / (target_count - 1)
            for i in range(1, target_count - 1):
                idx = int(round(i * step))
                selected_indices.append(min(max(idx, 1), total - 2))

        unique_sorted = sorted(set(selected_indices))
        selected = [photo_urls[idx] for idx in unique_sorted if idx < len(photo_urls)]

        if len(selected) < target_count:
            for idx, url in enumerate(photo_urls[:total]):
                if idx not in unique_sorted:
                    selected.append(url)
                    unique_sorted.append(idx)
                if len(selected) >= target_count:
                    break

        return selected[:target_count]

    def analyze_event_photos(
        self,
        event_id: str,
        photo_urls: list[str],
        location: str,
    ) -> dict[str, Any]:
        """分析事件照片，生成描述和情感标签"""
        cache_key = self._get_cache_key("photo_analysis", str(event_id))
        cached = simple_cache(cache_key)
        if isinstance(cached, dict):
            self.last_error_code = None
            return cached

        selected_urls = self.select_photos_for_analysis(photo_urls, len(photo_urls))
        results = self.analyze_photo_batch(selected_urls)

        descriptions = []
        emotion_scores = {emotion: 0 for emotion in EMOTION_KEYWORDS}

        for result in results:
            if not result:
                continue
            desc = result.get("description", "")
            if desc:
                descriptions.append(str(desc)[:120])

            emotion = result.get("emotion", "Peaceful")
            if emotion in emotion_scores:
                emotion_scores[emotion] += 1

        dominant_emotion = max(emotion_scores.keys(), key=lambda k: emotion_scores[k])

        result = {
            "descriptions": descriptions,
            "emotion": dominant_emotion,
        }

        simple_cache(cache_key, result, self.cache_ttl)

        return result


ai_service = AIService()
