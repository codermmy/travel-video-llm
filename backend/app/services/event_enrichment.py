from __future__ import annotations

from datetime import datetime
import re
from typing import Optional, Sequence, TypeVar

from app.models.event import Event

T = TypeVar("T")
COORDINATE_LOCATION_PATTERN = re.compile(
    r"^\s*-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*$"
)


def format_coordinate_location(gps_lat: Optional[float], gps_lon: Optional[float]) -> Optional[str]:
    if gps_lat is None or gps_lon is None:
        return None
    return f"{gps_lat:.4f}, {gps_lon:.4f}"


def is_coordinate_location_text(value: Optional[str]) -> bool:
    if not value:
        return False
    return bool(COORDINATE_LOCATION_PATTERN.match(value))


def _format_date(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.strftime("%Y-%m-%d")


def build_event_date_range(start_time: Optional[datetime], end_time: Optional[datetime]) -> str:
    start = _format_date(start_time)
    end = _format_date(end_time)
    if start and end:
        return f"{start} - {end}"
    return start or end or "时间待补充"


def get_event_location_text(event: Event) -> Optional[str]:
    if event.location_name and event.location_name.strip():
        location_name = event.location_name.strip()
        if not is_coordinate_location_text(location_name):
            return location_name

    if event.detailed_location and event.detailed_location.strip():
        detailed = event.detailed_location.strip()
        if not is_coordinate_location_text(detailed):
            return detailed

    return None


def ensure_event_title(event: Event) -> str:
    if event.title and event.title.strip():
        return event.title.strip()

    location = get_event_location_text(event) or "旅程"
    date_range = build_event_date_range(event.start_time, event.end_time)
    return f"{location} · {date_range}"


def split_into_chapters(items: Sequence[T], chunk_size: int = 20) -> list[tuple[int, int, list[T]]]:
    if chunk_size < 1:
        chunk_size = 20

    chapters: list[tuple[int, int, list[T]]] = []
    total = len(items)
    if total == 0:
        return chapters

    for start in range(0, total, chunk_size):
        end = min(start + chunk_size, total)
        chapter_items = list(items[start:end])
        chapters.append((start, end - 1, chapter_items))

    return chapters
