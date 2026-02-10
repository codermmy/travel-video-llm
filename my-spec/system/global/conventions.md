# 全局规范（Conventions）

> **文档目的**：定义项目的编码规范、命名约定、提交规范和文档规范，确保代码库的一致性和可维护性。

---

## 1. 命名规范

### 1.1 TypeScript / React Native

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件名（组件） | PascalCase | `MapViewContainer.tsx` |
| 文件名（工具/服务） | camelCase | `mapClusterUtils.ts` |
| 组件名 | PascalCase | `SlideshowPlayer` |
| 函数名 | camelCase | `handleClusterPress` |
| 变量名 | camelCase | `selectedEventId` |
| 常量 | UPPER_SNAKE_CASE | `DEFAULT_SLIDE_DURATION_MS` |
| 类型/接口 | PascalCase | `EventRecord`, `AuthState` |
| 枚举 | PascalCase | `PlaybackState` |
| 枚举值 | PascalCase | `PlaybackState.Playing` |

### 1.2 Python / FastAPI

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件名 | snake_case | `photo_service.py` |
| 模块名 | snake_case | `event_enrichment` |
| 类名 | PascalCase | `PhotoService`, `EventRecord` |
| 函数名 | snake_case | `upload_photos` |
| 变量名 | snake_case | `user_id`, `file_hash` |
| 常量 | UPPER_SNAKE_CASE | `MAX_UPLOAD_SIZE` |
| 私有方法 | _snake_case | `_validate_hash` |

### 1.3 数据库

| 类型 | 规范 | 示例 |
|------|------|------|
| 表名 | snake_case（复数） | `users`, `photos`, `events` |
| 字段名 | snake_case | `user_id`, `created_at` |
| 索引名 | ix_{表名}_{字段名} | `ix_photos_user_hash` |
| 外键约束 | fk_{表名}_{引用表} | `fk_photos_users` |

---

## 2. 目录结构规范

### 2.1 前端 (mobile)

```
mobile/
├── app/                    # Expo Router 页面
│   ├── (auth)/            # 认证相关页面组
│   ├── (tabs)/            # Tab 导航页面组
│   └── events/            # 事件相关页面
├── src/
│   ├── components/        # 可复用组件
│   │   ├── auth/         # 认证组件
│   │   ├── map/          # 地图组件
│   │   ├── photo/        # 照片组件
│   │   └── slideshow/    # 幻灯片组件
│   ├── services/          # 服务层
│   │   ├── api/          # API 调用
│   │   ├── album/        # 相册服务
│   │   ├── storage/      # 本地存储
│   │   └── sync/         # 同步服务
│   ├── stores/            # Zustand 状态管理
│   ├── types/             # TypeScript 类型定义
│   ├── utils/             # 工具函数
│   ├── constants/         # 常量定义
│   ├── styles/            # 样式定义
│   └── navigation/        # 导航配置
```

### 2.2 后端 (backend)

```
backend/
├── app/
│   ├── api/
│   │   └── v1/           # API v1 路由
│   ├── core/             # 核心配置
│   ├── integrations/     # 第三方集成
│   │   └── providers/    # AI 提供商
│   ├── models/           # SQLAlchemy 模型
│   ├── schemas/          # Pydantic Schema
│   ├── services/         # 业务服务层
│   └── tasks/            # Celery 任务
├── alembic/              # 数据库迁移
│   └── versions/         # 迁移版本
└── tests/                # 测试文件
```

---

## 3. 代码质量规范

### 3.1 必须遵守

| 规则 | 说明 |
|------|------|
| 类型定义 | 所有函数参数和返回值必须有类型注解 |
| 错误处理 | 所有异步操作必须有 try-catch 或错误边界 |
| 无硬编码 | 配置信息必须通过环境变量或配置文件 |
| 可测试性 | 新增逻辑必须可被单元测试覆盖 |
| 无敏感信息 | 代码中不得包含密钥、密码等敏感信息 |

### 3.2 TypeScript 规范

```typescript
// ✅ 正确：有类型注解
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  // ...
}

// ❌ 错误：缺少类型注解
function calculateDistance(lat1, lon1, lat2, lon2) {
  // ...
}

// ✅ 正确：使用 interface 定义对象类型
interface EventCluster {
  id: string;
  center: { latitude: number; longitude: number };
  events: EventPoint[];
  count: number;
}

// ✅ 正确：异步操作有错误处理
async function fetchEvents(): Promise<EventRecord[]> {
  try {
    const response = await eventApi.listAllEvents();
    return response;
  } catch (error) {
    console.error('Failed to fetch events:', error);
    throw error;
  }
}
```

### 3.3 Python 规范

```python
# ✅ 正确：有类型注解
def upload_photos(
    user_id: UUID,
    photos: list[PhotoUploadRequest],
    trigger_clustering: bool = True
) -> PhotoUploadResponse:
    pass

# ❌ 错误：缺少类型注解
def upload_photos(user_id, photos, trigger_clustering=True):
    pass

# ✅ 正确：使用 Pydantic 定义 Schema
class PhotoUploadRequest(BaseModel):
    file_hash: str
    gps_lat: float | None = None
    gps_lon: float | None = None
    shoot_time: datetime | None = None

# ✅ 正确：异步操作有错误处理
async def reverse_geocode(lat: float, lon: float) -> dict | None:
    try:
        result = await amap_client.reverse_geocode(lat, lon)
        return result
    except TimeoutError:
        logger.warning(f"Geocode timeout for ({lat}, {lon})")
        return None
    except Exception as e:
        logger.error(f"Geocode failed: {e}")
        return None
```

---

## 4. Git 提交规范

### 4.1 提交消息格式

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### 4.2 Type 类型

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(auth): 添加邮箱验证码登录` |
| `fix` | Bug 修复 | `fix(map): 修复聚类标记点击无响应` |
| `docs` | 文档更新 | `docs(api): 更新认证接口文档` |
| `refactor` | 重构 | `refactor(photo): 优化上传去重逻辑` |
| `test` | 测试相关 | `test(auth): 添加登录失败测试用例` |
| `chore` | 构建/工具 | `chore(deps): 升级 expo-av 版本` |
| `style` | 代码格式 | `style(lint): 修复 ESLint 警告` |
| `perf` | 性能优化 | `perf(slideshow): 优化图片预加载` |

### 4.3 Scope 范围

| Scope | 说明 |
|-------|------|
| `auth` | 认证模块 |
| `photo` | 照片模块 |
| `event` | 事件模块 |
| `map` | 地图模块 |
| `sync` | 同步模块 |
| `ai` | AI 服务 |
| `api` | API 接口 |
| `db` | 数据库 |
| `deps` | 依赖管理 |

### 4.4 提交示例

```bash
# 新功能
feat(auth): 添加邮箱验证码登录

- 新增发送验证码接口
- 新增验证码校验逻辑
- 添加 60 秒倒计时限制

# Bug 修复
fix(map): 修复聚类标记双击无法缩放

双击事件被单击事件拦截，调整事件处理顺序

Closes #123

# 重构
refactor(photo): 重构上传去重逻辑

- 将去重逻辑从 API 层移至 Service 层
- 添加本地哈希缓存
- 优化批量去重性能
```

---

## 5. 文档规范

### 5.1 文档更新流程

```
代码变更
    ↓
编写 doc_change_preview.md
    ↓
代码审查通过
    ↓
合并到 system 文档
    ↓
归档 doc_change_preview.md
```

### 5.2 文档结构规范

每个模块文档应包含：

1. **模块概述**：职责范围、代码入口
2. **API/接口**：请求/响应格式
3. **数据模型**：字段定义、约束
4. **业务流程**：流程图、状态机
5. **错误处理**：错误码、降级策略
6. **测试要点**：测试场景、命令
7. **关联模块**：依赖关系
8. **变更影响**：需同步检查的文档

### 5.3 文档禁止事项

| 禁止 | 说明 |
|------|------|
| 过期 TODO | 未完成项应显式标记风险和负责阶段 |
| 硬编码示例 | 示例中不得包含真实密钥或敏感数据 |
| 模糊描述 | 避免"可能"、"大概"等不确定表述 |
| 无日期更新 | 每次更新必须更新"最后更新"日期 |

---

## 6. API 设计规范

### 6.1 RESTful 规范

| 方法 | 用途 | 示例 |
|------|------|------|
| `GET` | 获取资源 | `GET /api/v1/events/{id}` |
| `POST` | 创建资源 | `POST /api/v1/photos/upload` |
| `PATCH` | 部分更新 | `PATCH /api/v1/events/{id}` |
| `DELETE` | 删除资源 | `DELETE /api/v1/photos/{id}` |

### 6.2 响应格式

```json
// 成功响应
{
  "code": 0,
  "message": "success",
  "data": { ... }
}

// 错误响应
{
  "code": 1001,
  "message": "error_code",
  "detail": "详细错误信息"
}

// 分页响应
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "page_size": 20,
    "total_pages": 5
  }
}
```

### 6.3 错误码规范

| 范围 | 模块 |
|------|------|
| `AUTH_0xx` | 认证模块 |
| `PHOTO_0xx` | 照片模块 |
| `EVENT_0xx` | 事件模块 |
| `SYNC_0xx` | 同步模块 |
| `MAP_0xx` | 地图模块 |
| `AI_0xx` | AI 服务 |

---

## 7. 测试规范

### 7.1 测试文件命名

| 类型 | 命名规范 | 示例 |
|------|----------|------|
| 单元测试 | `test_{module}.py` | `test_auth.py` |
| 集成测试 | `test_{module}_integration.py` | `test_photo_integration.py` |
| E2E 测试 | `{feature}.e2e.ts` | `login.e2e.ts` |

### 7.2 测试覆盖要求

| 类型 | 覆盖要求 |
|------|----------|
| 核心业务逻辑 | 必须有单元测试 |
| API 接口 | 必须有集成测试 |
| 关键用户流程 | 应有 E2E 测试 |
| 边界条件 | 必须覆盖 |
| 错误场景 | 必须覆盖 |

### 7.3 测试命令

```bash
# 后端测试
cd backend && pytest tests/ -v

# 前端静态检查
cd mobile && npm run lint && npm run typecheck

# 前端单元测试
cd mobile && npm test
```

---

## 8. 安全规范

### 8.1 敏感信息处理

| 类型 | 处理方式 |
|------|----------|
| API 密钥 | 环境变量 |
| 数据库密码 | 环境变量 |
| JWT 密钥 | 环境变量 |
| 用户密码 | bcrypt 哈希存储 |
| Token | 不记录到日志 |

### 8.2 环境变量示例

```bash
# .env.example（可提交）
DATABASE_URL=postgresql://user:password@localhost/dbname
JWT_SECRET=your-secret-key
AMAP_API_KEY=your-amap-key
TONGYI_API_KEY=your-tongyi-key

# .env（不可提交）
DATABASE_URL=postgresql://prod_user:real_password@prod-host/prod_db
JWT_SECRET=actual-production-secret
```

### 8.3 .gitignore 必须包含

```
.env
.env.local
.env.*.local
*.pem
*.key
credentials.json
```

---

## 9. 代码注释规范

### 9.1 注释语言

- **与现有代码库保持一致**
- 自动检测项目主要注释语言
- 新增注释使用相同语言

### 9.2 注释类型

```typescript
// 单行注释：简短说明
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * 多行注释：函数/类说明
 * @param lat1 起点纬度
 * @param lon1 起点经度
 * @param lat2 终点纬度
 * @param lon2 终点经度
 * @returns 两点间距离（公里）
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  // ...
}

// TODO: 待办事项（需标注负责人和预计完成时间）
// TODO(zhangsan): 优化聚类算法性能 - 2024-02-15

// FIXME: 已知问题（需标注问题描述）
// FIXME: 大量照片时内存占用过高
```

---

## 10. 关联文档

| 文档 | 说明 |
|------|------|
| `global/project-overview.md` | 项目概述 |
| `global/architecture-map.md` | 架构图 |
| `global/test-profile.yaml` | 测试配置 |
| `global/doc-sync-rules.yaml` | 文档同步规则 |

---

> **最后更新**：2026-02-10
