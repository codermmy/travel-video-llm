# Audio System Phase 1

## 目标

本阶段的主目标不是一次性做完“音乐 + 导出 + 完整视频生产”，而是先把幻灯片的音频闭环补齐：

1. 建立可用的音乐素材库
2. 为音乐打标签并形成 manifest
3. 根据事件/故事情绪自动选曲
4. 解决不同视频时长和音乐时长不匹配的问题
5. 让播放器真正把音乐放对、播对、切对

## 本阶段做什么

### 1. 音乐素材库

- 已使用 Pixabay 下载旅行向纯音乐
- 当前已落地到 `backend/uploads/music/pixabay/tracks/`
- 已生成基础 manifest：
  - `backend/uploads/music/pixabay/manifests/pixabay_music_manifest.csv`
  - `backend/uploads/music/pixabay/manifests/pixabay_music_manifest.json`

### 2. 音乐标签体系

首版标签不追求复杂推荐系统，先做足够支撑自动选曲的字段。

建议保留：

- `provider`
- `selection_bucket`
- `title`
- `artist_slug`
- `source_track_id`
- `source_url`
- `relative_url`
- `mood_tags`
- `energy`
- `scene_fit`
- `recommended_start_sec`
- `recommended_end_sec`
- `fade_in_ms`
- `fade_out_ms`
- `status`

后续增强字段：

- `day_night`
- `city_nature`
- `intro_fit`
- `ending_fit`
- `loopable`
- `instrumentation`

### 3. 自动选曲

首版自动选曲规则：

- 不做只看单一维度的选曲
- 使用“整体情绪 + 场景倾向”的联合判断
- 推荐权重：
  - 整体情绪：`55%`
  - 视觉场景：`45%`
- 主要输入：
  - `event.emotionTag`
  - chapter 文案关键词
  - scene 总时长
  - 视觉场景倾向：
    - `city`
    - `nature`
    - `cafe`
    - `sunset`
    - `night`

首版自动选曲策略：

- 短视频优先选择一首主曲
- 长视频允许选择第二首、第三首
- 但后续曲目必须和主曲风格接近
- 不允许从平静治愈突然切到强烈激昂
- 多首衔接时，必须在同一风格桶或相邻风格桶中选择

素材库约束：

- 如果某个风格桶只有 `1-2` 首可用曲目
- 系统要能识别“无法安全换歌”
- 此时退回：
  - 单曲循环
  - 或优先选择更长曲目
- 后续要把“风格桶素材不足”作为运营补库信号

首版不做：

- 一章一首歌
- 智能混音
- 节拍卡点

### 4. 音乐与视频时长适配

这是本阶段必须解决的问题。

短视频场景：

- 如果幻灯片只有 20-40 秒，而音乐有 2 分钟
- 不裁原文件
- 使用 `recommended_start_sec`
- 播放时从推荐段落切入
- 结尾加淡出

长视频场景：

- 如果幻灯片很长，超过单首音乐长度
- Phase 1 默认策略不是只循环一首
- 优先策略：
  - 策略 A：选择第二首、第三首风格接近的音乐接续
  - 策略 B：如果没有足够相近曲目，再退回单曲循环
- 切歌要求：
  - 上一首末尾淡出
  - 下一首从推荐段落切入并淡入
  - 不做复杂 beat-match
  - 不做精细节拍卡点混音

默认策略：

- 短视频：截取主段
- 长视频：优先多首接续，素材不足时才循环主曲

### 5. 播放器改造

当前播放器已有 `musicUrl` 播放入口，但还只是“有链接就播”，没有完整音频策略。

本阶段需要补：

- 读取音乐 manifest
- 根据 event 自动分配 `musicUrl`
- 增加 `musicStartSec`
- 增加 `musicEndSec`
- 增加淡入淡出控制
- 进度条可拖动
- 拖动时先预览
- 松手后 scene 和音乐再真正跳转

进度条交互要求：

- 用户拖动时不立刻改变正式播放位置
- 拖动过程中显示预览位置
- 松手时统一执行 seek
- seek 后：
  - scene 跳到对应位置
  - 字幕重算当前展示
  - 音乐同步跳到对应时间
  - 如果当前是多首拼接，要正确换算到对应曲目片段

## 本阶段不做什么

这些不是不做，而是不放进当前主目标。

### 1. AI 旁白

- 先不做
- 等音乐闭环稳定后再评估

### 2. AI 旁白后的复杂音频层

- 先不做
- 当前只做纯音乐
- 不在本阶段引入旁白压混

## 优先级排序

### P0

- 音乐 manifest 可用
- 自动选曲
- 音乐时长适配
- 播放器接入实际音乐策略

### P1

- 播放器进度条可拖动
- 拖动时 scene 和音乐同步

## 当前结论

接下来主线只做：

1. 完善音乐 metadata
2. 自动选曲
3. 音乐播放策略
4. 进度条拖动
