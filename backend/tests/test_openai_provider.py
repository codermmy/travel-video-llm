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
                            {
                                "type": "output_text",
                                "text": "这是一次开心的旅行，有笑容与欢乐",
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

        def post(self, url: str, json, headers):  # noqa: ANN001
            assert url == "http://api.example.com/v1/responses"
            assert json["model"] == "gpt-5.1-codex"
            return FakeResponse()

    monkeypatch.setattr(
        "app.integrations.providers.openai_responses.httpx.Client", FakeHttpxClient
    )

    result = provider.analyze_image("https://example.com/image.jpg")
    assert result is not None
    assert result["description"]
    assert result["emotion"] == "Joyful"
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
                                "text": '```json\n{"title":"西湖之旅","full_story":"很美的一天","hero_title":"四月西湖漫游","hero_summary":"湖风把这段午后吹得更轻一些。","emotion":"Peaceful"}\n```',
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

        def post(self, url: str, json, headers):  # noqa: ANN001
            prompt = json["input"][0]["content"][0]["text"]
            assert "100-140字中文" in prompt
            assert "hero_title" in prompt
            assert "hero_summary" in prompt
            assert "可以直接忽略" in prompt
            assert "不要逐图展开" in prompt
            assert "原始坐标" in prompt
            assert "秋水照见归途" in prompt
            return FakeResponse()

    monkeypatch.setattr(
        "app.integrations.providers.openai_responses.httpx.Client", FakeHttpxClient
    )

    story = provider.generate_event_story(
        location="杭州",
        date_range="01月01日 - 01月01日",
        photo_descriptions=["湖边散步"],
        detailed_location="浙江省杭州市西湖区",
        location_tags="江南水乡",
    )
    assert story is not None
    assert story["title"] == "西湖之旅"
    assert story["hero_title"] == "四月西湖漫游"
    assert story["hero_summary"] == "湖风把这段午后吹得更轻一些。"
    assert story["emotion"] == "Peaceful"
    assert story["story"] == "很美的一天"


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

        def post(self, url: str, json, headers):  # noqa: ANN001
            raise httpx.ReadTimeout("timeout")

    monkeypatch.setattr(
        "app.integrations.providers.openai_responses.httpx.Client", FakeHttpxClient
    )

    assert provider.analyze_image("https://example.com/image.jpg") is None
    assert provider.get_last_error_code() == "openai_http_error"
