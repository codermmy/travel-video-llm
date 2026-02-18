# TASKS - events-timeline-view

## 执行清单

### 阶段 1：基础设施

- [ ] **T1**: 创建 timeline 组件目录结构
  - 创建 `mobile/src/components/timeline/` 目录
  - 创建 `mobile/src/utils/eventGrouping.ts`
  - **完成标准**：目录和空文件已创建

### 阶段 2：核心逻辑

- [ ] **T2**: 实现按月分组工具函数
  - 文件：`mobile/src/utils/eventGrouping.ts`
  - 功能：`groupEventsByMonth(events: EventRecord[]): MonthSection[]`
  - **完成标准**：函数可正确将事件按月分组，统计正确

- [ ] **T3**: 实现 MonthHeader 组件
  - 文件：`mobile/src/components/timeline/MonthHeader.tsx`
  - 功能：显示"YYYY年M月 · X个事件 · X张照片"
  - **完成标准**：组件渲染正确，样式美观

- [ ] **T4**: 实现 TimelineEventCard 组件
  - 文件：`mobile/src/components/timeline/TimelineEventCard.tsx`
  - 功能：左侧时间轴节点 + 右侧事件卡片（标题、日期、地点、3张缩略图）
  - **完成标准**：组件渲染正确，点击可触发回调

### 阶段 3：主页面改造

- [ ] **T5**: 改造 events.tsx 使用 SectionList
  - 文件：`mobile/app/(tabs)/events.tsx`
  - 功能：替换 FlatList 为 SectionList，集成时间线组件
  - **完成标准**：页面正常渲染时间线视图

- [ ] **T6**: 保持现有功能
  - 功能：下拉刷新、分页加载、hero 区域
  - **完成标准**：所有现有功能正常工作

### 阶段 4：测试与修复

- [ ] **T7**: 运行静态检查并修复
  - 命令：`cd mobile && npm run lint && npm run typecheck`
  - **完成标准**：无 lint 错误，无类型错误

- [ ] **T8**: 运行后端回归测试
  - 命令：`cd backend && source .venv/bin/activate && pytest -q`
  - **完成标准**：所有测试通过

- [ ] **T9**: E2E 验证（人机协作）
  - 步骤：真机启动应用，验证时间线视图
  - **完成标准**：TC-001 ~ TC-009 验证通过

### 阶段 5：文档与收尾

- [ ] **T10**: 生成文档预变更说明
  - 文件：`doc_change_preview.md`
  - **完成标准**：列出需要更新的文档和预计内容

- [ ] **T11**: 收集测试证据
  - 路径：`my-spec/artifacts/events-timeline-view/`
  - **完成标准**：报告、日志、截图已保存

## 执行规则

1. 每完成一个任务，记录变更说明和证据路径。
2. 若需人工操作，使用握手步骤并记录 step_id。
3. required 测试未通过时不得结束 apply 阶段。
4. T7、T8 为门禁任务，必须通过。

## 任务依赖

```
T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11
     └─────────────────┘
        可并行开发
```
