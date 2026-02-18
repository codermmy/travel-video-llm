# 文档预变更说明 - events-timeline-view

## 概述

本次变更为前端 UI 改造，将事件列表从卡片视图改为时间线视图。

## 本次代码落地（用于 verify 对照）

- 入口页面：`mobile/app/(tabs)/events.tsx`
  - 列表由 `FlatList` 切换为 `SectionList`
  - 接入 `groupEventsByMonth` 实现按月分组
  - 保留现有下拉刷新、分页加载、hero 区域、导入流程
- 新增组件：`mobile/src/components/timeline/MonthHeader.tsx`
- 新增组件：`mobile/src/components/timeline/TimelineEventCard.tsx`
- 新增工具：`mobile/src/utils/eventGrouping.ts`
- 新增自动化脚本：`mobile/.maestro/events-timeline.yaml`

## 预计文档更新

### 1. my-spec/system/frontend/modules/story.md

**更新内容**：
- 新增"时间线视图"章节
- 说明 TimelineView、MonthHeader、TimelineEventCard 组件
- 补充事件列表的新布局结构

**预计变更位置**：在"事件详情页"章节前新增

### 2. my-spec/system/project/03-module-catalog.md

**更新内容**：
- 前端模块表新增 timeline 组件入口

**预计变更**：
```markdown
| 时间线 | `my-spec/system/frontend/modules/story.md` | `mobile/src/components/timeline/` |
```

### 3. my-spec/system/project/01-overview.md

**更新内容**：
- 第 103 行"事件列表：时间线浏览"描述更新
- 补充时间线视图的具体说明

## 不需要更新的文档

- 后端模块文档（无后端变更）
- API 文档（无接口变更）
- 数据库文档（无模型变更）

## 验证检查清单

- [x] story.md 包含时间线视图说明
- [x] module-catalog.md 包含 timeline 组件入口
- [x] overview.md 描述与实际功能一致

## 测试与证据（apply 阶段）

- backend profile：`my-spec/artifacts/events-timeline-view/reports/backend-pytest.txt`（63 passed）
- mobile static：
  - `my-spec/artifacts/events-timeline-view/reports/mobile-typecheck.txt`（通过）
  - `my-spec/artifacts/events-timeline-view/reports/mobile-lint-changed-files.txt`（本次变更文件通过）
  - `my-spec/artifacts/events-timeline-view/reports/mobile-lint.txt`（仓库存在既有 lint/prettier 问题）
- mobile e2e manual assisted：
  - 自动化脚本：`mobile/.maestro/events-timeline.yaml`
  - 报告：`my-spec/artifacts/events-timeline-view/reports/mobile-maestro.txt`
  - 调试材料：`my-spec/artifacts/events-timeline-view/traces/`
  - 人工握手：`my-spec/artifacts/events-timeline-view/handshake/data-ready.done`
