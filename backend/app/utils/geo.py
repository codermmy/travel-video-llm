from __future__ import annotations

import math
from typing import Optional, Tuple

EARTH_RADIUS_KM = 6371.0


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points (km)."""

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_KM * c


def calculate_center_point(
    points: list[tuple[float, float]],
) -> Optional[Tuple[float, float]]:
    """Calculate a geographic center point.

    Uses spherical averaging to avoid artifacts around the dateline.
    """

    if not points:
        return None

    x = y = z = 0.0
    for lat, lon in points:
        lat_rad = math.radians(lat)
        lon_rad = math.radians(lon)
        x += math.cos(lat_rad) * math.cos(lon_rad)
        y += math.cos(lat_rad) * math.sin(lon_rad)
        z += math.sin(lat_rad)

    n = float(len(points))
    x /= n
    y /= n
    z /= n

    lon_center = math.atan2(y, x)
    hyp = math.sqrt(x * x + y * y)
    lat_center = math.atan2(z, hyp)
    return math.degrees(lat_center), math.degrees(lon_center)


def format_coordinates(lat: float, lon: float, decimals: int = 4) -> str:
    fmt = f"{{:.{decimals}f}}"
    return f"{fmt.format(lat)},{fmt.format(lon)}"
