# 跨工具命令兼容性分析

## 概述

本文档分析 Claude Code、OpenCode、Codex CLI 三个工具的命令机制，并提供迁移方案。

## 三工具命令机制对比

| 特性 | Claude Code | OpenCode | Codex CLI |
|------|-------------|----------|-----------|
| **机制名称** | Commands | Commands | **Skills** |
| **目录（全局）** | `~/.claude/commands/` | `~/.config/opencode/commands/` | `~/.codex/skills/` |
| **目录（项目）** | `.claude/commands/` | `.opencode/commands/` | `.codex/skills/` 或 `.agents/skills/` |
| **文件格式** | `命令名.md` | `命令名.md` | `技能名/SKILL.md` (文件夹结构) |
| **命令名来源** | 文件名（不含 .md） | 文件名（不含 .md） | 文件夹名 |
| **子目录命名空间** | ✅ `spec/prd.md` → `/spec:prd` | ✅ 支持 | ❌ 每个技能独立文件夹 |
| **参数占位符** | `$ARGUMENTS` | `$ARGUMENTS`, `$1`-`$9` | 无固定占位符 |
| **调用方式** | `/命令名` | `/命令名` | `$技能名` 或自然语言触发 |

### 关键差异：Codex 使用 Skills 而非 Commands

**Codex Skills 结构**：
```
~/.codex/skills/
└── spec-prd/           # 技能文件夹名 = 技能名
    ├── SKILL.md        # 必需：主指令文件
    ├── scripts/        # 可选：脚本
    ├── references/     # 可选：参考文档
    └── assets/         # 可选：资源文件
```

**SKILL.md 格式**：
```markdown
---
name: spec-prd
description: 创建或澄清变更并生成 PRD。当用户说"创建PRD"、"新建变更"时触发。
---

技能指令内容...
```

### Frontmatter 字段对比

| 字段 | Claude Code | OpenCode | Codex Skills |
|------|-------------|----------|--------------|
| `description` | ✅ | ✅ | ✅ (触发依据) |
| `name` | ❌ (用文件名) | ❌ (用文件名) | ✅ (必需) |
| `argument-hint` | ✅ | ✅ | ❌ |
| `allowed-tools` | ✅ | ❌ | ❌ |
| `agent` | ❌ | ✅ | ❌ |
| `model` | ❌ | ✅ | ❌ |

## 兼容性结论

**Claude Code 与 OpenCode**：高度兼容，格式几乎相同
**Codex CLI**：使用完全不同的 Skills 机制，需要转换

主要差异：
1. **Codex 用文件夹而非单文件** - 每个技能是一个文件夹，内含 `SKILL.md`
2. **Codex 用 `$技能名` 调用** - 而非 `/命令名`
3. **Codex 支持隐式触发** - 基于 description 自动匹配用户意图

## 迁移方案

### 方案 A：Claude Code ↔ OpenCode（符号链接）

这两个工具格式兼容，可以直接链接：

```bash
# 以 Claude Code 的 .claude/commands/ 为源
ln -s ../.claude/commands .opencode/commands
```

### 方案 B：转换为 Codex Skills

需要将每个命令转换为 Skill 文件夹结构：

**转换规则**：
| Claude Code | Codex Skills |
|-------------|--------------|
| `.claude/commands/spec/prd.md` | `.codex/skills/spec-prd/SKILL.md` |
| `.claude/commands/spec/apply.md` | `.codex/skills/spec-apply/SKILL.md` |

**SKILL.md 格式转换**：

原始 Claude Code 命令 (`spec/prd.md`):
```markdown
---
description: Create or clarify a change and generate PRD
argument-hint: [change-intent-or-doc]
allowed-tools: Read,Write,Edit,Grep,Glob,Bash(*)
---

Create a new change under `my-spec/changes/`...
```

转换后的 Codex Skill (`spec-prd/SKILL.md`):
```markdown
---
name: spec-prd
description: Create or clarify a change and generate PRD in my-spec workflow. Use when user says "create PRD", "new change", "spec prd", or wants to start a new feature/fix.
---

Create a new change under `my-spec/changes/`...

## Example triggers
- "创建一个新的 PRD"
- "开始一个新变更"
- "$spec-prd 用户认证功能"
```

### 方案 C：自动转换脚本

使用仓库脚本统一同步三端资产（commands + skills）：

```bash
./scripts/sync-commands.sh --source claude
./scripts/sync-commands.sh --source opencode
./scripts/sync-commands.sh --source opencode --check
./scripts/sync-commands.sh --check
```

说明：

- `--source claude|opencode` 选择单一源
- 默认源为 `opencode`
- 同步目标包含：另一端 commands、`.codex/skills`、另一端 skills
- `--check` 用于一致性校验（不改文件）

## 推荐的命令编写规范

为确保跨工具兼容，编写命令时遵循：

### 1. 使用通用 frontmatter 字段

```yaml
---
description: 简短但完整的描述，包含触发关键词
argument-hint: <change-name>
---
```

### 2. 在正文中包含触发示例

```markdown
## When to use
- 当用户说 "创建 PRD" 时
- 当用户说 "新建变更" 时
- 当用户输入 `/spec:prd` 或 `$spec-prd` 时
```

### 3. 避免工具特有语法

- 不依赖 `$ARGUMENTS`（Codex 不支持）
- 在指令中明确说明如何获取用户输入

## 实施步骤

### 步骤 1：创建目录结构

```bash
cd /path/to/project

# Claude Code（已存在）
ls .claude/commands/

# OpenCode
mkdir -p .opencode/commands

# Codex Skills
mkdir -p .codex/skills
```

### 步骤 2：同步到 OpenCode（符号链接）

```bash
# 直接链接，格式兼容
ln -sf ../.claude/commands .opencode/commands
```

### 步骤 3：转换为 Codex Skills

运行 `./scripts/sync-commands.sh --source <claude|opencode>`。

### 步骤 4：验证

```bash
# Claude Code
claude
/spec:prd

# OpenCode
opencode
/spec:prd

# Codex
codex
$spec-prd
```

## 当前项目状态

本项目（travel-video-llm）的命令位于：
- `.claude/commands/spec/` - my-spec 工作流命令
- `.claude/commands/opsx/` - OpenSpec 实验性命令

### 迁移清单

- [x] Claude Code 命令已就绪
- [x] 三端命令/技能可通过统一脚本同步
- [ ] 在 CI 加入 `./scripts/sync-commands.sh --source opencode --check`

## 工具对比总结

| 维度 | Claude Code | OpenCode | Codex CLI |
|------|-------------|----------|-----------|
| 调用方式 | `/命令名` | `/命令名` | `$技能名` 或自然语言 |
| 文件结构 | 单文件 `.md` | 单文件 `.md` | 文件夹 + `SKILL.md` |
| 隐式触发 | ❌ | ❌ | ✅ 基于 description |
| 参数传递 | `$ARGUMENTS` | `$ARGUMENTS` | 自然语言描述 |
| 脚本支持 | ❌ | ❌ | ✅ `scripts/` 目录 |
| 资源文件 | ❌ | ❌ | ✅ `references/`, `assets/` |

## 关键词

Claude Code, OpenCode, Codex CLI, slash commands, Skills, SKILL.md, 命令迁移, 跨工具兼容

## 记录信息

- 首次记录：2026-02-11
- 最后更新：2026-02-11
