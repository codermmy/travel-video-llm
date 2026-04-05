# 后端模块：地图与地理编码

## 1. 当前职责

- 逆地理编码：经纬度转简化地点名
- 位置上下文：生成 `display_location / detailed_location / location_tags`
- 城市搜索、地点搜索

## 2. 代码入口

| 类型 | 文件 |
|---|---|
| AMap 集成 | `backend/app/integrations/amap.py` |
| 地理编码服务 | `backend/app/services/geocoding_service.py` |
| 事件路由使用 | `backend/app/api/v1/events.py` |

## 3. AMapClient 当前能力

### 3.1 逆地理编码

- 底层接口：`/v3/geocode/regeo`
- 对外方法：
  - `reverse_geocode(lat, lon)` -> 简化地点名
  - `get_location_context(lat, lon)` -> 详细地点上下文

### 3.2 搜索

- `search_cities(keyword)`：基于 district search
- `search_places(keyword, city)`：混合 text search + input tips

## 4. 事件位置更新

### 4.1 自动补全

聚类任务完成后，`geocoding_service.update_event_locations()` 会遍历用户事件：

- 有 GPS 且地点名为空/还是坐标文本时，尝试写入地点名

### 4.2 手动补全

事件编辑接口中，如果同时传入经纬度且地点信息为空，后端会调用：

- `amap_client.get_location_context()`

自动回填：

- `location_name`
- `detailed_location`
- `location_tags`

## 5. 位置标签策略

- 代码内有少量 `LOCATION_TAG_PRESETS`
- 其余按地点文本关键词归类为：
  - 自然景区
  - 乡村
  - 海滨
  - 城市

这不是严格 GIS 语义，只是给故事和展示提供轻量语义补充。

## 6. 失败与降级

- 未配置 `AMAP_API_KEY` 时直接降级为空结果
- 请求异常记录日志，不阻塞主链路
- 无法解析地点时，事件仍可保留坐标并继续使用
