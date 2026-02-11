# 问题：Maestro 驱动连接超时

## 现象

运行 Maestro 测试时，长时间卡住后报错：

```
io.grpc.StatusRuntimeException: DEADLINE_EXCEEDED: deadline exceeded after 119.98s.
[closed=[], open=[[buffered_nanos=119986100000, waiting_for_connection]]]
```

或者显示：
```
Unable to launch app com.maoyuan.travelalbum
```

## 原因

Maestro 驱动（dev.mobile.maestro）未安装或未正常启动，导致 gRPC 连接无法建立。

常见原因：
1. 驱动 APK 从未安装
2. 驱动被卸载（之前手动卸载或系统清理）
3. 驱动安装失败（被小米等设备的安全机制拦截）

## 解决方案

### 步骤 1：检查驱动是否安装

```bash
adb shell pm list packages | grep maestro
```

正常应该看到：
```
package:dev.mobile.maestro
package:dev.mobile.maestro.test
```

如果没有输出，说明驱动未安装。

### 步骤 2：手动安装驱动

```bash
# 提取 APK
cd /tmp
unzip -o ~/.maestro/lib/maestro-client.jar maestro-app.apk maestro-server.apk

# 安装
adb install -r -t /tmp/maestro-app.apk
adb install -r -t /tmp/maestro-server.apk
```

### 步骤 3：如果安装失败

参考 `xiaomi-usb-install.md` 解决小米设备的 USB 安装权限问题。

### 步骤 4：重启 ADB 服务

```bash
adb kill-server
adb start-server
adb devices  # 确认设备已连接
```

### 步骤 5：重新运行测试

```bash
cd mobile && .maestro/run-tests.sh 00-app-launch.yaml
```

## 相关文件

- `~/.maestro/lib/maestro-client.jar` - 包含驱动 APK
- `~/.maestro/tests/<timestamp>/maestro.log` - 详细错误日志

## 关键词

DEADLINE_EXCEEDED, waiting_for_connection, Unable to launch app, gRPC, 连接超时, 驱动未安装, dev.mobile.maestro

## 记录信息

- 首次记录：2026-02-11
- 最后更新：2026-02-11
