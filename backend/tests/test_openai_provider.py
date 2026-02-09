from __future__ import annotations

import httpx

from app.integrations.providers.openai_responses import OpenAIResponsesProvider


def test_analyze_image_parses_responses_output(monkeypatch) -> None:
    provider = OpenAIResponsesProvider(
        api_key="dummy",
        base_url="http://api.example.com/v1",
        vision_model="gpt-5.1-codex",
        story_model="gpt-5.1-codex",
    )

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {
                "status": "completed",
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {"type": "output_text", "text": "这是一次开心的旅行，有笑容与欢乐"}
                        ],
                    }
                ],
            }

    class FakeHttpxClient:
        def __init__(self, timeout: int):
            self.timeout = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url: str, json, headers):
            assert url == "http://api.example.com/v1/responses"
            assert json["model"] == "gpt-5.1-codex"
            return FakeResponse()

    monkeypatch.setattr("app.integrations.providers.openai_responses.httpx.Client", FakeHttpxClient)

    result = provider.analyze_image("https://example.com/image.jpg")
    assert result is not None
    assert result["description"]
    assert result["emotion"] == "Happy"
    assert provider.get_last_error_code() is None


def test_generate_event_story_parses_json_text(monkeypatch) -> None:
    provider = OpenAIResponsesProvider(
        api_key="dummy",
        base_url="http://api.example.com/v1",
        vision_model="gpt-5.1-codex",
        story_model="gpt-5.1-codex",
    )

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {
                "status": "completed",
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": '```json\n{"title":"西湖之旅","story":"很美的一天","emotion":"Calm"}\n```',
                            }
                        ],
                    }
                ],
            }

    class FakeHttpxClient:
        def __init__(self, timeout: int):
            self.timeout = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url: str, json, headers):
            return FakeResponse()

    monkeypatch.setattr("app.integrations.providers.openai_responses.httpx.Client", FakeHttpxClient)

    story = provider.generate_event_story(
        location="杭州",
        date_range="01月01日 - 01月01日",
        photo_descriptions=["湖边散步"],
    )
    assert story is not None
    assert story["title"] == "西湖之旅"
    assert story["emotion"] == "Calm"


def test_openai_provider_http_error_sets_reason(monkeypatch) -> None:
    provider = OpenAIResponsesProvider(
        api_key="dummy",
        base_url="http://api.example.com/v1",
    )

    class FakeHttpxClient:
        def __init__(self, timeout: int):
            self.timeout = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url: str, json, headers):
            raise httpx.ReadTimeout("timeout")

    monkeypatch.setattr("app.integrations.providers.openai_responses.httpx.Client", FakeHttpxClient)

    assert provider.analyze_image("https://example.com/image.jpg") is None
    assert provider.get_last_error_code() == "openai_http_error"
