# 后端模块：设备认证

## 1. 当前职责

- 基于 `device_id` 自动注册或找回用户
- 生成 JWT access token
- 为后续 `CurrentUserIdDep` 提供鉴权基础

## 2. 代码入口

| 类型 | 文件 |
|---|---|
| 路由 | `backend/app/api/v1/auth.py` |
| token 生成 | `backend/app/core/security.py` |
| 用户模型 | `backend/app/models/user.py` |
| schema | `backend/app/schemas/user.py` |

## 3. 当前唯一活动接口

### `POST /api/v1/auth/register`

请求体：

```json
{
  "device_id": "string",
  "nickname": "可选"
}
```

行为：

- 若 `device_id` 已存在，直接返回现有用户 token
- 若不存在，创建 `auth_type=device` 的新用户
- 若传入 `nickname` 且老用户昵称为空，则补写昵称

返回字段：

- `token`
- `user_id`
- `device_id`
- `email`
- `nickname`
- `created_at`
- `is_new_user`
- `auth_type`

## 4. 当前口径

- 当前移动端只使用设备注册，不存在登录页和邮箱登录主链路
- `users` 表里与邮箱认证有关的字段仍保留，但路由层没有暴露对应接口
- 所有需要登录态的接口统一依赖 JWT，而不是 session/cookie
