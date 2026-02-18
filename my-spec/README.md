# my-spec 工作流说明

my-spec 是本仓库的 AI 驱动研发系统，目标是把需求澄清、测试先行、实现闭环、文档联动和归档追溯统一到一条可重复执行的流水线。

## 核心原则

1. 文档不是附属品，而是执行系统的一部分。
2. 先验证需求，再写实现；先定义测试，再写代码。
3. 任何变更都必须留下证据（日志、报告、截图、回归说明）。
4. 任何变更都必须同步更新 system 文档或明确声明无需更新。
5. Bug 修复使用 `spec:hotfix` 命令，快速同步文档而不走完整流程。

## 目录结构

```text
my-spec/
  CHANGELOG.md    # 全局变更日志（所有归档变更的历史记录）
  system/         # 项目知识系统（长期维护）
  templates/      # 规范模板（命令生成文档时使用）
  changes/        # 进行中的变更工单
  archived/       # 已归档变更
  artifacts/      # 测试/日志/截图/trace/握手状态
  hotfix-log.md   # Hotfix 快速修复记录
```

## 五个命令

- `/spec:prd`：创建并澄清变更，输出 `prd.md`
- `/spec:testplan <change-name>`：生成测试计划，输出 `testplan.md`
- `/spec:plan <change-name>`：生成薄技术方案和任务拆解
- `/spec:apply <change-name>`：实现 + 测试 + 自修复 + 文档预变更
- `/spec:verify <change-name>`：验收后同步文档并归档

## 七个状态

`DRAFT -> CLARIFIED -> TEST_DEFINED -> PLANNED -> IMPLEMENTING -> READY_FOR_VERIFY -> ARCHIVED`

完整规则请查看 `my-spec/system/core/02-status-machine.md`。

## 单一真相源（冲突处理）

- 命令输入/输出/前置条件：`my-spec/system/core/03-command-contract.md`
- 状态流转和门禁：`my-spec/system/core/02-status-machine.md`
- 测试执行标准：`my-spec/system/execution/01-test-profile.yaml`
- 文档联动标准：`my-spec/system/execution/04-doc-sync-rules.yaml`

## 测试适配

- 项目测试配置文件：`my-spec/system/execution/01-test-profile.yaml`
- 执行手册：`my-spec/system/execution/02-testing-playbook.md`
- 所有 `spec:testplan` / `spec:apply` 必须按 profile 选择并执行测试。

## 推荐先读

- `my-spec/system/README.md`（系统入口）
- `my-spec/system/core/01-what-is-my-spec.md`（完整说明）
- `my-spec/system/prompts/doc-enrichment.md`（AI 提示词模板）
