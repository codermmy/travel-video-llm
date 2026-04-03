# 审计文档：移动端 UI 逐页对照报告

- 文档状态：Ready for Implementation
- 创建时间：2026-04-03
- 最后更新：2026-04-03
- 对照基线：
  - [mobile-ui-wireframes.html](/Users/maoyuan/code/travel-video-llm/my-spec/docs/mobile-ui-revamp-prd/mobile-ui-wireframes.html)
  - [mobile-ui-revamp-prd.md](/Users/maoyuan/code/travel-video-llm/my-spec/docs/mobile-ui-revamp-prd/mobile-ui-revamp-prd.md)
  - [mobile-ui-realignment-prd.md](/Users/maoyuan/code/travel-video-llm/my-spec/docs/mobile-ui-revamp-prd/mobile-ui-realignment-prd.md)

## 1. 审计结论

- 当前 UI 实现不能视为已和 HTML 设计稿对齐。
- 偏差不是零散细节，而是整套页面在以下方面不够严格：
  - 页面结构仍偏“现有实现心智”，不是“设计稿心智”
  - 首页、地图等页面的状态来源不真实
  - 详情页、地图页、回忆流仍然信息过重
  - 多个页面虽有真实功能，但视觉层级和模块顺序仍未对齐
- 因此后续返工必须以“逐页对照 + 接近 1:1 落地”为目标，而不是继续做大致风格修补。

## 2. 审计规则

- `未通过`
  - 已确认和设计稿/PRD 存在明显结构或状态偏差，必须返工
- `返工中`
  - 已进入重做阶段，但还未达到重新验收通过的标准
- `部分通过`
  - 已有对应页面和能力，但模块顺序、视觉节奏或状态呈现仍不达标
- `待专项审计`
  - 功能存在，但需要更细的逐项对照后才能判断是否通过
- `非本轮目标`
  - 原始 PRD 明确不在本轮范围

## 3. 页面逐页审计

### 页面 01：冷启动欢迎态

- 当前对应：
  - [memories-screen.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/screens/memories-screen.tsx)
- 当前状态：`部分通过`
- 设计稿要求：
  - 完整欢迎页
  - 唯一主 CTA `整理最近 200 张`
  - 次入口 `手动补导入`
  - 三条简短承诺卡片
- 已确认偏差：
  - 基本结构已具备，但页面气质和留白仍未达到设计稿那种成熟感
  - 当前更像“空态页”，还不够像产品主启动页
- 返工要求：
  - 继续按页面 01 的 Hero 节奏、按钮权重和文案密度收紧

### 页面 02：回忆首页

- 当前对应：
  - [memories-screen.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/screens/memories-screen.tsx)
  - [TimelineEventCard.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/timeline/TimelineEventCard.tsx)
  - [MonthHeader.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/timeline/MonthHeader.tsx)
- 当前状态：`返工中`
- 设计稿要求：
  - 顶部标题 `回忆`
  - 轻量状态胶囊
  - 系统 Banner
  - 最近回忆 Hero 卡
  - 整理状态中心卡
  - 筛选胶囊
  - 轻量回忆流
- 已确认偏差：
  - 顶部“整理中 / 分析中”之前用事件字段硬算，状态不真实
  - Hero 卡、状态中心、筛选与回忆流的组合仍偏实现化
  - 回忆流卡片仍偏重，和设计稿的扁平、轻媒体风格不一致
- 本轮已处理：
  - 首页状态已经改为读取真实任务态
  - 页面分段标签已补回
  - 回忆流卡片已继续做减法
- 返工要求：
  - 状态统一读任务中心真实运行态
  - 回忆流卡片继续减法
  - 页面 02 作为主入口重新收紧视觉节奏

### 页面 03：地图探索页

- 当前对应：
  - [map.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/(tabs)/map.tsx)
  - [MapViewContainer.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/map/MapViewContainer.tsx)
  - [ClusterMarker.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/map/ClusterMarker.tsx)
- 当前状态：`返工中`
- 设计稿要求：
  - 单个 floating pill 作为顶部主结构
  - 必要工具按钮
  - 轻量筛选
  - 干净地图层
  - 单事件抽屉
- 已确认偏差：
  - 顶部仍不像设计稿的纯 floating pill 结构
  - marker、筛选、抽屉的统一状态语言还没完成
  - 地图层仍有实现化痕迹，不够纯净
- 本轮已处理：
  - 顶部标题卡已压成更轻的 floating pill 结构
  - 地图层额外状态总结层已移除
  - marker 已开始区分状态描边
- 返工要求：
  - 继续按页面 03 做结构减法
  - 回退和抽屉层级继续收口

### 页面 04：事件详情页

- 当前对应：
  - [[eventId].tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/events/[eventId].tsx)
  - [EventJourneyChapterCard.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/event/EventJourneyChapterCard.tsx)
- 当前状态：`返工中`
- 设计稿要求：
  - Hero 只保留返回、更多、标题、地点、时间
  - 三个主次动作 `播放回忆 / 查看照片 / 更多`
  - 轻状态条
  - 摘要区
  - 故事引子
  - 章节
  - 相册
  - 完整故事
- 已确认偏差：
  - 首屏曾残留 `照片 / 章节 / 封面` 这类指标层
  - 状态提示和解释性文案仍偏多
  - 详情页整体还没完全达到“旅行记忆册”的减法
- 本轮已处理：
  - 首屏 `照片 / 章节 / 封面` 指标层已删除
  - Hero 已压成更接近设计稿的单行元信息
  - 状态提示文案已开始压缩
- 返工要求：
  - 首屏继续减法
  - 章节和相册区继续按设计稿重排和压缩

### 页面 05：我的 / 设备中心

- 当前对应：
  - [profile.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/(tabs)/profile.tsx)
- 当前状态：`返工中`
- 设计稿要求：
  - 设备身份卡
  - 指标区
  - 三段分组
  - 风险操作单独分层
- 已确认偏差：
  - 已有设备中心方向，但还没完成对页面 05 的严格视觉验收
- 本轮已处理：
  - 去掉不属于设计稿的状态 Banner
  - 首屏设备卡文案继续向页面 05 收口
  - 去掉设计稿里没有的本机标识 / 注册时间顶层展示
- 返工要求：
  - 继续压层级与信息密度

### 页面 06：地图聚合点事件列表

- 当前对应：
  - [EventCardList.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/map/EventCardList.tsx)
  - [MapViewContainer.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/map/MapViewContainer.tsx)
- 当前状态：`未通过`
- 设计稿要求：
  - 聚合点展开进入 cluster sheet
  - 列表项具备缩略图、标题、照片数、状态、进入动作
- 已确认偏差：
  - 当前更像通用抽屉，不是页面 06 的明确聚合列表态
- 返工要求：
  - 单事件态与聚合列表态彻底分开

### 页面 07：照片查看器

- 当前对应：
  - [photo-viewer.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/photo-viewer.tsx)
  - [PhotoViewer.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/photo/PhotoViewer.tsx)
- 当前状态：`返工中`
- 设计稿要求：
  - 返回胶囊
  - 页码胶囊
  - 沉浸主图
  - 时间 / 地点 / caption 信息层
  - 胶片条
  - 失败占位
- 已确认偏差：
  - 真实能力基本具备，但还没对照页面 07 做严格视觉验收
- 本轮已处理：
  - 失败兜底 banner 已加入页面化表达
  - 信息层文案已继续贴近设计稿
- 返工要求：
  - 继续校正信息层位置和暗色视觉节奏

### 页面 08：长按照片 / 管理照片

- 当前对应：
  - [EventPhotoManagerSheet.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/event/EventPhotoManagerSheet.tsx)
  - [SelectableMediaGrid.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/photo/SelectableMediaGrid.tsx)
- 当前状态：`返工中`
- 设计稿要求：
  - 浏览态
  - 长按选择态
  - 批量移动 / 移出 / 删除
  - 底部操作卡
- 已确认偏差：
  - 功能链路存在，但视觉仍需按页面 08 重新校准
- 本轮已处理：
  - 选择态 Banner 已加强
  - 管理照片页继续向页面 08 的选择流程靠拢
- 返工要求：
  - 继续贴近系统相册式的选择体验

### 页面 09：手动补导入选择器

- 当前对应：
  - [PhotoLibraryPickerModal.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/photo/PhotoLibraryPickerModal.tsx)
  - [SelectableMediaGrid.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/photo/SelectableMediaGrid.tsx)
- 当前状态：`返工中`
- 设计稿要求：
  - 浏览态
  - 长按进入选择态
  - 选择 Banner
  - 全选已加载
  - 开始导入 / 取消
- 已确认偏差：
  - 功能已具备，但还没完成页面 09 的视觉和交互校验
- 本轮已处理：
  - 选择 banner 已强化
  - 动作区已改成更接近设计稿的主次按钮堆叠
- 返工要求：
  - 工具条、Banner、动作区继续贴近设计稿

### 页面 10：导入任务中心

- 当前对应：
  - [import-tasks.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/profile/import-tasks.tsx)
  - [ImportProgressModal.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/import/ImportProgressModal.tsx)
  - [UploadProgress.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/upload/UploadProgress.tsx)
- 当前状态：`返工中`
- 设计稿要求：
  - 顶部说明
  - 系统 Banner
  - 指标区
  - 筛选胶囊
  - 任务卡
- 已确认偏差：
  - 功能方向正确，但仍需对照页面 10 压缩信息噪音
- 本轮已处理：
  - 任务卡已开始从数字块改成摘要 + micro chips 的表达
  - 任务卡信息层继续往页面 10 的阶段卡表达靠拢
- 返工要求：
  - 任务卡和 Banner 继续按设计稿重排

### 页面 11：资料编辑 / 头像更新

- 当前对应：
  - [edit.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/profile/edit.tsx)
  - [avatar.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/profile/avatar.tsx)
- 当前状态：`返工中`
- 设计稿要求：
  - 本机资料页也保持同一套卡片和动作系统
  - 头像来源说明清晰
- 已确认偏差：
  - 页面方向正确，但还没完成页面 11 的严格对照
- 本轮已处理：
  - 本机资料页与头像来源入口继续统一到主视觉体系
  - 头像来源区块已改成更接近设计稿的说明卡
  - 上传头像入口改成更明确的确认动作
- 返工要求：
  - 继续统一低频页的气质

### 页面 12：幻灯片播放器

- 当前对应：
  - [slideshow.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/slideshow.tsx)
  - [SlideshowPlayer.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/slideshow/SlideshowPlayer.tsx)
- 当前状态：`非本轮目标`
- 说明：
  - 原总 PRD 已明确播放器本体不在本轮 UI 重构范围内

### 页面 13：权限恢复与头像来源

- 当前对应：
  - [PermissionRecoveryCard.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/photo/PermissionRecoveryCard.tsx)
  - [PhotoLibraryPickerModal.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/photo/PhotoLibraryPickerModal.tsx)
  - [avatar.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/profile/avatar.tsx)
- 当前状态：`返工中`
- 设计稿要求：
  - 一套统一权限恢复模板
  - 相册、相机、头像来源统一心智
- 已确认偏差：
  - 模板已新增，但还需要核对所有入口是否真正统一
- 本轮已处理：
  - 头像页上传确认按钮已改成更明确的主动作表达
  - 权限恢复模板已继续并入头像与相册流程
  - 头像来源页已补充来源说明卡

### 页面 14：事件卡长按快捷操作

- 当前对应：
  - [memories-screen.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/screens/memories-screen.tsx)
- 当前状态：`部分通过`
- 设计稿要求：
  - 长按事件卡后有明确快捷操作 Sheet
  - 高操作频动作收口清晰
- 已确认偏差：
  - 链路存在，但仍需核对动作顺序、文案和视觉重量

### 页面 15：封面选择 / 移动目标选择

- 当前对应：
  - [[eventId].tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/events/[eventId].tsx)
  - [EventPhotoManagerSheet.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/event/EventPhotoManagerSheet.tsx)
- 当前状态：`部分通过`
- 设计稿要求：
  - 更多操作中有明确二级流入口
  - 封面选择和移动目标选择都是可见流程
- 已确认偏差：
  - 流程已存在，但仍需继续校验“像页面而不是实现弹窗”

## 4. 返工优先级

- `P0`
  - 页面 02
  - 页面 03
  - 页面 04
  - 页面 06
- `P1`
  - 页面 01
  - 页面 05
  - 页面 10
  - 页面 14
  - 页面 15
- `P2`
  - 页面 07
  - 页面 08
  - 页面 09
  - 页面 11
  - 页面 13
- `记录但不纳入本轮`
  - 页面 12

## 5. 使用方式

- 每次返工前，先从本报告选一页或一组紧邻页面
- 返工后更新：
  - 当前状态
  - 已确认偏差
  - 返工重点
- 页面只有在与 HTML 对照通过后，才允许回填原 execution PRD 与总 PRD 的完成状态
