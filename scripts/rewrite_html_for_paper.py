#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import re
from pathlib import Path


P_TAG_RE = re.compile(r'^(?P<prefix>\s*<p\b[^>]*>)(?P<text>.*?)(?P<suffix></p>\s*)$')
TAG_RE = re.compile(r"<[^>]+>")
HEADING_RE = re.compile(r"^\d+(?:\.\d+)*\s+\S+")
CODE_LIKE_RE = re.compile(
    r"(^\s*(function|const|let|return|import|export|class|interface|type|def|val)\b)|"
    r"[{}<>]=?|=>|;\s*$"
)


SKIP_EXACT = {
    "面向旅途的智能VLOG创作应用设计与实现",
    "摘 要",
    "ABSTRACT",
    "参考文献",
    "致谢",
    "附录",
}
SKIP_PREFIX = ("图 ", "表 ", "代码 ")
SKIP_CONTAINS = ("占位", "这张图建议", "这张表建议", "这幅图建议")


MANUAL_REWRITES = {
    "手机相册保存了大量旅行照片和视频。它们记录了真实的旅途过程。可是在旅行结束以后，用户往往很少再去整理这些内容。现有工具更偏向存储、浏览和手动剪辑。它们很难直接把零散素材整理成有结构、有故事、还能继续回看的旅行回忆。围绕这个问题，本文设计并实现了一款面向旅途的智能 VLOG 创作应用。系统以旅行照片为主要输入。它支持相册导入、元数据提取、照片去重、旅行事件聚合、故事与章节生成、地图轨迹展示、幻灯片预览和本地视频导出。":
        "手机相册中往往保存着大量旅行照片和视频，这些素材记录了旅途中真实的时间、地点与场景，但旅行结束以后，用户通常很少再专门整理。现有工具更多偏向存储、浏览或手动剪辑，难以直接把零散素材组织成有结构、有故事、便于反复回看的旅行回忆。针对这一问题，本文设计并实现了一款面向旅途的智能 VLOG 创作应用，以旅行照片为主要输入，支持相册导入、元数据提取、照片去重、旅行事件聚合、故事与章节生成、地图轨迹展示、幻灯片预览以及本地视频导出。",
    "本文采用移动端与后端协同的实现方式。移动端基于 Expo React Native 构建。它负责相册读取、本地媒体映射、端侧视觉分析、页面交互和视频导出。后端基于 FastAPI 构建。它负责结构化数据管理、事件聚合、地点补全、故事生成和任务调度。系统在照片聚合部分采用“时空密度聚类 + 时间规则修正 + 语义辅助合并”的混合方案。系统在视觉理解部分优先使用 Android 端的 ML Kit 本地能力，并将结构化结果回写后端。系统在视频生成部分采用场景编排和本地原生导出方案。当前音乐链路的真实实现是配乐匹配，不是原创音乐生成。":
        "本文采用移动端与后端协同的实现方式。移动端基于 Expo React Native 构建，负责相册读取、本地媒体映射、端侧视觉分析、页面交互和视频导出；后端基于 FastAPI 构建，负责结构化数据管理、事件聚合、地点补全、故事生成和任务调度。照片聚合环节采用“时空密度聚类 + 时间规则修正 + 语义辅助合并”的混合方案，视觉理解环节优先使用 Android 端的 ML Kit 本地能力并将结构化结果回写后端，视频生成环节则使用场景编排和本地原生导出方案。需要说明的是，当前音乐链路的真实实现为配乐匹配，而非原创音乐生成。",
    "从当前实现结果看，系统已经打通了从相册导入到旅行回忆输出的主流程。用户可以从手机相册导入旅行照片。系统会自动完成事件划分、地点组织、故事生成和视频导出。这个应用降低了旅行素材整理和回看成本，也为旅行回忆场景下的智能内容组织提供了一种可运行的工程方案。":
        "从当前实现情况来看，系统已经打通了从相册导入到旅行回忆输出的主流程。用户可直接从手机相册导入旅行照片，系统随后会自动完成事件划分、地点组织、故事生成和视频导出。该应用在一定程度上降低了旅行素材整理与回看成本，也为旅行回忆场景下的智能内容组织提供了一套可运行的工程方案。",
    "手机拍摄能力越来越强。用户在一次旅行中很容易留下几十张、上百张，甚至更多照片。这些照片保存了地点、时间和当时的画面内容。它们本身有很强的记录价值。可是大多数用户在旅行结束以后，只会在社交平台上挑少量照片分享。其余内容会长期留在系统相册里。时间一长，回看成本会越来越高。很多本来很有价值的旅途片段，也会因为缺少整理而被忽略。":
        "随着手机拍摄能力不断提升，用户在一次旅行中往往会留下几十张、上百张，甚至更多照片。这些照片保存了地点、时间以及当时的画面内容，本身具有较强的记录价值。但在旅行结束后，大多数用户通常只会在社交平台挑选少量照片进行分享，其余内容则长期留在系统相册中。随着时间推移，回看成本会不断升高，不少本来很有价值的旅途片段也会因为缺少整理而被逐渐忽略。",
    "传统相册产品擅长按时间展示图片。传统剪辑工具擅长手动编辑视频。可是对于“旅行回忆”这个具体场景，这两类产品都存在明显空缺。前者一般只能完成存储、检索和简单浏览。后者需要用户自己完成筛选、排序、配文、配乐和导出。这个过程很耗时间，也需要较高的操作成本。对大多数普通用户来说，旅行回忆不是不能做，而是很难持续去做。":
        "传统相册产品更擅长按时间展示图片，传统剪辑工具则偏向手动视频编辑。但在“旅行回忆”这一具体场景下，这两类产品都存在明显空缺。前者通常只能完成存储、检索和简单浏览，后者则要求用户自行完成筛选、排序、配文、配乐和导出，整个过程既耗时，也意味着较高的操作成本。对大多数普通用户而言，旅行回忆并非无法制作，而是很难长期坚持去做。",
    "在这种背景下，旅行照片的自动整理和叙事化组织就有了实际意义。一个更理想的系统，不应只停留在“把照片存起来”。它应该能根据照片中的时间、地点和视觉线索，把零散素材整理成更接近真实记忆方式的旅行事件，再把这些事件组织成可以浏览、可以编辑、也可以导出的视频化内容。这样一来，用户就能以更低成本重新看到一段旅途的结构和情绪。":
        "在这样的背景下，旅行照片的自动整理与叙事化组织便具有了更明确的现实意义。一个更理想的系统，不应只停留在“把照片存起来”这一层面，而应根据照片中的时间、地点和视觉线索，把零散素材整理成更接近真实记忆方式的旅行事件，再进一步组织为可浏览、可编辑、也可导出的视频化内容。如此一来，用户就能以更低成本重新看到一段旅途的结构与情绪。",
}


ENUM_REPLACEMENTS = {
    "第一，": "一是，",
    "第二，": "二是，",
    "第三，": "三是，",
    "第四，": "四是，",
    "第五，": "五是，",
    "第六，": "六是，",
    "第七，": "七是，",
    "第八，": "八是，",
}


PHRASE_REPLACEMENTS = [
    ("本研究", "该研究"),
    ("本课题", "该课题"),
    ("本系统", "系统"),
    ("这个系统", "该系统"),
    ("围绕这个问题", "针对这一问题"),
    ("需要说明的是", "需要强调的是"),
    ("从当前实现结果看", "从当前实现情况来看"),
    ("从当前实现角度看", "从当前实现角度来看"),
    ("从系统实现角度看", "从系统实现角度来看"),
    ("从关键技术路线看", "从关键技术路线来看"),
    ("综合来看", "整体来看"),
    ("这样一来", "这样处理之后"),
    ("呈现", "表现为"),
    ("阐述", "说明"),
    ("依据", "根据"),
    ("导致", "造成"),
    ("更符合", "更贴近"),
    ("可以概括为", "大致可以概括为"),
    ("主要体现在", "主要体现为"),
    ("有几个明显特点", "有几个较为明显的特点"),
    ("这个任务可以拆成几个连续步骤", "这一任务还可以拆分为几个彼此衔接的步骤"),
    ("可以把系统的使用过程概括为三个阶段", "系统的使用过程大体可以分为三个阶段"),
    ("这样的写法更符合系统现状，也更便于后续测试和答辩", "这样的写法更贴近系统现状，后续测试和答辩时也更容易说明"),
    ("不是单一算法实验，也不是单页界面展示", "既不是单一算法实验，也不是单页界面展示"),
    ("这个过程很耗时间，也需要较高的操作成本", "这一过程既耗时，也意味着较高的操作成本"),
    ("不是不能做，而是很难持续去做", "并非无法完成，而是很难长期坚持"),
    ("把时间线和空间线结合起来", "把时间线索和空间线索结合起来"),
    ("把照片从“文件集合”变成“事件集合”", "把照片由“文件集合”进一步组织成“事件集合”"),
    ("可是在", "但在"),
    ("系统会自动完成", "系统随后会自动完成"),
    ("它负责", "主要负责"),
    ("它支持", "支持"),
    ("它需要", "需要"),
    ("它可以", "可以"),
]


def should_rewrite(text: str, in_references: bool) -> bool:
    if not text or in_references:
        return False
    plain = TAG_RE.sub("", text).strip()
    if not plain:
        return False
    if plain in SKIP_EXACT:
        return False
    if plain.startswith(SKIP_PREFIX):
        return False
    if any(flag in plain for flag in SKIP_CONTAINS):
        return False
    if HEADING_RE.match(plain):
        return False
    if plain in {"travel album; event grouping; story generation; map review; video export", "旅行相册；事件聚合；故事生成；地图轨迹；视频导出"}:
        return False
    if plain.startswith("[" ) or plain.startswith("http"):
        return False
    if CODE_LIKE_RE.search(plain):
        return False
    if re.fullmatch(r"[A-Za-z0-9; :,\-_/().]+", plain):
        return False
    return True


def merge_sentences(text: str) -> str:
    parts = [part.strip() for part in text.split("。") if part.strip()]
    if len(parts) <= 1:
        return text

    merged: list[str] = []
    join_markers = ("它", "这", "这些", "其中", "同时", "此外", "因此", "而且", "用户", "系统", "移动端", "后端", "对", "对于", "在")
    for part in parts:
        if not merged:
            merged.append(part)
            continue
        prev = merged[-1]
        if len(part) <= 20 and part.startswith(join_markers) and len(prev) < 90:
            merged[-1] = prev + "，" + part
        elif len(prev) <= 24 and len(part) <= 28:
            merged[-1] = prev + "，" + part
        else:
            merged.append(part)
    return "。".join(merged) + ("。" if text.endswith("。") else "")


def normalize_lists(text: str) -> str:
    for old, new in ENUM_REPLACEMENTS.items():
        text = text.replace(old, new)
    if "一是，" in text:
        text = text.replace("。一是，", "：一是，", 1)
        for marker in ("二是，", "三是，", "四是，", "五是，", "六是，", "七是，", "八是，"):
            text = text.replace(f"。{marker}", f"；{marker}")
    text = re.sub(r"第([一二三四五六七八九十])部分是", r"\1是", text)
    text = re.sub(r"第([一二三四五六七八九十])个阶段是", r"第\1阶段为", text)
    return text


def cleanup(text: str) -> str:
    text = text.replace("：一是，", "：一是")
    for marker in ("二是", "三是", "四是", "五是", "六是", "七是", "八是"):
        text = text.replace(f"；{marker}，", f"；{marker}")
    text = text.replace("，，", "，")
    text = text.replace("。。", "。")
    text = text.replace("；。", "。")
    text = text.replace("，主要负责", "，负责")
    text = text.replace("。支持", "，支持")
    text = text.replace("。需要", "，需要")
    return text


def rewrite_chinese(text: str) -> str:
    text = MANUAL_REWRITES.get(text, text)
    if text in MANUAL_REWRITES.values():
        return text

    text = normalize_lists(text)
    for old, new in PHRASE_REPLACEMENTS:
        text = text.replace(old, new)

    text = re.sub(r"本文的目标，是", "本文的目标在于", text)
    text = re.sub(r"本系统面向的核心场景，是", "系统面向的核心场景是", text)
    text = re.sub(r"当前项目的真实实现", "当前项目的实际实现", text)
    text = re.sub(r"这个模块", "该模块", text)
    text = re.sub(r"这样设计有三个原因", "之所以采用这样的设计，主要有三个原因", text)
    text = re.sub(r"这一部分是", "这一部分主要是", text)
    text = re.sub(r"当前实现中，", "在当前实现中，", text)
    text = re.sub(r"从主流程看，", "从主流程来看，", text)
    text = re.sub(r"从代码实现看，", "从代码实现来看，", text)
    text = re.sub(r"从数据流角度看，", "从数据流转的角度来看，", text)
    text = re.sub(r"总体来看，", "整体来看，", text)
    text = re.sub(r"对工程实现来说，", "从工程实现角度来看，", text)
    text = re.sub(r"这样做的原因是，", "之所以这样处理，是因为", text)
    text = re.sub(r"这个方案的优点是", "这一方案的优点在于", text)
    text = re.sub(r"这样做有两个直接好处", "这样处理有两个直接好处", text)

    text = merge_sentences(text)
    text = cleanup(text)
    return text


def rewrite_text(text: str) -> str:
    if re.search(r"[\u4e00-\u9fff]", text):
        return rewrite_chinese(text)
    return text


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_html", type=Path)
    parser.add_argument("output_html", type=Path)
    parser.add_argument("--log", type=Path, required=True)
    args = parser.parse_args()

    lines = args.input_html.read_text(encoding="utf-8").splitlines()
    out_lines: list[str] = []
    log_entries: list[str] = []
    in_references = False
    changes = 0

    for idx, line in enumerate(lines, start=1):
        match = P_TAG_RE.match(line)
        if not match:
            out_lines.append(line)
            continue

        raw_text = match.group("text")
        plain = html.unescape(TAG_RE.sub("", raw_text)).strip()
        if plain == "参考文献":
            in_references = True

        if not should_rewrite(raw_text, in_references):
            out_lines.append(line)
            continue

        rewritten = rewrite_text(plain)
        if rewritten != plain:
            new_line = f"{match.group('prefix')}{html.escape(rewritten, quote=False)}{match.group('suffix')}"
            out_lines.append(new_line)
            changes += 1
            log_entries.append(f"[line {idx}]\nOLD: {plain}\nNEW: {rewritten}\n")
        else:
            out_lines.append(line)

    args.output_html.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    args.log.write_text("\n".join(log_entries) + f"\nTOTAL_CHANGES={changes}\n", encoding="utf-8")
    print(f"changes={changes}")
    print(f"output={args.output_html}")
    print(f"log={args.log}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
