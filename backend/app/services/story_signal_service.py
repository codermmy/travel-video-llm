from __future__ import annotations

import json
from collections import Counter
from typing import Any

from app.models.photo import Photo


def sample_story_items(items: list[str], max_items: int) -> list[str]:
    if max_items <= 0 or len(items) <= max_items:
        return items

    if max_items == 1:
        return [items[0]]

    step = (len(items) - 1) / (max_items - 1)
    sampled_indices = sorted({min(len(items) - 1, round(index * step)) for index in range(max_items)})
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
    segments: list[str] = []

    scene_category = str(signal.get("scene_category") or "").strip()
    if scene_category:
        segments.append(f"场景:{scene_category}")

    activity_hint = str(signal.get("activity_hint") or "").strip()
    if activity_hint:
        segments.append(f"活动:{activity_hint}")

    landmark_hint = str(signal.get("landmark_hint") or "").strip()
    if landmark_hint:
        segments.append(f"地标:{landmark_hint}")

    emotion_hint = str(signal.get("emotion_hint") or photo.emotion_tag or "").strip()
    if emotion_hint:
        segments.append(f"情绪:{emotion_hint}")

    object_tags = signal.get("object_tags")
    if isinstance(object_tags, list):
        tags = [str(tag).strip() for tag in object_tags if str(tag).strip()]
        if tags:
            segments.append(f"元素:{'、'.join(tags[:4])}")

    ocr_text = str(signal.get("ocr_text") or "").strip().replace("\n", " ")
    if ocr_text:
        segments.append(f"文字:{ocr_text[:20]}")

    description = str(signal.get("description") or "").strip()
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
        result["emotion"] = (
            str(signal.get("emotion_hint") or photo.emotion_tag or "Peaceful").strip()
        )
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

    for index, photo in enumerate(photos, start=1):
        signal = load_photo_story_signal(photo)
        scene = str(signal.get("scene_category") or "").strip()
        activity = str(signal.get("activity_hint") or "").strip()
        emotion = str(signal.get("emotion_hint") or photo.emotion_tag or "").strip()
        landmark = str(signal.get("landmark_hint") or "").strip()
        ocr_text = str(signal.get("ocr_text") or "").strip().replace("\n", " ")

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

        object_tags = signal.get("object_tags")
        if isinstance(object_tags, list):
            for tag in object_tags:
                value = str(tag).strip()
                if value:
                    object_counter[value] += 1

        seed = build_photo_story_seed(photo)
        if seed:
            photo_descriptions.append(seed)

        time_label = photo.shoot_time.strftime("%H:%M") if photo.shoot_time else f"片段{index}"
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
        summary_parts.append(
            "关键元素:" + "、".join(item for item, _ in object_counter.most_common(6))
        )
    if ocr_snippets:
        summary_parts.append("可见文字:" + "、".join(ocr_snippets[:3]))

    return {
        "photo_descriptions": photo_descriptions,
        "timeline_clues": timeline_clues,
        "structured_summary": "\n".join(summary_parts) or "暂无结构化旅行线索",
        "dominant_emotion": emotion_counter.most_common(1)[0][0] if emotion_counter else None,
        "scene_categories": [item for item, _ in scene_counter.most_common(5)],
        "activity_hints": [item for item, _ in activity_counter.most_common(5)],
        "landmark_hints": [item for item, _ in landmark_counter.most_common(3)],
        "ocr_snippets": ocr_snippets[:5],
    }
