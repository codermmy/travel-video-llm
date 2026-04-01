from __future__ import annotations

import json
from collections import Counter
from typing import Any

from sqlalchemy.orm import Session

from app.models.chapter import EventChapter
from app.models.photo import Photo
from app.models.photo_group import PhotoGroup
from app.services.micro_story_service import micro_story_service
from app.services.story_signal_service import (
    build_photo_analysis_for_micro_story,
    build_photo_story_seed,
    load_photo_story_signal,
)


class PhotoGroupService:
    @staticmethod
    def _split_counts(photo_count: int) -> list[int]:
        if photo_count <= 0:
            return []
        if photo_count <= 5:
            return [photo_count]

        target_group_count = 4 if photo_count >= 12 else 3
        target_group_count = min(target_group_count, max(1, photo_count // 2))

        counts = [2 for _ in range(target_group_count)]
        remaining = photo_count - sum(counts)
        idx = 0
        while remaining > 0:
            if counts[idx] < 5:
                counts[idx] += 1
                remaining -= 1
            idx = (idx + 1) % target_group_count
        return counts

    @classmethod
    def divide_into_groups(cls, photo_count: int) -> list[dict[str, int]]:
        counts = cls._split_counts(photo_count)
        groups: list[dict[str, int]] = []
        start = 0
        for idx, count in enumerate(counts, start=1):
            end = start + count - 1
            groups.append(
                {
                    "group_index": idx,
                    "photo_start_index": start,
                    "photo_end_index": end,
                    "photo_count": count,
                }
            )
            start = end + 1
        return groups

    @staticmethod
    def _derive_group_theme(
        group_analyses: list[dict[str, Any]], group_index: int
    ) -> str:
        descriptions = [str(item.get("description") or "").strip() for item in group_analyses]
        descriptions = [d for d in descriptions if d]
        if not descriptions:
            return f"片段 {group_index}"
        return descriptions[0][:15]

    @staticmethod
    def _derive_group_emotion(group_analyses: list[dict[str, Any]]) -> str:
        emotions = [
            str(item.get("emotion") or "Thoughtful").strip() for item in group_analyses
        ]
        if not emotions:
            return "Thoughtful"
        return Counter(emotions).most_common(1)[0][0]

    def create_for_chapter(
        self,
        db: Session,
        *,
        user_id: str,
        event_id: str,
        chapter: EventChapter,
        chapter_photos: list[Photo],
        chapter_start_index: int,
        chapter_index: int,
        total_chapters: int,
    ) -> dict[str, str]:
        group_specs = self.divide_into_groups(len(chapter_photos))
        group_summaries: list[dict[str, str]] = []

        for group_spec in group_specs:
            local_start = group_spec["photo_start_index"]
            local_end = group_spec["photo_end_index"]
            group_index = group_spec["group_index"]
            photos = chapter_photos[local_start : local_end + 1]

            analyses: list[dict[str, Any]] = []
            for offset, photo in enumerate(photos):
                photo.photo_index = chapter_start_index + local_start + offset
                analysis = build_photo_analysis_for_micro_story(photo)
                signal = load_photo_story_signal(photo)
                if not photo.visual_desc and signal:
                    photo.visual_desc = json.dumps(signal, ensure_ascii=False)
                photo.emotion_tag = str(
                    signal.get("emotion_hint")
                    or analysis.get("emotion")
                    or photo.emotion_tag
                    or "Thoughtful"
                )
                analyses.append(analysis)

            group_theme = self._derive_group_theme(analyses, group_index)
            group_emotion = self._derive_group_emotion(analyses)
            group_scene_desc = json.dumps(
                {
                    "descriptions": [
                        item.get("description")
                        for item in analyses
                        if item.get("description")
                    ],
                    "emotion": group_emotion,
                },
                ensure_ascii=False,
            )

            group_context = {
                "group_theme": group_theme,
                "group_emotion": group_emotion,
            }
            for idx, photo in enumerate(photos):
                analysis = (
                    analyses[idx]
                    if idx < len(analyses)
                    else {"description": build_photo_story_seed(photo)}
                )
                photo.micro_story = micro_story_service.generate_micro_story(
                    photo_analysis=analysis,
                    group_context=group_context,
                    photo_index_in_group=idx,
                )

            db.add(
                PhotoGroup(
                    user_id=user_id,
                    event_id=event_id,
                    chapter_id=chapter.id,
                    group_index=group_index,
                    group_theme=group_theme,
                    group_emotion=group_emotion,
                    group_scene_desc=group_scene_desc,
                    photo_start_index=chapter_start_index + local_start,
                    photo_end_index=chapter_start_index + local_end,
                )
            )

            group_summaries.append({"theme": group_theme, "emotion": group_emotion})

        return micro_story_service.generate_chapter_intro_summary(
            chapter_index=chapter_index,
            total_chapters=total_chapters,
            groups=group_summaries,
        )


photo_group_service = PhotoGroupService()
