# 状态机定义

## 状态

### 正常状态

| 状态 | 说明 |
|------|------|
| `DRAFT` | 变更目录已创建，尚未澄清 |
| `CLARIFIED` | PRD 已完成，关键歧义已关闭 |
| `TEST_DEFINED` | 测试计划已完成并通过 review |
| `PLANNED` | 薄技术方案 + 任务清单已完成 |
| `IMPLEMENTING` | 代码实现与测试执行中 |
| `READY_FOR_VERIFY` | 实现完成，测试通过，等待人工验收 |
| `ARCHIVED` | 验收通过并已同步 system 文档，变更已归档 |

### 异常状态

| 状态 | 说明 |
|------|------|
| `BLOCKED` | 因外部依赖、环境问题或多次失败无法继续，需人工介入 |

---

## 状态流转图

```
                    正常流程
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  DRAFT → CLARIFIED → TEST_DEFINED → PLANNED → IMPLEMENTING     │
│                                                       │        │
│                                                       ▼        │
│                                          READY_FOR_VERIFY      │
│                                                       │        │
│                                                       ▼        │
│                                                   ARCHIVED     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

                    异常流程
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  IMPLEMENTING ──(多次失败/外部阻塞)──→ BLOCKED                   │
│       ▲                                    │                    │
│       │                                    │                    │
│       └────────(问题解决后)────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 状态门禁

| 命令 | 前置状态 | 目标状态 |
|------|----------|----------|
| `spec:prd` | - | `CLARIFIED` |
| `spec:testplan` | `CLARIFIED` | `TEST_DEFINED` |
| `spec:plan` | `TEST_DEFINED` | `PLANNED` |
| `spec:apply` | `PLANNED` | `IMPLEMENTING` → `READY_FOR_VERIFY` |
| `spec:verify` | `READY_FOR_VERIFY` | `ARCHIVED` |

**门禁原则**：
- 不允许跳状态
- 不允许跳 required 测试
- 不允许跳文档联动检查

---

## BLOCKED 状态处理

### 进入条件

以下情况应进入 `BLOCKED` 状态：

1. **测试多次失败**：同一测试连续失败 3 次且无法自动修复
2. **外部依赖不可用**：第三方 API、服务、环境问题
3. **人工握手超时**：等待人工操作超过合理时间（如 24 小时）
4. **需求歧义重现**：实现过程中发现 PRD 有重大遗漏

### 进入 BLOCKED 时必须记录

在 `meta.yaml` 中添加：

```yaml
status: BLOCKED
blocked_at: 2026-02-10T12:00:00
blocked_reason: "后端测试连续失败 3 次，pytest 报错 ConnectionRefused"
blocked_by: "Redis 服务未启动"
```

### 解除条件

1. 问题已解决（环境修复、依赖恢复）
2. 人工确认可以继续
3. 解除后状态回到 `IMPLEMENTING`，继续执行

### 解除时必须记录

```yaml
status: IMPLEMENTING
unblocked_at: 2026-02-10T14:00:00
unblock_action: "启动 Redis 服务，重新运行测试"
```

---

## 状态回退

### 允许的回退场景

| 当前状态 | 可回退到 | 触发条件 |
|----------|----------|----------|
| `READY_FOR_VERIFY` | `IMPLEMENTING` | 验收发现新问题需要修复 |
| `BLOCKED` | `IMPLEMENTING` | 阻塞问题已解决 |

### 不允许的回退

- 已 `ARCHIVED` 的变更不可回退（如需修改，创建新 change）
- 不允许跨多个状态回退（如从 `PLANNED` 直接回到 `DRAFT`）

---

## 超时提醒

| 状态 | 建议最长停留时间 | 超时处理 |
|------|------------------|----------|
| `IMPLEMENTING` | 8 小时 | 检查是否应进入 BLOCKED |
| `READY_FOR_VERIFY` | 24 小时 | 提醒人工验收 |
| `BLOCKED` | 48 小时 | 升级处理或考虑放弃变更 |

---

> **最后更新**：2026-02-10
