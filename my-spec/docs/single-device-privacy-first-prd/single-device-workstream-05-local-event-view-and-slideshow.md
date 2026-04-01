# Workstream 05：事件详情、封面、幻灯片与本地导出

> 角色：前端主需求包
>
> 优先级：P0
>
> 是否允许并行开发：是

---

## 1. 需求背景

当前事件详情和幻灯片模块默认基于服务端返回的图片 URL 工作，这意味着即使产品定义为“默认不上图”，展示层仍然依赖旧云图模型。

如果不改这里，产品即使导入链路和故事链路改完，也无法真正落成单设备体验。

---

## 2. 目标

把事件详情、封面、图片查看器、幻灯片播放和视频导出全部切换到“优先使用本地媒体”的单设备体验。

---

## 3. 范围

### 包含

- 事件封面重构
- 图片网格与查看器重构
- 幻灯片播放重构
- 视频端侧导出

### 不包含

- 默认故事生成
- Android 端识别实现
- 增强入口云端上传

---

## 4. 产品要求

### 4.1 事件封面

- 默认从首图、抽样图、代表图中选择
- 支持用户手动更换
- 在无可用封面图时允许展示无图兜底卡片

### 4.2 事件详情

- 照片网格优先使用本地缩略图
- Photo Viewer 优先使用本地原图
- 页面中故事和章节继续显示服务端文本结果

### 4.3 幻灯片与导出

- 幻灯片播放基于本地图片
- 字幕使用事件故事、章节文案和微故事
- 视频导出在端侧完成

---

## 5. 技术方向

### 前端

- `EventDetail` 改为消费本地封面与本地照片引用
- `PhotoGrid`、`PhotoViewer`、`SlideshowPlayer` 优先使用本地 URI
- `slideshowStore` 需要保存本地媒体引用
- 端侧导出能力可基于 React Native / Expo 可用方案实现

### 数据依赖

- 需要 `02-本地媒体模型` 提供本地引用字段
- 需要 `04-默认故事链路` 提供稳定的文本输出

---

## 6. 涉及模块

- `mobile/app/events/[eventId].tsx`
- `mobile/app/photo-viewer.tsx`
- `mobile/app/slideshow.tsx`
- `mobile/src/components/photo/PhotoGrid.tsx`
- `mobile/src/components/photo/PhotoViewer.tsx`
- `mobile/src/components/slideshow/SlideshowPlayer.tsx`
- `mobile/src/stores/photoViewerStore.ts`
- `mobile/src/stores/slideshowStore.ts`
- `mobile/src/types/event.ts`
- `mobile/src/types/photo.ts`
- `mobile/src/types/slideshow.ts`

---

## 7. 验收口径

- 事件详情不再把服务端图片 URL 作为唯一依赖
- 封面支持本地选择与手动替换
- 幻灯片在未上传图片时仍可正常播放
- 视频导出在单设备上可完成

---

## 8. 与其他需求包的关系

- 依赖 `00-核心契约`
- 依赖 `02-本地导入与本地媒体模型`
- 依赖 `04-默认故事生成链路`
- 与 `01-壳层与设置` 可并行
