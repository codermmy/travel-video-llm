# 执行 PRD：照片与补导入链路重构

- 文档状态：Ready for Implementation
- 执行顺序：4
- 对应总 PRD：
  - [mobile-ui-revamp-prd.md](/Users/maoyuan/code/travel-video-llm/my-spec/docs/mobile-ui-revamp-prd/mobile-ui-revamp-prd.md)
- 对应设计基线：
  - [mobile-ui-wireframes.html](/Users/maoyuan/code/travel-video-llm/my-spec/docs/mobile-ui-revamp-prd/mobile-ui-wireframes.html)

## 1. 目标

- 把照片查看、多选管理、手动补导入、权限恢复整理成一条完整链路。
- 一次完成页面 07、08、09、13：
  - 07 照片查看器
  - 08 长按照片 / 管理照片
  - 09 手动补导入选择器
  - 13 权限恢复与头像来源模板

## 2. 关联总任务

- [ ] `C1` 页面 07 照片查看器按 HTML 完整实现
- [ ] `C2` 页面 08 长按照片 / 管理照片按 HTML 完整实现
- [ ] `C3` 页面 09 手动补导入选择器按 HTML 完整实现
- [ ] `C4` 页面 13 权限恢复模板接入相册、相机、补导入、当前事件加图、头像来源

## 3. 页面边界

- 页面 07：沉浸式照片查看器
- 页面 08：事件照片管理和多选操作
- 页面 09：手动补导入选择器
- 页面 13：权限拒绝恢复模板

## 4. 主要文件边界

- 允许修改：
  - `mobile/app/photo-viewer.tsx`
  - `mobile/src/components/photo/PhotoViewer.tsx`
  - `mobile/src/components/photo/PhotoLibraryPickerModal.tsx`
  - `mobile/src/components/photo/SelectableMediaGrid.tsx`
  - `mobile/src/components/event/EventPhotoManagerSheet.tsx`
  - `mobile/app/profile/avatar.tsx`
- 不应修改：
  - 首页主结构
  - 地图页
  - 事件详情主结构

## 5. 实现要求

- 照片查看器必须具备：
  - 返回胶囊
  - 页码胶囊
  - 图片失败占位
  - 时间
  - 地点/GPS
  - 低噪音 caption
  - 胶片条
- 管理照片必须具备：
  - 默认浏览
  - 长按进入选择态
  - 连续选择
  - 批量移动
  - 移出当前事件
  - 删除
- 手动补导入必须具备：
  - 浏览态
  - 长按选择态
  - 已选择 banner
  - 全选已加载
  - 取消选择
  - 开始导入 / 取消
- 权限拒绝必须统一为一套模板，复用到：
  - 相册导入
  - 手动补导入
  - 当前事件加图
  - 头像相册来源
  - 头像拍照来源

## 6. 非目标

- 不扩展新的照片编辑能力。
- 不增加新的系统权限类型。
- 不重构头像页整体结构，这部分只处理权限恢复模板和来源心智接入。

## 7. 任务清单

- [x] P1：照片查看器顶部、底部信息层和失败态按页面 07 重构
- [x] P2：照片管理页的选择态与批量操作按页面 08 重构
- [x] P3：手动补导入选择器按页面 09 重构
- [x] P4：相册权限拒绝时接入页面 13 模板
- [x] P5：相机权限拒绝时接入页面 13 模板
- [x] P6：当前事件加图和头像来源复用同一权限恢复心智

## 8. 验收标准

- 页面 07 不再只是黑底大图，而是完整浏览器。
- 页面 08 的选择态与批量操作清晰、连续，不依赖零散按钮。
- 页面 09 虽是次级入口，但体验完整，不像临时弹窗。
- 页面 13 在所有权限拒绝相关入口上都能复用。

## 9. 验证方式

- `cd mobile && npm run lint`
- `cd mobile && npm run typecheck`
- 手动核对：
  - 照片查看正常态
  - 照片加载失败态
  - 长按进入多选
  - 补导入选择态
  - 相册权限拒绝
  - 相机权限拒绝

## 10. 完成规则

- 只有页面 07、08、09、13 全部对齐 HTML 并打通主要交互后，才允许勾总 PRD 的 `C1-C4`。
