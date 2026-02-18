# my-spec 系统文档

> 一句话定义：my-spec 是项目级 DocOps 执行系统，通过 5 命令 + 7 状态 + 文档联动，确保每次变更可追溯、可验证、可归档。

---

## 快速入门

### 你是谁？选择你的阅读路径：

| 场景 | 你应该看 | 预计时间 |
|------|----------|----------|
| 首次了解 my-spec | `core/01-what-is-my-spec.md` | 10 分钟 |
| 执行一个变更 | `core/03-command-contract.md` + `core/02-status-machine.md` + `execution/01-test-profile.yaml` | 5 分钟 |
| 了解本项目业务 | `project/01-overview.md` | 5 分钟 |
| 查找某个模块 | `frontend/` 或 `backend/` | 按需 |

---

## 目录结构

```
my-spec/system/
├── README.md                ← 你在这里
├── core/                    ← 核心概念（了解系统必读）
├── execution/               ← 执行指南（执行时必读）
├── project/                 ← 本项目知识（项目特定）
├── prompts/                 ← AI 提示词模板
├── frontend/                ← 前端模块文档
├── backend/                 ← 后端模块文档
└── knowledge/               ← 问题经验库
```

---

## 执行一个变更

### 五命令流程

`spec:prd -> spec:testplan -> spec:plan -> spec:apply -> spec:verify`

### 单一真相源（避免冲突）

1. 命令契约：`core/03-command-contract.md`
2. 状态门禁：`core/02-status-machine.md`
3. 测试门禁：`execution/01-test-profile.yaml`
4. 文档联动：`execution/04-doc-sync-rules.yaml`

### 执行中常用参考

| 阶段 | 参考文档 |
|------|----------|
| 写测试计划 | `execution/01-test-profile.yaml` |
| 跑测试 | `execution/02-testing-playbook.md` |
| 检查文档联动 | `execution/04-doc-sync-rules.yaml` |
| 验收检查 | `execution/05-dod-checklist.md` |

---

## 快速导航

- 完整索引：`INDEX.md`
- 项目概览：`project/01-overview.md`
- 前端模块：`frontend/INDEX.md`
- 后端模块：`backend/INDEX.md`

---

> 最后更新：2026-02-11
