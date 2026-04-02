package expo.modules.travelvision

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.ImageLabel
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.max
import kotlin.math.min
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine

class TravelVisionModule : Module() {
  companion object {
    private const val TAG = "TravelVision"
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

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

  override fun definition() = ModuleDefinition {
    Name("TravelVision")

    Function("isAvailable") {
      true
    }

    AsyncFunction("analyzeBatchAsync") { items: List<Map<String, Any?>> ->
      runBlocking {
        items.map { analyzeSafely(it) }
      }
    }
  }

  private suspend fun analyzeSafely(item: Map<String, Any?>): Map<String, Any?> {
    val cacheKey = item.string("cacheKey")
      ?: throw IllegalArgumentException("cacheKey is required")
    val localUri = item.string("localUri")
      ?: throw IllegalArgumentException("localUri is required")

    return try {
      Log.d(TAG, "analyze:start cacheKey=$cacheKey uri=$localUri")
      val uri = Uri.parse(localUri)
      val image = InputImage.fromFilePath(context, uri)
      val labels = awaitTask(imageLabeler.process(image))
      val faces = awaitTask(faceDetector.process(image))
      val text = awaitTask(textRecognizer.process(image))
      val bitmap = loadScaledBitmap(uri)
      val width = item.int("width") ?: bitmap?.width ?: 0
      val height = item.int("height") ?: bitmap?.height ?: 0
      val imageStats = analyzeBitmap(bitmap, width, height)
      val result = buildVisionResult(labels, faces, text, imageStats)
      val objectTags = (result["object_tags"] as? List<*>)?.take(4) ?: emptyList<Any>()
      val ocrLength = (result["ocr_text"] as? String)?.length ?: 0
      Log.d(
        TAG,
        "analyze:done cacheKey=$cacheKey labels=${labels.size} faces=${faces.size} textBlocks=${text.textBlocks.size} " +
          "scene=${result["scene_category"]} activity=${result["activity_hint"]} people=${result["people_count_bucket"]} " +
          "cover=${result["cover_score"]} tags=$objectTags ocrLength=$ocrLength"
      )

      mapOf(
        "cacheKey" to cacheKey,
        "result" to result,
      )
    } catch (error: Throwable) {
      Log.e(TAG, "analyze:error cacheKey=$cacheKey uri=$localUri", error)
      mapOf(
        "cacheKey" to cacheKey,
        "errorMessage" to (error.message ?: error.javaClass.simpleName),
      )
    }
  }

  private fun buildVisionResult(
    labels: List<ImageLabel>,
    faces: List<Face>,
    text: Text,
    imageStats: ImageStats,
  ): Map<String, Any?> {
    val normalizedLabels = labels
      .sortedByDescending { it.confidence }
      .mapNotNull { label ->
        val normalized = normalizeToken(label.text)
        normalized?.let { token -> token to label.confidence.toDouble() }
      }

    val sceneCategory = inferSceneCategory(normalizedLabels)
    val objectTags = normalizedLabels.map { it.first }.distinct().take(6)
    val ocrText = text.textBlocks
      .mapNotNull { block -> block.text.trim().takeIf { it.isNotEmpty() } }
      .joinToString("\n")
      .take(400)
    val peopleCountBucket = peopleCountBucket(faces.size)
    val emotionHint = inferEmotionHint(faces)
    val landmarkHint = inferLandmarkHint(normalizedLabels, ocrText)
    val activityHint = inferActivityHint(sceneCategory, normalizedLabels, faces.size, ocrText)
    val qualityFlags = inferQualityFlags(imageStats)
    val coverScore = inferCoverScore(
      imageStats = imageStats,
      topConfidence = normalizedLabels.firstOrNull()?.second ?: 0.0,
      faceCount = faces.size,
      qualityFlags = qualityFlags,
    )

    val confidenceMap = mutableMapOf<String, Double>(
      "scene_category" to (normalizedLabels.firstOrNull()?.second ?: 0.0),
      "people_present" to if (faces.isEmpty()) 0.92 else min(1.0, 0.65 + faces.size * 0.08),
      "cover_score" to coverScore,
    )
    if (activityHint != null) {
      confidenceMap["activity_hint"] = inferKeywordConfidence(activityHint, normalizedLabels)
    }
    if (landmarkHint != null) {
      confidenceMap["landmark_hint"] = inferKeywordConfidence(landmarkHint, normalizedLabels)
    }
    if (emotionHint != null) {
      confidenceMap["emotion_hint"] = if (faces.isNotEmpty()) 0.7 else 0.0
    }
    if (ocrText.isNotEmpty()) {
      confidenceMap["ocr_text"] = 0.8
    }

    return mapOf(
      "schema_version" to "single-device-vision/v1",
      "source_platform" to "android-mlkit",
      "generated_at" to java.time.Instant.now().toString(),
      "scene_category" to sceneCategory,
      "object_tags" to objectTags,
      "activity_hint" to activityHint,
      "people_present" to faces.isNotEmpty(),
      "people_count_bucket" to peopleCountBucket,
      "emotion_hint" to emotionHint,
      "ocr_text" to ocrText,
      "landmark_hint" to landmarkHint,
      "image_quality_flags" to qualityFlags,
      "cover_score" to coverScore,
      "confidence_map" to confidenceMap,
    )
  }

  private fun inferSceneCategory(labels: List<Pair<String, Double>>): String? {
    val ordered = labels.map { it.first }
    return when {
      ordered.any { it in setOf("beach", "sea", "ocean", "coast", "palm_tree", "sand") } -> "beach"
      ordered.any { it in setOf("mountain", "hill", "snow", "hiking", "valley", "lake") } -> "mountain"
      ordered.any { it in setOf("city", "street", "building", "skyscraper", "tower") } -> "city"
      ordered.any { it in setOf("food", "dish", "meal", "restaurant", "drink") } -> "food_and_dining"
      ordered.any { it in setOf("museum", "temple", "church", "palace", "castle", "bridge") } -> "landmark"
      ordered.any { it in setOf("train", "airplane", "airport", "vehicle", "boat") } -> "transport"
      ordered.any { it in setOf("hotel", "room", "bed", "lobby", "interior_design") } -> "indoor"
      ordered.any { it in setOf("tree", "forest", "flower", "park", "nature") } -> "nature"
      ordered.isNotEmpty() -> ordered.first()
      else -> null
    }
  }

  private fun inferActivityHint(
    sceneCategory: String?,
    labels: List<Pair<String, Double>>,
    faceCount: Int,
    ocrText: String,
  ): String? {
    val ordered = labels.map { it.first }
    return when {
      faceCount >= 3 -> "group_photo"
      sceneCategory == "beach" -> "beach_walk"
      sceneCategory == "food_and_dining" -> "dining"
      sceneCategory == "mountain" -> "outdoor_exploring"
      sceneCategory == "transport" -> "in_transit"
      ordered.any { it in setOf("museum", "temple", "church", "tower", "bridge") } -> "sightseeing"
      ocrText.contains("menu", ignoreCase = true) -> "dining"
      ocrText.contains("gate", ignoreCase = true) || ocrText.contains("terminal", ignoreCase = true) -> "in_transit"
      ordered.isNotEmpty() && sceneCategory != null -> sceneCategory
      else -> null
    }
  }

  private fun inferLandmarkHint(labels: List<Pair<String, Double>>, ocrText: String): String? {
    val ordered = labels.map { it.first }
    return when {
      ordered.any { it == "tower" } -> "tower"
      ordered.any { it == "bridge" } -> "bridge"
      ordered.any { it == "temple" } -> "temple"
      ordered.any { it == "church" } -> "church"
      ordered.any { it == "museum" } -> "museum"
      ordered.any { it == "castle" || it == "palace" } -> "historic_site"
      ocrText.contains("museum", ignoreCase = true) -> "museum"
      ocrText.contains("temple", ignoreCase = true) -> "temple"
      else -> null
    }
  }

  private fun inferEmotionHint(faces: List<Face>): String? {
    if (faces.isEmpty()) {
      return null
    }
    val smiling = faces
      .mapNotNull { face ->
        val probability = face.smilingProbability
        if (probability != null && probability >= 0f) {
          probability.toDouble()
        } else {
          null
        }
      }

    if (smiling.isEmpty()) {
      return "neutral"
    }

    val averageSmile = smiling.average()
    return when {
      averageSmile >= 0.75 -> "joyful"
      averageSmile >= 0.45 -> "pleasant"
      else -> "neutral"
    }
  }

  private fun inferQualityFlags(stats: ImageStats): List<String> {
    val flags = mutableListOf<String>()
    if (min(stats.width, stats.height) in 1..719) {
      flags.add("low_resolution")
    }
    if (stats.meanLuminance < 60.0) {
      flags.add("too_dark")
    }
    if (stats.meanLuminance > 205.0) {
      flags.add("too_bright")
    }
    if (stats.luminanceStdDev in 0.0..26.0) {
      flags.add("low_contrast")
    }
    return flags
  }

  private fun inferCoverScore(
    imageStats: ImageStats,
    topConfidence: Double,
    faceCount: Int,
    qualityFlags: List<String>,
  ): Double {
    val resolutionScore = if (min(imageStats.width, imageStats.height) >= 720) 1.0 else 0.72
    val exposureScore = when {
      imageStats.meanLuminance in 70.0..190.0 -> 1.0
      else -> 0.74
    }
    val faceBonus = when {
      faceCount == 1 -> 0.08
      faceCount in 2..3 -> 0.12
      faceCount > 3 -> 0.06
      else -> 0.0
    }
    val penalty = qualityFlags.size * 0.08
    return clampScore(
      0.32 +
        (topConfidence * 0.28) +
        (resolutionScore * 0.18) +
        (exposureScore * 0.16) +
        faceBonus -
        penalty
    )
  }

  private fun inferKeywordConfidence(keyword: String, labels: List<Pair<String, Double>>): Double {
    return labels.firstOrNull { it.first == keyword }?.second ?: 0.66
  }

  private fun peopleCountBucket(faceCount: Int): String {
    return when {
      faceCount <= 0 -> "0"
      faceCount == 1 -> "1"
      faceCount <= 3 -> "2-3"
      else -> "4+"
    }
  }

  private fun normalizeToken(value: String?): String? {
    if (value == null) {
      return null
    }
    val normalized = value
      .trim()
      .lowercase()
      .replace(Regex("[^a-z0-9]+"), "_")
      .trim('_')
    return normalized.takeIf { it.isNotEmpty() }
  }

  private fun clampScore(value: Double): Double {
    return max(0.0, min(1.0, value))
  }

  private fun loadScaledBitmap(uri: Uri): Bitmap? {
    val resolver = context.contentResolver
    val bounds = BitmapFactory.Options().apply {
      inJustDecodeBounds = true
    }

    resolver.openInputStream(uri)?.use { stream ->
      BitmapFactory.decodeStream(stream, null, bounds)
    }

    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      return null
    }

    var sampleSize = 1
    while (bounds.outWidth / sampleSize > 640 || bounds.outHeight / sampleSize > 640) {
      sampleSize *= 2
    }

    val decodeOptions = BitmapFactory.Options().apply {
      inSampleSize = sampleSize
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }

    return resolver.openInputStream(uri)?.use { stream ->
      BitmapFactory.decodeStream(stream, null, decodeOptions)
    }
  }

  private fun analyzeBitmap(bitmap: Bitmap?, fallbackWidth: Int, fallbackHeight: Int): ImageStats {
    if (bitmap == null) {
      return ImageStats(
        width = fallbackWidth,
        height = fallbackHeight,
        meanLuminance = 128.0,
        luminanceStdDev = 40.0,
      )
    }

    val sampleStepX = max(1, bitmap.width / 32)
    val sampleStepY = max(1, bitmap.height / 32)
    val luminances = mutableListOf<Double>()

    var x = 0
    while (x < bitmap.width) {
      var y = 0
      while (y < bitmap.height) {
        val pixel = bitmap.getPixel(x, y)
        val red = (pixel shr 16) and 0xff
        val green = (pixel shr 8) and 0xff
        val blue = pixel and 0xff
        val luminance = (0.299 * red) + (0.587 * green) + (0.114 * blue)
        luminances.add(luminance)
        y += sampleStepY
      }
      x += sampleStepX
    }

    val mean = luminances.average().takeIf { !it.isNaN() } ?: 128.0
    val variance = luminances
      .map { (it - mean) * (it - mean) }
      .average()
      .takeIf { !it.isNaN() }
      ?: 0.0

    return ImageStats(
      width = bitmap.width,
      height = bitmap.height,
      meanLuminance = mean,
      luminanceStdDev = kotlin.math.sqrt(variance),
    )
  }

  private suspend fun <T> awaitTask(task: com.google.android.gms.tasks.Task<T>): T =
    suspendCancellableCoroutine { continuation ->
      task
        .addOnSuccessListener { result -> continuation.resume(result) }
        .addOnFailureListener { error -> continuation.resumeWithException(error) }
    }

  private fun Map<String, Any?>.string(key: String): String? {
    return this[key] as? String
  }

  private fun Map<String, Any?>.int(key: String): Int? {
    val value = this[key] ?: return null
    return when (value) {
      is Int -> value
      is Double -> value.toInt()
      is Float -> value.toInt()
      is Long -> value.toInt()
      is Number -> value.toInt()
      else -> null
    }
  }
}

private data class ImageStats(
  val width: Int,
  val height: Int,
  val meanLuminance: Double,
  val luminanceStdDev: Double,
)
