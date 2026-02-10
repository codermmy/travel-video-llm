# 后端模块：地图与地理编码（Map）

> **文档目的**：详细说明地图模块的地理编码服务、位置上下文获取和 POI 标签功能，帮助开发者快速理解和修改地图相关功能。

---

## 1. 模块概述

### 1.1 职责范围

- **逆地理编码**：将 GPS 坐标转换为可读地址
- **位置上下文**：获取地点的详细信息（省/市/区/POI）
- **地点标签**：为事件生成地点标签（景点、商圈等）
- **预设地点**：热门旅游地点的预设信息

### 1.2 代码入口

| 类型 | 文件路径 |
|------|----------|
| 高德地图客户端 | `backend/app/integrations/amap.py` |
| 事件增强服务 | `backend/app/services/event_enrichment.py` |
| 地理编码服务 | `backend/app/services/geocoding_service.py` |
| 事件模型 | `backend/app/models/event.py` (位置相关字段) |

---

## 2. 高德地图集成

### 2.1 AmapClient 类

```python
# backend/app/integrations/amap.py
class AmapClient:
    def __init__(self):
        self.api_key = settings.AMAP_API_KEY
        self.base_url = "https://restapi.amap.com/v3"

    async def reverse_geocode(self, lat: float, lon: float) -> dict:
        """逆地理编码：坐标 → 地址"""
        pass

    async def get_location_context(self, lat: float, lon: float) -> dict:
        """获取位置上下文：省/市/区/POI"""
        pass
```

### 2.2 逆地理编码 API

**高德 API 端点**：
```
GET https://restapi.amap.com/v3/geocode/regeo
```

**请求参数**：
| 参数 | 说明 |
|------|------|
| `key` | 高德 API Key |
| `location` | 经纬度（格式：`lon,lat`） |
| `extensions` | `all` 返回详细信息 |
| `output` | `json` |

**响应示例**：
```json
{
  "status": "1",
  "regeocode": {
    "formatted_address": "北京市朝阳区建国门外大街1号",
    "addressComponent": {
      "province": "北京市",
      "city": "北京市",
      "district": "朝阳区",
      "township": "建外街道",
      "neighborhood": {
        "name": "国贸中心"
      }
    },
    "pois": [
      {
        "name": "国贸大厦",
        "type": "商务住宅",
        "distance": "50"
      }
    ]
  }
}
```

### 2.3 位置上下文解析

```python
async def get_location_context(self, lat: float, lon: float) -> dict:
    result = await self.reverse_geocode(lat, lon)

    if not result or result.get("status") != "1":
        return None

    regeo = result.get("regeocode", {})
    addr = regeo.get("addressComponent", {})

    return {
        "formatted_address": regeo.get("formatted_address"),
        "province": addr.get("province"),
        "city": addr.get("city"),
        "district": addr.get("district"),
        "township": addr.get("township"),
        "pois": [
            {
                "name": poi.get("name"),
                "type": poi.get("type"),
                "distance": poi.get("distance")
            }
            for poi in regeo.get("pois", [])[:5]  # 取最近 5 个 POI
        ]
    }
```

---

## 3. 事件地理信息增强

### 3.1 增强流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        事件地理信息增强流程                               │
└─────────────────────────────────────────────────────────────────────────┘

1. 聚类完成，创建 Event 记录
   ↓
2. 计算事件中心坐标
   ├─ 取所有照片 GPS 的平均值
   └─ 或取照片数量最多的位置
   ↓
3. 调用高德逆地理编码
   ├─ 成功：获取地址信息
   └─ 失败：保留原始坐标，记录错误
   ↓
4. 填充事件字段
   ├─ location_name: 省市区
   ├─ detailed_location: 完整地址
   └─ location_tags: POI 标签
   ↓
5. 检查预设地点
   ├─ 匹配：使用预设的丰富信息
   └─ 不匹配：使用 API 返回的信息
```

### 3.2 事件位置字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `gps_lat` | Float | 中心纬度 | `39.9042` |
| `gps_lon` | Float | 中心经度 | `116.4074` |
| `location_name` | String | 地点名称 | `北京市` |
| `detailed_location` | String | 详细地址 | `北京市朝阳区建国门外大街` |
| `location_tags` | JSON | 地点标签 | `["故宫", "天安门", "王府井"]` |

### 3.3 地点标签生成

```python
def generate_location_tags(pois: list, preset_tags: list = None) -> list:
    """生成地点标签"""
    tags = []

    # 1. 优先使用预设标签
    if preset_tags:
        tags.extend(preset_tags)

    # 2. 从 POI 中提取标签
    for poi in pois:
        name = poi.get("name")
        poi_type = poi.get("type")

        # 过滤通用 POI（如"停车场"、"公交站"）
        if is_meaningful_poi(name, poi_type):
            tags.append(name)

    # 3. 去重并限制数量
    return list(dict.fromkeys(tags))[:10]
```

---

## 4. 预设地点

### 4.1 热门旅游地点预设

```python
# backend/app/integrations/amap.py
LOCATION_TAG_PRESETS = {
    "九寨沟": {
        "bounds": {"lat_min": 32.5, "lat_max": 33.5, "lon_min": 103.5, "lon_max": 104.5},
        "tags": ["九寨沟", "五花海", "诺日朗瀑布", "珍珠滩"],
        "emotion_hint": "壮观"
    },
    "成都": {
        "bounds": {"lat_min": 30.4, "lat_max": 31.0, "lon_min": 103.8, "lon_max": 104.5},
        "tags": ["宽窄巷子", "锦里", "大熊猫基地", "春熙路"],
        "emotion_hint": "美食"
    },
    "三亚": {
        "bounds": {"lat_min": 18.0, "lat_max": 18.5, "lon_min": 109.0, "lon_max": 110.0},
        "tags": ["亚龙湾", "天涯海角", "蜈支洲岛", "南山寺"],
        "emotion_hint": "浪漫"
    },
    "西湖": {
        "bounds": {"lat_min": 30.2, "lat_max": 30.3, "lon_min": 120.1, "lon_max": 120.2},
        "tags": ["西湖", "断桥", "雷峰塔", "苏堤"],
        "emotion_hint": "宁静"
    }
}
```

### 4.2 预设匹配逻辑

```python
def match_preset_location(lat: float, lon: float) -> dict | None:
    """匹配预设地点"""
    for name, preset in LOCATION_TAG_PRESETS.items():
        bounds = preset["bounds"]
        if (bounds["lat_min"] <= lat <= bounds["lat_max"] and
            bounds["lon_min"] <= lon <= bounds["lon_max"]):
            return {
                "name": name,
                "tags": preset["tags"],
                "emotion_hint": preset.get("emotion_hint")
            }
    return None
```

---

## 5. 错误处理

### 5.1 降级策略

| 错误场景 | 处理方式 |
|----------|----------|
| API 请求超时 | 重试 2 次，仍失败则跳过 |
| API 返回错误 | 记录日志，保留原始坐标 |
| 无效坐标 | 跳过编码，标记为无位置 |
| API 限流 | 延迟重试（指数退避） |

### 5.2 错误码

| 错误码 | 说明 |
|--------|------|
| `MAP_001` | 高德 API Key 无效 |
| `MAP_002` | 坐标格式错误 |
| `MAP_003` | API 请求超时 |
| `MAP_004` | API 限流 |
| `MAP_005` | 逆地理编码失败 |

### 5.3 日志记录

```python
async def reverse_geocode_with_fallback(lat: float, lon: float) -> dict:
    try:
        result = await amap_client.reverse_geocode(lat, lon)
        return result
    except TimeoutError:
        logger.warning(f"Geocode timeout for ({lat}, {lon})")
        return None
    except RateLimitError:
        logger.warning(f"Geocode rate limited for ({lat}, {lon})")
        await asyncio.sleep(1)  # 简单退避
        return await reverse_geocode_with_fallback(lat, lon)
    except Exception as e:
        logger.error(f"Geocode failed for ({lat}, {lon}): {e}")
        return None
```

---

## 6. 性能约束

| 约束项 | 限制值 | 说明 |
|--------|--------|------|
| API QPS | 100 | 高德免费版限制 |
| 单次批量 | 20 | 批量编码限制 |
| 超时时间 | 5 秒 | 单次请求超时 |
| 重试次数 | 2 次 | 失败重试次数 |

---

## 7. 配置项

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `AMAP_API_KEY` | 高德 API Key | 必填 |
| `AMAP_TIMEOUT` | 请求超时（秒） | `5` |
| `AMAP_RETRY_COUNT` | 重试次数 | `2` |

---

## 8. 测试要点

### 8.1 单元测试

```bash
cd backend && pytest tests/test_amap.py -v
```

**覆盖场景**：
- 逆地理编码成功
- 逆地理编码失败（超时/限流/无效坐标）
- 预设地点匹配
- 地点标签生成

### 8.2 集成测试

- 事件创建后地理信息自动填充
- 地理编码失败不影响主流程
- 预设地点优先级正确

---

## 9. 关联模块

| 模块 | 文档 | 关联说明 |
|------|------|----------|
| 前端地图 | `frontend/modules/map.md` | 地图展示、事件标记 |
| 后端事件 | `backend/modules/event.md` | 事件地理信息字段 |
| 后端照片 | `backend/modules/photo.md` | 照片 GPS 坐标 |

---

## 10. 变更影响

若本模块变更，需同步检查：

- [ ] `my-spec/system/frontend/modules/map.md`
- [ ] `my-spec/system/backend/modules/event.md`
- [ ] `my-spec/system/backend/api/INDEX.md`

---

> **最后更新**：2026-02-10
