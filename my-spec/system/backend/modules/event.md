# 后端模块：事件与故事（Event）

> **文档目的**：详细说明事件模块的 API、数据模型、聚类算法、AI 生成流程，帮助开发者快速理解和修改事件相关功能。

---

## 1. 模块概述

### 1.1 职责范围

- **时空聚类**：将照片按时间和地理位置聚合成事件
- **地理编码**：将 GPS 坐标转换为地名
- **AI 故事生成**：为事件生成标题、故事、章节
- **情感标签**：识别事件的情感基调
- **事件管理**：查询、更新、删除事件

### 1.2 代码入口

| 类型 | 文件路径 |
|------|----------|
| API 路由 | `backend/app/api/v1/events.py` |
| 事件服务 | `backend/app/services/event_service.py` |
| 聚类服务 | `backend/app/services/clustering_service.py` |
| AI 服务 | `backend/app/services/ai_service.py` |
| 事件 AI 服务 | `backend/app/services/event_ai_service.py` |
| 章节 AI 服务 | `backend/app/services/chapter_ai_service.py` |
| 数据模型 | `backend/app/models/event.py` |
| 章节模型 | `backend/app/models/chapter.py` |
| 照片组模型 | `backend/app/models/photo_group.py` |
| Schema | `backend/app/schemas/event.py` |

---

## 2. API 接口

### 2.1 获取事件列表

```
GET /api/v1/events/
```

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | int | 页码，默认 1 |
| `page_size` | int | 每页数量，默认 20，最大 100 |
| `status` | string | 按状态筛选 |
| `start_time` | datetime | 事件开始时间起始 |
| `end_time` | datetime | 事件开始时间结束 |

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "uuid",
        "title": "北京三日游",
        "location_name": "北京市",
        "gps_lat": 39.9042,
        "gps_lon": 116.4074,
        "start_time": "2024-01-15T08:00:00Z",
        "end_time": "2024-01-17T20:00:00Z",
        "photo_count": 150,
        "cover_photo_url": "https://...",
        "status": "generated",
        "emotion_tag": "温馨"
      }
    ],
    "total": 50,
    "page": 1,
    "page_size": 20
  }
}
```

---

### 2.2 获取事件详情

```
GET /api/v1/events/{event_id}
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "event": {
      "id": "uuid",
      "title": "北京三日游",
      "location_name": "北京市",
      "detailed_location": "北京市朝阳区",
      "location_tags": ["故宫", "天安门", "颐和园"],
      "gps_lat": 39.9042,
      "gps_lon": 116.4074,
      "start_time": "2024-01-15T08:00:00Z",
      "end_time": "2024-01-17T20:00:00Z",
      "photo_count": 150,
      "cover_photo_url": "https://...",
      "story_text": "简短故事摘要...",
      "full_story": "完整故事内容...",
      "status": "generated",
      "emotion_tag": "温馨",
      "music_url": "https://..."
    },
    "photos": [
      {
        "id": "uuid",
        "thumbnail_url": "https://...",
        "photo_index": 0,
        "caption": "故宫太和殿",
        "visual_desc": "红墙金瓦的宫殿建筑",
        "micro_story": "阳光洒在金色的琉璃瓦上..."
      }
    ],
    "chapters": [
      {
        "id": "uuid",
        "chapter_index": 0,
        "chapter_title": "初到北京",
        "chapter_story": "清晨的阳光洒在故宫的红墙上...",
        "chapter_intro": "第一天的行程从故宫开始",
        "slideshow_caption": "故宫｜初见紫禁城",
        "photo_start_index": 0,
        "photo_end_index": 30
      }
    ],
    "photo_groups": [
      {
        "id": "uuid",
        "chapter_id": "uuid",
        "group_index": 0,
        "group_theme": "故宫建筑",
        "group_emotion": "庄严",
        "group_scene_desc": "红墙金瓦的宫殿群",
        "photo_start_index": 0,
        "photo_end_index": 10
      }
    ]
  }
}
```

---

### 2.3 重新生成故事

```
POST /api/v1/events/{event_id}/regenerate-story
```

**用途**：AI 生成失败后重试，或用户想要重新生成故事

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "task_id": "uuid",
    "status": "ai_pending"
  }
}
```

**业务规则**：
- 将事件状态重置为 `ai_pending`
- 触发新的 AI 生成任务
- 返回任务 ID 供前端轮询

---

### 2.4 云端增强故事

```
POST /api/v1/events/{event_id}/enhance-story
```

**用途**：用户显式上传 3-5 张压缩代表图，触发一次更强的事件故事重生成

**请求方式**：`multipart/form-data`

- `files`: 3-5 张压缩图片
- `photoIds`: 与上传图片同顺序的事件照片 ID（可选）
- `reuseExisting`: `true` 时不重新上传，直接复用 7 天内保留的增强素材

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "taskId": "uuid",
    "status": "queued",
    "enhancement": {
      "status": "retained",
      "assetCount": 3,
      "totalBytes": 412345,
      "canRetry": true,
      "retainedUntil": "2026-04-08T12:00:00Z"
    }
  }
}
```

**业务规则**：
- 增强链路与默认故事链路分开，不改变“默认不上图”产品形态
- 每次只接受 3-5 张代表图
- 上传素材保留 7 天，可直接复用重试
- 增强任务会重新回写事件故事与章节

### 2.5 增强素材汇总与清理

```
GET /api/v1/events/enhancement-storage/summary
DELETE /api/v1/events/enhancement-storage
```

**用途**：为设置页提供增强素材统计与手动清理能力

**业务规则**：
- 汇总当前用户保留中的增强素材数量、事件数量、总体积、最近到期时间
- 删除接口只清理增强素材，不删除已生成的事件故事
- 过期素材会在读写接口前自动清理

---

### 2.6 更新事件信息

```
PATCH /api/v1/events/{event_id}
```

**请求体**：
```json
{
  "title": "新标题",
  "cover_photo_id": "uuid"
}
```

---

### 2.7 删除事件

```
DELETE /api/v1/events/{event_id}
```

**业务规则**：
- 删除事件及其关联的章节、照片组
- 照片不删除，状态重置为 `uploaded`
- 可触发重新聚类

---

### 2.8 事件统计

```
GET /api/v1/events/stats
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total_events": 50,
    "generated_events": 45,
    "pending_events": 3,
    "failed_events": 2,
    "total_photos_in_events": 5000
  }
}
```

---

## 3. 数据模型

### 3.1 Event 表

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 主键 | PK |
| `user_id` | UUID | 用户 ID | FK → users, NOT NULL |
| `title` | String | 事件标题 | 可空 |
| `location_name` | String | 地点名称 | 可空 |
| `detailed_location` | String | 详细地点 | 可空 |
| `location_tags` | JSON | 地点标签数组 | 可空 |
| `gps_lat` | Float | 中心纬度 | 可空 |
| `gps_lon` | Float | 中心经度 | 可空 |
| `start_time` | DateTime | 开始时间 | 可空 |
| `end_time` | DateTime | 结束时间 | 可空 |
| `photo_count` | Integer | 照片数量 | 默认 0 |
| `cover_photo_id` | UUID | 封面照片 ID | FK → photos, 可空 |
| `cover_photo_url` | String | 封面照片 URL | 可空 |
| `story_text` | Text | 故事摘要 | 可空 |
| `full_story` | Text | 完整故事 | 可空 |
| `emotion_tag` | String | 情感标签 | 可空 |
| `music_id` | UUID | 音乐 ID | FK → music, 可空 |
| `music_url` | String | 音乐 URL | 可空 |
| `status` | Enum | 状态 | 见状态机 |
| `ai_error` | Text | AI 错误信息 | 可空 |
| `created_at` | DateTime | 创建时间 | |
| `updated_at` | DateTime | 更新时间 | |

### 3.2 EventChapter 表

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 主键 | PK |
| `user_id` | UUID | 用户 ID | FK → users |
| `event_id` | UUID | 事件 ID | FK → events |
| `chapter_index` | Integer | 章节索引 | NOT NULL |
| `chapter_title` | String | 章节标题 | 可空 |
| `chapter_story` | Text | 章节故事 | 可空 |
| `chapter_intro` | Text | 章节简介 | 可空 |
| `chapter_summary` | Text | 章节摘要 | 可空 |
| `slideshow_caption` | String | 幻灯片字幕 | 可空 |
| `photo_start_index` | Integer | 照片起始索引 | |
| `photo_end_index` | Integer | 照片结束索引 | |
| `created_at` | DateTime | 创建时间 | |

**索引**：`(event_id, chapter_index)` UNIQUE

### 3.4 EventEnhancementAsset 表

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 主键 | PK |
| `user_id` | UUID | 用户 ID | FK → users |
| `event_id` | UUID | 事件 ID | FK → events |
| `photo_id` | UUID | 对应的事件照片 ID | FK → photos, 可空 |
| `local_path` | String | 服务端本地缓存路径 | 非空 |
| `public_url` | String | 对外访问 URL / 相对路径 | 可空 |
| `storage_provider` | String | `local` / `oss` | 可空 |
| `object_key` | String | OSS 对象键 | 可空 |
| `file_size` | Integer | 素材体积（字节） | 默认 0 |
| `analysis_result` | JSON | 云端看图结果 | 可空 |
| `expires_at` | DateTime | 到期时间 | 非空 |

**用途**：
- 记录事件级增强素材
- 支持 7 天内直接重试
- 支持过期自动清理与设置页手动清理

### 3.3 PhotoGroup 表

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 主键 | PK |
| `user_id` | UUID | 用户 ID | FK → users |
| `event_id` | UUID | 事件 ID | FK → events |
| `chapter_id` | UUID | 章节 ID | FK → chapters |
| `group_index` | Integer | 组索引 | NOT NULL |
| `group_theme` | String | 组主题 | 可空 |
| `group_emotion` | String | 组情感 | 可空 |
| `group_scene_desc` | Text | 场景描述 | 可空 |
| `photo_start_index` | Integer | 照片起始索引 | |
| `photo_end_index` | Integer | 照片结束索引 | |
| `created_at` | DateTime | 创建时间 | |

**索引**：`(chapter_id, group_index)` UNIQUE

---

## 4. 事件状态机

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           事件状态流转                                   │
└─────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────┐
                         │  clustered  │  ← 聚类完成，等待 AI 处理
                         └──────┬──────┘
                                │
                                │ 触发 AI 生成任务
                                ▼
                         ┌─────────────┐
                         │ ai_pending  │  ← 等待 AI 处理
                         └──────┬──────┘
                                │
                                │ AI 任务开始执行
                                ▼
                         ┌──────────────┐
                         │ai_processing │  ← AI 正在生成
                         └──────┬───────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
                ▼                               ▼
       ┌─────────────┐                 ┌─────────────┐
       │  generated  │                 │  ai_failed  │
       │ (生成成功)  │                 │ (生成失败)  │
       └─────────────┘                 └──────┬──────┘
                                              │
                                              │ 用户点击重试
                                              ▼
                                       ┌─────────────┐
                                       │ ai_pending  │  ← 重新进入队列
                                       └─────────────┘
```

**状态说明**：
| 状态 | 说明 | 前端展示 |
|------|------|----------|
| `clustered` | 聚类完成，等待 AI | 显示"正在生成故事..." |
| `ai_pending` | AI 任务已入队 | 显示"正在生成故事..." |
| `ai_processing` | AI 正在处理 | 显示"正在生成故事..." |
| `generated` | 生成成功 | 显示完整故事和章节 |
| `ai_failed` | 生成失败 | 显示"生成失败"和重试按钮 |

---

## 5. 时空聚类算法

### 5.1 算法概述

聚类服务位于 `backend/app/services/clustering_service.py`，核心类：

- `SpacetimeClustering`：主聚类类
- `SpacetimeHDBSCAN`：HDBSCAN 聚类算法
- `SemanticClustering`：语义相似度合并
- `TemporalRules`：时间规则优化

### 5.2 聚类流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           聚类流程                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. 数据准备                                                             │
│     ├─ 获取用户所有 status=uploaded 的照片                               │
│     ├─ 过滤无 GPS 或无拍摄时间的照片（标记为 noise）                      │
│     └─ 构建特征矩阵 [lat, lon, timestamp]                               │
│                                                                         │
│  2. HDBSCAN 聚类                                                        │
│     ├─ 自适应时间阈值（根据照片时间跨度）                                 │
│     ├─ 自适应距离阈值（根据照片地理分布）                                 │
│     └─ 输出初始聚类标签                                                  │
│                                                                         │
│  3. 语义合并                                                             │
│     ├─ 计算相邻聚类的语义相似度                                          │
│     └─ 合并高相似度的聚类                                                │
│                                                                         │
│  4. 时间规则优化                                                         │
│     ├─ 合并短间隔聚类（< 2 小时）                                        │
│     ├─ 拆分大间隔聚类（> 24 小时）                                       │
│     └─ 城市跳转检测（距离 > 100km 且时间 < 4 小时）                       │
│                                                                         │
│  5. 事件创建                                                             │
│     ├─ 为每个聚类创建 Event 记录                                         │
│     ├─ 计算事件中心坐标                                                  │
│     ├─ 计算事件时间范围                                                  │
│     └─ 更新照片的 event_id 和 status                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 聚类参数

| 参数 | 默认值 | 说明 | 环境变量 |
|------|--------|------|----------|
| `min_cluster_size` | 3 | 最小聚类照片数 | `CLUSTERING_MIN_SIZE` |
| `time_threshold_hours` | 24 | 时间阈值（小时） | `CLUSTERING_TIME_THRESHOLD` |
| `distance_threshold_km` | 50 | 距离阈值（公里） | `CLUSTERING_DISTANCE_THRESHOLD` |
| `merge_threshold_hours` | 2 | 合并阈值（小时） | `CLUSTERING_MERGE_THRESHOLD` |

---

## 6. AI 故事生成

### 6.1 生成流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AI 故事生成流程                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. 地理位置上下文                                                       │
│     ├─ 调用高德地图 API 逆地理编码                                       │
│     ├─ 获取地点名称、详细地址、POI 标签                                  │
│     └─ 保存到 Event.location_name, detailed_location, location_tags    │
│                                                                         │
│  2. 默认故事信号聚合                                                     │
│     ├─ 读取照片 Metadata、地理信息、端侧结构化识别结果                    │
│     ├─ 聚合结构化摘要、时间线索、章节切分种子                             │
│     └─ 默认链路不要求图片公网 URL，不调用服务端看图                      │
│                                                                         │
│  3. 故事生成                                                             │
│     ├─ 构建上下文（地点、时间、照片描述）                                 │
│     ├─ 调用 AI 生成故事（通义千问）                                      │
│     └─ 解析输出：title, story_text, full_story, emotion_tag            │
│                                                                         │
│  4. 章节划分                                                             │
│     ├─ 根据时间和地点变化划分章节                                        │
│     ├─ 为每个章节生成 chapter_title, chapter_story                      │
│     └─ 生成 slideshow_caption（幻灯片字幕）                              │
│                                                                         │
│  5. 照片组生成                                                           │
│     ├─ 在章节内按场景/主题分组                                           │
│     ├─ 基于结构化信号生成 micro_story / caption                         │
│     └─ 生成 group_theme, group_emotion, group_scene_desc               │
│                                                                         │
│  6. 状态更新                                                             │
│     └─ Event.status = 'generated'                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 AI 提供商

> 说明：默认故事链路使用文本模型根据结构化旅行线索生成故事；仅增强链路才允许进入云端看图分支。

当前使用通义千问（Tongyi），配置：

```python
# backend/app/integrations/tongyi.py
class TongyiClient:
    def __init__(self):
        self.api_key = settings.TONGYI_API_KEY
        self.model = settings.TONGYI_MODEL  # qwen-vl-max

    def analyze_image(self, image_url: str, prompt: str) -> str:
        # 调用通义千问视觉模型
        pass

    def generate_story(self, context: dict) -> dict:
        # 调用通义千问文本模型
        pass
```

### 6.3 情感标签

支持的情感标签（定义在 `providers/base.py`）：

| 标签 | 关键词 |
|------|--------|
| 温馨 | 家人、团聚、温暖、幸福 |
| 浪漫 | 情侣、约会、爱情、甜蜜 |
| 冒险 | 探险、挑战、刺激、户外 |
| 宁静 | 安静、平和、放松、自然 |
| 欢乐 | 开心、快乐、庆祝、派对 |
| 怀旧 | 回忆、老地方、故乡、童年 |
| 壮观 | 震撼、宏伟、壮丽、风景 |
| 美食 | 餐厅、美食、品尝、聚餐 |
| 文艺 | 艺术、展览、博物馆、文化 |
| 运动 | 健身、比赛、运动、活力 |

---

## 7. 错误处理

### 7.1 错误码

| 错误码 | HTTP 状态 | 说明 |
|--------|-----------|------|
| `EVENT_001` | 404 | 事件不存在 |
| `EVENT_002` | 403 | 无权访问该事件 |
| `EVENT_003` | 400 | 事件状态不允许此操作 |
| `EVENT_004` | 500 | AI 生成失败 |
| `EVENT_005` | 500 | 聚类失败 |

### 7.2 AI 失败处理

```python
# event_ai_service.py
async def generate_event_story_for_event(event_id: UUID):
    try:
        # ... AI 生成逻辑
        event.status = EventStatus.GENERATED
    except Exception as e:
        event.status = EventStatus.AI_FAILED
        event.ai_error = str(e)
        logger.error(f"AI generation failed for event {event_id}: {e}")
```

**失败原因记录**：
- AI API 调用超时
- AI API 返回格式错误
- 事件缺少可用时间范围
- 结构化信号缺失或不足
- 地理编码失败

---

## 8. 测试要点

### 8.1 单元测试

```bash
cd backend && pytest tests/test_events.py -v
```

**覆盖场景**：
- 事件列表查询
- 事件详情查询
- 事件更新
- 事件删除
- 重新生成故事

### 8.2 集成测试

- 完整聚类流程（上传照片 → 聚类 → 创建事件）
- 完整 AI 生成流程（聚类 → AI 分析 → 故事生成）
- AI 失败重试流程

### 8.3 聚类算法测试

- 单城市多天旅行
- 多城市跳转旅行
- 照片时间跨度大（> 1 年）
- 照片数量大（> 1000 张）

---

## 9. 关联模块

| 模块 | 文档 | 关联说明 |
|------|------|----------|
| 前端故事 | `frontend/modules/story.md` | 事件详情页、幻灯片播放 |
| 前端地图 | `frontend/modules/map.md` | 地图上展示事件标记 |
| 后端照片 | `backend/modules/photo.md` | 照片归属事件 |
| 后端地图 | `backend/modules/map.md` | 地理编码服务 |

---

## 10. 变更影响

若本模块变更，需同步检查：

- [ ] `my-spec/system/frontend/modules/story.md`
- [ ] `my-spec/system/frontend/modules/map.md`
- [ ] `my-spec/system/backend/modules/photo.md`
- [ ] `my-spec/system/backend/api/INDEX.md`
- [ ] `my-spec/system/backend/database/schema-dictionary.md`

---

> **最后更新**：2026-02-10
