# 问题：Expo Dev Client 启动即设备初始化失败，认证注册报 Network Error

## 现象

- Android 打开 App 后停在“设备初始化失败”
- 日志中可见：
  - `authStore.bootstrapDeviceSession register fresh device session`
  - `authStore.register failed {"error": "Network Error"}`
- 后端本机可访问，但移动端首个 `/api/v1/auth/register` 请求无法到达

## 原因

在 Expo 54 + Dev Client 环境下，开发机地址不一定还能稳定从旧的 `Constants.manifest.debuggerHost` 读取到。  
如果 `API_BASE_URL` 解析失败，客户端会回退到 `http://localhost:8000`：

- 真机访问 `localhost` 会指向手机自己
- Android 模拟器通常需要 `http://10.0.2.2:8000`
- 局域网真机通常需要开发机 Wi-Fi IP，例如 `http://192.168.x.x:8000`

因此一旦 host 解析不完整，就会在首次设备注册时直接报 `Network Error`。

## 解决方案

1. 在 `mobile/src/constants/api.ts` 中同时兼容以下来源：
   - `EXPO_PUBLIC_API_URL`
   - `Constants.expoConfig?.hostUri`
   - `Constants.expoGoConfig?.debuggerHost`
   - 旧版 `Constants.manifest?.debuggerHost`
   - `Constants.linkingUri / experienceUrl`
2. 生成多个候选 API 地址，而不是只保留一个：
   - 环境变量 URL
   - Expo 开发机 host 推导出的 `http://<host>:8000`
   - Android 模拟器 `http://10.0.2.2:8000`
   - iOS 模拟器 `http://127.0.0.1:8000`
   - `http://localhost:8000`
3. 在 `mobile/src/services/api/client.ts` 中，对开发环境下无响应的 `Network Error` 做一次候选地址自动回退重试
4. 在 `authApi.register()` 打印当前 API 解析信息，便于直接确认客户端最终命中的地址

## 相关文件

- `mobile/src/constants/api.ts`
- `mobile/src/services/api/client.ts`
- `mobile/src/services/api/authApi.ts`
- `mobile/src/utils/urlUtils.ts`

## 关键词

Expo 54, Dev Client, Network Error, 设备初始化失败, auth register, API_BASE_URL, debuggerHost, hostUri, 10.0.2.2, localhost

## 记录信息

- 首次记录：2026-04-01
- 最后更新：2026-04-01
