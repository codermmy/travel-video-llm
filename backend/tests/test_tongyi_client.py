from __future__ import annotations

from app.integrations.tongyi import TongyiClient


def test_is_configured_false_when_no_key() -> None:
    client = TongyiClient(api_key="")
    assert client.is_configured() is False


def test_detect_emotion_keywords() -> None:
    client = TongyiClient(api_key="dummy")
    assert client._detect_emotion("今天很开心，大家都在笑容里") == "Happy"
    assert client._detect_emotion("宁静的湖面让人平静") == "Calm"
    assert client._detect_emotion("壮观的雪山非常雄伟") == "Epic"
    assert client._detect_emotion("浪漫的夕阳和温馨时刻") == "Romantic"


def test_analyze_image_parses_response(monkeypatch) -> None:
    client = TongyiClient(api_key="dummy")

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": "这是一次开心的旅行，有笑容与欢乐",
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

        def post(self, url: str, json, headers):
            return FakeResponse()

    monkeypatch.setattr("app.integrations.tongyi.httpx.Client", FakeHttpxClient)

    result = client.analyze_image("https://example.com/image.jpg")
    assert result is not None
    assert result["emotion"] == "Happy"


def test_generate_event_story_parses_json_block(monkeypatch) -> None:
    client = TongyiClient(api_key="dummy")

    def fake_generate_story(prompt: str, max_tokens: int = 500, temperature: float = 0.7):
        return """```json
{\"title\":\"西湖之旅\",\"story\":\"很美的一天\",\"emotion\":\"Calm\"}
```"""

    monkeypatch.setattr(client, "generate_story", fake_generate_story)

    story = client.generate_event_story(
        location="杭州",
        date_range="01月01日 - 01月01日",
        photo_descriptions=["湖边散步"],
    )
    assert story is not None
    assert story["title"] == "西湖之旅"
    assert story["emotion"] == "Calm"


def test_generate_event_story_fallback_on_invalid_json(monkeypatch) -> None:
    client = TongyiClient(api_key="dummy")

    def fake_generate_story(prompt: str, max_tokens: int = 500, temperature: float = 0.7):
        return "不是JSON，但也能作为故事内容返回"

    monkeypatch.setattr(client, "generate_story", fake_generate_story)

    story = client.generate_event_story(
        location="杭州",
        date_range="01月01日 - 01月01日",
        photo_descriptions=["湖边散步"],
    )
    assert story is not None
    assert story["title"] == "杭州之旅"
    assert story["emotion"] == "Calm"
