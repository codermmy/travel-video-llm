# 前端模块：地图与地点补全

## 1. 职责范围

- 展示带 GPS 的事件
- 根据当前缩放级别做前端聚类
- 在聚类内展示事件卡片并跳转详情
- 发现缺地点事件并引导补全

## 2. 代码入口

| 类型 | 文件 |
|---|---|
| 路由页面 | `mobile/app/(tabs)/map.tsx` |
| 地图容器 | `mobile/src/components/map/MapViewContainer.tsx` |
| 聚类工具 | `mobile/src/utils/mapClusterUtils.ts` |
| 待补地点页 | `mobile/app/map/missing-locations.tsx` |
| 地点补全页 | `mobile/app/event-location/[eventId].tsx` |

## 3. 地图主页面

### 3.1 数据来源

- `eventApi.listAllEvents()`
- 本地只过滤掉没有有效 GPS 的事件

### 3.2 交互

- 点击聚类：展开底部事件列表
- 点击卡片：进入事件详情
- reset token 变化：回到初始视角
- 顶部 banner：提示待补地点事件数

### 3.3 fallback

以下情况不会显示地图本体，而是显示说明卡片：

- Web
- Expo Go
- 未配置 AMap key
- 原生模块加载失败

## 4. 前端聚类

聚类策略完全在端侧执行：

- `zoom >= 14`：不聚类
- `zoom >= 10`：100 米
- `zoom >= 6`：1 公里
- 其余：10 公里

聚类中心使用簇内经纬度平均值，地图历史视角通过 `MapViewStack` 维护。

## 5. 地点补全

### 5.1 入口

- 地图页顶部提示 banner
- “待补地点”列表页

### 5.2 流程

1. 选择城市
2. 输入地点关键词
3. `eventApi.searchLocationPlaces(query, city)`
4. 选择地点后 `PATCH /api/v1/events/{id}`

### 5.3 判定规则

当前 `needsLocationSupplement()` 只看事件是否拥有有效 `gpsLat/gpsLon`。

## 6. 关联模块

- 事件详情：`frontend/modules/story.md`
- 地理编码与地点搜索：`backend/modules/map.md`
- 事件列表数据：`backend/modules/event.md`
