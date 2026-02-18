# 状态机（v2）

## 正常状态

| 状态 | 含义 |
|---|---|
| `DRAFT` | 已创建 change，需求未澄清 |
| `CLARIFIED` | PRD 完成，核心歧义关闭 |
| `TEST_DEFINED` | 测试计划完成并标注 required |
| `PLANNED` | 技术方案、任务、文档影响已确认 |
| `IMPLEMENTING` | 正在开发并执行测试 |
| `READY_FOR_VERIFY` | required 全绿，等待验收 |
| `ARCHIVED` | 验收通过并归档 |

## 异常状态

| 状态 | 含义 |
|---|---|
| `BLOCKED` | 受外部条件阻塞，无法继续 |

## 唯一允许流转

`DRAFT -> CLARIFIED -> TEST_DEFINED -> PLANNED -> IMPLEMENTING -> READY_FOR_VERIFY -> ARCHIVED`

额外流转：

- `IMPLEMENTING -> BLOCKED`
- `BLOCKED -> IMPLEMENTING`
- `READY_FOR_VERIFY -> IMPLEMENTING`（验收打回）

## 硬门禁

1. 禁止跳状态。
2. required 测试未通过，禁止进入 `READY_FOR_VERIFY`。
3. doc-sync 未完成，禁止进入 `ARCHIVED`。

## 命令到状态映射

| 命令 | 前置状态 | 目标状态 |
|---|---|---|
| `spec:prd` | `DRAFT` 或未建工单 | `CLARIFIED` |
| `spec:testplan` | `CLARIFIED` | `TEST_DEFINED` |
| `spec:plan` | `TEST_DEFINED` | `PLANNED` |
| `spec:apply` | `PLANNED` | `IMPLEMENTING -> READY_FOR_VERIFY` |
| `spec:verify` | `READY_FOR_VERIFY` | `ARCHIVED` |

## 常见问题与处理

1. 状态不匹配：命令必须停止并提示当前状态与期望状态。
2. 测试失败：保留失败证据，状态保持 `IMPLEMENTING`。
3. 环境阻塞：进入 `BLOCKED` 并记录阻塞原因。
4. 验收打回：从 `READY_FOR_VERIFY` 回到 `IMPLEMENTING`。

## BLOCKED 记录要求（meta.yaml）

```yaml
status: BLOCKED
blocked_at: <ISO-8601>
blocked_reason: <why>
blocked_by: <dependency_or_env>
```

解除时：

```yaml
status: IMPLEMENTING
unblocked_at: <ISO-8601>
unblock_action: <what_changed>
```

## 归档后规则

- `ARCHIVED` 不允许回退。
- 如需修改已归档需求，必须新建 change。

> 最后更新：2026-02-11
