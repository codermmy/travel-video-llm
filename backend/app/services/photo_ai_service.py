from __future__ import annotations

from app.services.ai_service import ai_service


def generate_photo_caption(photo_description: str) -> str | None:
    prompt = f"""请为照片生成中文短文案。

照片描述：{photo_description}

要求：
1. 输出 4-8 个关键词
2. 使用 “关键词 · 关键词 · 关键词” 的形式
3. 简洁、有画面感

直接返回文案。
"""

    output = ai_service.client.generate_story(prompt, max_tokens=120)
    if not output:
        return None

    text = output.strip().replace("\n", " ")
    if not text:
        return None

    if "·" not in text:
        parts = [p.strip() for p in text.replace("，", " ").split() if p.strip()]
        if parts:
            text = " · ".join(parts[:4])

    return text[:100]
