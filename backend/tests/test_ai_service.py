from __future__ import annotations

from typing import Any

from app.services.ai_service import AIService


def test_select_photos_for_analysis_uses_all_when_small() -> None:
    svc = AIService()
    urls = [f"https://example.com/{i}.jpg" for i in range(8)]
    selected = svc.select_photos_for_analysis(urls, photo_count=len(urls))
    assert selected == urls


def test_select_photos_for_analysis_uses_ratio_and_bounds() -> None:
    svc = AIService()
    urls = [f"https://example.com/{i}.jpg" for i in range(30)]
    selected = svc.select_photos_for_analysis(urls, photo_count=len(urls))
    assert len(selected) == 15
    assert selected[0] == urls[0]
    assert selected[-1] == urls[-1]


def test_select_photos_for_analysis_caps_for_huge_sets() -> None:
    svc = AIService()
    urls = [f"https://example.com/{i}.jpg" for i in range(150)]
    selected = svc.select_photos_for_analysis(urls, photo_count=len(urls))
    assert len(selected) == 50
    assert selected[0] == urls[0]
    assert selected[-1] == urls[-1]


def test_analyze_event_photos_sampling_and_cache() -> None:
    svc = AIService()

    calls: list[str] = []

    class FakeClient:
        def provider_name(self) -> str:
            return "fake"

        def current_models(self) -> dict[str, str]:
            return {"vision_model": "fake-v", "story_model": "fake-s"}

        def configuration_error_code(self) -> str:
            return "fake_api_key_not_configured"

        def is_configured(self) -> bool:
            return True

        def analyze_image(self, image_url: str, prompt: str = "") -> dict[str, Any] | None:
            calls.append(image_url)
            if image_url.endswith("0.jpg"):
                return {"description": "开心", "emotion": "Joyful"}
            return {"description": "宁静", "emotion": "Peaceful"}

        def generate_event_story(self, *args, **kwargs):  # noqa: ANN002, ANN003
            return None

        def get_last_error_code(self):
            return None

    setattr(svc, "client", FakeClient())

    urls = [f"https://example.com/{i}.jpg" for i in range(12)]
    event_id = "evt-test-001"

    out1 = svc.analyze_event_photos(event_id=event_id, photo_urls=urls, location="")
    assert out1["emotion"] in ("Joyful", "Peaceful")
    assert len(out1["descriptions"]) >= 3
    assert calls[0] == urls[0]

    out2 = svc.analyze_event_photos(event_id=event_id, photo_urls=urls, location="")
    assert out2 == out1
    assert len(calls) == len(set(calls))
