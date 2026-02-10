# 人机握手协议（Handshake Protocol）

本文档定义 my-spec 流程中 AI 与人工协作的标准化握手机制，用于处理自动化无法完成的操作。

---

## 1. 适用场景

当以下情况发生时，需要启动握手机制：

| 场景 | 示例 |
|------|------|
| **真机操作** | 点击 RN 应用按钮、滑动手势、输入验证码 |
| **系统权限** | 相机/相册/定位权限弹窗确认 |
| **外部依赖** | 等待第三方 API 响应、等待邮件验证 |
| **人工判断** | UI 视觉验收、用户体验评估 |
| **环境准备** | 启动模拟器、连接真机、配置测试账号 |

---

## 2. 握手文件结构

```
my-spec/artifacts/<change-name>/handshake/
├── <step_id>.pending      # AI 创建，等待人工操作
├── <step_id>.done         # 人工创建，表示操作完成
├── <step_id>.failed       # 人工创建，表示操作失败
├── <step_id>.skip         # 人工创建，表示跳过此步骤
└── <step_id>.context.json # AI 创建，操作上下文信息
```

---

## 3. 握手流程

### 3.1 标准流程

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  AI 执行中 ──→ 遇到需人工操作 ──→ 创建 .pending + .context  │
│                                         │                   │
│                                         ▼                   │
│                              输出 ACTION_REQUIRED           │
│                                         │                   │
│                                         ▼                   │
│                              人工执行操作                    │
│                                         │                   │
│                    ┌────────────────────┼────────────────┐  │
│                    ▼                    ▼                ▼  │
│               创建 .done           创建 .failed      创建 .skip │
│                    │                    │                │  │
│                    ▼                    ▼                ▼  │
│               AI 继续执行         AI 记录失败        AI 跳过  │
│                                   并决定下一步       并继续   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 AI 输出格式

当需要人工操作时，AI 必须输出：

```
═══════════════════════════════════════════════════════════════
🔔 ACTION_REQUIRED
═══════════════════════════════════════════════════════════════

变更名称: <change-name>
步骤 ID:  <step_id>
操作类型: <operation_type>

📋 操作说明:
<详细的人工操作步骤>

✅ 完成后请执行:
touch my-spec/artifacts/<change-name>/handshake/<step_id>.done

❌ 如果失败请执行:
touch my-spec/artifacts/<change-name>/handshake/<step_id>.failed

⏭️ 如果需要跳过请执行:
touch my-spec/artifacts/<change-name>/handshake/<step_id>.skip

⏱️ 超时时间: <timeout_minutes> 分钟

═══════════════════════════════════════════════════════════════
```

---

## 4. step_id 命名规范

```
<phase>-<action>-<sequence>
```

| 部分 | 说明 | 示例 |
|------|------|------|
| `phase` | 测试阶段 | `e2e`, `manual`, `setup` |
| `action` | 具体动作 | `login`, `upload`, `permission` |
| `sequence` | 序号（可选） | `01`, `02` |

示例：
- `e2e-login-01`
- `manual-photo-upload`
- `setup-simulator`
- `e2e-permission-camera`

---

## 5. context.json 格式

AI 创建 `.pending` 时，同时创建 `.context.json` 记录上下文：

```json
{
  "step_id": "e2e-login-01",
  "change_name": "add-email-login",
  "created_at": "2026-02-10T14:30:00Z",
  "timeout_minutes": 30,
  "operation": {
    "type": "manual_test",
    "description": "在真机上测试邮箱登录流程",
    "preconditions": [
      "模拟器/真机已启动",
      "应用已安装最新版本"
    ],
    "steps": [
      "打开应用",
      "点击「邮箱登录」",
      "输入测试账号 test@example.com",
      "输入密码 Test123456",
      "点击「登录」按钮",
      "验证是否跳转到首页"
    ],
    "expected_result": "成功登录并显示首页",
    "evidence_required": [
      "登录成功截图",
      "首页截图"
    ]
  },
  "retry_count": 0,
  "max_retries": 2,
  "depends_on": [],
  "blocks": ["e2e-upload-photo"]
}
```

---

## 6. 超时处理

### 6.1 超时配置

| 操作类型 | 默认超时 | 可配置 |
|----------|----------|--------|
| 简单点击确认 | 5 分钟 | 是 |
| 功能测试 | 30 分钟 | 是 |
| 环境准备 | 60 分钟 | 是 |
| 复杂验收 | 120 分钟 | 是 |

### 6.2 超时后处理

```
超时检测
    │
    ├─→ 检查是否有 .done/.failed/.skip
    │       │
    │       ├─ 有 → 按信号处理
    │       │
    │       └─ 无 → 超时处理
    │               │
    │               ├─→ retry_count < max_retries
    │               │       │
    │               │       └─→ 重新输出 ACTION_REQUIRED
    │               │           retry_count++
    │               │
    │               └─→ retry_count >= max_retries
    │                       │
    │                       └─→ 标记为 BLOCKED
    │                           记录到 meta.yaml
```

---

## 7. 失败处理

### 7.1 .failed 文件内容（可选）

人工可以在 `.failed` 文件中记录失败原因：

```
# 失败原因
登录按钮点击后无响应，控制台报错 NetworkError

# 环境信息
- 设备: iPhone 14 Pro
- 系统: iOS 17.2
- 应用版本: 1.0.0-beta

# 截图
见 screenshots/error-login-20260210.png
```

### 7.2 AI 处理失败

收到 `.failed` 信号后，AI 应：

1. 读取失败原因（如有）
2. 记录到 `tasks.md`
3. 决定下一步：
   - 可自动修复 → 修复后重试
   - 需人工介入 → 输出新的 ACTION_REQUIRED
   - 无法继续 → 标记 BLOCKED

---

## 8. 多步骤编排

### 8.1 依赖关系

使用 `depends_on` 和 `blocks` 字段定义步骤依赖：

```json
{
  "step_id": "e2e-upload-photo",
  "depends_on": ["e2e-login-01"],
  "blocks": ["e2e-view-timeline"]
}
```

### 8.2 并行执行

无依赖关系的步骤可以并行请求：

```
═══════════════════════════════════════════════════════════════
🔔 ACTION_REQUIRED (2 个并行步骤)
═══════════════════════════════════════════════════════════════

【步骤 1】e2e-permission-camera
操作: 授予相机权限
完成后: touch .../handshake/e2e-permission-camera.done

【步骤 2】e2e-permission-location
操作: 授予定位权限
完成后: touch .../handshake/e2e-permission-location.done

两个步骤可同时进行，无先后顺序要求。
═══════════════════════════════════════════════════════════════
```

---

## 9. 快速参考

### 人工操作命令

```bash
# 完成操作
touch my-spec/artifacts/<change>/handshake/<step_id>.done

# 操作失败
touch my-spec/artifacts/<change>/handshake/<step_id>.failed

# 跳过步骤
touch my-spec/artifacts/<change>/handshake/<step_id>.skip

# 查看等待中的步骤
ls my-spec/artifacts/<change>/handshake/*.pending

# 查看步骤上下文
cat my-spec/artifacts/<change>/handshake/<step_id>.context.json
```

### AI 检查命令

```bash
# 检查是否有完成信号
test -f my-spec/artifacts/<change>/handshake/<step_id>.done && echo "DONE"

# 检查是否有失败信号
test -f my-spec/artifacts/<change>/handshake/<step_id>.failed && echo "FAILED"

# 检查是否有跳过信号
test -f my-spec/artifacts/<change>/handshake/<step_id>.skip && echo "SKIPPED"
```

---

## 10. 与其他文档的关联

| 文档 | 关联 |
|------|------|
| `execution/02-testing-playbook.md` | 定义何时需要握手 |
| `execution/06-artifacts-standard.md` | 定义 handshake 目录结构 |
| `core/02-status-machine.md` | 超时后进入 BLOCKED 状态 |
| `tasks.md` | 记录握手失败和重试 |

---

> **最后更新**：2026-02-10
