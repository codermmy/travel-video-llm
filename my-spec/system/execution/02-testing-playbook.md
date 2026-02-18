# 测试执行手册（项目定制）

本手册定义 travel-video-llm 在 my-spec 流程下的测试执行方式，避免把 Web、RN、后端项目混为一套脚本。

## 1. 入口规则

1. `spec:testplan` 必须读取 `01-test-profile.yaml`，按 profile 生成用例与执行命令。
2. `spec:apply` 必须至少执行命中的 `required=conditional` profile。
3. 前端变更默认走 `mobile_manual_acceptance` 人工验收，不走 1:1 自动化门禁。

## 2. profile 解释

- `required`：必须通过，否则禁止 `READY_FOR_VERIFY`
- `conditional`：命中触发条件时必须通过
- `optional`：可选执行，失败需记录原因但不阻塞归档

前端策略补充：

- 复杂交互默认走 `mobile_manual_acceptance`
- 自动化脚本不再作为门禁项

## 3. 建议执行顺序

1. 后端测试（`backend`）
2. 移动端静态检查（`mobile_static`）
3. 移动端人工验收（`mobile_manual_acceptance`，命中时）

先后顺序理由：后端和静态检查能最快暴露确定性问题；前端复杂交互由人工验收更稳定。

## 4. 输出重定向示例

```bash
# backend
cd backend && source .venv/bin/activate && pytest -q \
  > ../my-spec/artifacts/<change>/reports/backend-pytest.txt 2>&1

# mobile static
cd mobile && npm run lint \
  > ../my-spec/artifacts/<change>/reports/mobile-lint.txt 2>&1
cd mobile && npm run typecheck \
  > ../my-spec/artifacts/<change>/reports/mobile-typecheck.txt 2>&1

# 前端人工验收报告（手工填写）
cat > my-spec/artifacts/<change>/reports/manual-acceptance.md << 'EOF'
# Manual Acceptance
- scenario:
- result:
- screenshots:
EOF
```

## 5. 人机握手步骤（RN）

当自动化测试无法完成设备侧动作时，AI 必须输出：

- `ACTION_REQUIRED`
- `change-name`
- `step_id`
- 人工步骤描述
- done 文件路径

done 文件标准路径：

`my-spec/artifacts/<change>/handshake/<step_id>.done`

人工验收报告路径建议：

`my-spec/artifacts/<change>/reports/manual-acceptance.md`

## 6. 证据最小集

每次 `spec:apply` 结束前，至少产出：

- `reports/backend-pytest.txt`
- `reports/mobile-lint.txt`
- `reports/mobile-typecheck.txt`
- `reports/manual-acceptance.md`（命中前端变更时）
- `logs/` 关键失败日志（如失败）
- `screenshots/` 或 `traces/`（如涉及 UI 验收）

## 7. 失败处理策略

1. 命令失败先记录原始输出到 artifacts。
2. 在 `tasks.md` 记录失败原因与修复动作。
3. 重跑同一 profile 直到通过，或达到 BLOCKED 条件。
4. 连续 3 次失败且确认为外部依赖阻塞时，进入 `BLOCKED`。

## 8. 前端自动化说明

当前项目流程不包含前端 1:1 自动化门禁；如需自动化，仅可作为临时调试手段，不计入门禁。

> 最后更新：2026-02-11
