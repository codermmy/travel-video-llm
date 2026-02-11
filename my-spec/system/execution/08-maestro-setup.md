# Maestro E2E 测试指南

本文档说明如何在 Travel Album 项目中使用 Maestro 进行 E2E 测试。

---

## 1. 概述

### 1.1 为什么选择 Maestro

| 特性 | Maestro | Detox | Appium |
|------|---------|-------|--------|
| 配置复杂度 | 低（YAML） | 中 | 高 |
| RN/Expo 支持 | 原生支持 | 需配置 | 需配置 |
| AI 友好 | ✅ YAML 易生成 | 一般 | 一般 |

### 1.2 本项目特殊配置

由于使用 **Expo Development Build**，测试流程需要：
1. 连接到本地开发服务器
2. 处理 Expo Dev Client 的开发者菜单蒙层

这些已在共享流程中自动处理。

---

## 2. 目录结构

```
mobile/.maestro/
├── config.yaml                    # 配置文件（DEV_SERVER_URL）
├── run-tests.sh                   # 自动化运行脚本（自动获取本机 IP）
└── flows/
    ├── shared/
    │   └── connect-dev-server.yaml  # 共享：连接开发服务器 + 关闭开发者菜单
    ├── 00-app-launch.yaml           # 基础启动测试
    ├── 01-login-flow.yaml           # 登录流程测试
    ├── 02-quick-start.yaml          # 快速启动测试
    └── 03-tab-navigation.yaml       # Tab 导航测试
```

---

## 3. 测试场景分类

### 3.1 全新状态测试（clearState: true）

**适用场景**：
- 登录/注册流程
- 首次启动体验
- 权限请求流程

**特点**：
- 每次清除应用数据
- 需要重新连接开发服务器
- 需要处理开发者菜单蒙层

```yaml
appId: com.maoyuan.travelalbum
env:
  DEV_SERVER_URL: ${DEV_SERVER_URL}
---
- launchApp:
    clearState: true  # 清除所有数据

- runFlow: shared/connect-dev-server.yaml  # 连接开发服务器
```

### 3.2 保持状态测试（不清除数据）

**适用场景**：
- 已登录用户的功能测试
- 事件生成/照片管理等业务功能
- 需要已有数据的场景

**特点**：
- 保留登录状态和用户数据
- 应用会记住开发服务器，可能直接进入应用
- 测试更快，无需重复登录

```yaml
appId: com.maoyuan.travelalbum
env:
  DEV_SERVER_URL: ${DEV_SERVER_URL}
---
- launchApp  # 不清除状态，保留数据

# 可能需要处理两种情况：
# 1. 直接进入应用（已记住服务器）
# 2. 需要重新连接（服务器地址变化）
- runFlow:
    when:
      visible: "Development Build"
    file: shared/connect-dev-server.yaml
```

### 3.3 场景选择指南

| 测试类型 | clearState | 说明 |
|----------|------------|------|
| 登录/注册 | ✅ true | 需要全新状态 |
| 首次启动 | ✅ true | 测试欢迎页流程 |
| 事件生成 | ❌ false | 需要已有照片数据 |
| 照片导入 | ❌ false | 需要已登录状态 |
| 地图展示 | ❌ false | 需要已有事件数据 |
| 幻灯片播放 | ❌ false | 需要已有事件数据 |

---

## 4. 运行测试

### 4.1 前置条件

1. **启动开发服务器**：
   ```bash
   cd mobile && npx expo start
   ```

2. **连接设备**（Android 真机或模拟器）：
   ```bash
   adb devices  # 确认设备已连接
   ```

3. **安装 Maestro 驱动**（首次或驱动丢失时）：
   ```bash
   # 从 Maestro JAR 中提取并安装
   cd /tmp
   unzip -o ~/.maestro/lib/maestro-client.jar maestro-app.apk maestro-server.apk
   adb install -r -t /tmp/maestro-app.apk
   adb install -r -t /tmp/maestro-server.apk
   ```

### 4.2 使用自动化脚本（推荐）

```bash
cd mobile

# 运行单个测试（自动获取本机 IP）
.maestro/run-tests.sh 00-app-launch.yaml

# 运行所有测试
.maestro/run-tests.sh

# 指定端口（如果不是 8081）
EXPO_PORT=8082 .maestro/run-tests.sh
```

### 4.3 手动运行

```bash
cd mobile

# 获取本机 IP
IP=$(ipconfig getifaddr en0)

# 运行测试
~/.maestro/bin/maestro test .maestro/flows/00-app-launch.yaml \
  -e DEV_SERVER_URL="http://${IP}:8081"
```

### 4.4 带环境变量运行

```bash
.maestro/run-tests.sh 01-login-flow.yaml \
  -e EMAIL=test@example.com \
  -e PASSWORD=Test123456
```

---

## 5. 编写测试

### 5.1 testID 规范

在 React Native 组件上添加 `testID`：

```tsx
// ✅ 正确：testID 在原生 View 组件上
<View testID="welcome-screen">
  <LinearGradient>
    {/* 内容 */}
  </LinearGradient>
</View>

// ❌ 错误：testID 在第三方组件上（可能不生效）
<LinearGradient testID="welcome-screen">
  {/* 内容 */}
</LinearGradient>
```

**命名规范**：
```
<screen>-<element>[-<variant>]
```

示例：
- `welcome-screen` - 欢迎页容器
- `login-screen` - 登录页容器
- `email-input` - 邮箱输入框
- `quick-start-button` - 快速启动按钮
- `map-screen` - 地图页容器

### 5.2 测试流程模板

**全新状态测试模板**：
```yaml
# 测试名称
# 测试描述

appId: com.maoyuan.travelalbum
env:
  DEV_SERVER_URL: ${DEV_SERVER_URL}
---

# 启动应用（清除状态）
- launchApp:
    clearState: true

# 连接开发服务器
- runFlow: shared/connect-dev-server.yaml

# 测试步骤...
- assertVisible: "预期文字"
- tapOn:
    id: "button-id"
- takeScreenshot: test-result
```

**保持状态测试模板**：
```yaml
# 测试名称（需要已登录状态）
# 测试描述

appId: com.maoyuan.travelalbum
env:
  DEV_SERVER_URL: ${DEV_SERVER_URL}
---

# 启动应用（保持状态）
- launchApp

# 条件连接开发服务器（仅在需要时）
- runFlow:
    when:
      visible: "Development Build"
    file: shared/connect-dev-server.yaml

# 测试步骤...
```

### 5.3 常用命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `launchApp` | 启动应用 | `- launchApp: { clearState: true }` |
| `tapOn` | 点击元素 | `- tapOn: { id: "button-id" }` |
| `inputText` | 输入文字 | `- inputText: "hello"` |
| `eraseText` | 删除文字 | `- eraseText: 30` |
| `assertVisible` | 断言可见 | `- assertVisible: "Welcome"` |
| `extendedWaitUntil` | 等待条件 | 见下方 |
| `takeScreenshot` | 截图 | `- takeScreenshot: "name"` |
| `runFlow` | 运行子流程 | `- runFlow: shared/xxx.yaml` |

**等待元素出现**：
```yaml
- extendedWaitUntil:
    visible:
      id: "element-id"
    timeout: 30000  # 毫秒
```

**可选操作（不存在时跳过）**：
```yaml
- tapOn:
    text: "关闭"
    optional: true
```

---

## 6. AI 行为原则

### 6.1 核心原则

| 原则 | 说明 |
|------|------|
| **自主排错** | 测试失败时，AI 先截图分析，尝试自动修复，而不是直接报错给人 |
| **组合复用** | 新测试 = 已验证的基础流程 + 新增步骤，而不是从头写 |

### 6.2 自主排错原则

**测试失败时，AI 应该：**

```
测试失败
    ↓
1. 自动获取当前页面状态
   - 查看截图：~/.maestro/tests/<timestamp>/screenshot-❌-*.png
   - 获取元素：maestro hierarchy
    ↓
2. 分析失败原因
   - 是否有意外弹窗/蒙层？
   - 元素是否存在但 ID 不对？
   - 页面是否还在加载中？
    ↓
3. 尝试自动修复
   - 修改测试脚本（如添加关闭弹窗的步骤）
   - 调整等待时间
   - 修正元素选择器
    ↓
4. 重新运行测试验证修复
    ↓
5. 只有以下情况才请求人工介入：
   - 设备连接问题（硬件层面）
   - 权限被系统拒绝（需要手动设置）
   - 网络/服务器问题（环境层面）
   - 多次自动修复仍然失败
```

**示例：遇到意外蒙层**

```
❌ 测试失败：找不到 welcome-screen

AI 行为：
1. 截图查看 → 发现有开发者菜单蒙层
2. 分析原因 → 首次启动会显示此蒙层
3. 修复脚本 → 添加 `- tapOn: { text: "Close", optional: true }`
4. 重新运行 → 测试通过 ✅
```

### 6.3 组合复用原则

**核心思想**：不要从头写完整测试，而是复用已验证的基础流程。

**已验证流程的价值**：
- 100 步已验证流程 + 10 步新增 → 成功率高
- 110 步全部重写 → 出错概率高，理解偏差大

**流程组织结构**：

```
mobile/.maestro/flows/
├── shared/                          # 已验证的基础流程
│   ├── connect-dev-server.yaml      # 连接开发服务器
│   ├── login.yaml                   # 登录流程
│   ├── navigate-to-map.yaml         # 导航到地图页
│   ├── navigate-to-profile.yaml     # 导航到个人主页
│   └── navigate-to-events.yaml      # 导航到事件列表
├── auth/                            # 认证相关测试
│   ├── 00-app-launch.yaml
│   └── 01-login-flow.yaml
└── features/                        # 功能测试
    ├── event-generation.yaml
    └── logout.yaml
```

**编写新测试的步骤**：

```
1. 确定目标状态（如：在个人主页点击退出）
    ↓
2. 查找已验证流程（如何到达个人主页？）
    ↓
3. 组合已有流程
   - runFlow: shared/connect-dev-server.yaml  ✅ 已验证
   - runFlow: shared/login.yaml               ✅ 已验证
   - runFlow: shared/navigate-to-profile.yaml ✅ 已验证
    ↓
4. 只编写新增步骤
   - tapOn: "退出登录"
   - assertVisible: "确认退出"
   - tapOn: "确认"
```

**流程导航表**：

| 目标状态 | 使用流程 | 前置条件 |
|----------|----------|----------|
| 欢迎页（全新） | `shared/connect-dev-server.yaml` | `clearState: true` |
| 已登录-地图页 | `shared/login.yaml` | 欢迎页 |
| 已登录-个人主页 | `shared/navigate-to-profile.yaml` | 已登录 |
| 已登录-事件列表 | `shared/navigate-to-events.yaml` | 已登录 |

### 6.4 何时使用 Maestro 测试

| 场景 | 是否使用 | 说明 |
|------|----------|------|
| 新增页面/组件 | ✅ | 添加 testID，编写基础测试 |
| 修改交互逻辑 | ✅ | 验证交互流程正确 |
| 修改样式/布局 | ❌ | 视觉变化不影响功能 |
| 修复 Bug | 视情况 | 如果 Bug 涉及交互流程则需要 |
| 重构代码 | ✅ | 确保功能不受影响 |

### 6.5 AI 编写测试的完整步骤

1. **确定测试场景**：全新状态 or 保持状态
2. **查找可复用流程**：查看 `shared/` 目录和流程导航表
3. **组合已验证流程**：使用 `runFlow` 复用
4. **编写新增步骤**：只写必要的新步骤
5. **运行验证**：使用 `run-tests.sh`
6. **失败时自主排错**：截图分析 → 修复 → 重试

---

## 7. 与 my-spec 流程集成

### 7.1 在 testplan.md 中定义

```markdown
## E2E 测试用例

| TC-ID | 测试场景 | Maestro Flow | 状态要求 |
|-------|----------|--------------|----------|
| TC-E2E-001 | 应用启动 | 00-app-launch.yaml | 全新状态 |
| TC-E2E-002 | 登录流程 | 01-login-flow.yaml | 全新状态 |
| TC-E2E-003 | 事件生成 | event-generation.yaml | 保持状态 |
```

### 7.2 在 spec:apply 中执行

```bash
# 执行 E2E 测试并保存报告
cd mobile && .maestro/run-tests.sh 2>&1 | tee ../my-spec/artifacts/<change>/reports/maestro.txt
```

### 7.3 测试证据归档

测试截图和日志自动保存在：
```
~/.maestro/tests/<timestamp>/
├── screenshot-*.png
├── maestro.log
└── commands-*.json
```

---

## 8. 常见问题

### Q: 小米设备无法安装 Maestro 驱动？

A: 需要开启以下设置：
- 设置 → 更多设置 → 开发者选项 → USB 安装 ✅
- 设置 → 更多设置 → 开发者选项 → USB 调试（安全设置）✅

### Q: 测试卡在 "waiting_for_connection"？

A: Maestro 驱动未安装或未启动，手动安装：
```bash
adb install -r -t /tmp/maestro-app.apk
adb install -r -t /tmp/maestro-server.apk
```

### Q: 找不到 welcome-screen？

A: 检查：
1. testID 是否在原生 View 组件上（不是第三方组件）
2. 开发者菜单蒙层是否已关闭
3. 应用是否成功连接到开发服务器

### Q: 如何测试已登录状态的功能？

A: 使用保持状态模式：
```yaml
- launchApp  # 不加 clearState
```
先手动登录一次，后续测试会保持登录状态。

---

## 9. 已配置的 testID 清单

| 页面 | testID | 说明 |
|------|--------|------|
| 欢迎页 | `welcome-screen` | 页面容器 |
| 欢迎页 | `welcome-nickname-input` | 昵称输入框 |
| 欢迎页 | `quick-start-button` | 一键开始按钮 |
| 欢迎页 | `email-login-button` | 邮箱登录入口 |
| 欢迎页 | `register-button` | 注册入口 |
| 登录页 | `login-screen` | 页面容器 |
| 登录页 | `email-input` | 邮箱输入框 |
| 登录页 | `password-input` | 密码输入框 |
| 登录页 | `login-submit-button` | 登录按钮 |
| 注册页 | `register-screen` | 页面容器 |
| 地图页 | `map-screen` | 页面容器 |

---

> **最后更新**：2026-02-11
