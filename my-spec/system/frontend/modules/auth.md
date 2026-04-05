# 前端模块：设备会话与鉴权

## 1. 职责范围

- App 启动时自动恢复或注册设备会话
- 维护 token、userId、deviceId 的本地存储
- 给每个 API 请求附带 `Authorization` 和 `X-Device-Id`
- 401 后自动清理本地态并重新初始化

## 2. 代码入口

| 类型 | 文件 |
|---|---|
| 根布局 | `mobile/app/_layout.tsx` |
| 状态管理 | `mobile/src/stores/authStore.ts` |
| 认证 API | `mobile/src/services/api/authApi.ts` |
| Axios 客户端 | `mobile/src/services/api/client.ts` |
| token 存储 | `mobile/src/services/storage/tokenStorage.ts` |
| deviceId 生成与持久化 | `mobile/src/utils/deviceUtils.ts` |

## 3. 当前真实流程

### 3.1 启动

1. `RootLayout` 首次挂载时调用 `bootstrapDeviceSession()`
2. 并行读取：
   - `tokenStorage.getToken()`
   - `tokenStorage.getTokenSavedAt()`
   - `getLocalUserInfo()`
3. token 在 30 天 TTL 内则直接恢复
4. token 缺失或过期则调用 `POST /api/v1/auth/register`
5. 成功后进入 `(tabs)`，失败则显示“设备初始化失败”

### 3.2 请求拦截

- 每次请求前都尝试附加：
  - `Authorization: Bearer <token>`
  - `X-Device-Id: <deviceId>`
- 开发环境下，如果当前 base URL 不通，会自动切换候选 API 地址

### 3.3 401 处理

- 非 auth 接口返回 401 时：
  - 清空本地 token
  - 触发 `unauthorizedHandler`
  - 重新走设备初始化

## 4. 本地存储

### 4.1 tokenStorage

- Web：`localStorage`
- 原生：`expo-file-system/legacy` 下的 JSON 文件

键值：

- `auth_token`
- `auth_token_saved_at`
- `user_id`
- `device_id`
- `user_email`

### 4.2 deviceId

- Web：`localStorage`
- 原生：`app-storage/device-id.txt`
- 首次生成后长期复用，作为设备账号身份基础

## 5. 当前不做

- 登录页 / 注册页 / 忘记密码页
- 邮箱验证码流程
- 手动退出到登录态

这些能力在 schema 和部分注释里还有遗留，但当前移动端主链路未接入。
