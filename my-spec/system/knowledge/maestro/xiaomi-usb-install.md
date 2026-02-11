# 问题：小米设备无法安装 Maestro 驱动

## 现象

运行 Maestro 测试时，驱动 APK 安装失败：

```
adb: failed to install maestro-app.apk: Failure [INSTALL_FAILED_USER_RESTRICTED: Install canceled by user]
```

或者安装时没有任何弹窗提示，静默失败。

## 原因

小米/MIUI 设备默认禁用了 USB 安装功能，出于安全考虑：
1. 「USB 安装」选项默认关闭
2. 「USB 调试（安全设置）」默认关闭
3. 部分 MIUI 版本需要登录小米账号才能开启这些选项

## 解决方案

### 步骤 1：开启开发者选项中的 USB 安装

```
设置 → 更多设置 → 开发者选项
    ✅ USB 调试（确保已开启）
    ✅ USB 安装（关键！）
    ✅ USB 调试（安全设置）（关键！）
```

### 步骤 2：如果找不到「USB 安装」选项

- 需要插入 SIM 卡
- 需要登录小米账号
- 尝试关闭再重新开启「开发者选项」

### 步骤 3：手动安装 Maestro 驱动

```bash
# 从 Maestro JAR 中提取 APK
cd /tmp
unzip -o ~/.maestro/lib/maestro-client.jar maestro-app.apk maestro-server.apk

# 安装（手机上会弹出确认框，点击「继续安装」）
adb install -r -t /tmp/maestro-app.apk
adb install -r -t /tmp/maestro-server.apk

# 验证安装成功
adb shell pm list packages | grep maestro
# 应该看到：
# package:dev.mobile.maestro
# package:dev.mobile.maestro.test
```

### 步骤 4：如果仍然失败

尝试关闭「MIUI 优化」：
```
设置 → 更多设置 → 开发者选项 → MIUI 优化 → 关闭
```
关闭后可能需要重启手机。

## 相关文件

- `~/.maestro/lib/maestro-client.jar` - 包含驱动 APK
- `/tmp/maestro-app.apk` - 提取后的主驱动
- `/tmp/maestro-server.apk` - 提取后的测试服务端

## 关键词

小米, MIUI, USB安装, INSTALL_FAILED_USER_RESTRICTED, Install canceled by user, 驱动安装失败, maestro-app.apk, USB调试安全设置

## 记录信息

- 首次记录：2026-02-11
- 最后更新：2026-02-11
- 验证设备：小米手机（MIUI）
