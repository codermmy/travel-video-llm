# 中期答辩问题详答（从底层代码实现角度）

> 本文档基于代码实现分析，确保回答准确反映系统真实技术细节。

---

## 问题 1：时空聚合算法是怎么做的，具体细节是什么，能实现什么样的效果

### 1.1 算法概述

本系统的时空聚合算法采用 **"时空密度聚类 + 时间规则后处理 + 语义辅助合并"** 的混合方案。

**核心代码位置**：`backend/app/services/clustering_service.py`

### 1.2 第三方依赖

```python
from sklearn.cluster import DBSCAN  # 基础密度聚类算子

try:
    from hdbscan import HDBSCAN  # 可选依赖
except Exception:
    HDBSCAN = None

try:
    from sentence_transformers import SentenceTransformer  # 可选语义向量模型
except Exception:
    SentenceTransformer = None
```

**关键点**：系统底层依赖 `scikit-learn` 的 DBSCAN 算子，可选 `hdbscan`，这些是成熟的第三方聚类库。

### 1.3 自研实现细节

#### （1）数据清洗（第 62-88 行）

```python
def _is_timestamp_valid(value: datetime) -> bool:
    """检查时间戳是否有效。
    无效情况：
    - 时间 < 2000-01-01（相机未设置时间）
    - 时间 > 当前时间 + 1 天（未来时间）
    """
    if value.year < 2000:
        return False
    max_valid_time = datetime.now(tz=timezone.utc) + timedelta(days=1)
    if value > max_valid_time:
        return False
    return True

def _has_valid_gps(lat: Optional[float], lon: Optional[float]) -> bool:
    # 过滤 (0,0) 和越界坐标
    if math.isclose(lat, 0.0, abs_tol=1e-9) and math.isclose(lon, 0.0, abs_tol=1e-9):
        return False
    return -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0
```

**作用**：排除脏数据，避免异常 metadata 影响聚类结果。

#### （2）自适应阈值计算（第 193-243 行）

```python
def _adaptive_time_threshold(self, photos: list[PhotoData]) -> timedelta:
    """根据相邻照片时间间隔的 75 分位数自适应估计时间阈值"""
    gaps_seconds = []
    for idx in range(1, len(sorted_photos)):
        gap_seconds = max((curr - prev).total_seconds(), 0.0)
        gaps_seconds.append(gap_seconds)

    threshold_seconds = _safe_percentile(gaps_seconds, percentile=75, default=fallback)
    # 限制在 [30分钟, 96小时] 范围内
    minimum_seconds = 30 * 60
    maximum_seconds = fallback.total_seconds() * 2
    return timedelta(seconds=threshold_seconds)

def _adaptive_distance_threshold(self, photos: list[PhotoData]) -> float:
    """根据照片地理距离分布的 80 分位数自适应估计空间阈值"""
    threshold = _safe_percentile(distances, percentile=80, default=base)
    # 限制在 [0.2km, 150km] 范围内
    return max(minimum_km, min(threshold, maximum_km))
```

**关键点**：时间阈值和空间阈值不是写死的，而是根据数据分布自适应估计。

#### （3）时空距离矩阵构建（第 245-291 行）

```python
def _build_distance_matrix(self, photos: list[PhotoData], ...) -> np.ndarray:
    """构建自定义时空距离矩阵"""

    SMALL_RADIUS_KM = 0.5  # 500 米

    for i in range(size):
        for j in range(i + 1, size):
            # 计算时间差归一化
            time_diff_seconds = abs((left.shoot_time - right.shoot_time).total_seconds())

            # 计算空间距离
            if _photo_has_valid_gps(left) and _photo_has_valid_gps(right):
                distance_km = haversine_distance(...)
                spatial_norm = min(distance_km / distance_denominator, 1.0)
                is_small_range = distance_km <= SMALL_RADIUS_KM

            # 关键规则：小范围拍摄时，放宽时间惩罚
            if is_small_range:
                time_norm = min((time_diff_seconds * 0.5) / time_denominator, 1.0)
            else:
                time_norm = min(time_diff_seconds / time_denominator, 1.0)

            # 组合距离 = sqrt(time_norm^2 + space_norm^2)
            combined = math.sqrt((time_norm * time_norm) + (spatial_norm * spatial_norm))
            matrix[i, j] = combined
```

**关键创新点**：
- 时间阈值和空间阈值自适应计算
- **小范围拍摄惩罚放宽**：同一景点内（500米以内）的照片，时间惩罚减半，避免同一景点被错误拆分

#### （4）基础密度聚类（第 310-348 行）

```python
def _fit_labels(self, distance_matrix: np.ndarray, min_cluster_size: int) -> list[int]:
    eps = self._derive_fallback_eps(distance_matrix)
    dbscan_labels = DBSCAN(
        eps=eps,
        min_samples=min_samples,
        metric="precomputed",  # 使用自定义距离矩阵
    ).fit_predict(distance_matrix).tolist()

    # 如果 HDBSCAN 可用，尝试使用并比较结果
    if HDBSCAN is not None:
        hdbscan_labels = HDBSCAN(
            min_cluster_size=min_cluster_size,
            metric="precomputed",
            cluster_selection_method="eom",
            allow_single_cluster=True,
        ).fit_predict(distance_matrix).tolist()

        # 选择聚类效果更好的结果
        if h_clustered > d_clustered:
            return hdbscan_labels
```

**关键点**：使用 `metric="precomputed"` 表明聚类器使用的是我们自定义的距离矩阵，而不是库默认的距离计算。

#### （5）时间规则后处理（第 636-991 行）

这是完全自研的业务层算法，包括以下规则：

**① 短间隔合并**（`merge_short_intervals`，第 638-660 行）：
```python
def merge_short_intervals(events, min_interval: timedelta) -> list:
    """间隔小于 180 分钟的相邻事件合并"""
    for current in ordered:
        gap = current[0].shoot_time - previous[-1].shoot_time
        if gap < min_interval:
            merged[-1] = sorted(previous + current, ...)
```

**② 大时间缝隙切分**（`split_large_internal_gaps`，第 663-730 行）：
```python
def split_large_internal_gaps(events, *, max_time_gap, jump_threshold_km, ...):
    """事件内部出现大时间缝隙时切分"""
    for photo in ordered[1:]:
        time_gap = photo.shoot_time - previous.shoot_time
        should_split = time_gap > max_time_gap

        # GPS 跳跃也触发切分
        if distance > jump_threshold_km and time_gap >= min_time_gap_for_jump:
            should_split = True
```

**③ 超长事件切分**（`split_oversized_events`，第 770-824 行）：
```python
def split_oversized_events(events, *, default_max_span=timedelta(days=14), ...):
    """跨度过长的事件（>14天）寻找合理切分点切分"""
    if current_span <= max_span:
        continue
    split_index = _find_split_index_for_max_span(current, max_span, min_split_gap)
    pending.insert(0, current[split_index:])
    pending.insert(0, current[:split_index])
```

**④ 跨城市跳跃拆分**（`split_city_transitions`，第 910-961 行）：
```python
def split_city_transitions(events, jump_threshold_km: float, ...):
    """跨城市跳跃拆分"""
    distance = haversine_distance(left.gps_lat, left.gps_lon, right.gps_lat, right.gps_lon)

    # > 200km 的跳跃直接拆分（不管时间间隔）
    if distance > 200:
        result.append(list(current))
        continue

    # > 50km 的跳跃敏感拆分
    if distance > jump_threshold_km:
        result.append(list(current))
```

**⑤ 小事件合并**（`merge_tiny_events`，第 856-907 行）：
```python
def merge_tiny_events(events, *, min_photos_per_event, ...):
    """照片过少的事件（<2张）尝试合并到相邻事件"""
    if len(current) < min_photos_per_event and _can_merge_adjacent_events(...):
        previous.extend(current)
```

**⑥ 夜间单张噪声过滤**（`filter_night_singletons`，第 964-990 行）：
```python
def filter_night_singletons(events) -> list:
    """夜间单张照片（22:00-06:00）过滤，可能是误触"""
    hour = event[0].shoot_time.hour
    if 22 <= hour or hour <= 6:
        continue  # 过滤掉
```

#### （6）语义辅助合并（第 387-633 行）

```python
class SemanticClustering:
    def merge_semantic_clusters(self, clusters):
        """基于语义相似度辅助合并相邻事件"""

        # 1. 计算每个事件的语义向量
        cluster_embeddings = self.compute_cluster_embeddings(clusters)

        # 2. 找出语义相似的事件对
        similar_pairs = self.find_semantic_similar_pairs(cluster_embeddings)

        # 3. 只有同时满足"语义相似"和"时空相邻"才合并
        for left, right, _ in similar_pairs:
            if self._are_spatiotemporal_adjacent(clusters[left], clusters[right]):
                union(left, right)
```

**关键点**：
- 使用 `sentence-transformers` 的 `clip-ViT-B-32-multilingual-v1` 模型（可选）
- 如果模型不可用，退化为 `HashingVectorizer` 文本向量方案
- **只有同时满足语义相似和时空相邻才合并**，不是单纯靠语义聚类

### 1.4 最终效果

| 场景 | 效果 |
|------|------|
| 同一景点连续拍摄 | 不因时间拉长被错误拆分 |
| 不同城市/景点 | 容易被拆分为独立事件 |
| 跨城市连续旅行 | 超过 50km 跳跃会被拆分 |
| 超长旅行（>14天） | 自动寻找合理切分点 |
| 小事件（1-2张） | 尝试合并到相邻事件 |
| 夜间单张噪声 | 被过滤掉 |

### 1.5 自研部分 vs 第三方部分

| 类型 | 内容 |
|------|------|
| **第三方依赖** | `scikit-learn DBSCAN`、可选 `hdbscan`、可选 `sentence-transformers` |
| **自研实现** | 时空距离定义、自适应阈值、小范围时间惩罚放宽、所有规则后处理、语义辅助合并策略、事件创建与噪声标记 |

### 1.6 答辩口径建议

> "底层密度聚类算子使用了成熟第三方库 `scikit-learn DBSCAN`，但整个旅行场景下的时空距离设计、自适应阈值、规则后处理和语义辅助策略是我自己实现的。"

---

## 问题 2：端侧视觉模型使用的什么模型、技术，有怎么样的效果，具体作用和细节是什么，会给云端什么数据

### 2.1 技术概述

端侧视觉分析基于 **Google ML Kit** 的组合能力，在 Android 端本地运行，不依赖云端视觉模型。

**核心代码位置**：
- 原生模块：`mobile/modules/travel-vision/android/src/main/java/expo/modules/travelvision/TravelVisionModule.kt`
- TypeScript 服务层：`mobile/src/services/vision/onDeviceVisionService.ts`

### 2.2 第三方依赖

```kotlin
// build.gradle 依赖
com.google.mlkit:face-detection:16.1.7
com.google.mlkit:image-labeling:17.0.9
com.google.mlkit:text-recognition:16.0.1
```

```kotlin
// 原生模块初始化（第 35-54 行）
private val faceDetector by lazy {
    FaceDetection.getClient(
        FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
            .build()
    )
}

private val imageLabeler by lazy {
    ImageLabeling.getClient(
        ImageLabelerOptions.Builder()
            .setConfidenceThreshold(0.55f)
            .build()
    )
}

private val textRecognizer by lazy {
    TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
}
```

**三个基础能力**：
- **Face Detection**：检测人脸数量、位置、笑容概率
- **Image Labeling**：提取图像标签（如 beach、mountain、food）
- **Text Recognition**：识别图片中的文字（路牌、菜单等）

### 2.3 自研实现细节

#### （1）批量分析入口（第 63-68 行）

```kotlin
AsyncFunction("analyzeBatchAsync") { items: List<Map<String, Any?>> ->
    runBlocking {
        items.map { analyzeSafely(it) }
    }
}
```

#### （2）单张图片分析流程（第 70-108 行）

```kotlin
private suspend fun analyzeSafely(item: Map<String, Any?>): Map<String, Any?> {
    val uri = Uri.parse(localUri)
    val image = InputImage.fromFilePath(context, uri)

    // 并行调用三个 ML Kit 能力
    val labels = awaitTask(imageLabeler.process(image))
    val faces = awaitTask(faceDetector.process(image))
    val text = awaitTask(textRecognizer.process(image))

    // 加载 Bitmap 分析图片质量
    val bitmap = loadScaledBitmap(uri)
    val imageStats = analyzeBitmap(bitmap, width, height)

    // 核心：构建结构化视觉结果
    val result = buildVisionResult(labels, faces, text, imageStats)
    return mapOf("cacheKey" to cacheKey, "result" to result)
}
```

#### （3）结构化视觉结果构建（第 110-175 行）—— 核心自研部分

```kotlin
private fun buildVisionResult(
    labels: List<ImageLabel>,
    faces: List<Face>,
    text: Text,
    imageStats: ImageStats,
): Map<String, Any?> {
    // 场景分类推断
    val sceneCategory = inferSceneCategory(normalizedLabels)

    // 活动推断
    val activityHint = inferActivityHint(sceneCategory, normalizedLabels, faces.size, ocrText)

    // 地标提示
    val landmarkHint = inferLandmarkHint(normalizedLabels, ocrText)

    // 情绪推断
    val emotionHint = inferEmotionHint(faces)

    // 图片质量标记
    val qualityFlags = inferQualityFlags(imageStats)

    // 封面评分
    val coverScore = inferCoverScore(imageStats, topConfidence, faces.size, qualityFlags)

    return mapOf(
        "schema_version" to "single-device-vision/v1",
        "source_platform" to "android-mlkit",
        "scene_category" to sceneCategory,
        "object_tags" to objectTags,
        "activity_hint" to activityHint,
        "people_present" to faces.isNotEmpty(),
        "people_count_bucket" to peopleCountBucket(faces.size),
        "emotion_hint" to emotionHint,
        "ocr_text" to ocrText,
        "landmark_hint" to landmarkHint,
        "image_quality_flags" to qualityFlags,
        "cover_score" to coverScore,
        "confidence_map" to confidenceMap,
    )
}
```

#### （4）场景分类推断（第 177-191 行）

```kotlin
private fun inferSceneCategory(labels: List<Pair<String, Double>>): String? {
    return when {
        ordered.any { it in setOf("beach", "sea", "ocean", "coast", "palm_tree", "sand") } -> "beach"
        ordered.any { it in setOf("mountain", "hill", "snow", "hiking", "valley", "lake") } -> "mountain"
        ordered.any { it in setOf("city", "street", "building", "skyscraper", "tower") } -> "city"
        ordered.any { it in setOf("food", "dish", "meal", "restaurant", "drink") } -> "food_and_dining"
        ordered.any { it in setOf("museum", "temple", "church", "palace", "castle", "bridge") } -> "landmark"
        ordered.any { it in setOf("train", "airplane", "airport", "vehicle", "boat") } -> "transport"
        ordered.any { it in setOf("hotel", "room", "bed", "lobby", "interior_design") } -> "indoor"
        ordered.any { it in setOf("tree", "forest", "flower", "park", "nature") } -> "nature"
        else -> ordered.first()
    }
}
```

**关键点**：场景分类不是 ML Kit 直接返回的，而是根据图像标签通过启发式规则映射的。

#### （5）活动推断（第 193-212 行）

```kotlin
private fun inferActivityHint(
    sceneCategory: String?,
    labels: List<Pair<String, Double>>,
    faceCount: Int,
    ocrText: String
): String? {
    return when {
        faceCount >= 3 -> "group_photo"  // 多人脸 = 合照
        sceneCategory == "beach" -> "beach_walk"
        sceneCategory == "food_and_dining" -> "dining"
        sceneCategory == "mountain" -> "outdoor_exploring"
        sceneCategory == "transport" -> "in_transit"
        ordered.any { it in setOf("museum", "temple", "church", "tower", "bridge") } -> "sightseeing"
        ocrText.contains("menu", ignoreCase = true) -> "dining"  // OCR 检测到菜单
        ocrText.contains("gate", ignoreCase = true) -> "in_transit"
        else -> sceneCategory
    }
}
```

**关键点**：活动标签是综合场景、标签、人脸数量、OCR 推断的。

#### （6）情绪推断（第 229-253 行）

```kotlin
private fun inferEmotionHint(faces: List<Face>): String? {
    if (faces.isEmpty()) return null

    // 使用 ML Kit 返回的笑容概率
    val smiling = faces.mapNotNull { face ->
        face.smilingProbability?.takeIf { it >= 0f }?.toDouble()
    }

    val averageSmile = smiling.average()
    return when {
        averageSmile >= 0.75 -> "joyful"
        averageSmile >= 0.45 -> "pleasant"
        else -> "neutral"
    }
}
```

**关键点**：情绪是启发式推断，基于人脸笑容概率，不是强语义理解型情绪模型。

#### （7）封面评分（第 272-298 行）

```kotlin
private fun inferCoverScore(
    imageStats: ImageStats,
    topConfidence: Double,
    faceCount: Int,
    qualityFlags: List<String>
): Double {
    val resolutionScore = if (min(width, height) >= 720) 1.0 else 0.72
    val exposureScore = if (meanLuminance in 70.0..190.0) 1.0 else 0.74

    // 人脸奖励
    val faceBonus = when {
        faceCount == 1 -> 0.08
        faceCount in 2..3 -> 0.12
        faceCount > 3 -> 0.06
        else -> 0.0
    }

    // 质量惩罚
    val penalty = qualityFlags.size * 0.08

    return clampScore(
        0.32 + (topConfidence * 0.28) + (resolutionScore * 0.18) +
        (exposureScore * 0.16) + faceBonus - penalty
    )
}
```

### 2.4 给云端的数据

**回写接口**：`POST /api/v1/photos/{photo_id}/vision`

**数据格式**（TypeScript 类型）：
```typescript
interface OnDeviceVisionResult {
  schema_version: "single-device-vision/v1";
  source_platform: "android-mlkit";
  generated_at: string;

  scene_category: string | null;      // 场景分类
  object_tags: string[];              // 对象标签列表
  activity_hint: string | null;       // 活动提示
  people_present: boolean;            // 是否有人
  people_count_bucket: "0" | "1" | "2-3" | "4+";  // 人数桶
  emotion_hint: string | null;        // 情绪提示
  ocr_text: string;                   // OCR 文本
  landmark_hint: string | null;       // 地标提示
  image_quality_flags: string[];      // 质量标记
  cover_score: number;                // 封面评分 0-1
  confidence_map: Record<string, number>;  // 各字段置信度
}
```

**数据库存储**（`photos` 表）：
```python
vision_result: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
vision_status: Mapped[str] = mapped_column(String(20), default="pending")
vision_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
```

### 2.5 实际作用

1. **为故事生成提供结构化视觉线索**：场景、活动、情绪、地标等
2. **辅助封面图选择**：cover_score 用于筛选高质量照片
3. **支持"默认不上原图"的隐私策略**：本地提取结构化信息，不上传原图
4. **为视频字幕提供素材**：activity_hint、landmark_hint 可用于生成微故事

### 2.6 自研部分 vs 第三方部分

| 类型 | 内容 |
|------|------|
| **第三方依赖** | Google ML Kit (Face Detection / Image Labeling / Text Recognition) |
| **自研实现** | 原生模块封装、视觉结果 schema 设计、场景分类映射、活动推断、地标推断、情绪推断、封面评分算法、质量检测、端侧队列管理、缓存同步、回写后端 |

### 2.7 答辩口径建议

> "端侧视觉不是自训练模型，而是基于 Google ML Kit 的本地视觉流水线。我负责的是结果 schema 设计、场景/活动/地标/情绪/封面评分等启发式推断逻辑，以及端侧队列管理和后端回写链路。"

---

## 问题 3：针对视频生产和故事生成，对应的策略是什么

### 3.1 故事生成策略

**核心代码位置**：`backend/app/services/event_ai_service.py`

#### （1）策略概述：结构化线索先行 + 分层生成 + 异步刷新

```
端侧视觉结果 → 信号聚合 → 事件总故事 → 章节故事 → 微故事
```

#### （2）信号聚合（`aggregate_story_signals`）

```python
# 从多张照片的 vision_result 中聚合信号
signals = aggregate_story_signals(photos)

descriptions = sample_story_items(signals.get("photo_descriptions", []), 36)
timeline_clues = sample_story_items(signals.get("timeline_clues", []), 24)
```

**关键点**：不是直接把原始 vision_result 塞给 LLM，而是先清洗、聚合、采样。

#### （3）事件级故事生成

```python
story = ai_service.generate_event_story(
    event_id=event_id,
    location=location,
    start_time=event.start_time.isoformat(),
    end_time=event.end_time.isoformat(),
    photo_descriptions=descriptions,
    detailed_location=detailed_location,
    location_tags=location_tags,
    structured_summary=str(signals.get("structured_summary") or ""),
    timeline_clues=timeline_clues,
)
```

**生成字段**：`title`, `full_story`, `hero_title`, `hero_summary`, `emotion_tag`

#### （4）章节生成

```python
chapter_slices = split_into_chapters(photos, chunk_size=10)  # 每 10 张切一章

for chapter_number, (start_idx, end_idx, chapter_photos) in enumerate(chapter_slices):
    generated = generate_chapter_story(
        event=event,
        chapter_index=chapter_number,
        total_chapters=total_chapters,
        chapter_photos=chapter_photos,
        ...
    )
    # 保存章节
    chapter = EventChapter(
        chapter_title=generated.chapter_title,
        chapter_story=generated.chapter_story,
        slideshow_caption=generated.slideshow_caption,
        photo_start_index=start_idx,
        photo_end_index=end_idx,
    )
```

#### （5）微故事生成

```python
# 章节内部再切成小组（2-5张），每张图生成 15-25 字的 micro_story
chapter_summary = photo_group_service.create_for_chapter(
    db,
    event_id=event.id,
    chapter=chapter,
    chapter_photos=chapter_photos,
    use_ai_micro_story=use_ai_per_photo_copy,
)
```

#### （6）版本控制

```python
# Event 模型中的版本字段
event_version: Mapped[int] = mapped_column(Integer, default=1)
story_generated_from_version: Mapped[Optional[int]]  # 故事基于哪个版本生成
story_requested_for_version: Mapped[Optional[int]]   # 当前请求生成的版本
story_freshness: Mapped[str] = mapped_column(String(20), default="stale")  # fresh/stale
```

**关键点**：用户修改事件标题、地点、照片归属后，story_freshness 变为 stale，触发后台重生成。

### 3.2 视频生产策略

**核心代码位置**：
- 场景构建：`mobile/src/services/slideshow/slideshowSceneBuilder.ts`
- 配乐规划：`mobile/src/services/slideshow/slideshowAudioService.ts`
- 导出服务：`mobile/src/services/slideshow/slideshowExportService.ts`

#### （1）策略概述：AI 生成文案 + 规则化场景编排 + 本地原生合成

```
故事文本 → 场景编排 → 时长控制 → 配乐匹配 → 本地渲染 → 视频编码
```

#### （2）场景类型

```typescript
type SlideshowSceneType = 'photo-frame' | 'montage-frame' | 'title-plate';

// photo-frame：单图场景，铺满画面
// montage-frame：拼贴场景，最多 3 张图
// title-plate：章节标题页/总结页
```

#### （3）字幕优先级

```typescript
// 字幕来源优先级
const subtitleText =
    scene.microStory ||      // 优先：微故事
    scene.caption ||         // 次选：照片描述
    scene.slideshowCaption;  // 最后：章节字幕
```

#### （4）时长控制

```typescript
const EXPORT_MAX_DURATION_MS = 120_000;  // 最大 120 秒

function compressExportTimeline(scenes, baseSlideDurationMs, maxTotalDurationMs) {
    // 1. 先压缩单图场景时长
    // 2. 再压缩辅助场景时长
    // 3. 必要时删除中间照片场景
}
```

#### （5）配乐匹配

```typescript
// 从 Pixabay 曲库清单匹配
const MANIFEST_PATH = '/uploads/music/pixabay/manifests/pixabay_music_manifest.json';

function buildSignalProfile(event, photos, timeline) {
    // 基于以下信号构建音乐偏好 profile：
    // - 事件情绪标签
    // - 照片视觉结果（scene_category, activity_hint, emotion_hint）
    // - 拍摄时间段（白天/日落/夜晚）
    // - 章节标题和故事文本关键词
}

function getTrackScore(track, profile) {
    // 综合评分：
    // - bucketScore: 曲库分类匹配度
    // - moodScore: 情绪标签匹配度
    // - sceneScore: 场景标签匹配度
    // - energyScore: 能量匹配度
    return bucketScore + moodScore * 0.18 + sceneScore * 0.16 + energyScore * 0.08;
}
```

**关键点**：配乐不是生成的，是从预整理的 Pixabay 曲库清单中基于多维度信号匹配。

### 3.3 自研部分 vs 第三方部分

| 模块 | 第三方依赖 | 自研实现 |
|------|------------|----------|
| 故事生成 | OpenAI-compatible / DeepSeek / 通义 LLM | 信号聚合、分层生成、版本刷新、章节组织、微故事生成 |
| 视频生产 | Pixabay 音乐素材、Android Media3 | 场景编排、字幕优先级、时长压缩、比例决策、配乐匹配规则、本地导出流水线 |

### 3.4 答辩口径建议

> "故事生成使用第三方 LLM，但我实现了信号聚合、分层生成和版本刷新机制。视频导出是本地原生合成，不是云端渲染或生成式视频模型。音乐是配乐匹配，不是原创音乐生成。"

---

## 问题 4：生产视频用的是什么技术栈

### 4.1 技术栈组成

| 层次 | 技术 |
|------|------|
| 前端框架 | Expo 54 + React Native 0.81 + TypeScript |
| 本地资源处理 | expo-file-system, expo-image-manipulator, expo-media-library |
| 原生模块 | 自定义 Expo 原生模块 `TravelSlideshowExport`（Kotlin 实现） |
| 视频编码 | AndroidX Media3 Transformer (H.264 + AAC) |

### 4.2 核心依赖

```groovy
// build.gradle
androidx.media3:media3-transformer:1.8.0
androidx.media3:media3-effect:1.8.0
androidx.media3:media3-common:1.8.0
```

### 4.3 视频合成流程

```
前端生成配置 JSON → 原生模块解析 → 逐场景渲染 Bitmap → Media3 Transformer 编码 → 保存 MP4
```

### 4.4 编码参数

| 模式 | 分辨率 | 帧率 | 视频码率 | 音频码率 |
|------|--------|------|----------|----------|
| 预览 | 960x540 / 540x960 | 6 fps | 1.8 Mbps | 64 kbps |
| 导出 | 1920x1080 / 1080x1920 | 12 fps | 5 Mbps | 96 kbps |

### 4.5 答辩口径建议

> "视频导出在 Android 端本地完成，使用 AndroidX Media3 Transformer 编码。前端负责场景编排和配乐规划，原生模块负责渲染和编码。"

---

## 问题 5：用的什么数据库，大概的数据库表关系是怎样的

### 5.1 数据库技术栈

- **数据库**：SQLite（开发默认）/ PostgreSQL（生产）
- **ORM**：SQLAlchemy 2.x
- **迁移工具**：Alembic
- **后端框架**：FastAPI

### 5.2 核心表结构

#### （1）`users` 表
```python
class User(Base):
    id: Mapped[str]                    # 主键
    device_id: Mapped[Optional[str]]   # 设备 ID（唯一索引）
    email: Mapped[Optional[str]]       # 邮箱
    nickname: Mapped[Optional[str]]    # 昵称
    avatar_url: Mapped[Optional[str]]  # 头像

    # 关系
    photos: Mapped[list["Photo"]]      # 一对多
    events: Mapped[list["Event"]]      # 一对多
```

#### （2）`photos` 表
```python
class Photo(Base):
    id: Mapped[str]                    # 主键
    user_id: Mapped[str]               # 外键 → users
    event_id: Mapped[Optional[str]]    # 外键 → events

    # 元数据
    asset_id: Mapped[Optional[str]]    # 本地 asset ID
    gps_lat: Mapped[Optional[Decimal]] # 纬度
    gps_lon: Mapped[Optional[Decimal]] # 经度
    shoot_time: Mapped[Optional[datetime]]  # 拍摄时间
    width: Mapped[Optional[int]]
    height: Mapped[Optional[int]]

    # 视觉结果
    vision_result: Mapped[Optional[dict]]  # JSON，存储端侧视觉结果
    vision_status: Mapped[str] = "pending"

    # 故事字段
    caption: Mapped[Optional[str]]     # 照片描述
    micro_story: Mapped[Optional[str]] # 微故事
    emotion_tag: Mapped[Optional[str]] # 情绪标签
```

#### （3）`events` 表
```python
class Event(Base):
    id: Mapped[str]                    # 主键
    user_id: Mapped[str]               # 外键 → users

    # 基本信息
    title: Mapped[str]                 # 事件标题
    location_name: Mapped[Optional[str]]  # 地点名称
    gps_lat: Mapped[Optional[Decimal]]
    gps_lon: Mapped[Optional[Decimal]]
    start_time: Mapped[Optional[datetime]]
    end_time: Mapped[Optional[datetime]]
    photo_count: Mapped[int]

    # 故事字段
    story_text: Mapped[Optional[str]]  # 故事文本
    full_story: Mapped[Optional[str]]  # 完整故事
    hero_title: Mapped[Optional[str]]  # Hero 标题
    hero_summary: Mapped[Optional[str]] # Hero 摘要
    emotion_tag: Mapped[Optional[str]]

    # 版本管理
    event_version: Mapped[int] = 1
    story_generated_from_version: Mapped[Optional[int]]
    story_freshness: Mapped[str] = "stale"  # fresh/stale
    slideshow_freshness: Mapped[str] = "stale"

    # 关系
    photos: Mapped[list["Photo"]]      # 一对多
    chapters: Mapped[list["EventChapter"]]  # 一对多
```

#### （4）`event_chapters` 表
```python
class EventChapter(Base):
    id: Mapped[str]
    event_id: Mapped[str]              # 外键 → events

    chapter_index: Mapped[int]         # 章节序号
    chapter_title: Mapped[Optional[str]]
    chapter_story: Mapped[Optional[str]]
    slideshow_caption: Mapped[Optional[str]]

    photo_start_index: Mapped[int]     # 章节起始照片索引
    photo_end_index: Mapped[int]       # 章节结束照片索引
```

#### （5）`photo_groups` 表
```python
class PhotoGroup(Base):
    id: Mapped[str]
    event_id: Mapped[str]              # 外键 → events
    chapter_id: Mapped[str]            # 外键 → event_chapters

    group_index: Mapped[int]           # 组序号
    group_theme: Mapped[Optional[str]] # 组主题
    group_emotion: Mapped[Optional[str]]  # 组情绪
    group_scene_desc: Mapped[Optional[str]]  # 组场景描述

    photo_start_index: Mapped[int]
    photo_end_index: Mapped[int]
```

#### （6）`async_tasks` 表
```python
class AsyncTask(Base):
    id: Mapped[str]
    user_id: Mapped[str]

    task_type: Mapped[str]             # clustering / geocoding / story / enhance_story
    status: Mapped[str]                # pending / processing / completed / failed
    stage: Mapped[str]                 # 当前阶段
    progress: Mapped[int]              # 进度
    total: Mapped[int]                 # 总数

    result: Mapped[Optional[str]]      # 结果 JSON
    error: Mapped[Optional[str]]       # 错误信息
```

### 5.3 表关系图

```
User
 ├── Photo (多张) ── vision_result (JSON)
 ├── Event (多个)
 │    ├── Photo (多张)
 │    ├── EventChapter (多章)
 │    │    └── PhotoGroup (多组)
 │    └── EventEnhancementAsset (可选增强图)
 └── AsyncTask (多个后台任务)
```

### 5.4 设计特点

1. **以事件为核心**：围绕"旅行事件"组织照片、章节、故事
2. **版本管理**：支持故事和视频的异步重生成
3. **视觉结果用 JSON 存储**：方便快速演进，不需要频繁改表结构

---

## 问题 6：当前系统的视频合成也是在本地去做的，那么具体技术细节、技术栈是什么

### 6.1 本地视频合成流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Native 层                           │
├─────────────────────────────────────────────────────────────────┤
│  1. 构建时间线 (buildSlideshowRenderTimeline)                    │
│  2. 分析比例 (resolveVideoAspectRatio)                           │
│  3. 压缩素材 (preparePhotoAssetMap)                              │
│  4. 规划配乐 (buildSlideshowAudioPlan)                           │
│  5. 生成配置 JSON (NativeExportConfig)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Kotlin 原生模块层                            │
├─────────────────────────────────────────────────────────────────┤
│  1. 解析配置 JSON (parseConfig)                                  │
│  2. 逐场景渲染 Bitmap (renderSceneFiles)                         │
│     - photo-frame: 单图 fitCenter                                │
│     - montage-frame: 多图 centerCrop 拼贴                        │
│     - title-plate: 背景图 + 遮罩 + 文字                          │
│  3. 构建 Composition (buildComposition)                          │
│  4. Media3 Transformer 编码 (runTransformer)                     │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 关键代码细节

#### （1）前端生成导出配置

```typescript
const config: NativeExportConfig = {
    eventTitle: params.event.title,
    aspectMode: params.aspectMode,
    resolvedAspectRatio,         // '16:9' | '9:16'
    layoutContract,              // 布局参数（标题安全区、字幕安全区等）
    frameRate: 12,               // 导出帧率
    videoBitrate: 5_000_000,     // 视频码率
    audioBitrate: 96_000,        // 音频码率
    outputWidth: 1080,
    outputHeight: 1920,
    outputPath: params.outputPath,
    scenes: buildNativeScenes(exportTimeline, params.photos, assetMap),
    subtitles: buildSubtitleCues(exportTimeline),
    audioSegments: cachedAudioSegments,
};

const result = await nativeModule.exportAsync(JSON.stringify(config));
```

#### （2）原生模块场景渲染

```kotlin
private fun renderSceneBitmap(config: ExportConfig, scene: ExportScene): Bitmap {
    val bitmap = Bitmap.createBitmap(config.outputWidth, config.outputHeight, ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.drawColor(Color.BLACK)

    when (scene.type) {
        "photo-frame" -> drawPhotoFrameScene(canvas, config, scene)
        "montage-frame" -> drawMontageFrameScene(canvas, config, scene)
        else -> drawTitlePlateScene(canvas, config, scene)
    }

    if (config.includeSubtitles && !scene.body.isNullOrBlank()) {
        drawSubtitleText(canvas, config, scene.body)
    }

    return bitmap
}
```

#### （3）Media3 Transformer 编码

```kotlin
private suspend fun runTransformer(composition: Composition, config: ExportConfig, outputPath: String) {
    val encoderFactory = DefaultEncoderFactory.Builder(context)
        .setRequestedVideoEncoderSettings(
            VideoEncoderSettings.Builder()
                .setBitrate(config.videoBitrate)
                .setiFrameIntervalSeconds(config.videoIFrameIntervalSeconds.toFloat())
                .build()
        )
        .setRequestedAudioEncoderSettings(
            AudioEncoderSettings.Builder()
                .setBitrate(config.audioBitrate)
                .build()
        )
        .build()

    val transformer = Transformer.Builder(context)
        .setVideoMimeType(MimeTypes.VIDEO_H264)
        .setAudioMimeType(MimeTypes.AUDIO_AAC)
        .setEncoderFactory(encoderFactory)
        .addListener(listener)
        .build()

    transformer.start(composition, outputPath)
}
```

#### （4）Composition 构建

```kotlin
private fun buildComposition(config: ExportConfig, renderedSceneFiles: List<File>): Composition {
    // 视频轨道：图片序列
    val videoSequenceBuilder = EditedMediaItemSequence.Builder(emptyList<EditedMediaItem>())
        .experimentalSetForceVideoTrack(true)

    config.scenes.zip(renderedSceneFiles).forEach { (scene, renderedFile) ->
        val mediaItem = MediaItem.Builder()
            .setUri(Uri.fromFile(renderedFile))
            .setImageDurationMs(scene.durationMs.toLong())  // 每张图显示时长
            .build()
        videoSequenceBuilder.addItem(EditedMediaItem.Builder(mediaItem).setFrameRate(config.frameRate).build())
    }

    // 音频轨道：音乐片段
    val audioSequenceBuilder = EditedMediaItemSequence.Builder(emptyList<EditedMediaItem>())
        .experimentalSetForceAudioTrack(true)

    config.audioSegments.forEach { segment ->
        val mediaItem = MediaItem.Builder()
            .setUri(segment.sourceUrl)
            .setClippingConfiguration(
                MediaItem.ClippingConfiguration.Builder()
                    .setStartPositionMs(segment.sourceStartMs.toLong())
                    .setEndPositionMs(segment.sourceEndMs.toLong())
                    .build()
            )
            .build()
        audioSequenceBuilder.addItem(EditedMediaItem.Builder(mediaItem).build())
    }

    return Composition.Builder(listOf(videoSequenceBuilder.build(), audioSequenceBuilder.build())).build()
}
```

### 6.3 技术栈总结

| 层次 | 技术 | 作用 |
|------|------|------|
| 前端编排 | TypeScript + React Native | 时间线生成、素材压缩、配乐规划 |
| 原生渲染 | Kotlin + Android Canvas | Bitmap 渲染、文字排版 |
| 视频编码 | AndroidX Media3 Transformer | H.264 + AAC 编码 |
| 本地存储 | expo-file-system + expo-media-library | 临时文件管理、保存到相册 |

---

## 问题 7：时空聚合算法是自己写的还是调用的三方包

### 7.1 直接回答

**底层的密度聚类算子调用的是第三方包 `scikit-learn` 的 `DBSCAN`，可选使用 `hdbscan`。但整个旅行场景下的时空距离设计、自适应阈值、规则后处理和语义辅助策略是我自己实现的。**

### 7.2 代码证据

**第三方依赖导入**（第 12-33 行）：
```python
from sklearn.cluster import DBSCAN

try:
    from hdbscan import HDBSCAN
except Exception:
    HDBSCAN = None

try:
    from sentence_transformers import SentenceTransformer
except Exception:
    SentenceTransformer = None
```

**调用第三方算子**（第 310-348 行）：
```python
def _fit_labels(self, distance_matrix: np.ndarray, min_cluster_size: int) -> list[int]:
    eps = self._derive_fallback_eps(distance_matrix)
    dbscan_labels = DBSCAN(
        eps=eps,
        min_samples=min_samples,
        metric="precomputed",  # 使用自定义距离矩阵
    ).fit_predict(distance_matrix).tolist()

    if HDBSCAN is not None:
        hdbscan_labels = HDBSCAN(
            min_cluster_size=min_cluster_size,
            metric="precomputed",
        ).fit_predict(distance_matrix).tolist()
        # 比较两者结果，选择更好的
```

**关键点**：`metric="precomputed"` 表明聚类器使用的是我们自定义的距离矩阵。

### 7.3 自研部分占比

| 模块 | 代码行数 | 是否自研 |
|------|----------|----------|
| 数据清洗 | ~30 行 | 自研 |
| 自适应阈值计算 | ~50 行 | 自研 |
| 时空距离矩阵构建 | ~50 行 | 自研 |
| 基础聚类调用 | ~40 行 | 调用第三方 |
| 时间规则后处理 | ~350 行 | 自研 |
| 语义辅助合并 | ~250 行 | 自研 |

**自研代码占比约 85%**。

### 7.4 答辩口径建议

> "我不是从零重新发明 DBSCAN，而是在成熟聚类算法之上，自己实现了一套面向旅行照片场景的时空聚合策略。底层算子使用 scikit-learn DBSCAN，但距离矩阵构建、自适应阈值、规则后处理和语义辅助合并都是我设计的。"

---

## 总结：答辩口径统一原则

1. **实事求是**：区分清楚"自研实现"和"第三方依赖"
2. **突出自研价值**：强调业务层、策略层、工程层的自研工作
3. **不夸大**：不说"自研了视觉模型"或"自研了视频生成模型"
4. **不贬低**：不说"只是调了个库"或"都是现成的"

**统一收口语**：

> "这个系统不是从零训练底层模型，而是在成熟基础能力之上，围绕旅行回忆场景完成了大量自研实现。底层聚类、视觉识别、视频编码等能力使用第三方成熟组件，但时空聚合策略、视觉结构化、故事链路、视频编排和整套系统工程都是我自己设计和实现的。"