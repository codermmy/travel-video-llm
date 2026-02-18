# 命令契约（v2，单一真相源）

## 通用规则

1. 每个命令必须检查前置状态。
2. 每个命令只依赖本文件规定的最小必读文档。
3. 命令输出必须落到 `my-spec/changes/<change-name>/` 或 `my-spec/artifacts/<change-name>/`。

## spec:prd

- 输入：用户需求（自然语言或草案）
- 前置：无
- 最小必读：本文件
- 必产物：`meta.yaml`、`prd.md`
- 状态：`DRAFT -> CLARIFIED`
- 完成条件：In Scope/Out of Scope、RQ、验收标准已完整
- 常见失败：需求仍有关键歧义（角色不明、边界不明、验收口径不明）

## spec:testplan <change-name>

- 输入：`<change-name>`
- 前置：`CLARIFIED`
- 最小必读：本文件 + `execution/01-test-profile.yaml`
- 必产物：`testplan.md`
- 状态：`CLARIFIED -> TEST_DEFINED`
- 完成条件：RQ->TC 映射完整，required 清单明确，命令矩阵可执行
- 常见失败：只写用例不写命令矩阵，或 required/optional 未区分

## spec:plan <change-name>

- 输入：`<change-name>`
- 前置：`TEST_DEFINED`
- 最小必读：本文件 + `execution/04-doc-sync-rules.yaml`
- 必产物：`plan.md`、`tasks.md`、`doc_scope_manifest.yaml`、`doc_change_preview.md`
- 状态：`TEST_DEFINED -> PLANNED`
- 完成条件：技术方案、任务拆解、文档影响和回滚方案完整
- 常见失败：遗漏 `doc_scope_manifest.yaml` 或未命中 doc-sync 规则

## spec:apply <change-name>

- 输入：`<change-name>`
- 前置：`PLANNED`
- 最小必读：本文件 + `execution/02-testing-playbook.md` + `execution/05-dod-checklist.md`
- 必产物：代码改动 + `artifacts/*` + 更新后的 `doc_change_preview.md`
- 状态：`PLANNED -> IMPLEMENTING -> READY_FOR_VERIFY`
- 完成条件：required profile 全绿，DoD 满足，证据齐全
- 常见失败：只跑静态检查未跑 required profile，或证据未落盘

## spec:verify <change-name>

- 输入：`<change-name>`
- 前置：`READY_FOR_VERIFY`
- 最小必读：本文件 + `execution/04-doc-sync-rules.yaml` + `execution/05-dod-checklist.md`
- 必产物：`verification.md`、更新 `changelog.md`、更新全局 `my-spec/CHANGELOG.md`、归档目录
- 状态：`READY_FOR_VERIFY -> ARCHIVED`
- 完成条件：doc-sync 通过，验收结论明确，归档成功
- 常见失败：文档已改但 `verification.md` / 全局 `CHANGELOG.md` 未同步

## hotfix（轻流）

- 用途：小 bug 或验收后小修
- 规则：可跳过 `prd/testplan/plan`，但必须保留测试证据和文档同步记录
- 推荐状态：`IMPLEMENTING -> READY_FOR_VERIFY` 或直接记录至 `hotfix-log`

## 命令输出最小检查

每个命令结束前至少确认：

1. 状态是否已切换到目标状态。
2. 约定产物文件是否存在。
3. 需要的 evidence 是否在 artifacts 落盘。

> 最后更新：2026-02-11
