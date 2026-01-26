from __future__ import annotations

from app.utils.geo import haversine_distance


def test_haversine_distance_nearby_points() -> None:
    d = haversine_distance(30.259, 120.215, 30.267, 120.220)
    assert abs(d - 1.01) <= 0.01


def test_haversine_distance_distant_points() -> None:
    d = haversine_distance(39.9042, 116.4074, 31.2304, 121.4737)  # Beijing -> Shanghai
    assert d > 900
