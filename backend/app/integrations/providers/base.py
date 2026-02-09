from __future__ import annotations

import json
from typing import Any, Optional, Protocol


class AIProvider(Protocol):
    def provider_name(self) -> str: ...

    def is_configured(self) -> bool: ...

    def configuration_error_code(self) -> str: ...

    def analyze_image(
        self,
        image_url: str,
        prompt: str = "请描述这张照片的内容，包括场景、物体、情感基调。",
    ) -> dict[str, Any] | None: ...

    def generate_event_story(
        self,
        location: str,
        date_range: str,
        photo_descriptions: list[str],
    ) -> dict[str, Any] | None: ...

    def current_models(self) -> dict[str, str]: ...

    def get_last_error_code(self) -> Optional[str]: ...


def detect_emotion_from_text(text: str) -> str:
    text_lower = text.lower()

    emotion_keywords = {
        "Happy": ["开心", "快乐", "笑容", "欢笑", "欢乐", "愉快", "幸福", "喜悦"],
        "Calm": ["宁静", "安静", "平静", "悠闲", "舒适", "放松", "平和", "恬静"],
        "Epic": ["壮观", "宏大", "雄伟", "震撼", "气势", "宏伟", "辽阔", "壮丽"],
        "Romantic": ["浪漫", "温馨", "甜蜜", "温柔", "夕阳", "花朵", "美丽", "柔美"],
    }

    scores: dict[str, int] = {}
    for emotion, keywords in emotion_keywords.items():
        score = sum(1 for kw in keywords if kw in text_lower)
        if score > 0:
            scores[emotion] = score

    if not scores:
        return "Calm"

    return max(scores, key=scores.get)


def parse_story_json_payload(response_text: str, location: str) -> dict[str, Any]:
    try:
        json_str: str
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
        if isinstance(result, dict):
            return result
    except (json.JSONDecodeError, ValueError):
        pass

    return {
        "title": f"{location}之旅",
        "story": response_text[:200] if len(response_text) > 200 else response_text,
        "emotion": "Calm",
    }
