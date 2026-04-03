# 执行 PRD：事件详情链路重构

- 文档状态：Ready for Implementation
- 执行顺序：3
- 对应总 PRD：
  - [mobile-ui-revamp-prd.md](/Users/maoyuan/code/travel-video-llm/my-spec/docs/mobile-ui-revamp-prd/mobile-ui-revamp-prd.md)
- 对应设计基线：
  - [mobile-ui-wireframes.html](/Users/maoyuan/code/travel-video-llm/my-spec/docs/mobile-ui-revamp-prd/mobile-ui-wireframes.html)

## 1. 目标

- 把事件详情从资料页改成“旅行记忆册”。
- 一次完成页面 04、15：
  - 04 事件详情页
  - 15 更多操作中的封面选择 / 移动目标选择

## 2. 关联总任务

- [ ] `B3` 页面 04 事件详情页按 HTML 完整实现
- [ ] `B4` 页面 15 中“更多操作 / 封面选择 / 移动目标选择”挂回事件详情链路

## 3. 页面边界

- 页面 04：详情主页面
- 页面 15：管理照片后的移动目标选择、封面选择二级流

## 4. 主要文件边界

- 允许修改：
  - `mobile/app/events/[eventId].tsx`
  - `mobile/src/components/event/EventEditSheet.tsx`
  - `mobile/src/components/event/EventPhotoManagerSheet.tsx`
  - 直接服务于详情 Hero、章节区、更多操作 Sheet 的组件
- 不应修改：
  - 首页
  - 地图页
  - 播放器页面

## 5. 实现要求

- Hero 区只保留必要信息：
  - 返回
  - 更多
  - 标题
  - 地点
  - 时间
  - 照片数
- 主次操作顺序固定：
  - `播放回忆`
  - `查看照片`
  - `更多`
- 内容顺序固定：
  - 自动更新轻状态条
  - 摘要指标
  - 故事引子
  - 章节卡
  - 相册
  - 完整故事
- `更多` 统一收纳：
  - 编辑事件
  - 管理照片
  - 更换封面
  - 恢复默认封面
  - 删除事件
  - 失败时重试生成
- 页面 15 必须作为可见二级流存在，不能只保留逻辑入口。

## 6. 非目标

- 不改播放器本体。
- 不重构故事生成和封面生成算法。
- 不处理照片查看器与相册选择器最终视觉，这部分归照片链路 PRD。

## 7. 任务清单

- [x] E1：详情 Hero 与主次动作按页面 04 重构
- [x] E2：自动更新状态条与摘要指标按页面 04 重构
- [x] E3：故事引子、章节卡、相册、完整故事顺序按页面 04 重构
- [x] E4：`刷新故事` 从主动作区降级，只在失败或异常路径中保留
- [x] E5：更多操作 Sheet 收口为统一入口
- [x] E6：移动目标选择按页面 15 实现
- [x] E7：封面选择与恢复默认按页面 15 实现

## 8. 验收标准

- 详情页第一眼像回忆册，而不是资料页。
- `播放回忆` 是明确主动作。
- 编辑、删事件、换封面、管理照片不再散落各处。
- 页面 15 的二级流是可见、可进入、可完成的流程，不是隐藏能力。

## 9. 验证方式

- `cd mobile && npm run lint`
- `cd mobile && npm run typecheck`
- 手动核对：
  - 正常详情页
  - 待更新状态
  - 失败状态
  - 更多操作 Sheet
  - 换封面流程
  - 移动目标选择流程

## 10. 完成规则

- 只有页面 04、15 全部对齐 HTML 且链路可走通后，才允许勾总 PRD 的 `B3-B4`。
