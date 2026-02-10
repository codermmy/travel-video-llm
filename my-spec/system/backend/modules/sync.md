# 后端模块：多设备同步（Sync）

> **文档目的**：详细说明多设备同步模块的 API、数据模型、同步机制和冲突处理策略，帮助开发者快速理解和修改同步相关功能。

---

## 1. 模块概述

### 1.1 职责范围

- 管理设备同步状态
- 提供增量数据同步能力
- 处理同步冲突与幂等
- 支持多设备数据一致性

### 1.2 代码入口

| 类型 | 文件路径 |
|------|----------|
| API 路由 | `backend/app/api/v1/sync.py` |
| 数据模型 | `backend/app/models/user.py` (UserDeviceSyncState) |
| Schema | `backend/app/schemas/task.py` (SyncStatusResponse, SyncPullRequest) |

---

## 2. API 接口

### 2.1 获取同步状态

```
GET /api/v1/sync/status
```

**Headers**：
```
Authorization: Bearer <token>
X-Device-Id: <device_uuid>
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "has_cloud_data": true,
    "cloud_photo_count": 500,
    "cloud_event_count": 20,
    "local_synced": false,
    "last_pull_at": "2024-01-15T10:30:00Z",
    "should_prompt_sync": true
  }
}
```

**字段说明**：
| 字段 | 说明 |
|------|------|
| `has_cloud_data` | 云端是否有该用户的数据 |
| `cloud_photo_count` | 云端照片总数 |
| `cloud_event_count` | 云端事件总数 |
| `local_synced` | 当前设备是否已同步 |
| `last_pull_at` | 上次拉取时间 |
| `should_prompt_sync` | 是否应该提示用户同步 |

---

### 2.2 拉取云端数据

```
POST /api/v1/sync/pull
```

**Headers**：
```
Authorization: Bearer <token>
X-Device-Id: <device_uuid>
```

**请求体**：
```json
{
  "cursor": "2024-01-15T10:30:00Z",
  "limit": 100
}
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "events": [
      {
        "id": "uuid",
        "title": "北京三日游",
        "location_name": "北京市",
        "start_time": "2024-01-15T08:00:00Z",
        "photo_count": 50,
        "cover_photo_url": "https://...",
        "status": "generated"
      }
    ],
    "photos": [
      {
        "id": "uuid",
        "event_id": "uuid",
        "thumbnail_url": "https://...",
        "shoot_time": "2024-01-15T10:30:00Z"
      }
    ],
    "next_cursor": "2024-01-16T08:00:00Z",
    "has_more": true
  }
}
```

**业务规则**：
- 按 `created_at` 升序返回数据
- `cursor` 为空时从头开始
- `limit` 默认 100，最大 500
- 返回 `next_cursor` 供下次请求使用

---

### 2.3 确认同步完成

```
POST /api/v1/sync/ack
```

**Headers**：
```
Authorization: Bearer <token>
X-Device-Id: <device_uuid>
```

**请求体**：
```json
{
  "cursor": "2024-01-16T08:00:00Z"
}
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "acknowledged": true,
    "last_pull_cursor": "2024-01-16T08:00:00Z",
    "last_pull_at": "2024-01-16T12:00:00Z"
  }
}
```

**业务规则**：
- 更新 `UserDeviceSyncState.last_pull_cursor`
- 更新 `UserDeviceSyncState.last_pull_at`
- 幂等操作，重复调用不会出错

---

## 3. 数据模型

### 3.1 UserDeviceSyncState 表

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 主键 | PK |
| `user_id` | UUID | 用户 ID | FK → users, NOT NULL |
| `device_id` | String | 设备 ID | NOT NULL |
| `last_pull_cursor` | String | 上次拉取游标 | 可空 |
| `last_pull_at` | DateTime | 上次拉取时间 | 可空 |
| `last_prompt_at` | DateTime | 上次提示时间 | 可空 |
| `created_at` | DateTime | 创建时间 | |
| `updated_at` | DateTime | 更新时间 | |

**联合唯一约束**：`(user_id, device_id)`

---

## 4. 同步机制

### 4.1 同步流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           多设备同步流程                                  │
└─────────────────────────────────────────────────────────────────────────┘

设备 A（已有数据）                              设备 B（新设备）
─────────────────                              ─────────────────

1. 用户在设备 A 上传照片
   ↓
2. 照片聚类生成事件
   ↓
3. AI 生成故事
   ↓
4. 数据存储到云端
                                               5. 用户在设备 B 登录
                                                  ↓
                                               6. GET /sync/status
                                                  → has_cloud_data: true
                                                  → should_prompt_sync: true
                                                  ↓
                                               7. 显示同步提示弹窗
                                                  ↓
                                               8. 用户确认同步
                                                  ↓
                                               9. POST /sync/pull (cursor: null)
                                                  → 返回第一批数据
                                                  ↓
                                               10. 循环拉取直到 has_more: false
                                                   ↓
                                               11. POST /sync/ack
                                                   → 更新同步状态
                                                   ↓
                                               12. 本地展示云端数据
```

### 4.2 增量同步

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           增量同步机制                                   │
└─────────────────────────────────────────────────────────────────────────┘

时间线：
─────────────────────────────────────────────────────────────────────────→

T1: 设备 B 首次同步
    cursor: null → 拉取所有数据 → ack(cursor: T1)

T2: 设备 A 新增照片
    云端数据更新

T3: 设备 B 再次同步
    cursor: T1 → 只拉取 T1 之后的数据 → ack(cursor: T3)

优势：
- 避免全量重复拉取
- 减少网络传输
- 提高同步效率
```

### 4.3 游标机制

```python
# 伪代码：游标查询逻辑
def pull_data(user_id: UUID, cursor: str, limit: int):
    query = db.query(Event).filter(Event.user_id == user_id)

    if cursor:
        # 增量查询：只返回 cursor 之后的数据
        cursor_time = datetime.fromisoformat(cursor)
        query = query.filter(Event.created_at > cursor_time)

    query = query.order_by(Event.created_at.asc())
    query = query.limit(limit + 1)  # 多查一条判断 has_more

    results = query.all()
    has_more = len(results) > limit
    items = results[:limit]

    next_cursor = items[-1].created_at.isoformat() if items else cursor

    return {
        "items": items,
        "next_cursor": next_cursor,
        "has_more": has_more
    }
```

---

## 5. 冲突处理

### 5.1 冲突场景

| 场景 | 处理策略 |
|------|----------|
| 同一照片在多设备上传 | 哈希去重，后上传的跳过 |
| 同一事件在多设备修改 | 以最后修改时间为准 |
| 设备 A 删除，设备 B 未同步 | 同步时标记为已删除 |

### 5.2 幂等性保证

```python
# 同步接口幂等性
def sync_ack(user_id: UUID, device_id: str, cursor: str):
    state = get_or_create_sync_state(user_id, device_id)

    # 幂等：重复调用不会出错
    state.last_pull_cursor = cursor
    state.last_pull_at = datetime.utcnow()

    db.commit()
    return state
```

---

## 6. 同步提示策略

### 6.1 何时提示同步

```python
def should_prompt_sync(user_id: UUID, device_id: str) -> bool:
    # 1. 检查云端是否有数据
    cloud_count = db.query(Photo).filter(Photo.user_id == user_id).count()
    if cloud_count == 0:
        return False

    # 2. 检查当前设备是否已同步
    state = get_sync_state(user_id, device_id)
    if state and state.last_pull_at:
        return False

    # 3. 检查是否最近已提示过（避免频繁打扰）
    if state and state.last_prompt_at:
        hours_since_prompt = (datetime.utcnow() - state.last_prompt_at).hours
        if hours_since_prompt < 24:
            return False

    return True
```

### 6.2 提示时机

- 用户登录后首次进入主页
- 检测到云端有数据但本地为空
- 距离上次提示超过 24 小时

---

## 7. 错误码

| 错误码 | HTTP 状态 | 说明 |
|--------|-----------|------|
| `SYNC_001` | 400 | 缺少 X-Device-Id 头 |
| `SYNC_002` | 400 | 游标格式无效 |
| `SYNC_003` | 404 | 用户不存在 |
| `SYNC_004` | 500 | 同步服务内部错误 |

---

## 8. 性能约束

| 约束项 | 限制值 | 说明 |
|--------|--------|------|
| 单次拉取数量 | 500 | 防止响应过大 |
| 默认拉取数量 | 100 | 平衡性能和体验 |
| 提示间隔 | 24 小时 | 避免频繁打扰 |

---

## 9. 测试要点

### 9.1 单元测试

```bash
cd backend && pytest tests/test_sync.py -v
```

**覆盖场景**：
- 获取同步状态（有数据/无数据）
- 增量拉取（首次/增量）
- 确认同步（正常/重复）
- 游标推进与回退

### 9.2 集成测试

- 完整同步流程（状态 → 拉取 → 确认）
- 多设备并发同步
- 同步中断后恢复

---

## 10. 关联模块

| 模块 | 文档 | 关联说明 |
|------|------|----------|
| 前端上传 | `frontend/modules/upload.md` | 同步状态展示、同步触发 |
| 前端认证 | `frontend/modules/auth.md` | 登录后触发同步检查 |
| 后端照片 | `backend/modules/photo.md` | 照片数据同步 |
| 后端认证 | `backend/modules/auth.md` | 用户身份验证 |

---

## 11. 变更影响

若本模块变更，需同步检查：

- [ ] `my-spec/system/frontend/modules/upload.md`
- [ ] `my-spec/system/backend/database/schema-dictionary.md`
- [ ] `my-spec/system/backend/api/INDEX.md`
- [ ] `my-spec/system/global/test-profile.yaml`（若新增同步专项测试）

---

> **最后更新**：2026-02-10
