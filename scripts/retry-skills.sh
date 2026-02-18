#!/bin/bash
# 重试安装失败的 skills
# 使用更长的超时时间和重试机制

set -e

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== Skills 重试安装脚本 ===${NC}"
echo ""

# === 待安装的 skills 列表 ===
# 格式: "仓库 skill名称"

declare -a SKILLS=(
    # 产品规划类
    "eddiebe147/claude-settings mvp-planner"
    "alirezarezvani/claude-skills agile-product-owner"
    "anton-abyzov/specweave roadmap-planner"
    "rshankras/claude-code-apple-skills product-development"

    # 架构类
    "wshobson/agents architecture-patterns"
    "wshobson/agents architecture-decision-records"
    "softaworks/agent-toolkit c4-architecture"
    "pluginagentmarketplace/custom-plugin-software-design domain-driven-design"
    "wshobson/agents react-native-architecture"

    # 设计类
    "vercel-labs/agent-skills web-design-guidelines"
    "lotosbin/claude-skills ui-ux-designer"
)

# === 已安装的 skills (跳过) ===
declare -a INSTALLED=(
    "product-manager"
    "frontend-design"
)

# 检查 skill 是否已安装
is_installed() {
    local name="$1"
    for installed in "${INSTALLED[@]}"; do
        if [ "$installed" = "$name" ]; then
            return 0
        fi
    done
    return 1
}

# 统计
SUCCESS=0
FAILED=0
SKIPPED=0

# 安装单个 skill
install_skill() {
    local repo="$1"
    local skill="$2"
    local max_attempts=3

    if is_installed "$skill"; then
        echo -e "${GREEN}⊘ $skill${NC} - 已安装，跳过"
        ((SKIPPED++))
        return
    fi

    echo -e "⬇️  正在安装: ${YELLOW}$repo${NC} @ ${YELLOW}$skill${NC}"

    for ((attempt=1; attempt<=max_attempts; attempt++)); do
        if npx skills add "$repo@$skill" -g -y 2>&1; then
            echo -e "${GREEN}✅ $skill 安装成功!${NC}"
            ((SUCCESS++))
            return 0
        else
            echo -e "${RED}❌ 第 $attempt 次尝试失败${NC}"
            if [ $attempt -lt $max_attempts ]; then
                echo "   等待 3 秒后重试..."
                sleep 3
            fi
        fi
    done

    echo -e "${RED}❌ $skill 安装失败（已重试 $max_attempts 次）${NC}"
    ((FAILED++))
    return 1
}

# 批量安装
for skill_info in "${SKILLS[@]}"; do
    read -r repo skill_name <<< "$skill_info"
    install_skill "$repo" "$skill_name"
    echo ""
done

# === 结果汇总 ===
echo -e "${YELLOW}=== 安装结果 ===${NC}"
echo -e "${GREEN}✅ 成功: $SUCCESS${NC}"
echo -e "${RED}❌ 失败: $FAILED${NC}"
echo -e "${YELLOW}⊘ 跳过: $SKIPPED${NC}"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${YELLOW}提示: 失败的 skill 可能需要：${NC}"
    echo "   1. 配置代理或使用 VPN"
    echo "   2. 稍后网络好一点时重试"
    echo "   3. 手动从 GitHub 下载并安装"
fi
