# my-spec 系统背景与运行模型（完整说明）

## 1. 文档目的

本文件用于向任何新成员、任何 AI 代理一次性说明：

1. `my-spec` 为什么存在。
2. `my-spec` 解决什么问题。
3. `my-spec` 如何运行（命令、状态、门禁、证据、归档）。
4. `my-spec` 如何与项目知识文档系统联动。

阅读完本文件后，读者应能独立执行一次完整需求交付，或在其他项目复制同一套方法。

## 2. 背景与核心痛点

在 AI 高强度参与研发后，项目通常会出现以下问题：

1. **需求歧义放大**：一句话需求直接进入编码，返工成本高。
2. **测试缺乏闭环**：后端可测，前端尤其 RN 依赖手点，难以持续自动化。
3. **文档与代码脱节**：代码变更后文档不更新，知识系统逐步失真。
4. **缺少追溯链路**：出了问题无法快速回答“为什么改、改了什么、怎么验证”。

`my-spec` 的设计目标是把这四件事变成系统能力，而不是依赖个人习惯。

## 3. 系统定位

`my-spec` 不是单纯“写文档工具”，而是项目级 **DocOps（Documentation Operations）执行系统**。

它把研发过程拆成三层：

1. **操作系统层（system）**：长期稳定的规则和知识。
2. **变更工单层（changes）**：每次需求的一次性工单资产。
3. **证据层（artifacts）**：可审计的测试与日志事实。

目录对应：

```text
my-spec/
  system/
  changes/
  artifacts/
  archived/
```

## 4. 核心概念

- `change-name`：单次需求的唯一标识（kebab-case）。
- `RQ`：需求条目（Requirement）。
- `TC`：测试用例（Test Case）。
- `profile`：项目级测试适配配置（由技术栈决定）。
- `doc-sync`：代码变更到文档变更的映射规则。
- `doc_scope_manifest`：本次变更命中的文档范围声明。
- `doc_change_preview`：正式回写前的人审文档预变更说明。

## 5. 目标与非目标

### 5.1 目标

1. 需求从模糊到清晰有固定入口和门禁。
2. 测试先行并可执行，且与项目技术栈匹配。
3. 代码改动自动触发文档联动检查。
4. 每个变更都有可追溯工单和证据。

### 5.2 非目标

1. 不追求 100% 无人工参与（RN 场景允许握手步骤）。
2. 不追求一次搭建覆盖所有项目（通过 profile 适配）。
3. 不替代 CI/CD，而是可与 CI/CD 对接。

## 6. 信息架构

### 6.1 system 层（长期知识）

- `core/`：核心概念（状态机、命令契约、术语表）
- `execution/`：执行指南（测试配置、执行手册、文档联动）
- `project/`：本项目知识（概览、架构、规范）
- `prompts/`：AI 提示词模板
- `frontend/`：前端模块文档（认证、地图、上传、故事、测试）
- `backend/`：后端模块文档（认证、地图、照片、事件、同步、测试、API、DB）

### 6.2 changes 层（一次变更）

每个 `change-name` 目录至少包含：

- `meta.yaml`
- `prd.md`
- `testplan.md`
- `plan.md`
- `tasks.md`
- `doc_scope_manifest.yaml`
- `doc_change_preview.md`
- `verification.md`
- `changelog.md`

### 6.3 artifacts 层（证据）

- `reports/`：测试报告
- `logs/`：关键日志
- `screenshots/`：失败截图
- `traces/`：trace 资料
- `handshake/`：人机握手信号

## 7. 五命令主流程

### 7.1 `/spec:prd`

目标：澄清需求并产出高质量 PRD。

规则：

1. 一句话需求必须进入澄清循环。
2. 结构化需求也必须做一致性校验。
3. 未关闭关键歧义不得结束该阶段。

输出：`prd.md`，状态 `DRAFT -> CLARIFIED`。

### 7.2 `/spec:testplan <change-name>`

目标：把需求映射为可执行测试计划。

规则：

1. 只能在 `CLARIFIED` 执行。
2. 必须读取 `test-profile.yaml`。
3. 必须输出命令矩阵和 required 用例。

输出：`testplan.md`，状态 `CLARIFIED -> TEST_DEFINED`。

### 7.3 `/spec:plan <change-name>`

目标：制定薄技术方案、任务拆解、文档影响范围。

规则：

1. 只能在 `TEST_DEFINED` 执行。
2. 必须匹配 `doc-sync-rules.yaml`。
3. 必须生成 `doc_scope_manifest.yaml`。

输出：`plan.md`、`tasks.md`、`doc_change_preview.md`（初稿），状态 `TEST_DEFINED -> PLANNED`。

### 7.4 `/spec:apply <change-name>`

目标：实现并跑通 required 测试。

规则：

1. 只能在 `PLANNED` 执行。
2. 必须执行 required profile。
3. required 用例未全绿不得退出。
4. 需要人工步骤时必须走握手文件。

输出：代码改动 + artifacts + 更新后的 `doc_change_preview.md`，状态 `PLANNED -> IMPLEMENTING -> READY_FOR_VERIFY`。

### 7.5 `/spec:verify <change-name>`

目标：人工验收后完成文档回写并归档。

规则：

1. 只能在 `READY_FOR_VERIFY` 执行。
2. 必须检查文档联动是否完成。
3. 未同步 system 文档禁止归档。

输出：`ARCHIVED` 目录下的归档工单，状态 `READY_FOR_VERIFY -> ARCHIVED`。

## 8. 状态机与门禁

标准状态机：

`DRAFT -> CLARIFIED -> TEST_DEFINED -> PLANNED -> IMPLEMENTING -> READY_FOR_VERIFY -> ARCHIVED`

门禁原则：

1. 不允许跳状态。
2. 不允许跳 required 测试。
3. 不允许跳文档联动检查。

## 9. Bug 修复快速通道（hotfix）

对于 bug 修复场景，由于其灵活性高、场景多变，不强制走完整的五命令流程。

### 使用场景

- 验收后发现的小 bug
- 线上紧急修复
- 文案/样式微调

### 工作方式

1. 直接修复代码并验证
2. 修复完成后执行 `/spec:hotfix`
3. 命令自动完成：
   - 检查代码变更范围
   - 匹配 doc-sync 规则
   - 生成/更新相关文档
   - 记录 changelog

### 与完整流程的区别

| 项目 | 完整流程 | hotfix |
|------|----------|--------|
| PRD 澄清 | 必需 | 跳过 |
| 测试计划 | 必需 | 跳过 |
| 技术方案 | 必需 | 跳过 |
| 代码实现 | 流程内 | 流程外（已完成）|
| 文档同步 | 必需 | 必需 |
| changelog | 必需 | 必需 |
| 归档 | 必需 | 可选 |

## 10. 测试适配模型

`test-profile.yaml` 是“项目测试执行契约”。

本项目 profile：

1. `backend`（required）
2. `mobile_static`（required）
3. `mobile_e2e_manual_assisted`（conditional）
4. `mobile_unit`（optional）

当迁移到 Web 项目时，只需替换 profile，不需要改五命令主流程。

## 11. 文档联动模型

文档联动由三件事组成：

1. `doc-sync-rules.yaml`：规则定义（代码路径 -> 必改文档）。
2. `doc_scope_manifest.yaml`：本次变更命中的规则声明。
3. `doc_change_preview.md`：正式回写前的人审预览。

归档前必须通过“规则命中与文档更新一致性检查”。

## 12. 人机握手机制（前端/RN）

当自动化执行受限（真机点击、系统弹窗权限）时：

1. AI 输出 `ACTION_REQUIRED` 和 `step_id`。
2. 人工完成后写入 done 文件。
3. AI 轮询到 done 信号后继续执行。

标准路径：

`my-spec/artifacts/<change>/handshake/<step_id>.done`

## 13. 追溯与审计

每个变更必须能回答四个问题：

1. **为什么改**：`prd.md`
2. **怎么验证**：`testplan.md` + artifacts
3. **改了什么**：`plan.md` + `tasks.md` + `changelog.md`
4. **文档如何同步**：`doc_scope_manifest.yaml` + `doc_change_preview.md`

## 14. 落地执行清单（每次变更）

### 功能开发（完整流程）

1. 创建 change 目录。
2. 完成 PRD 澄清，关闭关键歧义。
3. 生成测试计划并确认 required 用例。
4. 生成方案、任务和文档影响清单。
5. 实施并跑通 required profile。
6. 产出证据并完成人工验收。
7. 同步 system 文档并归档。

### Bug 修复（hotfix 流程）

1. 直接修复代码并本地验证。
2. 执行 `/spec:hotfix` 同步文档。
3. 确认 changelog 记录完整。

## 15. 对其他项目复用时的最小改造点

只需替换：

1. `my-spec/system/execution/01-test-profile.yaml`
2. `my-spec/system/execution/04-doc-sync-rules.yaml`
3. `my-spec/system/frontend|backend/modules/*` 的模块目录定义

其余命令、状态机、工单结构可保持不变。
