# my-spec 系统文档

> **一句话定义**：my-spec 是项目级 DocOps 执行系统，通过 5 命令 + 7 状态 + 文档联动，确保每次变更可追溯、可验证、可归档。

---

## 🚀 快速入门

### 你是谁？选择你的阅读路径：

| 场景 | 你应该看 | 预计时间 |
|------|----------|----------|
| **首次了解 my-spec** | `core/01-what-is-my-spec.md` | 10 分钟 |
| **执行一个变更** | [执行指南](#-执行一个变更) | 5 分钟 |
| **了解本项目业务** | `project/01-overview.md` | 5 分钟 |
| **查找某个模块** | `frontend/` 或 `backend/` | 按需 |

---

## 📁 目录结构

```
my-spec/system/
├── README.md                ← 你在这里
│
├── core/                    ← 核心概念（了解系统必读）
│   ├── 01-what-is-my-spec.md    # 系统完整说明
│   ├── 02-status-machine.md     # 状态机定义
│   ├── 03-command-contract.md   # 五命令契约
│   └── 04-glossary.md           # 术语表
│
├── execution/               ← 执行指南（执行时必读）
│   ├── 01-test-profile.yaml     # 测试配置
│   ├── 02-testing-playbook.md   # 测试执行手册
│   ├── 03-test-strategy.md      # 测试策略
│   ├── 04-doc-sync-rules.yaml   # 文档联动规则
│   └── 05-dod-checklist.md      # 完成定义检查清单
│
├── project/                 ← 本项目知识（项目特定）
│   ├── 01-overview.md           # 项目概览
│   ├── 02-architecture.md       # 架构图
│   ├── 03-module-catalog.md     # 模块目录
│   └── 04-conventions.md        # 编码规范
│
├── prompts/                 ← AI 提示词模板
│   └── doc-enrichment.md        # 文档补全提示词
│
├── frontend/                ← 前端模块文档
│   └── modules/...
│
└── backend/                 ← 后端模块文档
    └── modules/...
```

---

## 🎯 执行一个变更

### 五命令流程

```
spec:prd → spec:testplan → spec:plan → spec:apply → spec:verify
   │            │              │            │            │
   ▼            ▼              ▼            ▼            ▼
CLARIFIED → TEST_DEFINED → PLANNED → READY_FOR_VERIFY → ARCHIVED
```

### 执行前必读

1. **`core/03-command-contract.md`** - 每个命令的输入/输出/门禁
2. **`core/02-status-machine.md`** - 状态转换规则
3. **`execution/01-test-profile.yaml`** - 本项目的测试配置

### 执行中参考

| 阶段 | 参考文档 |
|------|----------|
| 写测试计划 | `execution/01-test-profile.yaml` |
| 跑测试 | `execution/02-testing-playbook.md` |
| 检查文档联动 | `execution/04-doc-sync-rules.yaml` |
| 验收检查 | `execution/05-dod-checklist.md` |

---

## 📚 核心概念速查

| 概念 | 定义 | 详见 |
|------|------|------|
| **change** | 单次需求的唯一标识 | `core/04-glossary.md` |
| **状态机** | 7 个状态 + 门禁规则 | `core/02-status-machine.md` |
| **五命令** | prd/testplan/plan/apply/verify | `core/03-command-contract.md` |
| **profile** | 测试执行配置 | `execution/01-test-profile.yaml` |
| **doc-sync** | 代码→文档联动规则 | `execution/04-doc-sync-rules.yaml` |
| **hotfix** | Bug 修复快速通道 | `core/01-what-is-my-spec.md` |

---

## 🔍 按功能查找模块

### 前端模块

| 功能 | 文档 |
|------|------|
| 登录注册 | `frontend/modules/auth.md` |
| 地图展示 | `frontend/modules/map.md` |
| 照片上传 | `frontend/modules/upload.md` |
| 故事播放 | `frontend/modules/story.md` |
| 测试 | `frontend/modules/testing.md` |

### 后端模块

| 功能 | 文档 |
|------|------|
| 认证鉴权 | `backend/modules/auth.md` |
| 照片管理 | `backend/modules/photo.md` |
| 事件生成 | `backend/modules/event.md` |
| 地理编码 | `backend/modules/map.md` |
| 数据同步 | `backend/modules/sync.md` |
| 测试 | `backend/modules/testing.md` |
| API 索引 | `backend/api/INDEX.md` |
| 数据库 | `backend/database/schema-dictionary.md` |

---

## ⚡ 常用命令

```bash
# 后端测试
cd backend && source .venv/bin/activate && pytest -q

# 前端静态检查
cd mobile && npm run lint && npm run typecheck

# 启动后端
cd backend && source .venv/bin/activate && uvicorn main:app --reload

# 启动前端
cd mobile && npm run start
```

---

## 📖 延伸阅读

- **迁移到其他项目**：只需替换 `execution/01-test-profile.yaml` 和 `execution/04-doc-sync-rules.yaml`
- **AI 文档补全**：使用 `prompts/doc-enrichment.md` 中的提示词
- **编码规范**：`project/04-conventions.md`

---

> **最后更新**：2026-02-10
