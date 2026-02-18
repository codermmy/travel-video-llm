# Claude Code Skills 安装与使用指南

> 本文档记录了**经过验证、真实存在**的 Claude Code Skills

## 🚀 快速安装

```bash
chmod +x scripts/install-skills.sh
./scripts/install-skills.sh
```

---

## 📦 全部安装命令

### 产品规划类 (2个)
```bash
npx skills add refoundai/lenny-skills@ai-product-strategy -g
npx skills add refoundai/lenny-skills@defining-product-vision -g
```

### 架构搭建类 (5个)
```bash
npx skills add wshobson/agents@architecture-patterns -g
npx skills add wshobson/agents@architecture-decision-records -g
npx skills add wshobson/agents@react-native-architecture -g
npx skills add softaworks/agent-toolkit@c4-architecture -g
npx skills add wshobson/agents@api-design-principles -g
```

### 前端设计类 (6个)
```bash
npx skills add anthropics/skills@frontend-design -g
npx skills add anthropics/skills@canvas-design -g
npx skills add vercel-labs/agent-skills@web-design-guidelines -g
npx skills add wshobson/agents@tailwind-design-system -g
npx skills add expo/skills@building-native-ui -g
npx skills add nextlevelbuilder/ui-ux-pro-max-skill@ui-ux-pro-max -g
```

---

## 📋 Skills 详解

### 1️⃣ 产品规划类

| Skill | 来源 | 作用 |
|-------|------|------|
| `ai-product-strategy` | refoundai/lenny-skills | AI 产品战略规划 |
| `defining-product-vision` | refoundai/lenny-skills | 定义产品愿景 |

**使用示例:**
```
你: "/ai-product-strategy 我想做一个旅行视频 App"
AI: 帮你分析市场、用户、竞品，制定产品战略
```

---

### 2️⃣ 架构搭建类

| Skill | 来源 | 作用 |
|-------|------|------|
| `architecture-patterns` | wshobson/agents | 软件架构模式指导 |
| `architecture-decision-records` | wshobson/agents | 架构决策记录 (ADR) |
| `react-native-architecture` | wshobson/agents | RN 架构最佳实践 |
| `c4-architecture` | softaworks/agent-toolkit | C4 架构图建模 |
| `api-design-principles` | wshobson/agents | API 设计原则 |

**使用示例:**
```
你: "/architecture-patterns 推荐 RN 项目架构"
AI: 分析项目规模，推荐 Clean Architecture / MVVM 等

你: "/c4-architecture 画出系统架构图"
AI: 生成 C4 模型的 PlantUML/Mermaid 代码
```

**C4 模型层级:**
| 层级 | 名称 | 描述 |
|------|------|------|
| Level 1 | System Context | 系统上下文 - 系统与外部交互 |
| Level 2 | Container | 容器 - App、数据库、API 等 |
| Level 3 | Component | 组件 - 容器内的组件结构 |
| Level 4 | Code | 代码 - 类/函数级别关系 |

---

### 3️⃣ 前端设计类

| Skill | 来源 | 作用 |
|-------|------|------|
| `frontend-design` ⭐ | anthropics/skills | 官方前端设计技能 |
| `canvas-design` | anthropics/skills | Canvas 设计 |
| `web-design-guidelines` | vercel-labs/agent-skills | Vercel 设计规范 |
| `tailwind-design-system` | wshobson/agents | Tailwind 设计系统 |
| `building-native-ui` | expo/skills | Expo/React Native UI |
| `ui-ux-pro-max` | nextlevelbuilder | UI/UX 专业设计 |

**使用示例:**
```
你: "/frontend-design 设计视频播放器界面"
AI: 生成高质量、美观的前端代码

你: "/building-native-ui 设计 RN 原生组件"
AI: 基于 Expo 最佳实践设计组件
```

---

## 🔄 典型开发流程

```
想法 → 产品规划 → 架构设计 → 开发实现
  ↓         ↓         ↓         ↓
ai-product   architecture  frontend
-strategy   -patterns     -design
```

### 完整示例:

```
1️⃣ 有想法
   你: "我想做一个旅行视频分享 App"

2️⃣ 产品战略
   你: "/ai-product-strategy 分析这个想法"
   → AI: 市场分析、用户画像、竞品分析

3️⃣ 定义愿景
   你: "/defining-product-vision 明确产品愿景"
   → AI: 产品定位、核心价值、使命宣言

4️⃣ 架构设计
   你: "/react-native-architecture 设计 RN 项目架构"
   → AI: 目录结构、状态管理、路由方案

   你: "/c4-architecture 画出系统架构"
   → AI: C4 架构图 (Mermaid/PlantUML)

5️⃣ 开发实现
   你: "/frontend-design 设计首页界面"
   → AI: 精美的前端代码

6️⃣ 记录决策
   你: "/architecture-decision-records 记录选型决策"
   → AI: 生成 ADR 文档
```

---

## 🛠️ 常用命令

```bash
# 列出已安装的 skills
npx skills list

# 搜索新 skills
npx skills find <keyword>

# 检查更新
npx skills check

# 更新所有 skills
npx skills update

# 删除 skill
npx skills remove <skill-name>
```

---

## 📚 相关资源

- [Skills CLI 官网](https://skills.sh/)
- [Claude Code 文档](https://github.com/anthropics/claude-code)
- [Expo Skills](https://github.com/expo/skills)
- [Vercel Agent Skills](https://github.com/vercel-labs/agent-skills)
