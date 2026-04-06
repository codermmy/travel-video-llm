from __future__ import annotations

from difflib import SequenceMatcher
import json
import re
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
        structured_summary: str = "",
        timeline_clues: Optional[list[str]] = None,
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


def _normalize_copy_text(text: Any, max_chars: int) -> str:
    cleaned = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(cleaned) <= max_chars:
        return cleaned
    return cleaned[:max_chars].rstrip("，。；、,.!?！？ ").strip()


def _normalize_similarity_text(text: Any) -> str:
    return re.sub(
        r"[\s，。；、,.!?！？:：·\-_~/|]+",
        "",
        str(text or ""),
    ).lower()


def _is_high_overlap(
    candidate: Any,
    baseline: Any,
    *,
    min_ratio: float,
    min_coverage: float,
) -> bool:
    left = _normalize_similarity_text(candidate)
    right = _normalize_similarity_text(baseline)
    if not left or not right:
        return False
    if left == right:
        return True

    shorter, longer = sorted((left, right), key=len)
    if (
        len(shorter) >= 6
        and shorter in longer
        and (len(shorter) / len(longer)) >= min_coverage
    ):
        return True

    return SequenceMatcher(None, left, right).ratio() >= min_ratio


def _simplify_location_label(location: str) -> str:
    source = str(location or "").split("·")[0].split(",")[0].strip()
    if not source:
        return "旅途"
    city_match = re.match(r"^(.+?)(?:市|州|盟|地区)", source)
    if city_match and city_match.group(1):
        return city_match.group(1)
    return source


def _build_default_hero_title(location: str) -> str:
    simplified_location = _simplify_location_label(location)
    return _normalize_copy_text(f"{simplified_location}的回望", 18) or "旅途片刻"


def _build_default_hero_summary(location: str) -> str:
    simplified_location = _simplify_location_label(location)
    if simplified_location and simplified_location != "旅途":
        candidate = f"这一路经过{simplified_location}，也把风景和心绪慢慢收进了回望里。"
    else:
        candidate = "这一程不急着抵达，只让沿途风景把心绪慢慢放轻。"
    return _normalize_copy_text(candidate, 40) or "这段回忆正在慢慢展开。"


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
            if "hero_title" not in normalized and "heroTitle" in normalized:
                normalized["hero_title"] = normalized["heroTitle"]
            if "hero_summary" not in normalized and "heroSummary" in normalized:
                normalized["hero_summary"] = normalized["heroSummary"]
            if "story" not in normalized and "full_story" in normalized:
                normalized["story"] = normalized["full_story"]
            if "full_story" not in normalized and "story" in normalized:
                normalized["full_story"] = normalized["story"]
            story_text = str(
                normalized.get("full_story") or normalized.get("story") or ""
            ).strip()
            title_text = str(normalized.get("title") or "").strip()
            if not str(normalized.get("hero_title") or "").strip() or _is_high_overlap(
                normalized.get("hero_title"),
                title_text,
                min_ratio=0.82,
                min_coverage=0.75,
            ):
                normalized["hero_title"] = _build_default_hero_title(location)
            if not str(normalized.get("hero_summary") or "").strip() or _is_high_overlap(
                normalized.get("hero_summary"),
                story_text,
                min_ratio=0.72,
                min_coverage=0.58,
            ):
                normalized["hero_summary"] = _build_default_hero_summary(location)
            return normalized
    except (json.JSONDecodeError, ValueError):
        pass

    summary = response_text[:300] if len(response_text) > 300 else response_text
    return {
        "title": f"{location}之旅",
        "story": summary,
        "full_story": summary,
        "hero_title": _build_default_hero_title(location),
        "hero_summary": _build_default_hero_summary(location),
        "emotion": detect_emotion_from_text(summary),
    }
