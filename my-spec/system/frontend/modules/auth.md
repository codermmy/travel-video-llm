# 前端模块：认证（Auth）

> **文档目的**：详细说明前端认证模块的页面、状态管理、存储策略和交互流程，帮助开发者快速理解和修改认证相关功能。

---

## 1. 模块概述

### 1.1 职责范围

- 展示注册/登录页面
- 维护登录态与 Token 存储
- 处理登录失败、Token 失效、重试
- 支持设备注册和邮箱密码认证
- 管理用户会话生命周期

### 1.2 代码入口

| 类型 | 文件路径 |
|------|----------|
| 登录页面 | `mobile/app/login.tsx` |
| 注册页面 | `mobile/app/register.tsx` |
| 认证入口 | `mobile/app/(auth)/index.tsx` |
| 忘记密码 | `mobile/app/forgot-password.tsx` |
| 状态管理 | `mobile/src/stores/authStore.ts` |
| API 服务 | `mobile/src/services/api/authApi.ts` |
| Token 存储 | `mobile/src/services/storage/tokenStorage.ts` |
| 认证组件 | `mobile/src/components/auth/` |
| 调试工具 | `mobile/src/utils/authDebug.ts` |

---

## 2. 页面结构

### 2.1 认证入口页 (`(auth)/index.tsx`)

**职责**：
- 检查本地 Token 状态
- 决定跳转到登录页还是主页
- 显示加载状态

**流程**：
```
┌─────────────────────────────────────────────────────────────────────────┐
│                        认证入口页流程                                    │
└─────────────────────────────────────────────────────────────────────────┘

页面加载
    ↓
调用 authStore.checkAuth()
    ↓
检查本地 Token
    ├─ 有 Token 且未过期 → 跳转主页
    ├─ Token 过期 → 清理本地状态 → 跳转登录页
    └─ 无 Token → 跳转登录页
```

### 2.2 登录页 (`login.tsx`)

**职责**：
- 邮箱密码登录表单
- 表单验证
- 登录状态反馈
- 跳转注册/忘记密码

**UI 组件**：
- `AuthBackground`：背景渐变
- `AuthInput`：输入框（邮箱、密码）
- `AuthButton`：登录按钮
- `Divider`：分隔线

### 2.3 注册页 (`register.tsx`)

**职责**：
- 邮箱验证码注册流程
- 密码强度检测
- 验证码发送与倒计时
- 注册成功后自动登录

**流程**：
```
┌─────────────────────────────────────────────────────────────────────────┐
│                        邮箱注册流程                                      │
└─────────────────────────────────────────────────────────────────────────┘

1. 输入邮箱
   ↓
2. 点击"发送验证码"
   ├─ 调用 POST /auth/send-verification-code
   └─ 开始 60 秒倒计时
   ↓
3. 输入验证码
   ↓
4. 输入密码（显示强度指示器）
   ↓
5. 点击"注册"
   ├─ 调用 POST /auth/register-email
   ├─ 成功：保存 Token → 跳转主页
   └─ 失败：显示错误信息
```

### 2.4 忘记密码页 (`forgot-password.tsx`)

**职责**：
- 发送重置密码验证码
- 验证码验证
- 设置新密码

---

## 3. 状态管理 (authStore)

### 3.1 状态定义

```typescript
type AuthState = {
  // 用户信息
  token: string | null;
  userId: string | null;
  deviceId: string | null;
  email: string | null;
  isNewUser: boolean;
  authType: string | null;

  // UI 状态
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // 方法
  register: (nickname?: string) => Promise<boolean>;
  registerWithEmail: (...) => Promise<boolean>;
  loginWithEmail: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
};
```

### 3.2 核心方法

#### `checkAuth()`

**职责**：检查本地认证状态，恢复登录态

**流程**：
```
1. 设置 isLoading = true
2. 并行读取本地存储：
   ├─ getLocalUserInfo()
   ├─ tokenStorage.getToken()
   └─ tokenStorage.getTokenSavedAt()
3. 检查 Token 有效性：
   ├─ 无 Token → 设置未认证状态
   ├─ Token 过期（>30天）→ 清理本地 → 设置未认证状态
   └─ Token 有效 → 设置已认证状态
4. 设置 isLoading = false
```

#### `loginWithEmail(email, password)`

**职责**：邮箱密码登录

**流程**：
```
1. 设置 isLoading = true, error = null
2. 调用 authApi.loginWithEmail()
3. 成功：
   ├─ 更新状态（token, userId, email 等）
   ├─ 设置 isAuthenticated = true
   └─ 返回 true
4. 失败：
   ├─ 解析错误信息
   ├─ 设置 error
   └─ 返回 false
5. 设置 isLoading = false
```

#### `logout()`

**职责**：退出登录，清理所有状态

**流程**：
```
1. 调用 authApi.logout()（清理本地存储）
2. 重置所有状态为初始值
3. 触发 UI 跳转到登录页
```

### 3.3 Token 过期处理

```typescript
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

// 在 checkAuth 中检查
const tokenAge = tokenSavedAt ? now - tokenSavedAt : 0;
const isExpired = tokenSavedAt !== null && tokenAge > TOKEN_TTL_MS;

if (isExpired) {
  await tokenStorage.clearAll();
  // 设置未认证状态
}
```

### 3.4 401 自动处理

```typescript
// 在 authStore 初始化时注册
setUnauthorizedHandler(() => {
  void useAuthStore.getState().logout();
});
```

---

## 4. Token 存储 (tokenStorage)

### 4.1 存储策略

| 平台 | 存储方式 | 说明 |
|------|----------|------|
| Web | `localStorage` | 浏览器本地存储 |
| iOS/Android | `FileSystem` (JSON) | Expo FileSystem 文件存储 |

### 4.2 存储键

| 键名 | 说明 |
|------|------|
| `auth_token` | JWT Token |
| `auth_token_saved_at` | Token 保存时间戳 |
| `user_id` | 用户 ID |
| `device_id` | 设备 ID |
| `user_email` | 用户邮箱 |

### 4.3 核心方法

```typescript
const tokenStorage = {
  // Token 操作
  saveToken(token: string): Promise<void>;
  getToken(): Promise<string | null>;
  removeToken(): Promise<void>;

  // Token 时间戳
  getTokenSavedAt(): Promise<number | null>;
  touchTokenSavedAt(): Promise<void>;

  // 用户信息
  saveUserId(userId: string): Promise<void>;
  getUserId(): Promise<string | null>;
  saveDeviceId(deviceId: string): Promise<void>;
  getDeviceId(): Promise<string | null>;
  saveEmail(email: string): Promise<void>;
  getEmail(): Promise<string | null>;

  // 清理
  clearAll(): Promise<void>;

  // 错误回调
  setErrorCallback(callback: ErrorCallback | null): void;
};
```

### 4.4 原生存储实现

```
存储路径：{documentDirectory}/app-storage/token-storage.json

文件结构：
{
  "auth_token": "jwt_token_string",
  "auth_token_saved_at": "1705312200000",
  "user_id": "uuid",
  "device_id": "uuid",
  "user_email": "user@example.com"
}
```

**特性**：
- 内存缓存 + 文件持久化
- 写入队列化（避免并发写入冲突）
- 失败重试（最多 3 次）
- 错误回调通知

---

## 5. API 服务 (authApi)

### 5.1 接口定义

```typescript
// 设备注册
register(nickname?: string): Promise<ApiResponse<AuthResponse>>;

// 邮箱注册
registerWithEmail(params: EmailPasswordRegisterParams): Promise<ApiResponse<AuthResponse>>;

// 邮箱登录
loginWithEmail(params: EmailPasswordLoginParams): Promise<ApiResponse<AuthResponse>>;

// 发送验证码
sendEmailCode(email: string, purpose: 'register' | 'reset_password'): Promise<ApiResponse<{message: string}>>;

// 验证邮箱
verifyEmailCode(email: string, code: string): Promise<ApiResponse<{message: string}>>;

// 重置密码
resetPassword(email: string, code: string, newPassword: string): Promise<ApiResponse<{message: string}>>;

// 检查认证状态
isAuthenticated(): Promise<boolean>;

// 退出登录
logout(): Promise<void>;

// 获取本地用户信息
getLocalUserInfo(): Promise<{userId, deviceId, email}>;
```

### 5.2 响应类型

```typescript
type AuthResponse = {
  token: string;
  user_id: string;
  device_id: string | null;
  email: string | null;
  nickname: string | null;
  created_at: string;
  is_new_user: boolean;
  auth_type: string;
};
```

### 5.3 自动 Token 持久化

登录/注册成功后，`authApi` 自动调用 `tokenStorage` 保存：
- Token
- User ID
- Device ID（如有）
- Email（如有）

---

## 6. 认证组件

### 6.1 组件列表

| 组件 | 文件 | 说明 |
|------|------|------|
| `AuthBackground` | `AuthBackground.tsx` | 渐变背景 |
| `AuthInput` | `AuthInput.tsx` | 输入框（支持密码显示切换） |
| `AuthButton` | `AuthButton.tsx` | 主按钮（支持加载状态） |
| `PasswordStrength` | `PasswordStrength.tsx` | 密码强度指示器 |
| `Divider` | `Divider.tsx` | 分隔线 |
| `OAuthButton` | `OAuthButton.tsx` | 第三方登录按钮（预留） |

### 6.2 样式常量

```
mobile/src/constants/
├── colors/auth.ts      # 认证页面颜色
├── spacing/auth.ts     # 间距常量
├── typography/auth.ts  # 字体样式
└── animations/auth.ts  # 动画配置
```

---

## 7. 认证流程图

### 7.1 完整认证流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        完整认证流程                                      │
└─────────────────────────────────────────────────────────────────────────┘

App 启动
    ↓
_layout.tsx 加载
    ↓
调用 authStore.checkAuth()
    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                        Token 检查                                        │
├─────────────────────────────────────────────────────────────────────────┤
│  有效 Token?                                                             │
│  ├─ 是 → isAuthenticated = true → 显示主页 (tabs)                       │
│  └─ 否 → isAuthenticated = false → 显示认证页 (auth)                    │
└─────────────────────────────────────────────────────────────────────────┘
    ↓
用户在认证页操作
    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                        登录/注册                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  1. 用户输入凭据                                                         │
│  2. 调用 authStore.loginWithEmail() 或 registerWithEmail()              │
│  3. API 返回 Token                                                       │
│  4. tokenStorage 保存 Token                                              │
│  5. authStore 更新状态                                                   │
│  6. 导航到主页                                                           │
└─────────────────────────────────────────────────────────────────────────┘
    ↓
用户使用 App
    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                        API 请求                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  每次请求自动附加 Authorization Header                                   │
│  ├─ 200 → 正常处理                                                       │
│  └─ 401 → 触发 unauthorizedHandler → logout() → 跳转登录页              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Token 刷新策略

当前实现采用**简单过期策略**：
- Token 有效期 30 天
- 过期后需重新登录
- 每次 `checkAuth` 检查过期时间

---

## 8. 错误处理

### 8.1 错误类型

| 错误场景 | 处理方式 |
|----------|----------|
| 网络错误 | 显示"网络错误，请重试" |
| 401 未授权 | 清理登录态，跳转登录页 |
| 密码错误 | 显示"账号或密码错误" |
| 邮箱已注册 | 显示"邮箱已被注册" |
| 验证码错误 | 显示"验证码错误或已过期" |
| 表单验证失败 | 前端即时校验提示 |

### 8.2 错误信息解析

```typescript
function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (typeof detail === 'object' && detail?.message) return detail.message;
    if (error.response?.status === 401) return '账号或密码错误';
    if (error.response?.status === 409) return '邮箱已被注册';
  }
  if (error instanceof Error) return error.message;
  return '操作失败，请稍后重试';
}
```

---

## 9. 调试工具

### 9.1 authDebug 工具

```typescript
// mobile/src/utils/authDebug.ts
authDebug(tag: string, data?: object);  // 调试日志
authWarn(tag: string, data?: object);   // 警告日志
```

**使用示例**：
```typescript
authDebug('authStore.checkAuth start');
authDebug('tokenStorage.getToken', { hasToken: Boolean(token) });
authWarn('authStore.loginWithEmail failed', { error: errorMessage });
```

### 9.2 日志输出

开发环境下，认证相关操作会输出详细日志：
```
[AUTH] authStore.checkAuth start
[AUTH] tokenStorage.getToken { hasToken: true }
[AUTH] authStore.checkAuth authenticated
```

---

## 10. 测试要点

### 10.1 静态检查

```bash
cd mobile && npm run lint && npm run typecheck
```

### 10.2 单元测试场景

- 登录成功/失败
- 注册成功/失败
- Token 过期处理
- 401 自动登出
- 表单验证

### 10.3 人工验收场景

- 完整登录流程
- 完整注册流程
- 退出登录后状态清理
- Token 过期后重新登录

---

## 11. 关联模块

| 模块 | 文档 | 关联说明 |
|------|------|----------|
| 后端认证 | `backend/modules/auth.md` | API 接口定义 |
| 前端上传 | `frontend/modules/upload.md` | 登录后触发同步检查 |
| 前端同步 | `frontend/modules/upload.md` | 多设备同步依赖认证 |
| API 客户端 | `mobile/src/services/api/client.ts` | 请求拦截、Token 注入 |

---

## 12. 变更影响

若本模块变更，需同步检查：

- [ ] `my-spec/system/backend/modules/auth.md`
- [ ] `my-spec/system/backend/api/INDEX.md`
- [ ] `my-spec/system/frontend/modules/upload.md`（若影响登录后流程）

---

> **最后更新**：2026-02-10
