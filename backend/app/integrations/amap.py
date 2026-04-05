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
        self._reverse_geocode_url = "https://restapi.amap.com/v3/geocode/regeo"
        self._place_text_search_url = "https://restapi.amap.com/v3/place/text"
        self._input_tips_url = "https://restapi.amap.com/v3/assistant/inputtips"
        self._district_search_url = "https://restapi.amap.com/v3/config/district"

    def is_configured(self) -> bool:
        return bool(settings.amap_api_key and settings.amap_api_key.strip())

    def _request_reverse_geocode(self, lat: float, lon: float) -> Optional[dict[str, Any]]:
        if not self.is_configured():
            return None

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(
                    self._reverse_geocode_url,
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

    def _request_place_text_search(
        self,
        *,
        keywords: str,
        city: Optional[str] = None,
        citylimit: bool = True,
    ) -> list[dict[str, Any]]:
        if not self.is_configured():
            return []

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(
                    self._place_text_search_url,
                    params={
                        "key": settings.amap_api_key,
                        "keywords": keywords,
                        "city": city or "",
                        "citylimit": "true" if city and citylimit else "false",
                        "offset": 20,
                        "page": 1,
                        "extensions": "base",
                    },
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception:
            logger.exception(
                "Amap place text search failed: keywords=%s city=%s citylimit=%s",
                keywords,
                city,
                citylimit,
            )
            return []

        if str(data.get("status")) != "1":
            logger.warning(
                "Amap place text search returned error: keywords=%s city=%s citylimit=%s payload=%s",
                keywords,
                city,
                citylimit,
                data,
            )
            return []

        pois = data.get("pois")
        if not isinstance(pois, list):
            return []
        return [poi for poi in pois if isinstance(poi, dict)]

    def _request_input_tips(
        self,
        *,
        keywords: str,
        city: Optional[str] = None,
        citylimit: bool = True,
    ) -> list[dict[str, Any]]:
        if not self.is_configured():
            return []

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(
                    self._input_tips_url,
                    params={
                        "key": settings.amap_api_key,
                        "keywords": keywords,
                        "city": city or "",
                        "citylimit": "true" if city and citylimit else "false",
                    },
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception:
            logger.exception(
                "Amap input tips failed: keywords=%s city=%s citylimit=%s",
                keywords,
                city,
                citylimit,
            )
            return []

        if str(data.get("status")) != "1":
            logger.warning(
                "Amap input tips returned error: keywords=%s city=%s citylimit=%s payload=%s",
                keywords,
                city,
                citylimit,
                data,
            )
            return []

        tips = data.get("tips")
        if not isinstance(tips, list):
            return []
        return [tip for tip in tips if isinstance(tip, dict)]

    def _request_district_search(self, *, keywords: str) -> list[dict[str, Any]]:
        if not self.is_configured():
            return []

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(
                    self._district_search_url,
                    params={
                        "key": settings.amap_api_key,
                        "keywords": keywords,
                        "subdistrict": 0,
                        "extensions": "base",
                        "offset": 20,
                        "page": 1,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception:
            logger.exception("Amap district search failed")
            return []

        if str(data.get("status")) != "1":
            logger.warning("Amap district search returned error: %s", data)
            return []

        districts = data.get("districts")
        if not isinstance(districts, list):
            return []
        return [district for district in districts if isinstance(district, dict)]

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
    def _normalize_region_name(value: Any) -> str:
        return (
            str(value or "")
            .strip()
            .replace("省", "")
            .replace("市", "")
            .replace("区", "")
            .replace("县", "")
        )

    @classmethod
    def _build_display_location(
        cls,
        *,
        province: Any = None,
        city: Any = None,
        district: Any = None,
        fallback: str = "",
    ) -> str:
        normalized_province = cls._normalize_region_name(province)
        normalized_city = cls._normalize_region_name(cls._normalize_city(city))
        normalized_district = cls._normalize_region_name(district)

        parts: list[str] = []
        if normalized_province:
            parts.append(normalized_province)
        if normalized_city and normalized_city != normalized_province:
            parts.append(normalized_city)
        if normalized_district:
            parts.append(normalized_district)

        return "".join(parts) or fallback

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
            "detailed_location": "",
            "location_tags": "旅行足迹、城市记忆",
            "location_type": "未知",
            "display_location": "",
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
        display_location = self._build_display_location(
            province=comp.get("province"),
            city=comp.get("city"),
            district=comp.get("district"),
            fallback=detailed_location,
        )

        return {
            "detailed_location": detailed_location,
            "location_tags": tags,
            "location_type": location_type,
            "display_location": display_location,
        }

    def search_cities(self, keyword: str) -> list[dict[str, str]]:
        query = keyword.strip()
        if not query:
            return []

        results: list[dict[str, str]] = []
        seen_adcodes: set[str] = set()
        for district in self._request_district_search(keywords=query):
            adcode = str(district.get("adcode") or "").strip()
            if not adcode or adcode in seen_adcodes:
                continue
            seen_adcodes.add(adcode)

            name = str(district.get("name") or "").strip()
            display_name = self._build_display_location(
                province=district.get("province"),
                city=district.get("name") if district.get("level") == "city" else district.get("city"),
                district=district.get("district") if district.get("level") != "district" else district.get("name"),
                fallback=name,
            )
            results.append(
                {
                    "name": name,
                    "display_name": display_name or name,
                    "adcode": adcode,
                }
            )
        return results

    def search_places(self, *, keyword: str, city: str) -> list[dict[str, Any]]:
        query = keyword.strip()
        city_value = city.strip()
        if not query or not city_value:
            return []

        results: list[dict[str, Any]] = []
        stage_counts: list[tuple[str, int]] = []

        pois = self._request_place_text_search(keywords=query, city=city_value, citylimit=True)
        stage_counts.append(("place_text_citylimit", len(pois)))
        if not pois:
            pois = self._request_input_tips(keywords=query, city=city_value, citylimit=True)
            stage_counts.append(("input_tips_citylimit", len(pois)))
        if not pois:
            pois = self._request_place_text_search(keywords=query, city=city_value, citylimit=False)
            stage_counts.append(("place_text_city", len(pois)))
        if not pois:
            pois = self._request_input_tips(keywords=query, city=city_value, citylimit=False)
            stage_counts.append(("input_tips_city", len(pois)))
        if not pois:
            pois = self._request_place_text_search(keywords=query, city=None, citylimit=False)
            stage_counts.append(("place_text_global", len(pois)))
        if not pois:
            pois = self._request_input_tips(keywords=query, city=None, citylimit=False)
            stage_counts.append(("input_tips_global", len(pois)))

        seen_keys: set[str] = set()
        for poi in pois:
            location = str(poi.get("location") or "").strip()
            if "," not in location:
                continue
            lon_str, lat_str = location.split(",", 1)
            try:
                lat = float(lat_str)
                lon = float(lon_str)
            except (TypeError, ValueError):
                continue

            name = str(poi.get("name") or "").strip()
            address = str(poi.get("address") or "").strip()
            province = poi.get("pname")
            city_name = poi.get("cityname")
            district = poi.get("adname")
            display_location = self._build_display_location(
                province=province,
                city=city_name,
                district=district,
                fallback=city_value,
            )
            location_type, tags = self._match_location_tags(
                " ".join(part for part in [name, address, display_location] if part)
            )
            detailed_location = name
            if address and address not in name:
                detailed_location = f"{name} · {address}"

            dedupe_key = f"{name}|{lat:.6f}|{lon:.6f}"
            if dedupe_key in seen_keys:
                continue
            seen_keys.add(dedupe_key)

            results.append(
                {
                    "name": name or detailed_location,
                    "address": address,
                    "display_location": display_location or city_value,
                    "detailed_location": detailed_location,
                    "location_tags": tags,
                    "location_type": location_type,
                    "gps_lat": lat,
                    "gps_lon": lon,
                }
            )
        return results


amap_client = AmapClient()
