#!/bin/bash
# 手动下载并安装 Claude Skills
# 使用镜像源加速

set -e

SKILLS_DIR="$HOME/.claude/skills"
mkdir -p "$SKILLS_DIR"

echo "📦 Skills 目录: $SKILLS_DIR"
echo ""

# 使用 ghproxy 镜像下载
MIRROR="https://mirror.ghproxy.com/"

# Skills 列表：格式 "仓库名 skill子目录 本地目录名"
declare -a SKILLS=(
    # 产品规划类
    "borghei/claude-skills product-manager product-manager"
    "eddiebe147/claude-settings mvp-planner mvp-planner"
    "alirezarezvani/claude-skills agile-product-owner agile-product-owner"
    "anton-abyzov/specweave roadmap-planner roadmap-planner"
    "rshankras/claude-code-apple-skills product-development product-development"

    # 架构类
    "wshobson/agents architecture-patterns architecture-patterns"
    "wshobson/agents architecture-decision-records architecture-decision-records"
    "softaworks/agent-toolkit c4-architecture c4-architecture"
    "wshobson/agents react-native-architecture react-native-architecture"

    # 设计类
    "anthropic/skills frontend-design frontend-design"
    "lotosbin/claude-skills ui-ux-designer ui-ux-designer"
)

for skill in "${SKILLS[@]}"; do
    read -r repo subpath localname <<< "$skill"

    echo "⬇️  正在下载: $repo/$subpath"

    # 使用镜像下载 zip
    url="https://github.com/${repo}/archive/refs/heads/main.zip"
    mirror_url="${MIRROR}${url}"

    tmpdir=$(mktemp -d)
    zipfile="$tmpdir/skill.zip"

    # 下载
    if curl -L -o "$zipfile" "$mirror_url" --max-time 30; then
        # 解压
        unzip -q "$zipfile" -d "$tmpdir"

        # 找到解压后的目录
        extracted_dir=$(find "$tmpdir" -mindepth 1 -maxdepth 1 -type d | head -1)

        # 检查 skill 是否存在
        if [ -d "$extracted_dir/$subpath" ]; then
            target_dir="$SKILLS_DIR/$localname"
            echo "   → 安装到: $target_dir"
            rm -rf "$target_dir"
            cp -r "$extracted_dir/$subpath" "$target_dir"
            echo "   ✅ 安装成功"
        else
            echo "   ❌ 未找到 skill: $subpath"
            echo "   可用目录:"
            ls -la "$extracted_dir/" | grep -E "^d" || true
        fi
    else
        echo "   ⚠️  下载失败，尝试直接克隆..."

        # 回退到直接克隆
        if git clone --depth 1 --single-branch \
            "https://github.com/${repo}.git" \
            "$tmpdir/clone" 2>/dev/null; then

            if [ -d "$tmpdir/clone/$subpath" ]; then
                target_dir="$SKILLS_DIR/$localname"
                rm -rf "$target_dir"
                cp -r "$tmpdir/clone/$subpath" "$target_dir"
                echo "   ✅ 克隆成功"
            else
                echo "   ❌ 未找到 skill: $subpath"
            fi
        else
            echo "   ❌ 克隆也失败了"
        fi
    fi

    rm -rf "$tmpdir"
    echo ""
done

echo "✨ 安装完成！"
echo ""
echo "查看已安装的 skills:"
ls -la "$SKILLS_DIR"
