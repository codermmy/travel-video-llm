# 术语表（Glossary）

> **文档目的**：统一 my-spec 系统中的核心术语定义，避免歧义。

---

## 核心概念

### change / change-name

单次需求变更的唯一标识，使用 kebab-case 命名。

```
示例：add-email-login, fix-map-cluster-click, refactor-photo-upload
```

每个 change 对应 `my-spec/changes/<change-name>/` 目录。

---

### 状态（Status）

变更在生命周期中的位置，共 7 个状态：

| 状态 | 含义 |
|------|------|
| `DRAFT` | 变更已创建，需求尚未澄清 |
| `CLARIFIED` | PRD 完成，关键歧义已关闭 |
| `TEST_DEFINED` | 测试计划已完成 |
| `PLANNED` | 技术方案 + 任务清单已完成 |
| `IMPLEMENTING` | 代码实现中 |
| `READY_FOR_VERIFY` | 实现完成，等待人工验收 |
| `ARCHIVED` | 验收通过，已归档 |

---

### 五命令

| 命令 | 作用 | 状态转换 |
|------|------|----------|
| `spec:prd` | 澄清需求，产出 PRD | DRAFT → CLARIFIED |
| `spec:testplan` | 定义测试计划 | CLARIFIED → TEST_DEFINED |
| `spec:plan` | 制定技术方案 | TEST_DEFINED → PLANNED |
| `spec:apply` | 实现 + 测试 | PLANNED → READY_FOR_VERIFY |
| `spec:verify` | 验收 + 归档 | READY_FOR_VERIFY → ARCHIVED |

---

### profile

测试执行配置，定义在 `execution/test-profile.yaml`。

| 类型 | 含义 |
|------|------|
| `required` | 必须通过，否则阻塞 |
| `conditional` | 满足条件时必须执行 |
| `optional` | 可选执行 |

本项目的 profile：
- `backend` (conditional)
- `mobile_static` (conditional)
- `mobile_manual_acceptance` (conditional)
- `mobile_unit` (optional)

---

### doc-sync

代码变更到文档变更的映射规则，定义在 `execution/doc-sync-rules.yaml`。

当修改某些代码文件时，必须同步更新对应的文档。

---

### artifacts

变更执行过程中产生的证据，存放在 `my-spec/artifacts/<change>/`。

| 目录 | 内容 |
|------|------|
| `reports/` | 测试报告 |
| `logs/` | 关键日志 |
| `screenshots/` | 失败截图 |
| `handshake/` | 人机握手信号 |

---

### 人机握手（Handshake）

当自动化测试无法完成某些操作（如真机点击、系统权限弹窗）时，AI 输出 `ACTION_REQUIRED`，等待人工完成后创建 `.done` 文件继续执行。

```
信号文件路径：my-spec/artifacts/<change>/handshake/<step_id>.done
```

---

### hotfix

Bug 修复快速通道，用于已完成代码修复后的文档同步。

| 项目 | 说明 |
|------|------|
| 适用场景 | 小 bug、文案微调、紧急修复 |
| 命令 | `spec:hotfix` |
| 特点 | 跳过 PRD/测试计划/技术方案，只做文档同步和 changelog |

与完整流程的区别：hotfix 假设代码已修复，只负责文档联动。

---

## 文档相关

### PRD (Product Requirements Document)

产品需求文档，由 `spec:prd` 产出，存放在 `changes/<change>/prd.md`。

---

### doc_scope_manifest

本次变更命中的文档范围声明，由 `spec:plan` 产出。

记录哪些 doc-sync 规则被触发，哪些文档需要更新。

---

### doc_change_preview

正式回写前的文档预变更说明，供人工审核。

在 `spec:verify` 阶段确认后，才正式回写到 system 文档。

---

### DoD (Definition of Done)

完成定义，变更必须满足的交付标准，见 `execution/dod-checklist.md`。

---

## 目录结构

### system/

长期稳定的规则和知识，不随单次变更而变化。

### changes/

每次需求的一次性工单资产，变更完成后归档到 `archived/`。

### artifacts/

可审计的测试与日志证据。

### archived/

已完成变更的归档目录。

---

> **最后更新**：2026-02-10
