from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


LOCATION_TAG_PRESETS: dict[str, tuple[str, str]] = {
    "九寨沟": ("自然景区", "世界自然遗产、水的奇观、童话森林"),
    "成都": ("城市", "天府之国、美食之都、熊猫故乡"),
    "三亚": ("海滨", "热带风情、阳光沙滩、椰林海岸"),
    "西湖": ("人文景区", "人间天堂、江南水乡、诗意湖光"),
}


class AmapClient:
    def __init__(self) -> None:
        self._base_url = "https://restapi.amap.com/v3/geocode/regeo"

    def is_configured(self) -> bool:
        return bool(settings.amap_api_key and settings.amap_api_key.strip())

    def _request_reverse_geocode(self, lat: float, lon: float) -> Optional[dict[str, Any]]:
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
                        "extensions": "all",
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

        regeocode = data.get("regeocode")
        if not isinstance(regeocode, dict):
            return None
        return regeocode

    @staticmethod
    def _normalize_city(city: Any) -> str:
        if isinstance(city, list):
            return "".join(str(c) for c in city).strip()
        if city is None:
            return ""
        return str(city).strip()

    def reverse_geocode(self, lat: float, lon: float) -> Optional[str]:
        regeocode = self._request_reverse_geocode(lat=lat, lon=lon)
        if not regeocode:
            return None

        comp = regeocode.get("addressComponent") or {}
        if not isinstance(comp, dict):
            return None

        province = str(comp.get("province") or "").strip()
        city = self._normalize_city(comp.get("city"))
        district = str(comp.get("district") or "").strip()

        parts: list[str] = []
        if province:
            parts.append(province)
        if city and city != province:
            parts.append(city)
        if district:
            parts.append(district)

        return "".join(parts) or None

    @staticmethod
    def _extract_poi_name(regeocode: dict[str, Any]) -> Optional[str]:
        pois = regeocode.get("pois")
        if isinstance(pois, list) and pois:
            first = pois[0]
            if isinstance(first, dict):
                name = str(first.get("name") or "").strip()
                if name:
                    return name
        return None

    @staticmethod
    def _extract_formatted_address(regeocode: dict[str, Any]) -> str:
        addr = str(regeocode.get("formatted_address") or "").strip()
        if addr:
            return addr
        comp = regeocode.get("addressComponent") or {}
        if not isinstance(comp, dict):
            return ""
        province = str(comp.get("province") or "").strip()
        city = AmapClient._normalize_city(comp.get("city"))
        district = str(comp.get("district") or "").strip()
        township = str(comp.get("township") or "").strip()

        parts = [p for p in [province, city, district, township] if p]
        return "".join(parts)

    @staticmethod
    def _match_location_tags(text: str) -> tuple[str, str]:
        for key, value in LOCATION_TAG_PRESETS.items():
            if key in text:
                return value

        if any(token in text for token in ["山", "湖", "景区", "国家公园", "森林"]):
            return ("自然景区", "自然风光、山水景观、旅行打卡")
        if any(token in text for token in ["古镇", "古城", "村", "乡"]):
            return ("乡村", "烟火人间、慢节奏、在地文化")
        if any(token in text for token in ["海", "湾", "沙滩"]):
            return ("海滨", "海风日落、热带风情、度假感")
        return ("城市", "在地日常、街巷烟火、旅途片段")

    def get_location_context(self, lat: float, lon: float) -> dict[str, str]:
        fallback = {
            "detailed_location": f"{lat:.4f}, {lon:.4f}",
            "location_tags": "旅行足迹、城市记忆",
            "location_type": "未知",
            "display_location": f"{lat:.4f}, {lon:.4f}",
        }

        regeocode = self._request_reverse_geocode(lat=lat, lon=lon)
        if not regeocode:
            return fallback

        formatted = self._extract_formatted_address(regeocode)
        poi_name = self._extract_poi_name(regeocode)
        detailed_location = poi_name or formatted or fallback["detailed_location"]

        location_type, tags = self._match_location_tags(detailed_location)

        comp = regeocode.get("addressComponent") or {}
        if not isinstance(comp, dict):
            comp = {}
        province = str(comp.get("province") or "").replace("省", "").replace("市", "")
        district = str(comp.get("district") or "").replace("区", "").replace("县", "")
        display_location = "".join([p for p in [province, district] if p]) or detailed_location

        return {
            "detailed_location": detailed_location,
            "location_tags": tags,
            "location_type": location_type,
            "display_location": display_location,
        }


amap_client = AmapClient()
