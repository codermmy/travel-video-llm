# 后端模块：用户资料

## 1. 当前职责

- 查询当前用户资料
- 更新昵称、用户名、头像 URL
- 上传头像文件
- 通过用户名 / 昵称 / 用户 ID 查询用户

## 2. 代码入口

| 类型 | 文件 |
|---|---|
| 路由 | `backend/app/api/v1/users.py` |
| 用户模型 | `backend/app/models/user.py` |
| schema | `backend/app/schemas/user.py` |
| 存储服务 | `backend/app/services/storage_service.py` |

## 3. 当前接口

- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`
- `POST /api/v1/users/me/avatar`
- `GET /api/v1/users/by-username/{username}`
- `GET /api/v1/users/by-nickname/{nickname}`
- `GET /api/v1/users/{user_id}`

## 4. 关键规则

### 4.1 更新资料

- `nickname` 会做格式校验
- `username` 会转小写并校验唯一性
- `avatar_url` 允许直接写值，但移动端主链路用的是上传接口

### 4.2 头像上传

- 参数：`file_hash` + `multipart/form-data`
- 存储位置：
  - 未启用 OSS 时：`uploads/avatars/{user_id}/`
  - 启用 OSS 时：`avatars/{user_id}/`

## 5. 当前边界

- 移动端目前只正式使用 `me` 和 `me/avatar`
- 用户搜索接口已实现，但当前 App UI 未接入
