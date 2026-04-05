# 前端模块：回忆主页

## 1. 职责范围

- 作为默认首页展示用户的事件列表
- 承担“最近 200 张导入”和“手动补导入”主入口
- 提供 hero 回忆卡片、月份分组、下拉刷新
- 集成事件编辑、照片管理、后台任务提示

## 2. 代码入口

| 类型 | 文件 |
|---|---|
| 路由入口 | `mobile/app/(tabs)/index.tsx` |
| 页面实现 | `mobile/src/screens/memories-screen.tsx` |
| 时间分组 | `mobile/src/utils/eventGrouping.ts` |
| 月份头部 | `mobile/src/components/timeline/MonthHeader.tsx` |
| 事件卡片 | `mobile/src/components/timeline/TimelineEventCard.tsx` |

## 3. 页面结构

### 3.1 顶部 hero

- 默认取最新事件作为 hero
- 可直接：
  - 打开故事
  - 打开照片
  - 触发导入

### 3.2 列表部分

- 通过 `eventApi.listAllEvents()` 拉全量事件
- 按月份分组展示
- 事件状态通过 `getEventStatusMeta()` 映射成：
  - 导入中
  - 整理中
  - 待更新
  - 失败
  - 已完成

### 3.3 弹层与二级操作

- `PhotoLibraryPickerModal`
- `ImportProgressModal`
- `UploadProgress`
- `EventEditSheet`
- `EventPhotoManagerSheet`

## 4. 关键交互

### 4.1 最近 200 张导入

- 主动触发，不会在启动时自动扫描
- 进入导入流水线后会创建 import task

### 4.2 手动补导入

- 允许从系统相册选择任意资产
- 失败时根据错误类型提示去系统设置开权限

### 4.3 编辑与照片管理

- 支持编辑事件标题、地点、封面
- 支持批量移动照片、删除照片、向当前事件补导入

## 5. 关联模块

- 导入与后台阶段：`frontend/modules/upload.md`
- 详情与播放：`frontend/modules/story.md`
- 事件数据来源：`backend/modules/event.md`
