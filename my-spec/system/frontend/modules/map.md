# 前端模块：地图（Map）

> **文档目的**：详细说明前端地图模块的组件结构、交互逻辑、聚类算法和状态管理，帮助开发者快速理解和修改地图相关功能。

---

## 1. 模块概述

### 1.1 职责范围

- 展示事件标记与聚合信息
- 承担地图层级导航与回退交互
- 连接事件详情页跳转
- 管理地图视图状态栈
- 实现前端事件聚类

### 1.2 代码入口

| 类型 | 文件路径 |
|------|----------|
| 主页面 | `mobile/app/(tabs)/index.tsx` |
| 地图容器 | `mobile/src/components/map/MapViewContainer.tsx` |
| 聚类标记 | `mobile/src/components/map/ClusterMarker.tsx` |
| 事件卡片列表 | `mobile/src/components/map/EventCardList.tsx` |
| 返回按钮 | `mobile/src/components/map/BackButton.tsx` |
| 聚类工具 | `mobile/src/utils/mapClusterUtils.ts` |
| 类型定义 | `mobile/src/types/mapStack.ts` |
| 高德类型 | `mobile/src/components/map/amapTypes.ts` |

---

## 2. 组件结构

### 2.1 MapViewContainer

**职责**：地图主容器，管理地图状态和交互

**Props**：
```typescript
interface MapViewContainerProps {
  events: EventRecord[];           // 事件列表
  onEventPress: (eventId: string) => void;  // 事件点击回调
}
```

**内部状态**：
```typescript
// 高德地图模块
const [amap, setAmap] = useState<AMapModule | null>(null);
const [amapStatus, setAmapStatus] = useState<AMapLoadStatus>('idle');
const [isMapReady, setIsMapReady] = useState(false);

// 选中状态
const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

// 视图栈
const [stack, setStack] = useState<MapViewStack | null>(null);
```

### 2.2 ClusterMarker

**职责**：聚类标记组件，显示封面图和数量

**Props**：
```typescript
interface ClusterMarkerProps {
  coverUrl: string | null;    // 封面图 URL
  clusterCount: number;       // 聚类数量
  isSelected: boolean;        // 是否选中
  onPress: () => void;        // 单击回调
  onDoublePress: () => void;  // 双击回调
}
```

**交互行为**：
- 单击：显示事件卡片列表
- 双击：缩放到聚类区域

### 2.3 EventCardList

**职责**：事件卡片列表，显示聚类内的事件

**Props**：
```typescript
interface EventCardListProps {
  events: EventPoint[];
  selectedEventId: string | null;
  onPressEvent: (eventId: string) => void;
  onPressDetails: (eventId: string) => void;
  onClose: () => void;
}
```

### 2.4 BackButton

**职责**：返回初始视图按钮

**Props**：
```typescript
interface BackButtonProps {
  levelName: string;    // 当前层级名称
  onPress: () => void;  // 点击回调
}
```

---

## 3. 地图状态栈

### 3.1 数据结构

```typescript
// mobile/src/types/mapStack.ts
interface CameraState {
  target: {
    latitude: number;
    longitude: number;
  };
  zoom: number;
}

interface MapViewStack {
  states: CameraState[];      // 状态历史
  initialState: CameraState;  // 初始状态
  currentIndex: number;       // 当前索引
}
```

### 3.2 状态操作

```typescript
// 初始化栈（根据事件计算最佳视图）
initializeStack(events: EventPoint[]): MapViewStack;

// 缩放到聚类
zoomIntoCluster(cluster: EventCluster, stack: MapViewStack): MapViewStack;

// 回退一级
popStack(stack: MapViewStack): MapViewStack;

// 返回初始状态
returnToInitialState(stack: MapViewStack): MapViewStack;
```

### 3.3 层级名称

```typescript
function getLevelName(cameraState: CameraState): string {
  if (cameraState.zoom <= 5) return '全国';
  if (cameraState.zoom <= 8) return '省级视图';
  if (cameraState.zoom <= 11) return '城市视图';
  return '区域视图';
}
```

---

## 4. 前端聚类算法

### 4.1 聚类数据结构

```typescript
interface EventCluster {
  id: string;                    // 聚类 ID（事件 ID 拼接）
  center: {
    latitude: number;
    longitude: number;
  };
  events: EventPoint[];          // 聚类内的事件
  count: number;                 // 事件数量
}
```

### 4.2 聚类算法

```typescript
// 基于 Haversine 距离的简单聚类
function clusterEvents(events: EventPoint[], thresholdKm: number): EventCluster[] {
  if (thresholdKm <= 0) {
    // 不聚类，每个事件单独显示
    return events.map(event => ({
      id: event.id,
      center: { latitude: event.gpsLat, longitude: event.gpsLon },
      events: [event],
      count: 1,
    }));
  }

  const clusters: EventCluster[] = [];
  const processed = new Set<string>();

  for (const event of events) {
    if (processed.has(event.id)) continue;

    const nearby: EventPoint[] = [event];
    processed.add(event.id);

    for (const other of events) {
      if (processed.has(other.id)) continue;

      const dist = haversineDistance(
        event.gpsLat, event.gpsLon,
        other.gpsLat, other.gpsLon
      );
      if (dist <= thresholdKm) {
        nearby.push(other);
        processed.add(other.id);
      }
    }

    // 计算聚类中心
    const centerLat = nearby.reduce((sum, item) => sum + item.gpsLat, 0) / nearby.length;
    const centerLon = nearby.reduce((sum, item) => sum + item.gpsLon, 0) / nearby.length;

    clusters.push({
      id: buildClusterId(nearby),
      center: { latitude: centerLat, longitude: centerLon },
      events: nearby,
      count: nearby.length,
    });
  }

  return clusters;
}
```

### 4.3 自适应聚类阈值

```typescript
function getAdaptiveClusterThreshold(zoom: number): number {
  if (zoom >= 14) return 0;    // 不聚类
  if (zoom >= 10) return 0.1;  // 100 米
  if (zoom >= 6) return 1;     // 1 公里
  return 10;                   // 10 公里
}
```

### 4.4 Haversine 距离计算

```typescript
const EARTH_RADIUS_KM = 6371;

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}
```

---

## 5. 交互流程

### 5.1 完整交互流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        地图交互流程                                      │
└─────────────────────────────────────────────────────────────────────────┘

1. 页面加载
   ↓
2. 获取事件列表
   ↓
3. 过滤有效 GPS 事件
   ↓
4. 初始化视图栈（计算最佳视图）
   ↓
5. 根据当前 zoom 计算聚类
   ↓
6. 渲染聚类标记
   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                        用户交互                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  单击聚类标记                                                            │
│  ├─ 设置 selectedClusterId                                              │
│  └─ 显示 EventCardList                                                  │
│                                                                         │
│  双击聚类标记                                                            │
│  ├─ 聚类数量 = 1 → 直接进入事件详情                                      │
│  └─ 聚类数量 > 1 → 缩放到聚类区域（zoom + 3）                            │
│                                                                         │
│  点击地图空白                                                            │
│  ├─ 有选中聚类 → 取消选中                                                │
│  └─ 无选中聚类 → 回退一级视图                                            │
│                                                                         │
│  点击返回按钮                                                            │
│  └─ 返回初始视图                                                         │
│                                                                         │
│  点击事件卡片                                                            │
│  └─ 进入事件详情页                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 视图缩放逻辑

```typescript
function zoomIntoCluster(cluster: EventCluster, stack: MapViewStack): MapViewStack {
  if (stack.currentIndex >= MAX_STACK_DEPTH - 1) {
    return stack;  // 防止栈溢出
  }

  const currentZoom = stack.states[stack.currentIndex]?.zoom ?? stack.initialState.zoom;
  const nextState: CameraState = {
    target: {
      latitude: cluster.center.latitude,
      longitude: cluster.center.longitude,
    },
    zoom: Math.min(currentZoom + 3, 18),  // 最大 zoom 18
  };

  return {
    ...stack,
    states: [...stack.states.slice(0, stack.currentIndex + 1), nextState],
    currentIndex: stack.currentIndex + 1,
  };
}
```

---

## 6. 高德地图集成

### 6.1 模块加载

```typescript
// 动态加载高德地图模块
useEffect(() => {
  if (isWeb || isExpoGo) {
    setAmapStatus('module_error');
    return;
  }

  if (!isPlatformKeyConfigured) {
    setAmapStatus('missing_keys');
    return;
  }

  try {
    const mod = require('react-native-amap3d');
    setAmap(mod);

    // 初始化 SDK
    if (Platform.OS === 'android') {
      mod.AMapSdk.init(amapAndroidKey);
    } else if (Platform.OS === 'ios') {
      mod.AMapSdk.init(amapIosKey);
    }

    setAmapStatus('ready');
  } catch (error) {
    setAmapStatus('module_error');
  }
}, []);
```

### 6.2 配置要求

```json
// mobile/app.json
{
  "expo": {
    "extra": {
      "amap": {
        "androidKey": "your_android_key",
        "iosKey": "your_ios_key"
      }
    }
  }
}
```

### 6.3 降级处理

| 场景 | 处理方式 |
|------|----------|
| Web 环境 | 显示"Web 不支持高德地图"提示 |
| Expo Go | 显示"Expo Go 无法显示地图"提示 |
| 未配置 Key | 显示配置指引 |
| 模块加载失败 | 显示错误信息 |

---

## 7. 空状态处理

### 7.1 无事件数据

```typescript
{validEvents.length === 0 ? (
  <View style={styles.emptyState}>
    <Text style={styles.emptyTitle}>还没有带定位的事件</Text>
    <Text style={styles.emptyText}>
      上传包含 GPS 信息的照片后，这里会显示足迹标记。
    </Text>
  </View>
) : null}
```

### 7.2 GPS 数据验证

```typescript
function hasValidGps(event: EventRecord): event is EventPoint {
  if (typeof event.gpsLat !== 'number' || typeof event.gpsLon !== 'number') {
    return false;
  }
  if (!Number.isFinite(event.gpsLat) || !Number.isFinite(event.gpsLon)) {
    return false;
  }
  if (Math.abs(event.gpsLat) > 90 || Math.abs(event.gpsLon) > 180) {
    return false;
  }
  return true;
}
```

---

## 8. 性能优化

### 8.1 聚类缓存

```typescript
const clusters = useMemo(() => {
  if (!stack || validEvents.length === 0) {
    return [];
  }
  const currentState = stack.states[stack.currentIndex];
  const thresholdKm = getAdaptiveClusterThreshold(currentState.zoom);
  return clusterEvents(validEvents, thresholdKm);
}, [stack, validEvents]);
```

### 8.2 事件过滤缓存

```typescript
const validEvents = useMemo(() => events.filter(hasValidGps), [events]);
```

### 8.3 栈深度限制

```typescript
const MAX_STACK_DEPTH = 10;  // 防止无限缩放
```

---

## 9. 测试要点

### 9.1 交互测试

- 聚类点单击/双击
- 空白区域点击回退
- 返回初始视图按钮
- 事件卡片点击进入详情

### 9.2 数据测试

- 多事件同坐标聚类
- 跨省分布事件
- 无 GPS 数据事件过滤
- 边界坐标处理

### 9.3 人工验收

- 从地图进入事件详情并返回
- 多级缩放后返回初始视图
- 地图加载失败降级显示

---

## 10. 关联模块

| 模块 | 文档 | 关联说明 |
|------|------|----------|
| 后端地图 | `backend/modules/map.md` | 逆地理编码、POI 标签 |
| 后端事件 | `backend/modules/event.md` | 事件数据、GPS 坐标 |
| 前端故事 | `frontend/modules/story.md` | 事件详情页跳转 |
| 事件 API | `mobile/src/services/api/eventApi.ts` | 事件列表获取 |

---

## 11. 变更影响

若本模块变更，需同步检查：

- [ ] `my-spec/system/backend/modules/map.md`
- [ ] `my-spec/system/backend/modules/event.md`
- [ ] `my-spec/system/frontend/modules/story.md`（若影响事件详情跳转）

---

> **最后更新**：2026-02-10
