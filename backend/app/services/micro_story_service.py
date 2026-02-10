from __future__ import annotations

import json
from typing import Any

from app.services.ai_service import ai_service


def _trim_story_length(text: str, min_len: int = 15, max_len: int = 25) -> str:
    cleaned = text.strip().replace("\n", "")
    if len(cleaned) > max_len:
        return cleaned[:max_len]
    if len(cleaned) < min_len:
        return cleaned
    return cleaned


class MicroStoryService:
    def generate_micro_story(
        self,
        photo_analysis: dict[str, Any],
        group_context: dict[str, Any],
        photo_index_in_group: int,
    ) -> str:
        analysis_text = json.dumps(photo_analysis, ensure_ascii=False)
        context_text = json.dumps(group_context, ensure_ascii=False)
        prompt = f"""请基于真实视觉信息写一条微故事。

照片识别结果：{analysis_text}
组上下文：{context_text}
组内序号：{photo_index_in_group + 1}

要求：
1. 15-25个中文字
2. 只能使用照片中可见元素
3. 不要编造不存在的场景
4. 直接输出一句话"""

        raw = ai_service.client.generate_story(prompt, max_tokens=120)
        if not raw:
            desc = str(photo_analysis.get("description") or "旅途中的瞬间").strip()
            fallback = f"{desc[:16]}，这一刻被轻轻定格"
            return _trim_story_length(fallback, 10, 25)

        return _trim_story_length(raw)

    def generate_chapter_intro_summary(
        self,
        chapter_index: int,
        total_chapters: int,
        groups: list[dict[str, str]],
    ) -> dict[str, str]:
        prompt = f"""请为旅行章节生成引言和总结。

章节：第{chapter_index}/{total_chapters}章
照片组摘要：{json.dumps(groups, ensure_ascii=False)}

要求：
- intro 40-50字
- summary 30-40字
- 简洁、真实、有画面感

返回 JSON：{{"intro":"...","summary":"..."}}"""

        raw = ai_service.client.generate_story(prompt, max_tokens=220)
        if raw:
            try:
                start = raw.index("{")
                end = raw.rindex("}") + 1
                payload = json.loads(raw[start:end])
                intro = str(payload.get("intro") or "").strip()
                summary = str(payload.get("summary") or "").strip()
                if intro and summary:
                    return {"intro": intro[:80], "summary": summary[:80]}
            except Exception:
                pass

        return {
            "intro": f"第{chapter_index}章，旅途在光影与步履之间继续展开。",
            "summary": "这一章落幕，记忆的温度仍停留在画面里。",
        }


micro_story_service = MicroStoryService()
