from __future__ import annotations

import json
from typing import Any, Optional, Protocol


EMOTION_KEYWORDS: dict[str, list[str]] = {
    "Joyful": ["开心", "快乐", "笑容", "欢乐", "愉快", "幸福", "喜悦", "欢声笑语", "欢欣"],
    "Exciting": ["兴奋", "激动", "刺激", "跳跃", "欢呼", "热血", "振奋"],
    "Adventurous": ["探险", "挑战", "突破", "新奇", "征服", "冒险", "远行"],
    "Epic": ["壮观", "宏大", "雄伟", "震撼", "气势", "辽阔", "壮丽"],
    "Romantic": ["浪漫", "温馨", "甜蜜", "温柔", "夕阳", "花朵", "柔美"],
    "Peaceful": ["宁静", "安静", "平静", "悠闲", "舒适", "放松", "平和", "恬静"],
    "Nostalgic": ["怀旧", "回忆", "过去", "时光", "岁月", "往事", "旧日"],
    "Thoughtful": ["思考", "沉思", "专注", "观察", "凝望", "遐想"],
    "Melancholic": ["忧伤", "怀念", "感伤", "惆怅", "凄美", "伤感"],
    "Solitary": ["孤寂", "孤单", "寂静", "空旷", "寂寥", "荒凉", "独自"],
}


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
        detailed_location: str = "",
        location_tags: str = "",
    ) -> dict[str, Any] | None: ...

    def generate_story(self, prompt: str, max_tokens: int = 500) -> str | None: ...

    def current_models(self) -> dict[str, str]: ...

    def get_last_error_code(self) -> Optional[str]: ...


def detect_emotion_from_text(text: str) -> str:
    text_lower = text.lower()

    scores: dict[str, int] = {}
    for emotion, keywords in EMOTION_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in text_lower)
        if score > 0:
            scores[emotion] = score

    if not scores:
        return "Peaceful"

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
            normalized = dict(result)
            if "story" not in normalized and "full_story" in normalized:
                normalized["story"] = normalized["full_story"]
            if "full_story" not in normalized and "story" in normalized:
                normalized["full_story"] = normalized["story"]
            return normalized
    except (json.JSONDecodeError, ValueError):
        pass

    summary = response_text[:300] if len(response_text) > 300 else response_text
    return {
        "title": f"{location}之旅",
        "story": summary,
        "full_story": summary,
        "emotion": detect_emotion_from_text(summary),
    }
