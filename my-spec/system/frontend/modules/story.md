# 前端模块：故事与播放（Story & Slideshow）

> **文档目的**：详细说明前端故事与播放模块的事件详情展示、幻灯片播放、章节结构和音乐控制，帮助开发者快速理解和修改故事相关功能。

---

## 1. 模块概述

### 1.1 职责范围

- 展示事件详情、章节、微故事
- 控制幻灯片播放与音乐状态
- 支持故事刷新与重生成入口
- 管理播放进度和速度控制
- 处理章节引言和总结展示

### 1.2 代码入口

| 类型 | 文件路径 |
|------|----------|
| 事件详情页 | `mobile/app/events/[eventId].tsx` |
| 幻灯片页面 | `mobile/app/slideshow.tsx` |
| 播放器组件 | `mobile/src/components/slideshow/SlideshowPlayer.tsx` |
| 照片查看器 | `mobile/src/components/photo/PhotoViewer.tsx` |
| 照片网格 | `mobile/src/components/photo/PhotoGrid.tsx` |
| 事件 API | `mobile/src/services/api/eventApi.ts` |
| 播放状态 | `mobile/src/stores/slideshowStore.ts` |
| 类型定义 | `mobile/src/types/slideshow.ts` |
| 章节类型 | `mobile/src/types/chapter.ts` |

### 1.3 事件时间线视图（Events Tab）

- 事件列表页改为时间线分组视图，按月展示事件与照片统计。
- 页面入口：`mobile/app/(tabs)/events.tsx`
- 分组逻辑：`mobile/src/utils/eventGrouping.ts`
- 月份头部：`mobile/src/components/timeline/MonthHeader.tsx`
- 时间线卡片：`mobile/src/components/timeline/TimelineEventCard.tsx`
- 保留行为：下拉刷新、分页加载、hero 区域与导入入口。

---

## 2. 事件详情页

### 2.1 数据结构

```typescript
interface EventDetail extends EventRecord {
  chapters: Chapter[];
  photoGroups: PhotoGroup[];
  photos: EventPhoto[];
}

interface Chapter {
  id: string;
  chapterIndex: number;
  chapterTitle: string | null;
  chapterStory: string | null;
  chapterIntro: string | null;
  chapterSummary: string | null;
  slideshowCaption: string | null;
  photoStartIndex: number;
  photoEndIndex: number;
}

interface PhotoGroup {
  id: string;
  groupIndex: number;
  groupTheme: string | null;
  groupEmotion: string | null;
  groupSceneDesc: string | null;
  photoStartIndex: number;
  photoEndIndex: number;
}

interface EventPhoto {
  id: string;
  thumbnailUrl: string | null;
  photoUrl: string | null;
  photoIndex: number;
  shootTime: string | null;
  caption: string | null;
  microStory: string | null;
}
```

### 2.2 页面功能

- 显示事件标题、地点、时间
- 展示故事摘要和完整故事
- 照片网格展示
- 进入幻灯片播放入口
- 重新生成故事按钮

---

## 3. 幻灯片播放器

### 3.1 播放状态

```typescript
enum PlaybackState {
  Playing = 'playing',
  Paused = 'paused',
}

// 播放器内部状态
const [currentIndex, setCurrentIndex] = useState(0);
const [playbackState, setPlaybackState] = useState<PlaybackState>(PlaybackState.Playing);
const [controlsVisible, setControlsVisible] = useState(true);
const [storyVisible, setStoryVisible] = useState(true);
const [elapsedMs, setElapsedMs] = useState(0);
const [slideDurationMs, setSlideDurationMs] = useState(DEFAULT_SLIDE_DURATION_MS);
const [musicStatus, setMusicStatus] = useState<MusicSourceStatus>('loading');
```

### 3.2 播放速度选项

```typescript
const SPEED_OPTIONS_MS = [2000, 3000, 5000] as const;
const DEFAULT_SLIDE_DURATION_MS = 3000;
```

### 3.3 控制自动隐藏

```typescript
const CONTROL_AUTO_HIDE_MS = 3000;  // 控制栏 3 秒后自动隐藏
const STORY_VISIBLE_MS = 3500;       // 故事文字 3.5 秒后隐藏
```

---

## 4. 故事内容展示

### 4.1 内容类型

```typescript
type StoryType = 'chapter-intro' | 'chapter-summary' | 'micro-story';

interface DisplayContent {
  type: StoryType;
  title?: string;
  text: string;
  durationMs: number;
}
```

### 4.2 内容优先级

```typescript
// 按优先级选择展示内容
const displayContent = useMemo(() => {
  const isFirstPhotoInChapter = currentIndex === currentChapter?.photoStartIndex;
  const isLastPhotoInChapter = currentIndex === currentChapter?.photoEndIndex;
  const isFirstPhotoInGroup = currentIndex === currentGroup?.photoStartIndex;

  // 1. 章节引言（章节第一张照片）
  if (isFirstPhotoInChapter && currentChapter?.chapterIntro) {
    return {
      type: 'chapter-intro',
      title: '章节引言',
      text: currentChapter.chapterIntro,
      durationMs: 3000,
    };
  }

  // 2. 章节总结（章节最后一张照片）
  if (isLastPhotoInChapter && currentChapter?.chapterSummary) {
    return {
      type: 'chapter-summary',
      title: '章节总结',
      text: currentChapter.chapterSummary,
      durationMs: 2000,
    };
  }

  // 3. 微故事（按优先级：照片微故事 > 照片标题 > 章节字幕 > 章节故事 > 事件故事）
  const microStoryText =
    currentPhoto?.microStory ||
    currentPhoto?.caption ||
    currentChapter?.slideshowCaption ||
    currentChapter?.chapterStory ||
    currentStoryChunk ||
    event.fullStory ||
    '';

  if (microStoryText) {
    return {
      type: 'micro-story',
      title: isFirstPhotoInGroup ? currentGroup?.groupTheme : undefined,
      text: microStoryText,
      durationMs: 1500,
    };
  }

  return null;
}, [currentIndex, currentChapter, currentGroup, currentPhoto, event]);
```

### 4.3 故事分段

```typescript
// 将长故事分成多个片段
function splitStory(story: string, maxChars = 50): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  const sentences = story.split('。').map(s => s.trim()).filter(Boolean);

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxChars) {
      currentChunk += `${sentence}。`;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = `${sentence}。`;
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

// 根据当前照片索引选择故事片段
const currentStoryChunk = useMemo(() => {
  if (storyChunks.length === 0) return '';
  const chunkIndex = Math.floor(currentIndex / 10) % storyChunks.length;
  return storyChunks[chunkIndex] || '';
}, [currentIndex, storyChunks]);
```

---

## 5. 音乐控制

### 5.1 音乐状态

```typescript
type MusicSourceStatus = 'loading' | 'remote' | 'fallback' | 'none' | 'error';
```

### 5.2 音乐加载流程

```typescript
// 音乐加载优先级
const sources: { kind: MusicSourceStatus; source: AVPlaybackSource }[] = [];

// 1. 优先使用远程音乐
if (event.musicUrl) {
  sources.push({ kind: 'remote', source: { uri: event.musicUrl } });
}

// 2. 降级到本地默认音乐
sources.push({ kind: 'fallback', source: DEFAULT_LOCAL_BGM });

// 依次尝试加载
for (const candidate of sources) {
  try {
    const { sound } = await Audio.Sound.createAsync(candidate.source, {
      shouldPlay: false,
      isLooping: true,
      volume: 1,
    });
    soundRef.current = sound;
    setMusicStatus(candidate.kind);
    return;
  } catch (error) {
    console.warn('Failed to load music:', candidate.kind, error);
  }
}

// 全部失败
setMusicStatus(event.musicUrl ? 'error' : 'none');
```

### 5.3 播放状态同步

```typescript
// 播放状态变化时同步音乐
useEffect(() => {
  const sound = soundRef.current;
  if (!sound) return;

  if (playbackState === PlaybackState.Playing) {
    void sound.playAsync();
  } else {
    void sound.pauseAsync();
  }
}, [playbackState]);
```

---

## 6. 交互流程

### 6.1 播放控制

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        幻灯片播放交互                                    │
└─────────────────────────────────────────────────────────────────────────┘

点击屏幕
├─ 控制栏可见 → 隐藏控制栏
└─ 控制栏隐藏 → 显示控制栏（3 秒后自动隐藏）

点击播放/暂停按钮
└─ 切换播放状态

点击上一张/下一张
└─ 切换照片（带淡入淡出动画）

选择播放速度
└─ 更新 slideDurationMs

点击关闭按钮
└─ 退出播放器
```

### 6.2 自动播放

```typescript
// 自动播放定时器
useEffect(() => {
  if (playbackState !== PlaybackState.Playing || photos.length === 0) {
    return;
  }

  const interval = setInterval(() => {
    setElapsedMs(prev => {
      const next = prev + 100;
      if (next >= activeSlideDurationMs) {
        onNextAuto();  // 切换到下一张
        return 0;
      }
      return next;
    });
  }, 100);

  return () => clearInterval(interval);
}, [activeSlideDurationMs, playbackState, photos.length]);
```

### 6.3 后台恢复

```typescript
// 应用从后台返回时暂停播放
useEffect(() => {
  const subscription = AppState.addEventListener('change', state => {
    if (state !== 'active' && playbackState === PlaybackState.Playing) {
      setPlaybackState(PlaybackState.Paused);
      setShowResumePrompt(true);  // 显示恢复提示
    }
  });

  return () => subscription.remove();
}, [playbackState]);
```

---

## 7. 动画效果

### 7.1 照片切换动画

```typescript
const animateSlideTransition = useCallback((nextIndex: number) => {
  // 淡出
  Animated.timing(opacity, {
    toValue: 0,
    duration: 300,
    useNativeDriver: true,
  }).start(() => {
    setCurrentIndex(nextIndex);
    setElapsedMs(0);
    // 淡入
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  });
}, [opacity]);
```

### 7.2 故事文字动画

```typescript
// 故事文字淡入动画
Animated.parallel([
  Animated.timing(storyOpacity, {
    toValue: 1,
    duration: 260,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: true,
  }),
  Animated.timing(storyTranslateY, {
    toValue: 0,
    duration: 260,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: true,
  }),
]).start();
```

---

## 8. 事件 API

### 8.1 接口定义

```typescript
const eventApi = {
  // 获取事件列表
  listEvents(params?: { page?: number; pageSize?: number }): Promise<EventListResult>;

  // 获取所有事件
  listAllEvents(pageSize?: number): Promise<EventRecord[]>;

  // 获取事件详情
  getEventDetail(eventId: string): Promise<EventDetail>;

  // 重新生成故事
  regenerateStory(eventId: string): Promise<RegenerateStoryResult>;
};
```

### 8.2 数据规范化

```typescript
// URL 规范化
function normalizeEventDetail(e: EventDetail): EventDetail {
  return {
    ...normalizeEvent(e),
    chapters: e.chapters || [],
    photoGroups: e.photoGroups || [],
    photos: e.photos.map(p => ({
      ...p,
      photoUrl: resolveApiUrl(p.photoUrl),
      thumbnailUrl: resolveApiUrl(p.thumbnailUrl),
    })),
  };
}
```

---

## 9. 空状态处理

### 9.1 无照片

```typescript
if (photos.length === 0) {
  return (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name="image-off-outline" size={36} color="#95A8D0" />
      <Text style={styles.emptyText}>该事件暂无可播放照片</Text>
      <Pressable style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeButtonText}>返回</Text>
      </Pressable>
    </View>
  );
}
```

### 9.2 故事缺失

- 显示提示信息
- 提供重新生成入口
- 降级显示基础事件信息

---

## 10. 性能优化

### 10.1 图片预加载

```typescript
// 预加载当前、上一张、下一张照片
useEffect(() => {
  if (photos.length === 0) return;

  const currentUri = getPhotoUri(photos[currentIndex]);
  const nextUri = getPhotoUri(photos[(currentIndex + 1) % photos.length]);
  const prevUri = getPhotoUri(photos[(currentIndex - 1 + photos.length) % photos.length]);

  [currentUri, nextUri, prevUri]
    .filter((uri): uri is string => Boolean(uri))
    .forEach(uri => void Image.prefetch(uri));
}, [currentIndex, photos]);
```

### 10.2 Memo 优化

```typescript
// 缓存章节查找
const currentChapter = useMemo(() => {
  const chapters = event.chapters || [];
  return chapters.find(
    chapter => currentIndex >= chapter.photoStartIndex && currentIndex <= chapter.photoEndIndex
  );
}, [currentIndex, event.chapters]);

// 缓存照片组查找
const currentGroup = useMemo(() =>
  photoGroups.find(
    group => currentIndex >= group.photoStartIndex && currentIndex <= group.photoEndIndex
  ),
  [currentIndex, photoGroups]
);
```

---

## 11. 测试要点

### 11.1 功能测试

- 详情页数据渲染完整性
- 幻灯片自动播放与手动切换
- 故事重生成后的状态刷新
- 音乐加载与播放控制

### 11.2 交互测试

- 播放/暂停切换
- 速度调节
- 控制栏自动隐藏
- 后台恢复提示

### 11.3 边界测试

- 单张照片事件
- 无故事事件
- 无音乐事件
- 章节边界切换

---

## 12. 关联模块

| 模块 | 文档 | 关联说明 |
|------|------|----------|
| 后端事件 | `backend/modules/event.md` | 事件数据、章节结构 |
| 后端地图 | `backend/modules/map.md` | 地点信息 |
| 前端地图 | `frontend/modules/map.md` | 事件详情跳转来源 |
| 任务 API | `mobile/src/services/api/taskApi.ts` | 故事重生成任务轮询 |

---

## 13. 变更影响

若本模块变更，需同步检查：

- [ ] `my-spec/system/backend/modules/event.md`
- [ ] `my-spec/system/backend/api/INDEX.md`
- [ ] `my-spec/system/execution/01-test-profile.yaml`（若新增前端人工验收要求）
- [ ] `my-spec/system/frontend/modules/map.md`（若影响跳转逻辑）

---

> **最后更新**：2026-02-11
