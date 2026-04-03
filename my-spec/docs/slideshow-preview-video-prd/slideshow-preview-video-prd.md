# 需求文档：Slideshow Preview Video 实验方案

- 文档状态：Confirmed
- 优先级：P0
- 负责人：
- 创建时间：2026-04-03
- 最后更新：2026-04-03

## 1. 背景

- 当前现状：
  - 当前 App 内播放主要依赖 `SlideshowPlayer` 运行时渲染 scene，实时拼装照片、章节卡、拼图和字幕。
  - 当前正式导出已经比 App 内预览更接近目标成片效果，但两者仍然存在明显差异，尤其体现在：
    - 横屏预览与导出不一致
    - 字幕大小与位置不一致
    - 章节卡 / 拼图 / 照片的版式在 App 内更容易被控制区挤压
  - 当前正式导出链路对 2 分钟左右的视频，用户体感耗时偏长，文件体积也偏大。
  - 当前导出内容本质上是“静态图时间轴 + 少量章节卡 + 配乐 + 字幕”，不是高运动视频内容。
- 为什么要改：
  - 当前继续把 App 内预览做成“实时渲染播放器”，很难长期保证和导出 100% 一致。
  - 对用户来说，真正重要的是“App 内看到的就是最终成片的样子”，而不是“App 内有一套近似预览器”。
  - 如果可以在端侧快速生成一个低规格 preview video，App 内直接播放视频，就可以显著提升所见即所得一致性。
- 触发这次变更的原因：
  - 用户明确提出：
    - 当前导出 2 分钟视频体积偏大、耗时接近分钟级，体验偏重。
    - 当前内容本质上接近幻灯片，很多连续帧画面相同，不应继续按高帧率和重规格处理。
    - 可以接受先保留当前 App 内实时预览链路代码，但用户侧主路径直接切到 Preview Video 预生成链路。
    - 当前实时预览链路只保留为代码级 fallback / 兜底，不再作为用户可见的双入口。
    - 当前事件的前置条件准备完成后，应自动开始生成 preview video，而不是等待用户手动点击触发。

## 2. 目标

- 本次要解决什么问题：
  - 为 App 内新增一条“预生成 preview video 并直接播放”的实验链路。
  - 验证在较低规格下，是否可以把预览视频生成时间压缩到用户可接受范围。
  - 验证低规格 preview video 是否足以在 App 内提供比实时渲染更稳定、更接近导出的观感。
- 预期结果是什么：
  - 故事 / chapter / slideshow 数据稳定后，系统自动在端侧生成一份低规格 preview video 并缓存。
  - App 内播放默认直接使用 preview video，不再把实时渲染播放器作为主入口暴露给用户。
  - preview video 在画面、字幕、章节卡、拼图、黑色留白策略上与正式导出尽量一致。
  - 当前正式导出链路保持不变，不因 preview 实验而降低正式成片质量。
- 成功标准是什么：
  - 预览视频链路可稳定产出缓存 mp4。
  - preview video 的生成耗时明显低于正式导出，目标进入“十几秒到几十秒”区间，而不是分钟级。
  - preview video 文件体积显著低于正式导出，2 分钟视频目标压缩到十几 MB 到几十 MB 量级。
  - App 内主播放路径默认命中 preview video；只有 preview 不可用时才回退到当前实时预览代码路径。
  - 当前实时预览链路和正式导出链路代码都不被删除。

## 3. 非目标

- 这次明确不做什么：
  - 不删除当前 `SlideshowPlayer` 实时预览链路。
  - 不降低正式导出视频的默认规格。
  - 不在本次引入服务端视频合成。
  - 不在本次重做 story / chapter 生成逻辑。
- 哪些相关问题先不处理：
  - 不在本次直接承诺所有机型都能在固定 10 秒内完成 preview 生成。
  - 不在本次引入高级视频编码格式实验，如 HEVC、AV1。
  - 不在本次把 preview video 自动保存到系统相册。
  - 不在本次移除或替换现有实时预览 UI 的所有问题点。

## 4. 用户场景

- 用户是谁：
  - 已生成故事和章节，希望快速查看最终成片效果的普通用户。
  - 对成片一致性敏感，希望 App 内看到的画面尽量等于最终导出结果的用户。
- 典型使用场景：
  - 用户完成照片导入、故事生成、章节生成后，系统自动开始生成 preview video。
  - 用户进入事件播放页时，若当前版本 preview video 已准备好，则直接播放缓存视频/r。
  - 若当前版本 preview video 尚未准备好，则显示生成中状态；必要时可临时回退到当前实时预览链路。
- 关键操作路径：
  - 事件完成结构化 -> 故事与章节生成完成 -> 自动触发 preview video 生成 -> 用户进入播放页 -> 优先播放缓存视频 -> 用户决定是否继续正式导出。

## 5. 需求拆解

### 5.1 功能需求

- 需求 1：新增 Preview Video 实验链路
  - 新增“低规格 preview video 生成 + 缓存 + 播放”能力。
  - preview video 与正式导出共用 scene、字幕、图片适配和黑色留白规则，尽量保证观感一致。
  - preview video 的目标是“所见即所得预览”，不是最终交付视频。

- 需求 2：保留当前实时预览链路
  - 当前 `SlideshowPlayer` 实时预览入口必须保留。
  - 当前实时预览链路不允许因 preview 实验被删除。
  - 当前实时预览链路只作为 fallback / 调试 / 回退方案保留，不再作为用户可见双入口。

- 需求 3：正式导出规格暂不变更
  - 当前正式导出仍使用原有高规格策略。
  - preview video 的规格和导出路径必须独立，不允许直接影响正式导出质量。

- 需求 4：引入 preview video 缓存
  - preview video 只缓存到 App 本地缓存目录，不默认保存到系统相册。
  - 需要为 preview video 建立有效的缓存命中与失效规则。
  - 若事件输入版本未变化，应优先复用缓存，避免重复生成。

- 需求 5：定义 preview video 的建议规格
  - 第一阶段目标规格建议：
    - 分辨率：`1280x720`
    - 帧率：`12fps`
    - 视频码率：`1.5 ~ 2.5 Mbps`
    - 音频：保留 AAC，但低于正式导出规格
  - 第一阶段不直接压到 `6fps`，避免切场和字幕显隐过于生硬。
  - 后续可基于实验结果继续下探 `10fps / 8fps / 6fps`。

- 需求 6：定义 preview video 的触发策略
  - 首版默认自动触发生成。
  - 自动触发前置条件至少包括：
    - 照片导入完成
    - 事件结构稳定
    - story 生成完成
    - chapters / slideshow 输入准备完成
  - 自动生成不应阻塞用户当前浏览主路径。
  - 若当前版本 preview video 不存在，则进入播放页时继续生成或补生成。

### 5.2 交互 / 界面要求

- 页面或入口：
  - 现有播放页默认直接承载 preview video 播放结果。
  - 当前实时预览入口不作为用户显式入口暴露。
- 用户操作：
  - 用户进入播放页：
    - 若缓存存在且未过期，直接播放
    - 若缓存不存在或过期，显示生成中状态
    - 若生成失败，可回退到当前实时预览链路
- 状态反馈：
  - 生成中：显示清晰的进度或阶段提示
  - 命中缓存：应快速进入播放
  - 生成失败：应允许重试，并回退到实时预览
- 异常提示：
  - 生成失败时必须明确提示，不得让用户停留在空白播放器
  - 需要区分：
    - 素材准备失败
    - 音频缓存失败
    - 视频生成失败

### 5.3 数据 / 状态要求

- 需要新增或调整的数据：
  - `preview_video_uri`
  - `preview_video_generated_from_version`
  - `preview_video_status`
  - `preview_video_generated_at`
  - 可选：`preview_video_profile`，用于区分分辨率 / fps / bitrate 档位
- 状态流转：
  - `idle`
  - `generating`
  - `ready`
  - `failed`
  - 当事件输入版本变化后，旧 preview video 自动进入 `stale`
  - 当满足自动触发前置条件时，从 `idle/stale` 自动进入 `generating`
- 持久化要求：
  - preview video 缓存仅需保存在本地缓存目录
  - 不要求默认长期持久化到相册
  - 若缓存目录被系统清理，允许按需重新生成

## 6. 技术参考

- 相关代码：
  - [mobile/src/components/slideshow/SlideshowPlayer.tsx](/Users/maoyuan/code/travel-video-llm/mobile/src/components/slideshow/SlideshowPlayer.tsx)
  - [mobile/src/services/slideshow/slideshowExportService.ts](/Users/maoyuan/code/travel-video-llm/mobile/src/services/slideshow/slideshowExportService.ts)
  - [mobile/modules/travel-slideshow-export/android/src/main/java/expo/modules/travelslideshowexport/TravelSlideshowExportModule.kt](/Users/maoyuan/code/travel-video-llm/mobile/modules/travel-slideshow-export/android/src/main/java/expo/modules/travelslideshowexport/TravelSlideshowExportModule.kt)
  - [mobile/src/services/slideshow/slideshowSceneBuilder.ts](/Users/maoyuan/code/travel-video-llm/mobile/src/services/slideshow/slideshowSceneBuilder.ts)
  - [mobile/src/services/slideshow/slideshowVideoContract.ts](/Users/maoyuan/code/travel-video-llm/mobile/src/services/slideshow/slideshowVideoContract.ts)
- 相关接口：
  - 当前主要为端侧导出模块 `TravelSlideshowExport.exportAsync`
- 相关表结构：
  - 当前若无正式表结构承载 preview 状态，可先在端侧状态层落地
- 相关历史文档：
  - [slideshow-export-phase1.md](/Users/maoyuan/code/travel-video-llm/my-spec/docs/slideshow-export-phase1/slideshow-export-phase1.md)
  - [journey-event-slideshow-coherence-prd.md](/Users/maoyuan/code/travel-video-llm/my-spec/docs/journey-event-slideshow-coherence-prd/journey-event-slideshow-coherence-prd.md)
- 外部依赖或平台限制：
  - 当前 Android 原生导出模块基于 Media3 Transformer
  - 当前导出帧率固定为 `30fps`
  - 当前正式导出默认 `1080p`

## 7. 方案约束

- 必须遵守的业务约束：
  - 继续坚持端侧生成，不上传原图到服务端合成。
  - preview video 必须与正式导出共享同一套 scene 与布局契约，不能出现另一套独立模板。
  - 当前实时预览链路必须保留，但默认不对用户暴露为主入口。
- 性能约束：
  - preview video 的生成速度必须明显快于正式导出。
  - preview video 的体积必须明显小于正式导出。
  - 不允许为了 preview 实验让现有正式导出变慢。
- 安全 / 隐私约束：
  - preview video 默认只落本地缓存，不默认落系统相册。
  - 不新增云端上传原图能力。
- 兼容性约束：
  - 首版优先 Android 端验证。
  - 若 iOS 端当前无相同原生导出能力，不要求本次同时打齐。

## 8. 风险与待确认

- 风险 1：
  - 即使降低规格，部分中低端机的 preview video 生成速度仍可能无法稳定进入十几秒区间。
- 风险 2：
  - 过低 fps 可能导致章节切换、字幕显隐和 seek 观感变差。
- 风险 3：
  - 若 preview video 的缓存失效策略设计不严谨，可能播放旧版本视频。
- 风险 4：
  - 若 preview video 自动生成时机过早，可能在 story / chapter 仍不稳定时反复重生成。
- 还需要确认的问题：
  - Preview Video 首版是否默认带音频
  - 自动触发的最准入时机以哪个版本信号为准

## 9. Task 列表

- [ ] Task 1：补充 Preview Video 技术方案，明确参数、缓存键和状态机
- [ ] Task 2：抽离正式导出与 preview video 的共享场景 / 布局 / 字幕配置
- [ ] Task 3：扩展原生导出模块，支持 preview 档参数
- [ ] Task 4：新增 preview video 缓存目录与状态管理
- [ ] Task 5：在播放页接入 preview video 作为默认主播放路径
- [ ] Task 6：实现 preview video 自动生成、命中缓存与失败回退
- [ ] Task 7：验证 `720p / 12fps` 预览版耗时、体积和观感
- [ ] Task 8：保留并验证实时预览 fallback 链路

## 10. 验收标准

- [ ] 当前实时预览入口仍然存在且可用
- [ ] 当前正式导出能力仍然存在且规格不降低
- [ ] 播放页默认优先播放 Preview Video 缓存视频
- [ ] Preview Video 的画面、字幕、章节卡、拼图与正式导出观感基本一致
- [ ] Preview Video 的生成时间明显低于正式导出
- [ ] Preview Video 的文件体积明显低于正式导出
- [ ] Preview Video 失败时，可明确回退到当前实时预览

## 11. 发布影响

- 是否需要迁移数据：
  - 暂不需要数据库迁移，可先从端侧缓存与状态层做起
- 是否影响现有用户：
  - 会改变播放页默认主路径，但保留当前实时预览作为兜底
- 是否需要重新 build / 安装：
  - 需要，涉及移动端代码和原生导出参数扩展
- 回滚方式：
  - 隐藏 Preview Video 实验入口
  - 保留当前实时预览和正式导出链路继续工作
