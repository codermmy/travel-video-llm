# 人机握手协议（Handshake Protocol）

本文档定义 my-spec 流程中 AI 与人工协作的标准化握手机制，用于处理自动化无法完成的操作。

## 1. 适用场景

当以下情况发生时，需要启动握手机制：

| 场景 | 示例 |
|------|------|
| 真机操作 | 点击 RN 按钮、滑动、输入验证码 |
| 系统权限 | 相机/相册/定位权限弹窗确认 |
| 外部依赖 | 等待第三方响应、等待邮件验证码 |
| 人工判断 | UI 视觉验收、体验结论 |

## 2. 握手文件结构

```
my-spec/artifacts/<change-name>/handshake/
├── <step_id>.done
├── <step_id>.failed
├── <step_id>.skip
└── <step_id>.context.json  # 可选
```

## 3. step_id 命名规范

`<phase>-<action>-<sequence>`

示例：

- `manual-login-01`
- `manual-photo-upload-01`
- `setup-device-01`

说明：前端默认采用人工验收握手，不使用 1:1 自动化测试门禁。

## 4. AI 输出模板

```text
ACTION_REQUIRED
change-name: <change-name>
step_id: <step_id>
description: <详细人工步骤>
done_file: my-spec/artifacts/<change-name>/handshake/<step_id>.done
failed_file: my-spec/artifacts/<change-name>/handshake/<step_id>.failed
skip_file: my-spec/artifacts/<change-name>/handshake/<step_id>.skip
timeout_minutes: <timeout>
```

## 5. 超时与失败处理

1. 超时后若无信号，最多重试 2 次。
2. 重试仍失败，进入 `BLOCKED`。
3. 收到 `.failed` 后记录原因到 `tasks.md` 或 `logs/`，并决定重试或替代路径。

## 6. 快速操作命令

```bash
# 完成
touch my-spec/artifacts/<change>/handshake/<step_id>.done

# 失败
touch my-spec/artifacts/<change>/handshake/<step_id>.failed

# 跳过
touch my-spec/artifacts/<change>/handshake/<step_id>.skip
```

> 最后更新：2026-02-11
