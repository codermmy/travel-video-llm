# AI 开发工作流指南

> **本文档作用**: 定义 AI 辅助开发的行为规范和工作流指引。

---

## ⚠️ 文档加载原则（重要）

**采用渐进式披露，按需加载，避免上下文冗余。**

| 场景 | 是否需要读取 my-spec 文档 |
|------|---------------------------|
| 日常对话、简单问答 | ❌ 不需要 |
| 小改动、单文件修复 | ❌ 不需要 |
| 用户明确使用 `/spec:*` 命令 | ✅ 需要，按命令要求读取 |
| 用户要求走 my-spec 流程 | ✅ 需要，从 `my-spec/system/INDEX.md` 开始 |
| 需要了解项目架构/模块详情 | ✅ 按需读取对应模块文档 |

**核心原则**：只有在实际需要时才读取文档，不要预加载大量文档到上下文。

---

## 🧭 my-spec 工作流

> **触发条件**：用户使用 `/spec:*` 命令，或明确要求走 my-spec 流程时才启用。

### 五命令流程

| 命令 | 作用 | 状态转换 |
|------|------|----------|
| `/spec:prd` | 创建变更、澄清需求 | `DRAFT → CLARIFIED` |
| `/spec:testplan <change>` | 定义测试计划 | `CLARIFIED → TEST_DEFINED` |
| `/spec:plan <change>` | 制定技术方案 | `TEST_DEFINED → PLANNED` |
| `/spec:apply <change>` | 实现 + 测试 + 自修复 | `PLANNED → READY_FOR_VERIFY` |
| `/spec:verify <change>` | 验收 + 文档同步 + 归档 | `READY_FOR_VERIFY → ARCHIVED` |

### 状态机门禁

```
DRAFT → CLARIFIED → TEST_DEFINED → PLANNED → IMPLEMENTING → READY_FOR_VERIFY → ARCHIVED
```

- 不允许跳状态
- 不允许跳 required 测试
- 不允许跳文档联动检查

### full / lite 双模式

- `full`：功能迭代、需求扩展、架构调整
- `lite`：小 bug、验收后小修、文案微调

### 知识文档入口

**只有在使用 my-spec 流程时**，从以下入口开始按需读取：

```
my-spec/system/README.md      ← 系统入口（推荐）
my-spec/system/INDEX.md       ← 详细索引
```

**目录结构**（按序号阅读）：
- `core/` - 核心概念（01-what-is-my-spec, 02-status-machine, 03-command-contract, 04-glossary）
- `execution/` - 执行指南（01-test-profile, 02-testing-playbook, 03-test-strategy, 04-doc-sync-rules, 05-dod-checklist）
- `project/` - 本项目知识（01-overview, 02-architecture, 03-module-catalog, 04-conventions）
- `frontend/` / `backend/` - 模块文档

---

## 📱 新手友好交付要求

为照顾新手用户，AI 在"每次改动完成后"都必须额外说明以下内容：

1. **是否需要重新 Build 并安装到手机** (明确写: 需要 / 不需要)
2. **判断原因** (例如: 仅 JS/TS 代码变更，或涉及原生层配置/依赖)
3. **可直接执行的命令** (按步骤给出，可复制粘贴)

### Build 判断规则 (移动端)

**通常不需要重新 Build**：
- 仅修改 `mobile/` 下 JS/TS 业务代码、页面样式、路由逻辑
- 可通过 Metro 热更新/重载生效

**通常需要重新 Build 并重新安装**：
- 修改 `mobile/package.json` 依赖（尤其原生依赖）
- 修改 `mobile/android/`、`mobile/ios/` 原生代码或配置
- 修改 `app.json` / `app.config.*` 中会影响原生工程的配置
- 新增或修改 `patches/` 下原生库 patch

### 常用命令模板

```bash
# 启动 Metro (开发服务)
cd mobile && npm run start

# 重建并安装到手机
cd mobile && npm install && npx expo run:android

# 连接 Dev Client
cd mobile && npx expo start --dev-client

# 后端启动
cd backend && source .venv/bin/activate && uvicorn main:app --reload

# 后端测试
cd backend && source .venv/bin/activate && pytest -q

# 前端静态检查
cd mobile && npm run lint && npm run typecheck
```

---

## 🎨 UI 设计任务

当需要进行前端 UI 设计或界面开发时，使用 `frontend-design` skill：

```
/skill frontend-design
```

触发条件：新建页面/组件的 UI 设计、界面视觉改进、交互流程设计

---

## 🚨 质量门禁

### 代码不通过的情况

以下情况 AI 应拒绝交付：
- ❌ 缺少类型定义
- ❌ 没有错误处理
- ❌ 硬编码配置信息
- ❌ 破坏现有架构
- ❌ 包含敏感信息

### 必须包含的内容

所有代码必须包含：
- ✅ 适当的类型注解
- ✅ 错误处理逻辑
- ✅ 必要的注释
- ✅ 符合规范的命名
- ✅ 清晰的函数结构

---

## 🎓 持续改进

如果发现项目文档不完善，AI 应：
1. 指出具体缺失
2. 建议补充内容
3. 在使用 my-spec 流程时，通过 `spec:verify` 阶段更新文档

---

> **使用说明**:
> 1. 本文档与 `CLAUDE.md` 配合使用
> 2. 只有使用 `/spec:*` 命令时才需要读取 my-spec 文档
> 3. 日常开发遵循本文档的质量门禁和交付要求即可
