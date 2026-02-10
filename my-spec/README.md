# my-spec 工作流说明

my-spec 是本仓库的 AI 驱动研发系统，目标是把需求澄清、测试先行、实现闭环、文档联动和归档追溯统一到一条可重复执行的流水线。

## 核心原则

1. 文档不是附属品，而是执行系统的一部分。
2. 先验证需求，再写实现；先定义测试，再写代码。
3. 任何变更都必须留下证据（日志、报告、截图、回归说明）。
4. 任何变更都必须同步更新 system 文档或明确声明无需更新。
5. 小改动使用 lite 模式，流程变轻但不绕过门禁。

## 目录结构

```text
my-spec/
  system/          # 项目知识系统（长期维护）
  templates/       # 规范模板（命令生成文档时使用）
  changes/         # 进行中的变更工单
  archived/        # 已归档变更
  artifacts/       # 测试/日志/截图/trace/握手状态
```

## 五个命令

- `/spec:prd`：创建并澄清变更，输出 `prd.md`
- `/spec:testplan <change-name>`：生成测试计划，输出 `testplan.md`
- `/spec:plan <change-name>`：生成薄技术方案和任务拆解
- `/spec:apply <change-name>`：实现 + 测试 + 自修复 + 文档预变更
- `/spec:verify <change-name>`：验收后同步文档并归档

## 七个状态

`DRAFT -> CLARIFIED -> TEST_DEFINED -> PLANNED -> IMPLEMENTING -> READY_FOR_VERIFY -> ARCHIVED`

完整规则请查看 `my-spec/system/global/status-machine.md`。

## 测试适配

- 项目测试配置文件：`my-spec/system/global/test-profile.yaml`
- 执行手册：`my-spec/system/global/testing-playbook.md`
- 所有 `spec:testplan` / `spec:apply` 必须按 profile 选择并执行测试。

## 推荐先读

- `my-spec/system/global/system-background-and-operating-model.md`
- `my-spec/system/global/doc-enrichment-prompts.md`
