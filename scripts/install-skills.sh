#!/bin/bash
# Claude Code Skills 安装脚本
# 只包含经过验证、真实存在的 skills

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   Claude Code Skills 安装脚本${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# === 产品规划类 ===
echo -e "${YELLOW}📦 产品规划类 Skills${NC}"
PRODUCT_SKILLS=(
    "refoundai/lenny-skills@ai-product-strategy"
    "refoundai/lenny-skills@defining-product-vision"
)

for skill in "${PRODUCT_SKILLS[@]}"; do
    echo -e "  → 安装 $skill"
    npx skills add "$skill" -g -y && echo -e "  ${GREEN}✅${NC}" || echo -e "  ${RED}❌${NC}"
done
echo ""

# === 架构搭建类 ===
echo -e "${YELLOW}🏗️  架构搭建类 Skills${NC}"
ARCH_SKILLS=(
    "wshobson/agents@architecture-patterns"
    "wshobson/agents@architecture-decision-records"
    "wshobson/agents@react-native-architecture"
    "softaworks/agent-toolkit@c4-architecture"
    "wshobson/agents@api-design-principles"
)

for skill in "${ARCH_SKILLS[@]}"; do
    echo -e "  → 安装 $skill"
    npx skills add "$skill" -g -y && echo -e "  ${GREEN}✅${NC}" || echo -e "  ${RED}❌${NC}"
done
echo ""

# === 前端设计类 ===
echo -e "${YELLOW}🎨 前端设计类 Skills${NC}"
DESIGN_SKILLS=(
    "anthropics/skills@frontend-design"
    "anthropics/skills@canvas-design"
    "vercel-labs/agent-skills@web-design-guidelines"
    "wshobson/agents@tailwind-design-system"
    "expo/skills@building-native-ui"
    "nextlevelbuilder/ui-ux-pro-max-skill@ui-ux-pro-max"
)

for skill in "${DESIGN_SKILLS[@]}"; do
    echo -e "  → 安装 $skill"
    npx skills add "$skill" -g -y && echo -e "  ${GREEN}✅${NC}" || echo -e "  ${RED}❌${NC}"
done
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✨ 安装完成！${NC}"
echo ""
echo "查看已安装的 skills:"
echo "  npx skills list"
echo ""
echo "检查更新:"
echo "  npx skills check"
echo ""
