from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class AmapClient:
    def __init__(self) -> None:
        self._base_url = "https://restapi.amap.com/v3/geocode/regeo"

    def is_configured(self) -> bool:
        return bool(settings.amap_api_key and settings.amap_api_key.strip())

    def reverse_geocode(self, lat: float, lon: float) -> Optional[str]:
        if not self.is_configured():
            return None

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(
                    self._base_url,
                    params={
                        "key": settings.amap_api_key,
                        "location": f"{lon},{lat}",
                        "radius": 1000,
                        "extensions": "base",
                    },
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception:
            logger.exception("Amap reverse geocode request failed")
            return None

        if str(data.get("status")) != "1":
            logger.warning("Amap reverse geocode returned error: %s", data)
            return None

        comp = (data.get("regeocode") or {}).get("addressComponent") or {}
        province = (comp.get("province") or "").strip()
        city = comp.get("city")
        if isinstance(city, list):
            city = "".join([str(c) for c in city])
        city_str = (str(city) if city is not None else "").strip()
        district = (comp.get("district") or "").strip()

        parts: list[str] = []
        if province:
            parts.append(province)
        if city_str and city_str != province:
            parts.append(city_str)
        if district:
            parts.append(district)

        location_name = "".join([p for p in parts if p])
        return location_name or None


amap_client = AmapClient()
