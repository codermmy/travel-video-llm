# PLAN - events-timeline-view

## 1. 薄技术方案

### 影响模块

| 模块 | 变更类型 | 说明 |
|------|----------|------|
| `mobile/app/(tabs)/events.tsx` | 重构 | 主要改造文件，FlatList → SectionList |
| `mobile/src/components/timeline/` | 新增 | 时间线相关组件 |
| `mobile/src/utils/eventGrouping.ts` | 新增 | 按月分组工具函数 |

### 关键设计决策

1. **列表组件选择**：使用 `SectionList` 替代 `FlatList`
   - 原因：SectionList 原生支持分组和 section header
   - 备选：继续用 FlatList + 手动插入分隔符（复杂度高）

2. **时间线布局方案**：左侧固定宽度时间轴 + 右侧弹性卡片
   ```
   ┌──────┬─────────────────────────────┐
   │ 40px │         flex: 1             │
   │ 时间轴│         事件卡片             │
   └──────┴─────────────────────────────┘
   ```

3. **分组逻辑**：前端计算，不依赖后端
   - 从 `startTime` 提取年月
   - 按年月倒序排列（最新在前）
   - 统计每组的事件数和照片总数

4. **组件拆分**：
   - `TimelineView` - 整体容器（SectionList 封装）
   - `MonthHeader` - 月份标题组件
   - `TimelineEventCard` - 事件卡片（含时间轴节点）
   - `TimelineConnector` - 时间轴线条

### 数据/接口变更

- **无后端变更**：复用现有 `eventApi.listEvents()` 接口
- **前端数据转换**：
  ```typescript
  // 输入：EventRecord[]
  // 输出：{ month: string; events: EventRecord[]; stats: { count: number; photos: number } }[]
  ```

### 风险与回滚

| 风险 | 缓解措施 | 回滚方案 |
|------|----------|----------|
| SectionList 性能 | 使用 `getItemLayout`、`initialNumToRender` 优化 | 回退到 FlatList |
| 分组逻辑错误 | 单元测试覆盖边界情况 | 修复逻辑 |
| 样式兼容性 | iOS/Android 双端测试 | 调整样式 |

## 2. 实现边界

### 本次实现

- [x] SectionList 替换 FlatList
- [x] 月份分组逻辑
- [x] 月份标题组件（含统计）
- [x] 时间线布局（轴线 + 节点）
- [x] 事件卡片改造（3张缩略图）
- [x] 保持下拉刷新、分页加载
- [x] 保持 hero 区域

### 暂不实现

- [ ] 时间线动画效果
- [ ] 年份折叠/展开
- [ ] 搜索/筛选功能
- [ ] 时间轴节点点击交互

## 3. 测试执行计划

### 读取 profile

`my-spec/system/execution/01-test-profile.yaml`

### 执行顺序

| 顺序 | Profile | 类型 | 命令 |
|------|---------|------|------|
| 1 | mobile_static | required | `cd mobile && npm run lint && npm run typecheck` |
| 2 | backend | required | `cd backend && source .venv/bin/activate && pytest -q` |
| 3 | mobile_e2e_manual_assisted | conditional | Maestro 测试 + 人工验证 |

### 门禁测试

必须通过：TC-010（静态检查）、TC-011（后端回归）、TC-001、TC-002、TC-006

## 4. 文档影响范围

### 命中的 doc-sync 规则

本次变更文件：
- `mobile/app/(tabs)/events.tsx`
- `mobile/src/components/timeline/*`（新增）
- `mobile/src/utils/eventGrouping.ts`（新增）

**匹配规则**：无直接匹配（events.tsx 不在现有规则中）

### 必改文档列表

虽然无直接匹配规则，但根据变更内容，建议更新：

| 文档 | 更新内容 |
|------|----------|
| `my-spec/system/frontend/modules/story.md` | 新增时间线视图说明 |
| `my-spec/system/project/03-module-catalog.md` | 新增 timeline 组件入口 |

### 可选更新文档

| 文档 | 更新内容 |
|------|----------|
| `my-spec/system/project/01-overview.md` | 更新"事件列表"描述为"时间线视图" |

## 5. 组件设计

### 目录结构

```
mobile/src/
├── components/
│   └── timeline/
│       ├── index.ts              # 导出
│       ├── TimelineView.tsx      # SectionList 封装
│       ├── MonthHeader.tsx       # 月份标题
│       ├── TimelineEventCard.tsx # 事件卡片
│       └── styles.ts             # 样式
└── utils/
    └── eventGrouping.ts          # 分组工具函数
```

### 核心类型

```typescript
interface MonthSection {
  month: string;           // "2026-02" 格式，用于排序
  displayMonth: string;    // "2026年2月" 格式，用于显示
  events: EventRecord[];
  stats: {
    eventCount: number;
    photoCount: number;
  };
}
```
