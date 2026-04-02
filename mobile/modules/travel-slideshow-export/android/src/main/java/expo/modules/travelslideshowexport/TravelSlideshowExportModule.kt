package expo.modules.travelslideshowexport

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.max
import kotlin.math.min
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine

class TravelSlideshowExportModule : Module() {
  companion object {
    private const val TAG = "TravelSlideshowExport"
    private const val EXPORT_IMAGE_FRAME_RATE = 30
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("TravelSlideshowExport")

    Function("isAvailable") {
      true
    }

    AsyncFunction("exportAsync") { config: Map<String, Any?> ->
      runBlocking {
        exportAsync(config)
      }
    }
  }

  private suspend fun exportAsync(rawConfig: Map<String, Any?>): Map<String, Any?> {
    val config = parseConfig(rawConfig)
    Log.i(
      TAG,
      "export:start eventTitle=${config.eventTitle} scenes=${config.scenes.size} subtitles=${config.subtitles.size} audioSegments=${config.audioSegments.size} durationMs=${config.totalDurationMs}",
    )
    val outputFile = File(config.outputPath.removePrefix("file://"))
    outputFile.parentFile?.mkdirs()
    if (outputFile.exists()) {
      outputFile.delete()
    }

    val sceneDir = File(outputFile.parentFile ?: context.cacheDir, "${outputFile.nameWithoutExtension}-frames")
    if (sceneDir.exists()) {
      sceneDir.deleteRecursively()
    }
    sceneDir.mkdirs()

    val renderedSceneFiles = renderSceneFiles(config, sceneDir)
    try {
      val composition = buildComposition(config, renderedSceneFiles)
      val result = runTransformer(composition, outputFile.absolutePath)
      Log.i(TAG, "export:done output=${outputFile.absolutePath} fileSize=${result.fileSizeBytes}")
      return mapOf(
        "fileUri" to Uri.fromFile(outputFile).toString(),
        "durationMs" to config.totalDurationMs,
        "exportedFileSizeBytes" to result.fileSizeBytes,
      )
    } finally {
      Log.d(TAG, "export:cleanup sceneDir=${sceneDir.absolutePath}")
      sceneDir.deleteRecursively()
    }
  }

  private fun buildComposition(
    config: ExportConfig,
    renderedSceneFiles: List<File>,
  ): Composition {
    val videoSequenceBuilder = EditedMediaItemSequence.Builder(emptyList<EditedMediaItem>())
      .experimentalSetForceVideoTrack(true)
    config.scenes.zip(renderedSceneFiles).forEach { (scene, renderedFile) ->
      val mediaItem = MediaItem.Builder()
        .setUri(Uri.fromFile(renderedFile))
        .setImageDurationMs(scene.durationMs.toLong())
        .build()
      videoSequenceBuilder.addItem(
        EditedMediaItem.Builder(mediaItem)
          .setFrameRate(EXPORT_IMAGE_FRAME_RATE)
          .build(),
      )
    }

    val sequences = mutableListOf<EditedMediaItemSequence>(videoSequenceBuilder.build())
    if (config.audioSegments.isNotEmpty()) {
      val audioSequenceBuilder = EditedMediaItemSequence.Builder(emptyList<EditedMediaItem>())
        .experimentalSetForceAudioTrack(true)
      config.audioSegments.forEach { segment ->
        val clippingConfiguration = MediaItem.ClippingConfiguration.Builder()
          .setStartPositionMs(segment.sourceStartMs.toLong())
          .setEndPositionMs(segment.sourceEndMs.toLong())
          .build()
        val mediaItem = MediaItem.Builder()
          .setUri(segment.sourceUrl)
          .setClippingConfiguration(clippingConfiguration)
          .build()
        audioSequenceBuilder.addItem(EditedMediaItem.Builder(mediaItem).build())
      }
      sequences.add(audioSequenceBuilder.build())
    }

    return Composition.Builder(sequences).build()
  }

  private suspend fun runTransformer(
    composition: Composition,
    outputPath: String,
  ): ExportResult = suspendCancellableCoroutine { continuation ->
    val handler = Handler(Looper.getMainLooper())
    handler.post {
      try {
        val listener = object : Transformer.Listener {
          override fun onCompleted(composition: Composition, result: ExportResult) {
            Log.i(TAG, "transformer:onCompleted fileSize=${result.fileSizeBytes}")
            if (continuation.isActive) {
              continuation.resume(result)
            }
          }

          override fun onError(
            composition: Composition,
            result: ExportResult,
            exception: ExportException,
          ) {
            Log.e(TAG, "transformer:onError", exception)
            if (continuation.isActive) {
              continuation.resumeWithException(exception)
            }
          }
        }

        val transformer = Transformer.Builder(context)
          .setVideoMimeType(MimeTypes.VIDEO_H264)
          .setAudioMimeType(MimeTypes.AUDIO_AAC)
          .addListener(listener)
          .build()
        continuation.invokeOnCancellation {
          transformer.cancel()
        }
        Log.d(TAG, "transformer:start output=$outputPath")
        transformer.start(composition, outputPath)
      } catch (throwable: Throwable) {
        Log.e(TAG, "transformer:start_failed", throwable)
        if (continuation.isActive) {
          continuation.resumeWithException(throwable)
        }
      }
    }
  }

  private fun renderSceneFiles(config: ExportConfig, sceneDir: File): List<File> {
    return config.scenes.mapIndexed { index, scene ->
      val file = File(sceneDir, "scene-${index.toString().padStart(3, '0')}.jpg")
      Log.d(TAG, "scene:render index=$index type=${scene.type} durationMs=${scene.durationMs} photoUri=${scene.photoUri}")
      val bitmap = renderSceneBitmap(config, scene)
      FileOutputStream(file).use { stream ->
        bitmap.compress(Bitmap.CompressFormat.JPEG, 92, stream)
      }
      bitmap.recycle()
      file
    }
  }

  private fun renderSceneBitmap(config: ExportConfig, scene: ExportScene): Bitmap {
    val bitmap = Bitmap.createBitmap(config.outputWidth, config.outputHeight, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.drawColor(Color.parseColor("#140F0D"))

    when (scene.type) {
      "photo" -> drawPhotoScene(canvas, config, scene)
      "collage" -> drawCollageScene(canvas, config, scene)
      else -> drawChapterScene(canvas, config, scene)
    }

    return bitmap
  }

  private fun drawPhotoScene(canvas: Canvas, config: ExportConfig, scene: ExportScene) {
    val photoBitmap = loadScaledBitmap(Uri.parse(scene.photoUri ?: "")) ?: return

    val frameRect = RectF(48f, 80f, config.outputWidth - 48f, config.outputHeight - 220f)
    val backgroundRect = RectF(0f, 0f, config.outputWidth.toFloat(), config.outputHeight.toFloat())
    drawBitmapCenterCrop(canvas, photoBitmap, backgroundRect)
    val shadePaint = Paint().apply { color = Color.argb(96, 20, 13, 9) }
    canvas.drawRect(backgroundRect, shadePaint)

    val cardPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(18, 255, 248, 240)
    }
    canvas.drawRoundRect(frameRect, 34f, 34f, cardPaint)
    drawBitmapFitCenter(canvas, photoBitmap, frameRect)

    if (config.includeSubtitles && !scene.body.isNullOrBlank()) {
      val subtitleTop = config.outputHeight - 270f
      val gradientPaint = Paint().apply {
        shader = LinearGradient(
          0f,
          subtitleTop,
          0f,
          config.outputHeight.toFloat(),
          intArrayOf(Color.argb(0, 20, 13, 9), Color.argb(132, 20, 13, 9), Color.argb(0, 20, 13, 9)),
          null,
          Shader.TileMode.CLAMP,
        )
      }
      canvas.drawRect(0f, subtitleTop, config.outputWidth.toFloat(), config.outputHeight.toFloat(), gradientPaint)
      drawCenteredTextBlock(
        canvas = canvas,
        text = scene.body ?: "",
        width = config.outputWidth - 140,
        left = 70f,
        top = config.outputHeight - 214f,
        textSizePx = 54f,
        lineSpacingExtraPx = 10f,
        color = Color.parseColor("#FFF8F0"),
        maxLines = 2,
        bold = true,
      )
    }

    photoBitmap.recycle()
  }

  private fun drawCollageScene(canvas: Canvas, config: ExportConfig, scene: ExportScene) {
    val photoUris = scene.photoUris.take(3)
    val leadRect = RectF(48f, 360f, config.outputWidth * 0.58f, config.outputHeight - 180f)
    val rightTopRect = RectF(config.outputWidth * 0.60f, 360f, config.outputWidth - 48f, config.outputHeight * 0.60f)
    val rightBottomRect = RectF(config.outputWidth * 0.60f, config.outputHeight * 0.62f, config.outputWidth - 48f, config.outputHeight - 180f)

    val surfaces = listOf(leadRect, rightTopRect, rightBottomRect)
    photoUris.forEachIndexed { index, uri ->
      if (index >= surfaces.size) {
        return@forEachIndexed
      }
      loadScaledBitmap(Uri.parse(uri))?.let { bitmap ->
        drawBitmapCenterCrop(canvas, bitmap, surfaces[index])
        bitmap.recycle()
      }
    }

    drawSceneEyebrow(canvas, "片段蒙太奇", config.outputWidth)
    drawCenteredTextBlock(
      canvas = canvas,
      text = scene.title.ifBlank { config.eventTitle },
      width = config.outputWidth - 120,
      left = 60f,
      top = 120f,
      textSizePx = 68f,
      lineSpacingExtraPx = 12f,
      color = Color.parseColor("#FFF7EE"),
      maxLines = 2,
      bold = true,
    )
    if (!scene.body.isNullOrBlank()) {
      drawCenteredTextBlock(
        canvas = canvas,
        text = scene.body ?: "",
        width = config.outputWidth - 140,
        left = 70f,
        top = 228f,
        textSizePx = 40f,
        lineSpacingExtraPx = 8f,
        color = Color.parseColor("#F2E2D1"),
        maxLines = 3,
      )
    }
  }

  private fun drawChapterScene(canvas: Canvas, config: ExportConfig, scene: ExportScene) {
    val backgroundPaint = Paint().apply {
      shader = LinearGradient(
        0f,
        0f,
        0f,
        config.outputHeight.toFloat(),
        intArrayOf(
          Color.parseColor("#3B2B20"),
          Color.parseColor("#241711"),
          Color.parseColor("#140F0D"),
        ),
        null,
        Shader.TileMode.CLAMP,
      )
    }
    canvas.drawRect(0f, 0f, config.outputWidth.toFloat(), config.outputHeight.toFloat(), backgroundPaint)

    if (!scene.photoUri.isNullOrBlank()) {
      loadScaledBitmap(Uri.parse(scene.photoUri))?.let { bitmap ->
        drawBitmapCenterCrop(
          canvas,
          bitmap,
          RectF(110f, 180f, config.outputWidth - 110f, 620f),
        )
        bitmap.recycle()
      }
    }

    drawSceneEyebrow(
      canvas,
      if (scene.type == "chapter-summary") "章节尾声" else "章节序幕",
      config.outputWidth,
    )
    drawCenteredTextBlock(
      canvas = canvas,
      text = scene.title.ifBlank { config.eventTitle },
      width = config.outputWidth - 120,
      left = 60f,
      top = 700f,
      textSizePx = 72f,
      lineSpacingExtraPx = 12f,
      color = Color.parseColor("#FFF7EE"),
      maxLines = 2,
      bold = true,
    )
    if (!scene.body.isNullOrBlank()) {
      drawCenteredTextBlock(
        canvas = canvas,
        text = scene.body ?: "",
        width = config.outputWidth - 160,
        left = 80f,
        top = 860f,
        textSizePx = 42f,
        lineSpacingExtraPx = 10f,
        color = Color.parseColor("#F4E7D8"),
        maxLines = 4,
      )
    }
  }

  private fun drawSceneEyebrow(canvas: Canvas, text: String, width: Int) {
    val badgePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(54, 231, 197, 160)
    }
    val rect = RectF(width / 2f - 120f, 58f, width / 2f + 120f, 108f)
    canvas.drawRoundRect(rect, 24f, 24f, badgePaint)
    val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#E7C5A0")
      textAlign = Paint.Align.CENTER
      textSize = 26f
      isFakeBoldText = true
    }
    val baseline = rect.centerY() - (textPaint.descent() + textPaint.ascent()) / 2
    canvas.drawText(text, rect.centerX(), baseline, textPaint)
  }

  private fun drawCenteredTextBlock(
    canvas: Canvas,
    text: String,
    width: Int,
    left: Float,
    top: Float,
    textSizePx: Float,
    lineSpacingExtraPx: Float,
    color: Int,
    maxLines: Int,
    bold: Boolean = false,
  ) {
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      this.color = color
      textSize = textSizePx
      textAlign = Paint.Align.CENTER
      isFakeBoldText = bold
    }

    val layout = StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
      .setAlignment(Layout.Alignment.ALIGN_CENTER)
      .setLineSpacing(lineSpacingExtraPx, 1f)
      .setMaxLines(maxLines)
      .setEllipsize(android.text.TextUtils.TruncateAt.END)
      .build()

    canvas.save()
    canvas.translate(left, top)
    layout.draw(canvas)
    canvas.restore()
  }

  private fun drawBitmapCenterCrop(canvas: Canvas, bitmap: Bitmap, destination: RectF) {
    val sourceAspect = bitmap.width.toFloat() / bitmap.height.toFloat()
    val destinationAspect = destination.width() / destination.height()
    val srcRect = if (sourceAspect > destinationAspect) {
      val newWidth = (bitmap.height * destinationAspect).toInt()
      val left = (bitmap.width - newWidth) / 2
      Rect(left, 0, left + newWidth, bitmap.height)
    } else {
      val newHeight = (bitmap.width / destinationAspect).toInt()
      val top = (bitmap.height - newHeight) / 2
      Rect(0, top, bitmap.width, top + newHeight)
    }
    canvas.drawBitmap(bitmap, srcRect, destination, null)
  }

  private fun drawBitmapFitCenter(canvas: Canvas, bitmap: Bitmap, destination: RectF) {
    val sourceAspect = bitmap.width.toFloat() / bitmap.height.toFloat()
    val destinationAspect = destination.width() / destination.height()
    val fittedRect = if (sourceAspect > destinationAspect) {
      val height = destination.width() / sourceAspect
      RectF(destination.left, destination.centerY() - height / 2f, destination.right, destination.centerY() + height / 2f)
    } else {
      val width = destination.height() * sourceAspect
      RectF(destination.centerX() - width / 2f, destination.top, destination.centerX() + width / 2f, destination.bottom)
    }
    canvas.drawBitmap(bitmap, null, fittedRect, null)
  }

  private fun loadScaledBitmap(uri: Uri): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    openInputStream(uri)?.use { input ->
      BitmapFactory.decodeStream(input, null, bounds)
    }

    val maxDimension = max(bounds.outWidth, bounds.outHeight)
    val sampleSize = if (maxDimension <= 0) 1 else max(1, Integer.highestOneBit(maxDimension / 2048))
    val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
    return openInputStream(uri)?.use { input ->
      BitmapFactory.decodeStream(input, null, options)
    }
  }

  private fun openInputStream(uri: Uri): InputStream? {
    return when (uri.scheme) {
      "content", "file" -> context.contentResolver.openInputStream(uri)
      null -> context.contentResolver.openInputStream(Uri.fromFile(File(uri.toString())))
      else -> context.contentResolver.openInputStream(uri)
    }
  }

  private fun parseConfig(rawConfig: Map<String, Any?>): ExportConfig {
    val scenes = rawConfig.list("scenes").map(::parseScene)
    val subtitles = rawConfig.list("subtitles").map(::parseSubtitleCue)
    val audioSegments = rawConfig.list("audioSegments").map(::parseAudioSegment)
    return ExportConfig(
      eventTitle = rawConfig.string("eventTitle") ?: "Travel Story",
      outputWidth = rawConfig.int("outputWidth") ?: 1080,
      outputHeight = rawConfig.int("outputHeight") ?: 1920,
      outputPath = rawConfig.string("outputPath") ?: throw IllegalArgumentException("outputPath is required"),
      includeSubtitles = rawConfig.boolean("includeSubtitles") ?: true,
      totalDurationMs = rawConfig.int("totalDurationMs") ?: 0,
      scenes = scenes,
      subtitles = subtitles,
      audioSegments = audioSegments,
    )
  }

  private fun parseScene(raw: Map<String, Any?>): ExportScene {
    return ExportScene(
      id = raw.string("id") ?: throw IllegalArgumentException("scene.id is required"),
      type = raw.string("type") ?: "photo",
      title = raw.string("title") ?: "",
      body = raw.string("body"),
      photoUri = raw.string("photoUri"),
      photoUris = raw.stringList("photoUris"),
      photoIndex = raw.int("photoIndex") ?: 0,
      durationMs = raw.int("durationMs") ?: 0,
      startMs = raw.int("startMs") ?: 0,
      endMs = raw.int("endMs") ?: 0,
      transitionPreset = raw.string("transitionPreset") ?: "dissolve",
      subtitleDelayMs = raw.int("subtitleDelayMs") ?: 0,
    )
  }

  private fun parseSubtitleCue(raw: Map<String, Any?>): SubtitleCue {
    return SubtitleCue(
      startMs = raw.int("startMs") ?: 0,
      endMs = raw.int("endMs") ?: 0,
      text = raw.string("text") ?: "",
    )
  }

  private fun parseAudioSegment(raw: Map<String, Any?>): AudioSegment {
    return AudioSegment(
      id = raw.string("id") ?: throw IllegalArgumentException("audioSegment.id is required"),
      trackId = raw.string("trackId") ?: "",
      title = raw.string("title") ?: "",
      selectionBucket = raw.string("selectionBucket") ?: "",
      sourceUrl = raw.string("sourceUrl") ?: throw IllegalArgumentException("audioSegment.sourceUrl is required"),
      sourceStartMs = raw.int("sourceStartMs") ?: 0,
      sourceEndMs = raw.int("sourceEndMs") ?: 0,
      timelineStartMs = raw.int("timelineStartMs") ?: 0,
      timelineEndMs = raw.int("timelineEndMs") ?: 0,
      fadeInMs = raw.int("fadeInMs") ?: 0,
      fadeOutMs = raw.int("fadeOutMs") ?: 0,
    )
  }

  private data class ExportConfig(
    val eventTitle: String,
    val outputWidth: Int,
    val outputHeight: Int,
    val outputPath: String,
    val includeSubtitles: Boolean,
    val totalDurationMs: Int,
    val scenes: List<ExportScene>,
    val subtitles: List<SubtitleCue>,
    val audioSegments: List<AudioSegment>,
  )

  private data class ExportScene(
    val id: String,
    val type: String,
    val title: String,
    val body: String?,
    val photoUri: String?,
    val photoUris: List<String>,
    val photoIndex: Int,
    val durationMs: Int,
    val startMs: Int,
    val endMs: Int,
    val transitionPreset: String,
    val subtitleDelayMs: Int,
  )

  private data class SubtitleCue(
    val startMs: Int,
    val endMs: Int,
    val text: String,
  )

  private data class AudioSegment(
    val id: String,
    val trackId: String,
    val title: String,
    val selectionBucket: String,
    val sourceUrl: String,
    val sourceStartMs: Int,
    val sourceEndMs: Int,
    val timelineStartMs: Int,
    val timelineEndMs: Int,
    val fadeInMs: Int,
    val fadeOutMs: Int,
  )
}

private fun Map<String, Any?>.string(key: String): String? = when (val value = this[key]) {
  is String -> value
  else -> null
}

private fun Map<String, Any?>.int(key: String): Int? = when (val value = this[key]) {
  is Int -> value
  is Long -> value.toInt()
  is Double -> value.toInt()
  is Float -> value.toInt()
  else -> null
}

private fun Map<String, Any?>.boolean(key: String): Boolean? = this[key] as? Boolean

@Suppress("UNCHECKED_CAST")
private fun Map<String, Any?>.list(key: String): List<Map<String, Any?>> =
  (this[key] as? List<*>)?.mapNotNull { it as? Map<String, Any?> } ?: emptyList()

@Suppress("UNCHECKED_CAST")
private fun Map<String, Any?>.stringList(key: String): List<String> =
  (this[key] as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
