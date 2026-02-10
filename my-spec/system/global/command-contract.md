# 命令契约

## spec:prd

- 输入：一句话需求或已有需求文档
- 输出：`changes/<change-name>/prd.md`、`meta.yaml`
- 状态：`DRAFT -> CLARIFIED`
- 要求：需求模糊时必须澄清，不允许直接跳到计划

## spec:testplan <change-name>

- 前置：`CLARIFIED`
- 输出：`testplan.md`
- 状态：`CLARIFIED -> TEST_DEFINED`
- 要求：必须读取 `my-spec/system/global/test-profile.yaml`，按 profile 产出可执行命令

## spec:plan <change-name>

- 前置：`TEST_DEFINED`
- 输出：`plan.md`、`tasks.md`、`doc_change_preview.md`（初稿）、`doc_scope_manifest.yaml`
- 状态：`TEST_DEFINED -> PLANNED`
- 要求：必须命中并记录 `doc-sync-rules.yaml` 规则

## spec:apply <change-name>

- 前置：`PLANNED`
- 输出：代码改动 + artifacts + `doc_change_preview.md`（更新）
- 状态：`PLANNED -> IMPLEMENTING -> READY_FOR_VERIFY`
- 要求：required profile 测试必须通过，失败时自动修复循环

## spec:verify <change-name>

- 前置：`READY_FOR_VERIFY`
- 输出：文档正式更新 + 归档到 `archived/<change-name>/`
- 状态：`READY_FOR_VERIFY -> ARCHIVED`
- 要求：文档联动检查通过后才允许归档
