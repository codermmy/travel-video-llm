#!/bin/bash
# sync-commands.sh
# 同步 Claude Code 命令到 OpenCode 和 Codex
#
# 用法: ./scripts/sync-commands.sh [--dry-run]

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_DIR="$PROJECT_ROOT/.claude/commands"
OPENCODE_DIR="$PROJECT_ROOT/.opencode/commands"
CODEX_SKILLS_DIR="$PROJECT_ROOT/.codex/skills"

DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo "🔍 Dry run mode - no changes will be made"
fi

# 检查源目录
if [[ ! -d "$SOURCE_DIR" ]]; then
    echo "❌ Source directory not found: $SOURCE_DIR"
    exit 1
fi

echo "📁 Source: $SOURCE_DIR"
echo ""

# 同步到 OpenCode（保持目录结构，格式兼容）
sync_to_opencode() {
    echo "📦 Syncing to OpenCode (compatible format)..."

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "   Would create: $OPENCODE_DIR"
        find "$SOURCE_DIR" -name "*.md" | while read -r file; do
            rel_path="${file#$SOURCE_DIR/}"
            echo "   Would copy: $rel_path"
        done
    else
        mkdir -p "$OPENCODE_DIR"
        # 复制所有内容，保持目录结构
        cp -r "$SOURCE_DIR"/* "$OPENCODE_DIR/" 2>/dev/null || true
        echo "   ✅ Synced to $OPENCODE_DIR"
    fi
    echo ""
}

# 转换为 Codex Skills（文件夹结构 + SKILL.md）
convert_to_codex_skills() {
    echo "📦 Converting to Codex Skills format..."

    find "$SOURCE_DIR" -name "*.md" | while read -r file; do
        # 获取相对路径并转换为技能名
        rel_path="${file#$SOURCE_DIR/}"
        skill_name=$(echo "${rel_path%.md}" | tr "/" "-")
        skill_dir="$CODEX_SKILLS_DIR/$skill_name"

        if [[ "$DRY_RUN" == "true" ]]; then
            echo "   Would create: $skill_dir/SKILL.md"
        else
            # 创建技能目录
            mkdir -p "$skill_dir"

            # 读取原文件内容
            content=$(cat "$file")

            # 提取 description（从 frontmatter）
            desc=$(echo "$content" | sed -n '/^---$/,/^---$/p' | grep "^description:" | sed 's/description: *//' | head -1)

            # 提取正文（跳过 frontmatter）
            # 找到第二个 --- 之后的内容
            body=$(echo "$content" | awk '/^---$/{n++; next} n>=2{print}')

            # 如果 description 为空，使用默认值
            if [[ -z "$desc" ]]; then
                desc="Execute the $skill_name workflow"
            fi

            # 生成 SKILL.md
            cat > "$skill_dir/SKILL.md" << EOF
---
name: $skill_name
description: $desc Use \$${skill_name} to invoke this skill.
---
$body

## How to invoke

- Type \`\$${skill_name}\` in Codex
- Or describe your intent naturally (Codex will match based on description)

## Original command

This skill was converted from Claude Code command: \`$rel_path\`
EOF

            echo "   ✅ Created: $skill_dir/SKILL.md"
        fi
    done
    echo ""
}

# 显示统计
show_stats() {
    echo "📊 Statistics:"
    local count=$(find "$SOURCE_DIR" -name "*.md" | wc -l | tr -d ' ')
    echo "   Total commands: $count"

    echo ""
    echo "📋 Command list:"
    find "$SOURCE_DIR" -name "*.md" | sort | while read -r file; do
        rel_path="${file#$SOURCE_DIR/}"
        skill_name=$(echo "${rel_path%.md}" | tr "/" "-")
        # 提取 description
        desc=$(sed -n '/^---$/,/^---$/p' "$file" | grep "^description:" | sed 's/description: *//' | head -1)
        printf "   %-25s → %-25s %s\n" "$rel_path" "\$${skill_name}" "${desc:0:40}"
    done
}

# 主流程
echo "═══════════════════════════════════════════════════════════"
echo "  Cross-Tool Command Sync"
echo "  Claude Code → OpenCode + Codex"
echo "═══════════════════════════════════════════════════════════"
echo ""

sync_to_opencode
convert_to_codex_skills
show_stats

echo ""
if [[ "$DRY_RUN" == "true" ]]; then
    echo "🔍 Dry run complete. Run without --dry-run to apply changes."
else
    echo "✅ Sync complete!"
    echo ""
    echo "📝 Usage:"
    echo "   Claude Code: /spec:prd"
    echo "   OpenCode:    /spec:prd"
    echo "   Codex:       \$spec-prd"
fi
