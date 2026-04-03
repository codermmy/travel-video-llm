# 执行 PRD：移动端 UI 重构基础契约

- 文档状态：Ready for Implementation
- 执行顺序：0
- 对应总 PRD：
  - [mobile-ui-revamp-prd.md](/Users/maoyuan/code/travel-video-llm/my-spec/docs/mobile-ui-revamp-prd/mobile-ui-revamp-prd.md)
- 对应设计基线：
  - [mobile-ui-wireframes.html](/Users/maoyuan/code/travel-video-llm/my-spec/docs/mobile-ui-revamp-prd/mobile-ui-wireframes.html)

## 1. 目标

- 在正式改页面前，先冻结共享视觉 contract，避免后续首页、地图、详情、我的页各写一套组件。
- 把共享色板、卡片、按钮、顶部标题、底部 Sheet、Tab 壳层、状态语言统一下来。
- 给后续 5 份页面执行 PRD 提供稳定基础，减少“做完一页又被下一页推翻”的返工。

## 2. 关联总任务

- 对应总任务：
  - `A1` Tab 导航与壳层整体视觉对齐
  - `D4` 任务中心、顶部状态条、即时进度反馈统一状态语言
- 本文档本身不是最终页面交付，不单独勾选页面完成，只负责打基础。

## 3. 范围

- 共享设计 token：
  - 颜色、描边、阴影、圆角、间距、状态色、Tab 选中态
- 共享基础组件：
  - 页面容器
  - 页面标题
  - 卡片容器
  - Banner
  - 主次按钮
  - 底部 Sheet Scaffold
  - 空态卡
  - 指标胶囊
- 共享状态语言：
  - importing
  - analyzing
  - stale
  - failed
  - ready
- Tab 壳层：
  - `回忆 / 地图 / 我的`
  - 统一底栏高度、背景、选中态、图标语义

## 4. 非目标

- 不单独完成首页、地图、详情、照片页、我的页的最终视觉交付。
- 不在本轮改播放器本体。
- 不新增后端接口，不重构任务数据结构。

## 5. 主要文件边界

- 允许修改：
  - `mobile/app/(tabs)/_layout.tsx`
  - `mobile/src/components/ui/revamp.tsx`
  - `mobile/src/styles/colors.ts`
  - `mobile/src/styles/theme.ts`
  - `mobile/src/components/import/ImportProgressModal.tsx`
  - `mobile/src/components/upload/UploadProgress.tsx`
- 原则上不应修改：
  - 具体页面业务逻辑文件
  - 地图原生模块
  - 播放器逻辑和导出逻辑

## 6. 执行要求

- 所有后续页面必须优先复用这里定义的基础组件，不允许再就地发明一套新样式。
- 状态表达要先统一词汇和样式，再分发到页面。
- 若页面需要特殊样式，优先通过扩展共享组件实现，而不是复制粘贴。

## 7. 任务清单

- [x] F1：冻结色板、状态色、描边、圆角、阴影与留白规则
- [x] F2：冻结主次按钮、Banner、卡片、页面标题、空态卡、指标胶囊样式
- [x] F3：冻结底部 Sheet Scaffold 和常用列表单元样式
- [x] F4：冻结 Tab 壳层的底栏风格和选中态
- [x] F5：统一导入中、分析中、失败、待更新的状态语言与视觉映射
- [x] F6：在总 PRD 中记录哪些共享组件是后续页面必须复用的

## 8. 验收标准

- 后续页面不需要再重复定义主按钮、次按钮、Banner、卡片的视觉规则。
- 同一状态在首页、任务中心、详情页、导入流程中颜色和命名一致。
- Tab 壳层不再是旧风格残留。
- 共享组件命名和扩展方式清晰，不会把页面特殊样式硬编码进基础组件。

## 9. 验证方式

- `cd mobile && npm run lint`
- `cd mobile && npm run typecheck`
- 目测核对共享组件预期使用场景：
  - 首页
  - 任务中心
  - 资料编辑
  - 头像来源

## 10. 完成规则

- 只有共享视觉 contract 稳定，且后续页面无需推翻重做时，才算完成。
- 完成后不直接勾总 PRD 页面任务，只标记本执行 PRD 完成，并作为后续页面前置依赖。
