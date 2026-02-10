# 后端模块：认证（Auth）

> **文档目的**：详细说明认证模块的 API、数据模型、业务流程和错误处理，帮助开发者快速理解和修改认证相关功能。

---

## 1. 模块概述

### 1.1 职责范围

- 设备 ID 自动注册（首次打开 App）
- 邮箱密码注册/登录
- 邮箱验证码发送与验证
- 密码重置
- JWT Token 生成与鉴权
- 用户身份隔离

### 1.2 代码入口

| 类型 | 文件路径 |
|------|----------|
| API 路由 | `backend/app/api/v1/auth.py` |
| 用户路由 | `backend/app/api/v1/users.py` |
| 数据模型 | `backend/app/models/user.py` |
| Schema | `backend/app/schemas/user.py` |
| 邮件服务 | `backend/app/services/email_service.py` |
| 安全工具 | `backend/app/core/security.py` |

---

## 2. API 接口

### 2.1 设备注册

```
POST /api/v1/auth/register
```

**用途**：首次打开 App 时，使用设备 ID 自动注册

**请求体**：
```json
{
  "device_id": "string (UUID)"
}
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "user_id": "string (UUID)",
    "token": "string (JWT)",
    "auth_type": "device"
  }
}
```

**业务规则**：
- 如果 `device_id` 已存在，返回已有用户的 token
- 如果 `device_id` 不存在，创建新用户并返回 token

---

### 2.2 发送邮箱验证码

```
POST /api/v1/auth/send-verification-code
```

**用途**：注册前发送邮箱验证码

**请求体**：
```json
{
  "email": "user@example.com"
}
```

**响应**：
```json
{
  "code": 0,
  "message": "验证码已发送",
  "data": null
}
```

**业务规则**：
- 验证码 6 位数字
- 有效期 10 分钟
- 同一邮箱 60 秒内不可重复发送

---

### 2.3 验证邮箱验证码

```
POST /api/v1/auth/verify-email
```

**用途**：验证邮箱验证码是否正确

**请求体**：
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**响应**：
```json
{
  "code": 0,
  "message": "验证成功",
  "data": {
    "verified": true
  }
}
```

---

### 2.4 邮箱密码注册

```
POST /api/v1/auth/register-email
```

**用途**：使用邮箱密码注册新账户

**请求体**：
```json
{
  "email": "user@example.com",
  "password": "string (min 8 chars)",
  "code": "123456",
  "device_id": "string (UUID, optional)"
}
```

**响应**：
```json
{
  "code": 0,
  "message": "注册成功",
  "data": {
    "user_id": "string (UUID)",
    "token": "string (JWT)",
    "auth_type": "email"
  }
}
```

**业务规则**：
- 必须先通过 `verify-email` 验证邮箱
- 如果提供 `device_id`，会关联到该设备
- 密码使用 bcrypt 加密存储

---

### 2.5 邮箱密码登录

```
POST /api/v1/auth/login
```

**用途**：使用邮箱密码登录

**请求体**：
```json
{
  "email": "user@example.com",
  "password": "string"
}
```

**响应**：
```json
{
  "code": 0,
  "message": "登录成功",
  "data": {
    "user_id": "string (UUID)",
    "token": "string (JWT)",
    "auth_type": "email"
  }
}
```

---

### 2.6 发送密码重置验证码

```
POST /api/v1/auth/send-reset-code
```

**用途**：忘记密码时发送重置验证码

**请求体**：
```json
{
  "email": "user@example.com"
}
```

---

### 2.7 重置密码

```
POST /api/v1/auth/reset-password
```

**用途**：使用验证码重置密码

**请求体**：
```json
{
  "email": "user@example.com",
  "code": "123456",
  "new_password": "string (min 8 chars)"
}
```

---

### 2.8 获取当前用户信息

```
GET /api/v1/users/me
```

**Headers**：
```
Authorization: Bearer <token>
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "string (UUID)",
    "email": "user@example.com",
    "nickname": "string",
    "avatar_url": "string",
    "username": "string",
    "auth_type": "email",
    "email_verified": true,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

---

### 2.9 更新当前用户信息

```
PATCH /api/v1/users/me
```

**Headers**：
```
Authorization: Bearer <token>
```

**请求体**：
```json
{
  "nickname": "string (optional)",
  "avatar_url": "string (optional)",
  "username": "string (optional)"
}
```

---

## 3. 数据模型

### 3.1 User 表

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 主键 | PK |
| `device_id` | String | 设备 ID | UNIQUE, 可空 |
| `email` | String | 邮箱 | UNIQUE, 可空 |
| `hashed_password` | String | 密码哈希 | 可空 |
| `auth_type` | Enum | 认证类型 | `device` / `email` |
| `email_verified` | Boolean | 邮箱是否验证 | 默认 false |
| `verification_code` | String | 验证码 | 可空 |
| `verification_expires_at` | DateTime | 验证码过期时间 | 可空 |
| `reset_code` | String | 重置码 | 可空 |
| `reset_code_expires_at` | DateTime | 重置码过期时间 | 可空 |
| `nickname` | String | 昵称 | 可空 |
| `avatar_url` | String | 头像 URL | 可空 |
| `username` | String | 用户名 | UNIQUE, 可空 |
| `created_at` | DateTime | 创建时间 | |
| `updated_at` | DateTime | 更新时间 | |

### 3.2 UserDeviceSyncState 表

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 主键 | PK |
| `user_id` | UUID | 用户 ID | FK → users |
| `device_id` | String | 设备 ID | |
| `last_pull_cursor` | String | 上次拉取游标 | 可空 |
| `last_pull_at` | DateTime | 上次拉取时间 | 可空 |
| `last_prompt_at` | DateTime | 上次提示时间 | 可空 |

**联合唯一约束**：`(user_id, device_id)`

---

## 4. 认证流程

### 4.1 设备注册流程

```
┌─────────────────────────────────────────────────────────────┐
│                      首次打开 App                            │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  生成设备 UUID（本地存储）                                    │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  POST /auth/register { device_id }                          │
└─────────────────────────────┬───────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│  device_id 已存在   │         │  device_id 不存在   │
│  返回已有用户 token │         │  创建新用户         │
└─────────────────────┘         │  返回新 token       │
                                └─────────────────────┘
```

### 4.2 邮箱注册流程

```
┌─────────────────────────────────────────────────────────────┐
│  1. POST /auth/send-verification-code { email }             │
│     → 发送 6 位验证码到邮箱                                  │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. POST /auth/verify-email { email, code }                 │
│     → 验证码正确返回 verified: true                          │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. POST /auth/register-email { email, password, code }     │
│     → 创建用户，返回 token                                   │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Token 鉴权流程

```
┌─────────────────────────────────────────────────────────────┐
│                      API 请求                                │
│  Headers: Authorization: Bearer <token>                     │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   get_current_user 依赖                      │
│  1. 解析 JWT Token                                          │
│  2. 验证签名和过期时间                                       │
│  3. 从 payload 提取 user_id                                 │
│  4. 查询数据库获取用户对象                                   │
└─────────────────────────────┬───────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│  Token 有效         │         │  Token 无效/过期    │
│  注入 current_user  │         │  返回 401 错误      │
│  继续处理请求       │         │  前端跳转登录页     │
└─────────────────────┘         └─────────────────────┘
```

---

## 5. 错误码

| 错误码 | HTTP 状态 | 说明 |
|--------|-----------|------|
| `AUTH_001` | 400 | 邮箱格式无效 |
| `AUTH_002` | 400 | 密码长度不足 |
| `AUTH_003` | 400 | 验证码错误或已过期 |
| `AUTH_004` | 400 | 邮箱已被注册 |
| `AUTH_005` | 401 | 邮箱或密码错误 |
| `AUTH_006` | 401 | Token 无效或已过期 |
| `AUTH_007` | 429 | 验证码发送过于频繁 |

---

## 6. 安全约束

### 6.1 密码安全

- 密码最小长度：8 字符
- 使用 bcrypt 加密，cost factor = 12
- 不存储明文密码

### 6.2 Token 安全

- JWT 有效期：30 天
- 签名算法：HS256
- Secret Key 从环境变量读取

### 6.3 验证码安全

- 6 位数字
- 有效期：10 分钟
- 同一邮箱 60 秒内不可重复发送
- 验证成功后立即失效

---

## 7. 测试要点

### 7.1 单元测试

```bash
cd backend && pytest tests/test_auth.py -v
```

**覆盖场景**：
- 设备注册成功
- 设备注册幂等性（重复注册返回相同用户）
- 邮箱注册成功
- 邮箱已存在时注册失败
- 登录成功
- 登录失败（密码错误）
- Token 验证成功
- Token 验证失败（过期/无效）

### 7.2 集成测试

- 完整注册流程（发送验证码 → 验证 → 注册）
- 完整登录流程（登录 → 访问受保护接口）
- 密码重置流程

---

## 8. 关联模块

| 模块 | 文档 | 关联说明 |
|------|------|----------|
| 前端认证 | `frontend/modules/auth.md` | 登录/注册页面、Token 存储 |
| 后端同步 | `backend/modules/sync.md` | 多设备同步需要用户身份 |
| API 索引 | `backend/api/INDEX.md` | 认证接口定义 |

---

## 9. 变更影响

若本模块变更，需同步检查：

- [ ] `my-spec/system/frontend/modules/auth.md`
- [ ] `my-spec/system/backend/api/INDEX.md`
- [ ] `my-spec/system/backend/database/schema-dictionary.md`
- [ ] `my-spec/system/global/test-profile.yaml`（若新增测试依赖）

---

> **最后更新**：2026-02-10
