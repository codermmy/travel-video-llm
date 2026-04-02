from __future__ import annotations

import httpx

from app.integrations.providers.deepseek_provider import DeepSeekProvider


def test_generate_story_reads_chat_completion_content(monkeypatch) -> None:
    provider = DeepSeekProvider(
        api_key="dummy",
        base_url="https://api.deepseek.com/v1",
        story_model="deepseek-chat",
    )

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": "这是一段旅行故事",
                        }
                    }
                ]
            }

    class FakeHttpxClient:
        def __init__(self, timeout: int):
            self.timeout = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url: str, json, headers):  # noqa: ANN001
            assert url == "https://api.deepseek.com/v1/chat/completions"
            assert json["model"] == "deepseek-chat"
            return FakeResponse()

    monkeypatch.setattr("app.integrations.providers.deepseek_provider.httpx.Client", FakeHttpxClient)

    result = provider.generate_story("写一段故事")
    assert result == "这是一段旅行故事"
    assert provider.get_last_error_code() is None


def test_generate_event_story_parses_json_payload(monkeypatch) -> None:
    provider = DeepSeekProvider(
        api_key="dummy",
        base_url="https://api.deepseek.com/v1",
        story_model="deepseek-chat",
    )

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": '{"title":"西湖之旅","full_story":"湖边散步的一天","emotion":"Peaceful"}',
                        }
                    }
                ]
            }

    class FakeHttpxClient:
        def __init__(self, timeout: int):
            self.timeout = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url: str, json, headers):  # noqa: ANN001
            assert json["response_format"] == {"type": "json_object"}
            return FakeResponse()

    monkeypatch.setattr("app.integrations.providers.deepseek_provider.httpx.Client", FakeHttpxClient)

    story = provider.generate_event_story(
        location="杭州",
        date_range="01月01日 - 01月01日",
        photo_descriptions=["湖边散步"],
        detailed_location="浙江省杭州市西湖区",
        location_tags="江南水乡",
    )
    assert story is not None
    assert story["title"] == "西湖之旅"
    assert story["story"] == "湖边散步的一天"
    assert story["emotion"] == "Peaceful"


def test_deepseek_provider_http_error_sets_reason(monkeypatch) -> None:
    provider = DeepSeekProvider(
        api_key="dummy",
        base_url="https://api.deepseek.com/v1",
        story_model="deepseek-chat",
    )

    class FakeHttpxClient:
        def __init__(self, timeout: int):
            self.timeout = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url: str, json, headers):  # noqa: ANN001
            raise httpx.ReadTimeout("timeout")

    monkeypatch.setattr("app.integrations.providers.deepseek_provider.httpx.Client", FakeHttpxClient)

    assert provider.generate_story("写一段故事") is None
    assert provider.get_last_error_code() == "deepseek_http_error"


def test_deepseek_provider_marks_vision_as_unsupported() -> None:
    provider = DeepSeekProvider(api_key="dummy")

    assert provider.analyze_image("https://example.com/image.jpg") is None
    assert provider.get_last_error_code() == "deepseek_vision_not_supported"
