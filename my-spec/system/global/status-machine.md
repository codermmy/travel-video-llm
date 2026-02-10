# 状态机定义

## 状态

- `DRAFT`：变更目录已创建，尚未澄清
- `CLARIFIED`：PRD 已完成，关键歧义已关闭
- `TEST_DEFINED`：测试计划已完成并通过 review
- `PLANNED`：薄技术方案 + 任务清单已完成
- `IMPLEMENTING`：代码实现与测试执行中
- `READY_FOR_VERIFY`：实现完成，测试通过，等待人工验收
- `ARCHIVED`：验收通过并已同步 system 文档，变更已归档

## 状态门禁

- `spec:prd` 结束时必须进入 `CLARIFIED`
- `spec:testplan` 只能在 `CLARIFIED` 执行
- `spec:plan` 只能在 `TEST_DEFINED` 执行
- `spec:apply` 只能在 `PLANNED` 执行
- `spec:verify` 只能在 `READY_FOR_VERIFY` 执行

## 模式

- `full`：完整流程，适用于功能迭代
- `lite`：轻量流程，适用于验收后小修或小 bug

`lite` 模式仍需满足测试和文档联动，不允许跳过 `spec:verify`。
