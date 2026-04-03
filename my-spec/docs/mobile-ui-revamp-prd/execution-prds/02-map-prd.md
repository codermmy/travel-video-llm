# 执行 PRD：地图链路重构

- 文档状态：Ready for Implementation
- 执行顺序：2
- 对应总 PRD：
  - [mobile-ui-revamp-prd.md](/Users/maoyuan/code/travel-video-llm/my-spec/docs/mobile-ui-revamp-prd/mobile-ui-revamp-prd.md)
- 对应设计基线：
  - [mobile-ui-wireframes.html](/Users/maoyuan/code/travel-video-llm/my-spec/docs/mobile-ui-revamp-prd/mobile-ui-wireframes.html)

## 1. 目标

- 把地图页稳定降级为辅助探索入口，而不是产品主视图。
- 一次完成页面 03、06：
  - 03 地图探索页
  - 06 地图聚合点事件列表

## 2. 关联总任务

- [ ] `B1` 页面 03 地图探索页按 HTML 完整实现
- [ ] `B2` 页面 06 地图聚合点事件列表按 HTML 完整实现

## 3. 页面边界

- 页面 03：地图基础浏览态
- 页面 06：同一地点多事件时的聚合列表态

## 4. 主要文件边界

- 允许修改：
  - `mobile/app/(tabs)/map.tsx`
  - `mobile/src/components/map/MapViewContainer.tsx`
  - `mobile/src/components/map/EventCardList.tsx`
  - 直接服务于地图浮层和抽屉的组件
- 不应修改：
  - 事件详情页
  - 首页事件流
  - 照片管理链路

## 5. 实现要求

- 地图层必须保持纯净，说明和状态优先收进顶部浮层和底部抽屉。
- 顶部只保留必要信息：
  - 当前区域或旅程信息
  - 必要工具按钮
  - 筛选胶囊
- 底部抽屉默认展示单个事件卡。
- 聚合点展开时，必须切换到事件列表，不允许退化成只有一张卡。
- 列表项必须具备：
  - 缩略图
  - 标题
  - 照片数
  - 状态
  - 进入动作

## 6. 非目标

- 不改地图底层数据接口。
- 不改事件详情内部视觉。
- 不增加复杂地图工具栏和高级筛选。

## 7. 任务清单

- [x] M1：地图顶部浮层按页面 03 收口
- [x] M2：地图筛选胶囊按页面 03 重构
- [x] M3：默认单事件抽屉按页面 03 重构
- [x] M4：聚合点事件列表抽屉按页面 06 重构
- [x] M5：聚合列表项和单事件卡使用同一套视觉语言
- [x] M6：从地图卡片和聚合列表进入事件详情链路稳定可用

## 8. 验收标准

- 地图不再是首页心智残留。
- 地图层上的文字、说明、控制数量明显下降。
- 同地点多事件时，用户可以在抽屉里连续浏览多个事件。
- Marker、抽屉卡片、筛选胶囊的视觉语言一致。

## 9. 验证方式

- `cd mobile && npm run lint`
- `cd mobile && npm run typecheck`
- 手动核对：
  - 空地图或无数据状态
  - 单个事件选中状态
  - 聚合点展开状态
  - 从抽屉进入详情

## 10. 完成规则

- 只有页面 03、06 与 HTML 对照通过后，才允许勾总 PRD 的 `B1-B2`。
