# 前端模块：测试（Testing）

> 文档目的：说明前端在 My-Spec 下的测试门禁、人工验收流程和证据标准。

---

## 1. 测试策略

本项目前端测试采用三层：

1. 静态检查（门禁）：`lint` + `typecheck`
2. 人工验收（门禁）：复杂业务交互由人工执行 checklist
3. 单元测试（可选）：`mobile_unit`

不使用前端 1:1 自动化测试作为门禁。

---

## 2. 门禁触发条件

命中 `mobile/**` 变更时，必须执行：

- `mobile_static`
- `mobile_manual_acceptance`

命中后端变更且不涉及 `mobile/**` 时，不要求执行前端门禁。

---

## 3. 必跑命令

```bash
cd mobile && npm run lint
cd mobile && npm run typecheck
```

输出写入：

- `my-spec/artifacts/<change>/reports/mobile-lint.txt`
- `my-spec/artifacts/<change>/reports/mobile-typecheck.txt`

---

## 4. 人工验收（默认主通道）

AI 在 `spec:apply` 中输出 `ACTION_REQUIRED`，人工完成后写入握手信号。

标准信号路径：

`my-spec/artifacts/<change>/handshake/<step_id>.done`

同时产出：

- `my-spec/artifacts/<change>/reports/manual-acceptance.md`
- `my-spec/artifacts/<change>/screenshots/`（如涉及 UI 变化）

---

## 5. manual-acceptance.md 建议模板

```markdown
# Manual Acceptance

- change-name:
- tester:
- date:

## Checklist
- [ ] 页面可达
- [ ] 关键路径可用
- [ ] 异常路径行为符合预期
- [ ] 回归点无明显破坏

## Result
- PASS / FAIL

## Notes
-
```

---

## 6. 失败处理

1. 人工验收失败时，写入 `.failed` 信号并记录原因。
2. AI 读取失败信息后，修复并重验或标记 `BLOCKED`。

---

## 7. 关联文档

- `my-spec/system/execution/01-test-profile.yaml`
- `my-spec/system/execution/02-testing-playbook.md`
- `my-spec/system/execution/07-handshake-protocol.md`

---

> 最后更新：2026-02-11
