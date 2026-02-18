# my-spec system 索引

> 入口文档：请先阅读 `README.md` 了解系统概览和阅读路径。

---

## 目录结构

```
my-spec/system/
├── README.md
├── core/
├── execution/
├── project/
├── knowledge/
├── prompts/
├── frontend/
└── backend/
```

---

## 按场景阅读

### 场景 1：首次了解 my-spec

1. `core/01-what-is-my-spec.md`
2. `core/02-status-machine.md`
3. `core/03-command-contract.md`
4. `core/04-glossary.md`

### 场景 2：执行一个变更

1. `core/03-command-contract.md`
2. `core/02-status-machine.md`
3. `execution/01-test-profile.yaml`
4. `execution/02-testing-playbook.md`
5. `execution/04-doc-sync-rules.yaml`
6. `execution/05-dod-checklist.md`

### 场景 3：了解本项目业务

1. `project/01-overview.md`
2. `project/02-architecture.md`
3. `project/03-module-catalog.md`
4. `project/04-conventions.md`

### 场景 4：查找模块文档

- 前端：`frontend/INDEX.md`
- 后端：`backend/INDEX.md`

---

## 单一真相源索引（新增）

| 规则类型 | 权威文件 |
|---|---|
| 命令输入/输出/前置 | `core/03-command-contract.md` |
| 状态流转/阻塞处理 | `core/02-status-machine.md` |
| required/conditional/optional 测试门禁 | `execution/01-test-profile.yaml` |
| 代码变更到文档联动 | `execution/04-doc-sync-rules.yaml` |

---

## 维护规则

1. 同一规则只在权威文件定义一次。
2. 其他文档只做解释与示例，避免重复写门禁。
3. 命令流程变更时，先改权威文件再改说明文档。

---

> 最后更新：2026-02-11
