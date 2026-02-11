# 问题：Maestro 找不到页面元素

## 现象

测试报错，提示找不到指定的元素：

```
❌ Assert that id: welcome-screen is visible... FAILED
Assertion is false: id: welcome-screen is visible
```

但实际上应用已经启动，页面应该已经加载。

## 原因

常见原因有以下几种：

### 原因 1：意外的弹窗/蒙层遮挡

Expo Dev Client 首次启动时会显示开发者菜单蒙层，提示：
- "This is the developer menu..."
- 有 "Continue" 和 "Close" 按钮

这个蒙层会遮挡应用界面，导致找不到应用内的元素。

### 原因 2：testID 在第三方组件上不生效

`testID` 放在第三方组件（如 `LinearGradient`）上可能不会正确暴露给原生层。

### 原因 3：页面还在加载中

JS Bundle 加载较慢，元素尚未渲染完成。

## 解决方案

### 针对原因 1：处理开发者菜单蒙层

在测试脚本中添加关闭蒙层的步骤：

```yaml
# 关闭开发者菜单蒙层（点击叉号）
- tapOn:
    text: "Close"
    optional: true
```

**注意**：点击 "Close"（叉号）关闭蒙层，不要点击 "Continue"（会进入开发者工具）。

### 针对原因 2：testID 放在原生组件上

```tsx
// ❌ 错误：testID 在第三方组件上
<LinearGradient testID="welcome-screen">
  {/* 内容 */}
</LinearGradient>

// ✅ 正确：testID 在原生 View 组件上
<View testID="welcome-screen">
  <LinearGradient>
    {/* 内容 */}
  </LinearGradient>
</View>
```

### 针对原因 3：增加等待时间

```yaml
- extendedWaitUntil:
    visible:
      id: "welcome-screen"
    timeout: 60000  # 增加到 60 秒
```

## 排查步骤

当遇到元素找不到时，AI 应该：

1. **查看失败截图**：
   ```bash
   open ~/.maestro/tests/<timestamp>/screenshot-❌-*.png
   ```

2. **获取当前页面元素**：
   ```bash
   ~/.maestro/bin/maestro hierarchy
   ```

3. **分析页面状态**：
   - 是否有弹窗/蒙层？
   - 目标元素是否存在但 ID 不同？
   - 页面是否还在加载？

4. **修复脚本并重试**

## 相关文件

- `mobile/.maestro/flows/shared/connect-dev-server.yaml` - 连接流程（包含关闭蒙层）
- `mobile/app/(auth)/index.tsx` - 欢迎页（testID 配置示例）
- `~/.maestro/tests/<timestamp>/` - 测试截图和日志

## 关键词

element not found, welcome-screen, 找不到元素, 蒙层, 弹窗, Development Build, Close, testID, LinearGradient, 第三方组件

## 记录信息

- 首次记录：2026-02-11
- 最后更新：2026-02-11
