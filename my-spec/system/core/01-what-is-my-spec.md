# 什么是 My-Spec（v2）

My-Spec 是一套“需求到归档”的执行系统，不是文档堆。它提供固定命令、固定状态机、固定证据要求。

## My-Spec 解决的问题

1. 需求未澄清直接编码。
2. 测试执行依赖个人习惯。
3. 文档与代码长期失配。
4. 变更无法审计与回放。

## v2 设计目标

1. 最小必读：执行时只强制少量文档。
2. 单一真相源：每条规则仅一个权威文件。 Into.
3. 流程可恢复：环境阻塞可进入 `BLOCKED`。
4. 证据可落地：所有结论都有 artifacts 对应。

## 运行模型

- 流程：`spec:prd` -> `spec:testplan` -> `spec:plan` -> `spec:apply` -> `spec:verify`
- 状态：`DRAFT -> CLARIFIED -> TEST_DEFINED -> PLANNED -> IMPLEMENTING -> READY_FOR_VERIFY -> ARCHIVED`
- 异常：`BLOCKED`

## 三层信息架构

1. `system/`：规则与知识。
2. `changes/`：单个需求工单。
3. `artifacts/`：测试报告、日志、截图、trace、握手信号。

## 快速原则

1. 未达前置状态，禁止执行下一命令。
2. required profile 未通过，禁止 `READY_FOR_VERIFY`。
3. doc-sync 未完成，禁止 `ARCHIVED`。
4. 需要人工步骤时，必须走握手协议。

## 你该先看什么

1. `core/03-command-contract.md`
2. `core/02-status-machine.md`
3. `execution/01-test-profile.yaml`

> 最后更新：2026-02-11
