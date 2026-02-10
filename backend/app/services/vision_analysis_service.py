from __future__ import annotations

from typing import Any

from app.services.ai_service import ai_service


class VisionAnalysisService:
    def __init__(self) -> None:
        self.vision_client = ai_service.client

    def analyze_photo(self, photo_url: str) -> dict[str, Any]:
        prompt = """请描述这张照片中真实可见的内容，并给出结构化结果。

返回 JSON，字段包括：
- description: 简要画面描述
- people: 人物信息（若无则返回空对象）
- objects: 主要物体数组
- scene: 场景信息
- environment: 环境信息
- emotion: 情绪标签（Joyful/Exciting/Adventurous/Epic/Romantic/Peaceful/Nostalgic/Thoughtful/Melancholic/Solitary）

不要臆造照片中不存在的内容。"""

        result = self.vision_client.analyze_image(photo_url, prompt)
        if not isinstance(result, dict):
            return {
                "description": "",
                "people": {},
                "objects": [],
                "scene": {},
                "environment": {},
                "emotion": "Thoughtful",
                "error": "vision_empty_result",
            }

        description = str(result.get("description") or "").strip()
        emotion = str(result.get("emotion") or "Thoughtful").strip() or "Thoughtful"

        return {
            "description": description,
            "people": result.get("people")
            if isinstance(result.get("people"), dict)
            else {},
            "objects": result.get("objects")
            if isinstance(result.get("objects"), list)
            else [],
            "scene": result.get("scene")
            if isinstance(result.get("scene"), dict)
            else {},
            "environment": result.get("environment")
            if isinstance(result.get("environment"), dict)
            else {},
            "emotion": emotion,
            "raw": result,
        }

    def analyze_batch(self, photo_urls: list[str]) -> list[dict[str, Any]]:
        return [self.analyze_photo(url) for url in photo_urls]


vision_analysis_service = VisionAnalysisService()
