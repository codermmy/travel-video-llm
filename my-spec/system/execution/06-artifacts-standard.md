# Artifacts 标准化规范

本文档定义 my-spec 流程中测试证据（留痕）的标准化结构，确保每次变更都有可追溯的执行记录。

---

## 1. 目录结构

每个变更的 artifacts 存放在 `my-spec/artifacts/<change-name>/` 下：

```
my-spec/artifacts/<change-name>/
├── logs/                    # 执行日志
│   ├── backend-pytest.log   # 后端测试完整日志
│   ├── mobile-lint.log      # 移动端 lint 日志
│   ├── mobile-typecheck.log # 移动端类型检查日志
│   ├── build.log            # 构建日志（如有）
│   └── error-<timestamp>.log # 错误快照
│
├── reports/                 # 测试报告
│   ├── summary.md           # 测试结论汇总（必需）
│   ├── backend-pytest.txt   # pytest 输出
│   ├── mobile-lint.txt      # ESLint 输出
│   ├── mobile-typecheck.txt # TypeScript 检查输出
│   ├── coverage.txt         # 覆盖率报告（如有）
│   └── e2e-result.md        # E2E 测试结果（如有）
│
├── screenshots/             # UI 截图
│   ├── before/              # 修改前截图
│   ├── after/               # 修改后截图
│   └── error/               # 错误状态截图
│
├── traces/                  # 调试追踪
│   ├── network.har          # 网络请求记录
│   ├── performance.json     # 性能数据
│   └── debug-<timestamp>.json
│
└── handshake/               # 人机握手状态
    ├── <step_id>.pending    # 等待人工操作
    └── <step_id>.done       # 人工操作完成
```

---

## 2. 必需文件（Minimum Evidence Set）

每次 `spec:apply` 完成时，**必须**存在以下文件：

| 文件 | 说明 | 生成时机 |
|------|------|----------|
| `reports/summary.md` | 测试结论汇总 | apply 结束前 |
| `reports/backend-pytest.txt` | 后端测试输出 | 执行 backend profile 后 |
| `reports/mobile-lint.txt` | Lint 检查输出 | 执行 mobile_static profile 后 |
| `reports/mobile-typecheck.txt` | 类型检查输出 | 执行 mobile_static profile 后 |

---

## 3. summary.md 模板

```markdown
# 测试执行摘要

## 基本信息

- **变更名称**: <change-name>
- **执行时间**: YYYY-MM-DD HH:MM
- **执行者**: AI / 人工
- **最终状态**: PASS / FAIL / BLOCKED

## 执行的 Profile

| Profile | 状态 | 耗时 | 备注 |
|---------|------|------|------|
| backend | ✅ PASS | 12s | 15 tests passed |
| mobile_static | ✅ PASS | 8s | 0 errors, 2 warnings |
| mobile_e2e_manual_assisted | ⏭️ SKIP | - | 未命中触发条件 |

## 关键发现

- [发现1]
- [发现2]

## 失败记录（如有）

| 测试 | 失败原因 | 修复动作 | 重试次数 |
|------|----------|----------|----------|
| test_xxx | AssertionError | 修复逻辑 | 2 |

## 证据清单

- [x] `reports/backend-pytest.txt`
- [x] `reports/mobile-lint.txt`
- [x] `reports/mobile-typecheck.txt`
- [ ] `screenshots/` (本次无 UI 变更)

## 验收建议

[简要说明人工验收时需要关注的点]
```

---

## 4. 文件命名规范

### 4.1 日志文件

```
<profile>-<tool>.log          # 正常日志
error-<YYYYMMDD-HHMMSS>.log   # 错误快照
```

示例：
- `backend-pytest.log`
- `error-20260210-143052.log`

### 4.2 截图文件

```
<场景>-<序号>-<描述>.png
```

示例：
- `before-01-login-page.png`
- `after-01-login-page.png`
- `error-01-network-timeout.png`

### 4.3 握手文件

```
<step_id>.pending   # 创建时
<step_id>.done      # 完成时（人工创建）
```

示例：
- `manual-login-test.pending`
- `manual-login-test.done`

---

## 5. 生命周期

### 5.1 创建时机

| 阶段 | 动作 |
|------|------|
| `spec:apply` 开始 | 创建 `my-spec/artifacts/<change-name>/` 目录 |
| 执行每个 profile | 写入对应的 log 和 report |
| 遇到错误 | 立即写入 `error-<timestamp>.log` |
| UI 相关变更 | 截图存入 `screenshots/` |
| 需要人工操作 | 创建 `handshake/<step_id>.pending` |
| `spec:apply` 结束 | 生成 `reports/summary.md` |

### 5.2 归档时机

当变更状态变为 `ARCHIVED` 时：

1. artifacts 目录**保留原位**（不随 change 移动）
2. 在 `my-spec/archived/<change-name>/changelog.md` 中记录 artifacts 路径
3. 可选：压缩旧 artifacts（超过 30 天）

### 5.3 清理策略

| 条件 | 处理 |
|------|------|
| 变更已归档超过 90 天 | 可删除 logs/ 和 traces/ |
| 变更已归档超过 180 天 | 可删除全部 artifacts |
| 变更被废弃（未完成） | 立即删除 artifacts |

---

## 6. 失败场景的额外记录

当测试失败时，除常规文件外，还需记录：

### 6.1 失败日志增强

```
logs/
├── error-<timestamp>.log     # 完整错误输出
├── error-<timestamp>.env     # 环境变量快照（脱敏）
└── error-<timestamp>.context # 上下文信息
```

### 6.2 context 文件格式

```yaml
timestamp: 2026-02-10T14:30:52
change_name: add-photo-upload
profile: backend
command: pytest backend/tests/ -v
exit_code: 1
failed_tests:
  - test_photo_upload_success
  - test_photo_hash_duplicate
environment:
  python_version: "3.11.4"
  os: "darwin"
  node_version: "18.17.0"
last_commit: "abc1234"
notes: "Redis 连接超时，可能是服务未启动"
```

---

## 7. 与其他文档的关联

| 文档 | 关联方式 |
|------|----------|
| `testplan.md` | 定义需要执行哪些 profile |
| `tasks.md` | 记录失败原因和修复动作 |
| `meta.yaml` | 记录 BLOCKED 状态和原因 |
| `changelog.md` | 归档时记录 artifacts 路径 |
| `doc_change_preview.md` | 不直接关联 |

---

## 8. 快速参考

### 创建 artifacts 目录

```bash
mkdir -p my-spec/artifacts/<change-name>/{logs,reports,screenshots,traces,handshake}
```

### 检查必需文件

```bash
ls my-spec/artifacts/<change-name>/reports/
# 应包含: summary.md, backend-pytest.txt, mobile-lint.txt, mobile-typecheck.txt
```

### 创建握手信号

```bash
# AI 创建 pending
touch my-spec/artifacts/<change-name>/handshake/<step_id>.pending

# 人工完成后创建 done
touch my-spec/artifacts/<change-name>/handshake/<step_id>.done
```

---

> **最后更新**：2026-02-10
