# 审计清单：移动端 UI 页面逐页对照

- 文档状态：Ready for Audit
- 对照基线：
  - [mobile-ui-wireframes.html](/Users/maoyuan/code/travel-video-llm/my-spec/docs/mobile-ui-revamp-prd/mobile-ui-wireframes.html)
  - [mobile-ui-revamp-prd.md](/Users/maoyuan/code/travel-video-llm/my-spec/docs/mobile-ui-revamp-prd/mobile-ui-revamp-prd.md)
  - [mobile-ui-realignment-prd.md](/Users/maoyuan/code/travel-video-llm/my-spec/docs/mobile-ui-revamp-prd/mobile-ui-realignment-prd.md)
- 审计原则：
  - 以 HTML 设计稿为最高视觉基线
  - 目标尽量做到 1:1 对齐，而不是“功能大致相同”
  - 先审计结构、主次关系、状态来源，再审计视觉细节
  - 页面只有在逐项对照通过后，才允许重新勾选完成状态

## 总体结论

- 当前实现不能视为与设计稿对齐。
- 最大问题不是单页缺功能，而是：
  - 页面结构仍然带着“当前代码实现心智”
  - 首页与地图存在假状态
  - 详情页首屏没有完成减法
  - 地图与回忆流的视觉重量仍高于设计稿
  - 文档完成状态曾被提前勾选

## 审计状态说明

- `未通过`：已确认和设计稿差距明显，必须返工
- `部分通过`：已有对应页面和流程，但结构或视觉仍未对齐
- `待专项审计`：功能存在，但还需要逐块细看
- `非本轮目标`：原总 PRD 明确非本轮实现目标

## 页面逐页清单

### 页面 01：冷启动欢迎态

- 设计稿位置：页面 01
- 当前对应：
  - [events.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/(tabs)/events.tsx)
- 当前状态：`部分通过`
- 设计稿关键点：
  - 完整欢迎态
  - 单一主 CTA `整理最近 200 张`
  - 次入口 `手动补导入`
  - 三条隐私/产品承诺短卡片
- 已确认偏差：
  - 欢迎态基本存在，但仍需继续压视觉气质和留白节奏
  - 当前实现更像“做过设计的空态”，还没完全达到设计稿的成熟度
- 返工重点：
  - 继续靠近页面 01 的欢迎 Hero 节奏
  - 强化主 CTA 的唯一性
  - 避免任何额外状态噪音进入欢迎态

### 页面 02：回忆首页

- 设计稿位置：页面 02
- 当前对应：
  - [events.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/(tabs)/events.tsx)
  - [TimelineEventCard.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/timeline/TimelineEventCard.tsx)
  - [MonthHeader.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/timeline/MonthHeader.tsx)
- 当前状态：`未通过`
- 设计稿关键点：
  - 顶部标题 `回忆`
  - 轻量状态胶囊
  - 最近回忆 Hero 卡
  - 整理状态中心卡
  - 筛选胶囊
  - 更轻、更媒体优先的回忆流
- 已确认偏差：
  - 首页顶部状态之前使用事件字段硬推导，存在假状态
  - 回忆流卡片仍偏重，信息密度和设计稿不一致
  - 首页整体仍偏“实现结构”，不是设计稿那种克制主入口
- 返工重点：
  - 顶栏状态和 Banner 统一读取真实任务状态
  - Hero、状态中心、筛选、回忆流继续按页面 02 收紧
  - 卡片继续做减法

### 页面 03：地图探索页

- 设计稿位置：页面 03
- 当前对应：
  - [map.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/(tabs)/map.tsx)
  - [MapViewContainer.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/map/MapViewContainer.tsx)
  - [ClusterMarker.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/map/ClusterMarker.tsx)
- 当前状态：`未通过`
- 设计稿关键点：
  - 顶部 floating pill
  - 必要工具按钮
  - 轻量筛选胶囊
  - 干净地图层
  - 单事件抽屉
- 已确认偏差：
  - 顶部仍不是设计稿那种单个 floating pill 结构
  - 地图抽屉与 marker 的状态语言还没有完全统一
  - 地图仍带着工具页气质，纯净度不够
- 返工重点：
  - 继续压缩顶部结构
  - 回退动作与抽屉态继续收口
  - marker / 抽屉 / 筛选统一视觉语言

### 页面 04：事件详情页

- 设计稿位置：页面 04
- 当前对应：
  - [[eventId].tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/events/[eventId].tsx)
  - [EventJourneyChapterCard.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/event/EventJourneyChapterCard.tsx)
- 当前状态：`未通过`
- 设计稿关键点：
  - Hero 只保留返回、更多、标题、地点、时间
  - 主动作固定为 `播放回忆 / 查看照片 / 更多`
  - 自动更新轻状态条
  - 故事引子
  - 章节卡
  - 相册
  - 完整故事
- 已确认偏差：
  - 之前首屏残留 `照片 / 章节 / 封面` 指标层
  - 首屏说明文案和状态文案偏多
  - 整体仍未完全达到“旅行记忆册”的减法效果
- 返工重点：
  - 首屏继续做减法
  - 章节与相册的视觉节奏继续向设计稿靠
  - 更多操作只做低频收口，不再干扰首屏

### 页面 05：我的 / 设备中心

- 设计稿位置：页面 05
- 当前对应：
  - [profile.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/(tabs)/profile.tsx)
- 当前状态：`待专项审计`
- 设计稿关键点：
  - 设备身份
  - 指标区
  - 三段分组
  - 隐私与数据管理清晰分层
- 已确认偏差：
  - 已有设备中心方向，但仍需严格对照页面 05 的视觉层级
  - 当前实现仍可能偏“实现列表”而不是设计稿里的信任中心
- 返工重点：
  - 对照页面 05 继续压层级和密度
  - 危险操作和普通入口彻底分层

### 页面 06：地图聚合点事件列表

- 设计稿位置：页面 06
- 当前对应：
  - [EventCardList.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/map/EventCardList.tsx)
  - [MapViewContainer.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/map/MapViewContainer.tsx)
- 当前状态：`未通过`
- 设计稿关键点：
  - 聚合点展开后直接进入 cluster sheet
  - 多事件列表连续浏览
  - 列表项统一状态语言
- 已确认偏差：
  - 当前更像“通用列表抽屉”，而不是页面 06 的专门 cluster sheet
  - 单事件态与聚合态区分不够强
- 返工重点：
  - 单事件抽屉和聚合列表抽屉分开设计
  - 列表项语义和标题结构更贴近页面 06

### 页面 07：照片查看器

- 设计稿位置：页面 07
- 当前对应：
  - [photo-viewer.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/photo-viewer.tsx)
  - [PhotoViewer.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/photo/PhotoViewer.tsx)
- 当前状态：`待专项审计`
- 设计稿关键点：
  - 返回胶囊
  - 页码胶囊
  - 沉浸式主图
  - 时间 / 地点 / caption 低噪音信息层
  - 胶片条
  - 失败兜底
- 已确认偏差：
  - 功能基本具备，但还需要核对布局比例、信息层密度、暗色面板气质
- 返工重点：
  - 严格对照页面 07 的信息层位置和视觉重量

### 页面 08：长按照片 / 管理照片

- 设计稿位置：页面 08
- 当前对应：
  - [EventPhotoManagerSheet.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/event/EventPhotoManagerSheet.tsx)
  - [SelectableMediaGrid.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/photo/SelectableMediaGrid.tsx)
- 当前状态：`待专项审计`
- 设计稿关键点：
  - 浏览态
  - 长按进入选择态
  - 批量移动 / 移出 / 删除
  - 底部操作 sheet
- 已确认偏差：
  - 功能链路存在，但还没完成页面 08 那种系统相册式节奏验收
- 返工重点：
  - 选择态 Banner、动作区和底部操作卡继续按页面 08 对齐

### 页面 09：手动补导入选择器

- 设计稿位置：页面 09
- 当前对应：
  - [PhotoLibraryPickerModal.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/photo/PhotoLibraryPickerModal.tsx)
  - [SelectableMediaGrid.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/photo/SelectableMediaGrid.tsx)
- 当前状态：`待专项审计`
- 设计稿关键点：
  - 浏览态
  - 长按进入选择态
  - 已选择 Banner
  - 全选已加载
  - 取消选择
  - 开始导入 / 取消
- 已确认偏差：
  - 核心流程已具备，但仍需严格按页面 09 校验视觉结构与选择体验
- 返工重点：
  - 工具条、选择 Banner、动作区继续向设计稿靠拢

### 页面 10：导入任务中心

- 设计稿位置：页面 10
- 当前对应：
  - [import-tasks.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/profile/import-tasks.tsx)
  - [ImportProgressModal.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/import/ImportProgressModal.tsx)
  - [UploadProgress.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/upload/UploadProgress.tsx)
- 当前状态：`待专项审计`
- 设计稿关键点：
  - 顶部说明
  - 系统状态 Banner
  - 指标区
  - 筛选胶囊
  - 阶段化任务卡
- 已确认偏差：
  - 功能和状态中心方向存在，但仍需核对信息密度与卡片表达是否过重
- 返工重点：
  - 任务卡继续贴近页面 10 的层次和轻重关系

### 页面 11：资料编辑 / 头像更新

- 设计稿位置：页面 11
- 当前对应：
  - [edit.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/profile/edit.tsx)
  - [avatar.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/profile/avatar.tsx)
- 当前状态：`待专项审计`
- 设计稿关键点：
  - 本机资料页保持和主页面一致的卡片体系
  - 头像来源说明明确
  - 轻量低频页面也保持统一设计语言
- 已确认偏差：
  - 当前实现方向对，但还需严格核对页面 11 的布局秩序和视觉重量
- 返工重点：
  - 资料概览卡、昵称编辑卡、头像来源说明卡继续按页面 11 对齐

### 页面 12：幻灯片播放器

- 设计稿位置：页面 12
- 当前对应：
  - [slideshow.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/slideshow.tsx)
  - [SlideshowPlayer.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/slideshow/SlideshowPlayer.tsx)
- 当前状态：`非本轮目标`
- 说明：
  - 原总 PRD 已明确播放器本体不在本轮 UI 重构范围内
  - 本页保留记录，但不纳入当前返工交付清单

### 页面 13：权限恢复与头像来源

- 设计稿位置：页面 13
- 当前对应：
  - [PermissionRecoveryCard.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/photo/PermissionRecoveryCard.tsx)
  - [PhotoLibraryPickerModal.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/photo/PhotoLibraryPickerModal.tsx)
  - [avatar.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/profile/avatar.tsx)
- 当前状态：`待专项审计`
- 设计稿关键点：
  - 一套统一权限恢复模板
  - 相册 / 相机 / 头像来源统一心智
- 已确认偏差：
  - 模板已新增，但还需核对是否所有入口都真正统一
- 返工重点：
  - 核对相册拒绝、相机拒绝、头像来源、事件加图四类入口

### 页面 14：事件卡长按快捷操作

- 设计稿位置：页面 14
- 当前对应：
  - [events.tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/(tabs)/events.tsx)
- 当前状态：`部分通过`
- 设计稿关键点：
  - 长按后有明确快捷操作 sheet
  - 编辑 / 管理照片 / 删除等高频动作可见
- 已确认偏差：
  - 链路已存在，但仍需继续核对文案、按钮顺序和视觉重量
- 返工重点：
  - 继续贴近页面 14 的快捷操作表达

### 页面 15：封面选择 / 移动目标选择

- 设计稿位置：页面 15
- 当前对应：
  - [[eventId].tsx](/Users/maoyuan/code/travel-video-llm/mobile/app/events/[eventId].tsx)
  - [EventPhotoManagerSheet.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/event/EventPhotoManagerSheet.tsx)
- 当前状态：`部分通过`
- 设计稿关键点：
  - 更多操作中有明确可见入口
  - 封面选择是一个真实二级流
  - 移动目标选择是一个真实二级流
- 已确认偏差：
  - 流程存在，但还需要核对“可见性”和“像页面而不是逻辑弹窗”
- 返工重点：
  - 继续把二级流做得更接近页面 15，而不是技术弹窗

## 优先级建议

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

## 使用方式

- 每次返工前，先从本清单选一页或一组紧邻页面
- 返工时必须同步更新：
  - 当前状态
  - 已确认偏差
  - 返工重点
- 页面通过 HTML 对照后，才能回填原 execution PRD 和总 PRD 的完成状态
