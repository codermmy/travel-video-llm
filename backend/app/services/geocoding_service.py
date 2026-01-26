from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.integrations.amap import amap_client
from app.models.event import Event
from app.utils.cache import geocoding_cache
from app.utils.geo import format_coordinates

logger = logging.getLogger(__name__)


class GeocodingService:
    def __init__(self) -> None:
        self._ttl_seconds = 86400

    def _cache_key(self, lat: float, lon: float) -> str:
        return f"geocode:{format_coordinates(lat, lon, decimals=4)}"

    def get_location_name(self, lat: float, lon: float) -> Optional[str]:
        key = self._cache_key(lat, lon)
        cached = geocoding_cache.get(key)
        if cached is not None:
            return cached

        location = amap_client.reverse_geocode(lat=lat, lon=lon)
        if location:
            geocoding_cache.set(key, location, ttl=self._ttl_seconds)
        return location

    def update_event_locations(self, user_id: str, db: Session) -> int:
        events = db.scalars(
            select(Event).where(and_(Event.user_id == user_id, Event.location_name.is_(None)))
        ).all()

        updated = 0
        for e in events:
            if e.gps_lat is None or e.gps_lon is None:
                continue

            try:
                name = self.get_location_name(float(e.gps_lat), float(e.gps_lon))
            except Exception:
                logger.exception("Geocoding failed for event %s", e.id)
                continue

            if not name:
                continue

            e.location_name = name
            updated += 1

        if updated:
            db.commit()
        return updated


geocoding_service = GeocodingService()
