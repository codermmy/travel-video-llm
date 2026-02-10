from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Optional

from app.models.event import Event
from app.models.photo import Photo
from app.services.ai_service import ai_service


@dataclass
class ChapterStoryResult:
    chapter_title: str
    chapter_story: str
    slideshow_caption: str


def _fallback_chapter_result(chapter_index: int, total_chapters: int) -> ChapterStoryResult:
    return ChapterStoryResult(
        chapter_title=f"第{chapter_index}章",
        chapter_story="这一段旅途留下了细碎而珍贵的片段，风景与情绪都在镜头中慢慢沉淀。",
        slideshow_caption=f"第{chapter_index}/{total_chapters}章",
    )


def generate_chapter_story(
    *,
    event: Event,
    chapter_index: int,
    total_chapters: int,
    chapter_photos: list[Photo],
    detailed_location: str,
    location_tags: str,
) -> Optional[ChapterStoryResult]:
    if not chapter_photos:
        return None

    photo_descriptions = [p.caption for p in chapter_photos if p.caption]
    if not photo_descriptions:
        photo_descriptions = [f"照片{idx + 1}" for idx in range(len(chapter_photos))]

    start_time = chapter_photos[0].shoot_time
    end_time = chapter_photos[-1].shoot_time
    if start_time and end_time:
        time_range = f"{start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}"
    else:
        time_range = "该阶段"

    prompt = f"""你是一位旅行写作者，请写一个章节故事。

地点：{detailed_location or event.location_name or '未知地点'}
地点特色：{location_tags or '旅行片段'}
章节：第 {chapter_index} / {total_chapters} 章
时间段：{time_range}
场景关键词：{'；'.join(photo_descriptions[:15])}

要求：
1. chapter_title：20字以内
2. chapter_story：80-120字
3. slideshow_caption：1-2句话，不超过20字
4. 保持与整段旅途叙事连贯

仅返回 JSON：
{{
  "chapter_title": "...",
  "chapter_story": "...",
  "slideshow_caption": "..."
}}
"""

    response_text = ai_service.client.generate_story(prompt, max_tokens=500)
    if not response_text:
        return _fallback_chapter_result(chapter_index, total_chapters)

    try:
        json_str = response_text
        if "```json" in response_text:
            start = response_text.index("```json") + 7
            end = response_text.index("```", start)
            json_str = response_text[start:end].strip()
        elif "{" in response_text:
            start = response_text.index("{")
            end = response_text.rindex("}") + 1
            json_str = response_text[start:end]

        payload = json.loads(json_str)
        if not isinstance(payload, dict):
            return _fallback_chapter_result(chapter_index, total_chapters)

        title = str(payload.get("chapter_title") or f"第{chapter_index}章").strip()[:20]
        story = str(payload.get("chapter_story") or "").strip()[:180]
        caption = str(payload.get("slideshow_caption") or f"第{chapter_index}/{total_chapters}章").strip()[:20]

        if not story:
            return _fallback_chapter_result(chapter_index, total_chapters)

        return ChapterStoryResult(
            chapter_title=title,
            chapter_story=story,
            slideshow_caption=caption,
        )
    except Exception:
        return _fallback_chapter_result(chapter_index, total_chapters)
