# 测试执行手册（项目定制）

本手册定义 travel-video-llm 在 my-spec 流程下的测试执行方式，避免把 Web、RN、后端项目混为一套脚本。

## 1. 入口规则

1. `spec:testplan` 必须读取 `test-profile.yaml`，按 profile 生成用例与执行命令。
2. `spec:apply` 必须至少执行 required profile。
3. 验收涉及 UI 交互时，启用 `mobile_e2e_manual_assisted` 并使用握手机制。

## 2. required profile（本项目）

- `backend`
- `mobile_static`

满足以下任一条件时，增加 `mobile_e2e_manual_assisted`：

- 修改了 RN 页面交互（`mobile/src/screens/**`）
- 修改了导航或认证流程（`mobile/app/**`, `mobile/src/stores/authStore.ts`）
- 修改了上传/同步主流程（`mobile/src/services/**`）

## 3. 建议执行顺序

1. 后端测试
2. 移动端静态检查
3. 移动端 E2E（如命中条件）

先后顺序理由：后端逻辑错误通常可最快暴露；静态检查成本低；E2E 最重，放最后。

## 4. 人机握手步骤（RN）

当自动化测试无法完成设备侧动作时，AI 必须输出：

- `ACTION_REQUIRED`
- `change-name`
- `step_id`
- 人工步骤描述
- done 文件路径

done 文件标准路径：

`my-spec/artifacts/<change>/handshake/<step_id>.done`

## 5. 证据最小集

每次 `spec:apply` 结束前，必须产出：

- `reports/summary.md`：测试结论汇总
- `reports/backend-pytest.txt`
- `reports/mobile-lint.txt`
- `reports/mobile-typecheck.txt`
- `logs/` 关键失败日志（如失败）
- `screenshots/`（如涉及 UI 问题）

> **详细规范**：完整的 artifacts 目录结构、命名规范和生命周期管理，请参阅 `06-artifacts-standard.md`。

## 6. 失败处理策略

1. 命令失败先记录原始输出到 artifacts
2. 在 `tasks.md` 记录失败原因与修复动作
3. 重跑同一 profile 直到通过
4. 多次失败且外部依赖阻塞时，状态可标记 `BLOCKED` 并等待人工处理

> **BLOCKED 状态详情**：进入条件、记录格式和解除流程，请参阅 `core/02-status-machine.md` 的"BLOCKED 状态处理"章节。

## 7. 迁移到其他项目

迁移时不改命令，只改 `test-profile.yaml`：

- Web 项目可把 `mobile_e2e_manual_assisted` 替换为 Playwright profile
- 纯后端项目可只保留 backend profile
- 原生项目可增加 iOS/Android 分离 profile
