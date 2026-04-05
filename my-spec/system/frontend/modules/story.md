# 前端模块：事件详情、编辑与幻灯片

## 1. 职责范围

- 展示事件详情、章节、照片、完整故事
- 提供事件编辑、封面覆盖、照片管理、删除事件
- 播放并导出幻灯片视频

## 2. 代码入口

| 类型 | 文件 |
|---|---|
| 详情页 | `mobile/app/events/[eventId].tsx` |
| 编辑弹层 | `mobile/src/components/event/EventEditSheet.tsx` |
| 照片管理弹层 | `mobile/src/components/event/EventPhotoManagerSheet.tsx` |
| 幻灯片页 | `mobile/app/slideshow.tsx` |
| 播放器 | `mobile/src/components/slideshow/SlideshowPlayer.tsx` |
| 场景构建 | `mobile/src/services/slideshow/slideshowSceneBuilder.ts` |
| 视频导出 | `mobile/src/services/slideshow/slideshowExportService.ts` |
| 音频规划 | `mobile/src/services/slideshow/slideshowAudioService.ts` |

## 3. 事件详情页

### 3.1 展示内容

- 封面 hero
- 标题、地点、日期、照片数
- 状态提示：
  - `waiting_for_vision`
  - freshness 为 `stale`
  - `ai_failed`
- 故事引子
- 章节卡片
- 照片网格
- 完整故事

### 3.2 快捷动作

- 播放回忆
- 查看照片
- 更多

“更多”里包含：

- 编辑事件
- 管理照片
- 移动整组照片
- 手动重试更新
- 删除事件

## 4. 事件编辑

### 4.1 可编辑项

- 标题
- 地点名
- 封面图

### 4.2 封面规则

- 默认封面来自事件中位图或已有 `coverPhotoId`
- 用户手动换封面后，只把覆盖信息存到本地 `event-cover-override`
- 不会把端侧封面覆盖直接写回后端

## 5. 照片管理

支持：

- 选中后移动到其他事件
- 选中后新建事件
- 选中后移出当前事件
- 批量删除照片
- 向当前事件补导入照片

照片结构变化后，后端会自动：

- 刷新事件摘要
- 标记故事和幻灯片为 stale
- 请求新的故事版本

## 6. 幻灯片播放器

### 6.1 当前能力

- 按章节和照片生成 scenes
- 生成视频预览，优先用预览视频播放
- 失败时降级为实时播放
- 远程音乐优先，本地 `default-bgm.wav` 兜底
- 支持横屏播放
- 支持导出完整视频

### 6.2 导出前提

以下任一条件成立时应视为不可导出：

- `event.slideshowFreshness === 'stale'`
- `event.hasPendingStructureChanges === true`

### 6.3 原生依赖

- `TravelSlideshowExport` Expo 原生模块
- `expo-av`

## 7. 当前边界

- 事件增强故事接口已接入 API 层，但当前详情页没有正式入口
- 详情页会预热预览视频，但预览缓存仍是端侧文件缓存，不属于服务端资源
