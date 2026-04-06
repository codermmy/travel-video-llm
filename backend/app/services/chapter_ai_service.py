from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Optional

from app.models.event import Event
from app.models.photo import Photo
from app.services.ai_service import ai_service
from app.services.story_signal_service import (
    CHAPTER_STORY_MAX_CHARS,
    aggregate_story_signals,
    normalize_story_output_text,
)


@dataclass
class ChapterStoryResult:
    chapter_title: str
    chapter_story: str
    slideshow_caption: str


def _fallback_chapter_result(
    chapter_index: int, total_chapters: int
) -> ChapterStoryResult:
    return ChapterStoryResult(
        chapter_title=f"第{chapter_index}章",
        chapter_story="这一段旅途被轻轻收进画面里，风景和情绪都停在这里。",
        slideshow_caption=f"第{chapter_index}/{total_chapters}章",
    )


def _normalize_chapter_story_text(text: str) -> str:
    return normalize_story_output_text(text, CHAPTER_STORY_MAX_CHARS)


def _normalize_chapter_title_text(text: str) -> str:
    return normalize_story_output_text(text, 20)


def _normalize_slideshow_caption_text(text: str) -> str:
    return normalize_story_output_text(text, 20)


def generate_chapter_story(
    *,
    event: Event,
    chapter_index: int,
    total_chapters: int,
    chapter_photos: list[Photo],
    detailed_location: str,
    location_tags: str,
    narrative_boost: str = "",
) -> Optional[ChapterStoryResult]:
    if not chapter_photos:
        return None

    chapter_signals = aggregate_story_signals(chapter_photos)
    photo_descriptions = [
        str(item)
        for item in chapter_signals.get("photo_descriptions", [])
        if isinstance(item, str) and item.strip()
    ]
    if not photo_descriptions:
        photo_descriptions = [f"照片{idx + 1}" for idx in range(len(chapter_photos))]

    start_time = chapter_photos[0].shoot_time
    end_time = chapter_photos[-1].shoot_time
    if start_time and end_time:
        time_range = f"{start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}"
    else:
        time_range = "该阶段"

    prompt = f"""你是一位旅行写作者，请写一个章节故事。

地点：{detailed_location or event.location_name or "未知地点"}
地点特色：{location_tags or "旅行片段"}
章节：第 {chapter_index} / {total_chapters} 章
时间段：{time_range}
结构化摘要：
{chapter_signals.get("structured_summary") or "暂无结构化线索"}
时间线索：
{chr(10).join(chapter_signals.get("timeline_clues", [])[:8]) or "暂无"}
场景关键词：{"；".join(photo_descriptions[:15])}
增强线索：
{narrative_boost or "暂无增强线索"}

要求：
1. chapter_title：20字以内
2. chapter_story：约50字，最多不超过60字，写成章节总览片段
3. slideshow_caption：1-2句话，不超过20字
4. 重点写这一章最明确的场景、行为和情绪，不要展开成长段落
5. 输入中可能存在 OCR、英文字母、数字、原始坐标、碎片化或低关联脏数据；对难以理解、无法自然连接、没有叙事价值的信息可以直接忽略
6. 不要把经纬度、坐标串或原始地点噪声直接写进 chapter_title、chapter_story、slideshow_caption
7. 优先使用重复出现或相互印证的线索，不要强行使用所有输入
8. 如果存在增强线索，只能把它当作章节语气和细节参考，不能编造当前章节未出现的内容

仅返回 JSON：
{{
  "chapter_title": "...",
  "chapter_story": "...",
  "slideshow_caption": "..."
}}
"""

    response_text = ai_service.client.generate_story(prompt, max_tokens=300)
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

        title = _normalize_chapter_title_text(
            str(payload.get("chapter_title") or f"第{chapter_index}章")
        )
        story = _normalize_chapter_story_text(str(payload.get("chapter_story") or ""))
        caption = _normalize_slideshow_caption_text(
            str(
                payload.get("slideshow_caption")
                or f"第{chapter_index}/{total_chapters}章"
            )
        )
        if not title:
            title = f"第{chapter_index}章"
        if not caption:
            caption = f"第{chapter_index}/{total_chapters}章"

        if not story:
            return _fallback_chapter_result(chapter_index, total_chapters)

        return ChapterStoryResult(
            chapter_title=title,
            chapter_story=story,
            slideshow_caption=caption,
        )
    except Exception:
        return _fallback_chapter_result(chapter_index, total_chapters)
