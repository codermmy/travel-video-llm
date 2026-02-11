# 问题：Expo Dev Client 开发者菜单蒙层

## 现象

使用 Expo Development Build 时，应用首次启动（或清除数据后启动）会显示一个黑色半透明蒙层，内容为：

```
This is the developer menu. It gives you access to useful tools in your development builds.

You can shake your device or long press anywhere on the screen with three fingers to get back to it at any time.

[Continue]  [×]
```

这个蒙层会阻挡自动化测试找到应用内的元素。

## 原因

这是 Expo Dev Client 的设计行为：
- 首次启动时向开发者介绍开发者菜单功能
- 告知如何再次打开开发者菜单（摇晃手机或三指长按）
- 需要用户手动关闭才能继续

## 解决方案

### 在 Maestro 测试中处理

在连接开发服务器后，添加关闭蒙层的步骤：

```yaml
# 关闭开发者菜单蒙层
# 注意：点击 Close（叉号）关闭，不要点 Continue（会进入开发者工具）
- tapOn:
    text: "Close"
    optional: true
```

### 完整的连接流程示例

```yaml
# shared/connect-dev-server.yaml

appId: com.maoyuan.travelalbum
---

# 等待 Expo 开发界面
- extendedWaitUntil:
    visible: "Development Build"
    timeout: 15000

# 输入开发服务器地址
- tapOn: "http://localhost:8081"
- eraseText: 30
- inputText: ${DEV_SERVER_URL}
- tapOn: "Connect"

# 关闭开发者菜单蒙层（首次启动会显示）
- tapOn:
    text: "Close"
    optional: true

# 等待应用加载
- extendedWaitUntil:
    visible:
      id: "welcome-screen"
    timeout: 60000
```

### 按钮说明

| 按钮 | 作用 | 测试中应该 |
|------|------|-----------|
| Close (×) | 关闭蒙层，进入应用 | ✅ 点击这个 |
| Continue | 进入开发者工具界面 | ❌ 不要点击 |

## 相关文件

- `mobile/.maestro/flows/shared/connect-dev-server.yaml` - 已配置关闭蒙层

## 关键词

Development Build, developer menu, 开发者菜单, 蒙层, Continue, Close, 首次启动, Expo Dev Client

## 记录信息

- 首次记录：2026-02-11
- 最后更新：2026-02-11
