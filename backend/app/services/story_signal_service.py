from __future__ import annotations

import json
import re
from collections import Counter
from typing import Any

from app.models.photo import Photo

EVENT_TITLE_MAX_CHARS = 16
EVENT_STORY_MAX_CHARS = 140
CHAPTER_STORY_MAX_CHARS = 60
HERO_TITLE_MAX_CHARS = 18
HERO_SUMMARY_MAX_CHARS = 40
MIN_SIGNAL_CONFIDENCE = 0.45
LOW_QUALITY_OCR_FLAGS = {
    "blurred",
    "motion_blur",
    "low_light",
    "overexposed",
    "underexposed",
}
COORDINATE_INLINE_PATTERN = re.compile(
    r"-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?"
)
ASCII_TOKEN_PATTERN = re.compile(r"\b[A-Za-z0-9][A-Za-z0-9_-]{0,20}\b")
DESCRIPTION_SPLIT_PATTERN = re.compile(r"[|/；;]+")


def _strip_coordinate_text(text: str) -> str:
    cleaned = COORDINATE_INLINE_PATTERN.sub(" ", text or "")
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])", "", cleaned)
    cleaned = re.sub(r"\s*([，。；、,;!?！？])\s*", r"\1", cleaned)
    cleaned = re.sub(r"[，。；、,;!?！？]{2,}", "，", cleaned)
    return cleaned.strip()


def normalize_story_output_text(text: str, max_chars: int) -> str:
    cleaned = re.sub(r"\s+", " ", _strip_coordinate_text(text or "")).strip()
    if len(cleaned) <= max_chars:
        return cleaned

    truncated = cleaned[:max_chars].rstrip("，。；、,.!?！？ ")
    if not truncated:
        return cleaned[:max_chars].strip()
    return truncated


def _normalize_signal_text(value: Any) -> str:
    raw = str(value or "").replace("\n", " ")
    return re.sub(r"\s+", " ", _strip_coordinate_text(raw)).strip()


def _contains_cjk(text: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", text))


def _is_numeric_or_symbol_noise(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return True
    if re.fullmatch(r"[\d\W_]+", stripped):
        return True
    return False


def _looks_like_low_value_ascii_fragment(text: str) -> bool:
    stripped = text.strip(" -_/|,.，。；：:·")
    if not stripped:
        return True
    if _contains_cjk(stripped):
        return False
    if re.fullmatch(r"\d+", stripped):
        return True

    words = re.findall(r"[A-Za-z]+", stripped)
    if not words:
        return True
    if len(words) == 1 and len(words[0]) <= 5:
        return True
    if len(stripped) <= 4:
        return True
    return False


def _confidence_allows(signal: dict[str, Any], field: str) -> bool:
    confidence_map = signal.get("confidence_map")
    if not isinstance(confidence_map, dict):
        return True

    raw = confidence_map.get(field)
    if raw is None:
        return True

    try:
        return float(raw) >= MIN_SIGNAL_CONFIDENCE
    except (TypeError, ValueError):
        return True


def _normalize_story_keyword(
    value: Any,
    *,
    max_len: int = 16,
    allow_ascii_phrase: bool = False,
) -> str:
    text = _normalize_signal_text(value)
    if not text or _is_numeric_or_symbol_noise(text):
        return ""
    if (
        not _contains_cjk(text)
        and not allow_ascii_phrase
        and _looks_like_low_value_ascii_fragment(text)
    ):
        return ""
    return text[:max_len]


def _normalize_story_description_fragment(text: str) -> str:
    cleaned = _normalize_signal_text(text)
    if not cleaned or _is_numeric_or_symbol_noise(cleaned):
        return ""

    cleaned = ASCII_TOKEN_PATTERN.sub(" ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -_/|,.，。；：:·")
    if not cleaned or _is_numeric_or_symbol_noise(cleaned):
        return ""
    if not _contains_cjk(cleaned):
        return ""
    return cleaned[:24]


def _normalize_story_description(value: Any) -> str:
    text = _normalize_signal_text(value)
    if not text or _is_numeric_or_symbol_noise(text):
        return ""

    if not _contains_cjk(text):
        return ""

    parts = [
        _normalize_story_description_fragment(part)
        for part in DESCRIPTION_SPLIT_PATTERN.split(text)
    ]
    normalized_parts: list[str] = []
    seen: set[str] = set()
    for part in parts:
        if not part or part in seen:
            continue
        seen.add(part)
        normalized_parts.append(part)
        if len(normalized_parts) >= 4:
            break

    if normalized_parts:
        return "；".join(normalized_parts)[:100]

    return _normalize_story_description_fragment(text)[:100]


def _normalize_ocr_candidate(value: Any) -> str:
    text = _normalize_signal_text(value)
    if not text:
        return ""
    return text[:24]


def _normalize_story_ocr_text(
    value: Any,
    *,
    support_count: int = 1,
    quality_flags: list[str] | None = None,
) -> str:
    text = _normalize_ocr_candidate(value)
    if not text or _is_numeric_or_symbol_noise(text):
        return ""

    flags = {
        str(flag).strip().lower() for flag in (quality_flags or []) if str(flag).strip()
    }
    if flags & LOW_QUALITY_OCR_FLAGS:
        return ""

    if _contains_cjk(text):
        return text[:20]

    if support_count < 2:
        return ""
    if _looks_like_low_value_ascii_fragment(text):
        return ""
    return text[:20]


def sanitize_story_signal(
    signal: dict[str, Any],
    *,
    emotion_fallback: str = "",
    ocr_support_counts: Counter[str] | None = None,
) -> dict[str, Any]:
    image_quality_flags = signal.get("image_quality_flags")
    quality_flags = (
        [str(flag) for flag in image_quality_flags if str(flag).strip()]
        if isinstance(image_quality_flags, list)
        else []
    )

    scene_category = (
        _normalize_story_keyword(signal.get("scene_category"), allow_ascii_phrase=True)
        if _confidence_allows(signal, "scene_category")
        else ""
    )
    activity_hint = (
        _normalize_story_keyword(signal.get("activity_hint"), allow_ascii_phrase=True)
        if _confidence_allows(signal, "activity_hint")
        else ""
    )
    landmark_hint = (
        _normalize_story_keyword(signal.get("landmark_hint"), allow_ascii_phrase=True)
        if _confidence_allows(signal, "landmark_hint")
        else ""
    )
    emotion_hint = _normalize_story_keyword(
        signal.get("emotion_hint") or emotion_fallback
    )

    object_tags_raw = signal.get("object_tags")
    object_tags: list[str] = []
    if isinstance(object_tags_raw, list):
        seen: set[str] = set()
        for tag in object_tags_raw:
            value = _normalize_story_keyword(tag)
            if not value or value in seen:
                continue
            seen.add(value)
            object_tags.append(value)
            if len(object_tags) >= 4:
                break

    ocr_candidate = _normalize_ocr_candidate(signal.get("ocr_text"))
    ocr_text = _normalize_story_ocr_text(
        ocr_candidate,
        support_count=(ocr_support_counts or {}).get(ocr_candidate, 1),
        quality_flags=quality_flags,
    )

    description = _normalize_story_description(signal.get("description"))

    return {
        "scene_category": scene_category,
        "activity_hint": activity_hint,
        "landmark_hint": landmark_hint,
        "emotion_hint": emotion_hint,
        "object_tags": object_tags,
        "ocr_text": ocr_text,
        "description": description,
    }


def build_visual_desc_from_signal(
    signal: dict[str, Any],
    *,
    emotion_tag: str | None = None,
) -> str | None:
    sanitized = sanitize_story_signal(signal, emotion_fallback=str(emotion_tag or ""))
    parts: list[str] = []
    if sanitized["scene_category"]:
        parts.append(str(sanitized["scene_category"]))
    if sanitized["activity_hint"]:
        parts.append(str(sanitized["activity_hint"]))
    if sanitized["object_tags"]:
        parts.append(" / ".join(str(item) for item in sanitized["object_tags"][:3]))
    if sanitized["ocr_text"]:
        parts.append(str(sanitized["ocr_text"]))

    if not parts:
        return None
    return " | ".join(parts)


def sample_story_items(items: list[str], max_items: int) -> list[str]:
    if max_items <= 0 or len(items) <= max_items:
        return items

    if max_items == 1:
        return [items[0]]

    step = (len(items) - 1) / (max_items - 1)
    sampled_indices = sorted(
        {min(len(items) - 1, round(index * step)) for index in range(max_items)}
    )
    return [items[index] for index in sampled_indices]


def load_photo_story_signal(photo: Photo) -> dict[str, Any]:
    if isinstance(photo.vision_result, dict):
        return dict(photo.vision_result)

    raw = photo.visual_desc
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            text = raw.strip()
            if text:
                result: dict[str, Any] = {"description": text}
                emotion = str(photo.emotion_tag or "").strip()
                if emotion:
                    result["emotion_hint"] = emotion
                return result
    return {}


def build_photo_story_seed(photo: Photo) -> str:
    signal = load_photo_story_signal(photo)
    sanitized = sanitize_story_signal(
        signal, emotion_fallback=str(photo.emotion_tag or "")
    )
    segments: list[str] = []

    scene_category = str(sanitized.get("scene_category") or "").strip()
    if scene_category:
        segments.append(f"场景:{scene_category}")

    activity_hint = str(sanitized.get("activity_hint") or "").strip()
    if activity_hint:
        segments.append(f"活动:{activity_hint}")

    landmark_hint = str(sanitized.get("landmark_hint") or "").strip()
    if landmark_hint:
        segments.append(f"地标:{landmark_hint}")

    emotion_hint = str(sanitized.get("emotion_hint") or "").strip()
    if emotion_hint:
        segments.append(f"情绪:{emotion_hint}")

    object_tags = sanitized.get("object_tags")
    if isinstance(object_tags, list):
        tags = [str(tag).strip() for tag in object_tags if str(tag).strip()]
        if tags:
            segments.append(f"元素:{'、'.join(tags[:4])}")

    ocr_text = str(sanitized.get("ocr_text") or "").strip()
    if ocr_text:
        segments.append(f"文字:{ocr_text[:20]}")

    description = str(sanitized.get("description") or "").strip()
    if not segments and description:
        return description[:100]

    if not segments and photo.caption:
        return photo.caption.strip()[:100]

    return "；".join(segments)[:100]


def build_photo_analysis_for_micro_story(photo: Photo) -> dict[str, Any]:
    signal = load_photo_story_signal(photo)
    result: dict[str, Any] = dict(signal)
    if "description" not in result or not str(result.get("description") or "").strip():
        result["description"] = build_photo_story_seed(photo) or "旅途中的一个片段"
    if "emotion" not in result or not str(result.get("emotion") or "").strip():
        result["emotion"] = str(
            signal.get("emotion_hint") or photo.emotion_tag or "Peaceful"
        ).strip()
    return result


def aggregate_story_signals(photos: list[Photo]) -> dict[str, Any]:
    scene_counter: Counter[str] = Counter()
    activity_counter: Counter[str] = Counter()
    emotion_counter: Counter[str] = Counter()
    landmark_counter: Counter[str] = Counter()
    object_counter: Counter[str] = Counter()
    ocr_snippets: list[str] = []
    timeline_clues: list[str] = []
    photo_descriptions: list[str] = []

    ocr_support_counts: Counter[str] = Counter()
    for photo in photos:
        signal = load_photo_story_signal(photo)
        candidate = _normalize_ocr_candidate(signal.get("ocr_text"))
        if candidate:
            ocr_support_counts[candidate] += 1

    for index, photo in enumerate(photos, start=1):
        signal = load_photo_story_signal(photo)
        sanitized = sanitize_story_signal(
            signal,
            emotion_fallback=str(photo.emotion_tag or ""),
            ocr_support_counts=ocr_support_counts,
        )
        scene = str(sanitized.get("scene_category") or "").strip()
        activity = str(sanitized.get("activity_hint") or "").strip()
        emotion = str(sanitized.get("emotion_hint") or "").strip()
        landmark = str(sanitized.get("landmark_hint") or "").strip()
        ocr_text = str(sanitized.get("ocr_text") or "").strip()

        if scene:
            scene_counter[scene] += 1
        if activity:
            activity_counter[activity] += 1
        if emotion:
            emotion_counter[emotion] += 1
        if landmark:
            landmark_counter[landmark] += 1
        if ocr_text:
            ocr_snippets.append(ocr_text[:20])

        object_tags = sanitized.get("object_tags")
        if isinstance(object_tags, list):
            for tag in object_tags:
                value = str(tag).strip()
                if value:
                    object_counter[value] += 1

        seed = build_photo_story_seed(photo)
        if seed:
            photo_descriptions.append(seed)

        time_label = (
            photo.shoot_time.strftime("%H:%M") if photo.shoot_time else f"片段{index}"
        )
        clue = seed or f"照片{index}"
        timeline_clues.append(f"{time_label} {clue}")

    summary_parts: list[str] = []
    if scene_counter:
        summary_parts.append(
            "主要场景:" + "、".join(item for item, _ in scene_counter.most_common(3))
        )
    if activity_counter:
        summary_parts.append(
            "活动线索:" + "、".join(item for item, _ in activity_counter.most_common(3))
        )
    if emotion_counter:
        summary_parts.append(
            "情绪线索:" + "、".join(item for item, _ in emotion_counter.most_common(3))
        )
    if landmark_counter:
        summary_parts.append(
            "地标线索:" + "、".join(item for item, _ in landmark_counter.most_common(2))
        )
    if object_counter:
        repeated_objects = [
            item for item, count in object_counter.most_common(6) if count >= 2
        ]
        if not repeated_objects and not summary_parts:
            repeated_objects = [item for item, _ in object_counter.most_common(4)]
        if repeated_objects:
            summary_parts.append("关键元素:" + "、".join(repeated_objects))
    if ocr_snippets:
        summary_parts.append("可见文字:" + "、".join(ocr_snippets[:3]))

    return {
        "photo_descriptions": photo_descriptions,
        "timeline_clues": timeline_clues,
        "structured_summary": "\n".join(summary_parts) or "暂无结构化旅行线索",
        "dominant_emotion": emotion_counter.most_common(1)[0][0]
        if emotion_counter
        else None,
        "scene_categories": [item for item, _ in scene_counter.most_common(5)],
        "activity_hints": [item for item, _ in activity_counter.most_common(5)],
        "landmark_hints": [item for item, _ in landmark_counter.most_common(3)],
        "ocr_snippets": ocr_snippets[:5],
    }
