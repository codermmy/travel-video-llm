from __future__ import annotations

from datetime import datetime, timezone

from app.models.photo import Photo
from app.services.story_signal_service import (
    aggregate_story_signals,
    normalize_story_output_text,
)


def test_aggregate_story_signals_filters_coordinate_noise_from_description() -> None:
    photos = [
        Photo(
            user_id="user-1",
            file_hash=f"{index + 1:064x}",
            shoot_time=datetime(2024, 6, 2, 9, index * 5, 0, tzinfo=timezone.utc),
            status="clustered",
            vision_result={
                "description": "33.1909, 103.8885 | AB12 | 栈道慢行",
                "ocr_text": "33.1909, 103.8885",
            },
        )
        for index in range(2)
    ]

    signals = aggregate_story_signals(photos)

    assert signals["photo_descriptions"] == ["栈道慢行", "栈道慢行"]
    assert signals["timeline_clues"] == ["09:00 栈道慢行", "09:05 栈道慢行"]
    assert "33.1909" not in signals["structured_summary"]
    assert "AB12" not in signals["structured_summary"]


def test_normalize_story_output_text_strips_coordinate_strings() -> None:
    text = "在33.1909, 103.8885附近慢慢前行，风声和水色都安静下来。"

    normalized = normalize_story_output_text(text, 60)

    assert "33.1909" not in normalized
    assert "103.8885" not in normalized
    assert normalized == "在附近慢慢前行，风声和水色都安静下来。"
