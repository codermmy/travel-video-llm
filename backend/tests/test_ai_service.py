from __future__ import annotations

from typing import Any

from app.services.ai_service import AIService


def test_select_photos_for_analysis_ge_10() -> None:
    svc = AIService()
    urls = [f"https://example.com/{i}.jpg" for i in range(12)]
    selected = svc.select_photos_for_analysis(urls, photo_count=len(urls))
    assert selected == [urls[0], urls[4], urls[9]]


def test_select_photos_for_analysis_lt_10() -> None:
    svc = AIService()
    urls = [f"https://example.com/{i}.jpg" for i in range(6)]
    selected = svc.select_photos_for_analysis(urls, photo_count=len(urls))
    assert selected == [urls[0], urls[len(urls) // 2], urls[-1]]


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
                return {"description": "开心", "emotion": "Happy"}
            return {"description": "宁静", "emotion": "Calm"}

        def generate_event_story(
            self, location: str, date_range: str, photo_descriptions: list[str]
        ):
            return None

        def get_last_error_code(self):
            return None

    setattr(svc, "client", FakeClient())

    urls = [f"https://example.com/{i}.jpg" for i in range(12)]
    event_id = "evt-test-001"

    out1 = svc.analyze_event_photos(event_id=event_id, photo_urls=urls, location="")
    assert out1["emotion"] in ("Happy", "Calm")
    assert len(out1["descriptions"]) == 3
    assert calls == [urls[0], urls[4], urls[9]]

    # Cache hit: no additional analyze_image calls.
    out2 = svc.analyze_event_photos(event_id=event_id, photo_urls=urls, location="")
    assert out2 == out1
    assert calls == [urls[0], urls[4], urls[9]]
