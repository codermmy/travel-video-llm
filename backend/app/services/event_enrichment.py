from __future__ import annotations

from datetime import datetime
from typing import Optional

from app.models.event import Event


def format_coordinate_location(gps_lat: Optional[float], gps_lon: Optional[float]) -> Optional[str]:
    if gps_lat is None or gps_lon is None:
        return None
    return f'{gps_lat:.4f}, {gps_lon:.4f}'


def _format_date(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.strftime('%Y-%m-%d')


def build_event_date_range(start_time: Optional[datetime], end_time: Optional[datetime]) -> str:
    start = _format_date(start_time)
    end = _format_date(end_time)
    if start and end:
        return f'{start} - {end}'
    return start or end or '时间待补充'


def get_event_location_text(event: Event) -> Optional[str]:
    if event.location_name and event.location_name.strip():
        return event.location_name.strip()

    gps_lat = float(event.gps_lat) if event.gps_lat is not None else None
    gps_lon = float(event.gps_lon) if event.gps_lon is not None else None
    return format_coordinate_location(gps_lat, gps_lon)


def ensure_event_title(event: Event) -> str:
    if event.title and event.title.strip():
        return event.title.strip()

    location = get_event_location_text(event) or '旅程'
    date_range = build_event_date_range(event.start_time, event.end_time)
    return f'{location} · {date_range}'
