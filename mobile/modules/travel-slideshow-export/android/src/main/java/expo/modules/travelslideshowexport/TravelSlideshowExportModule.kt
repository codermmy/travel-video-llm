package expo.modules.travelslideshowexport

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
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
import org.json.JSONArray
import org.json.JSONObject
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

    AsyncFunction("exportAsync") { configJson: String ->
      runBlocking {
        exportAsync(configJson)
      }
    }
  }

  private suspend fun exportAsync(configJson: String): Map<String, Any?> {
    val config = parseConfig(JSONObject(configJson))
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
    canvas.drawColor(Color.BLACK)

    when (scene.type) {
      "photo-frame" -> drawPhotoFrameScene(canvas, config, scene)
      "montage-frame" -> drawMontageFrameScene(canvas, config, scene)
      else -> drawTitlePlateScene(canvas, config, scene)
    }

    if (config.includeSubtitles && !scene.body.isNullOrBlank()) {
      drawSubtitleOverlay(canvas, config)
      drawSubtitleText(canvas, config, scene.body ?: "")
    }

    return bitmap
  }

  private fun drawPhotoFrameScene(canvas: Canvas, config: ExportConfig, scene: ExportScene) {
    val photoBitmap = loadScaledBitmap(Uri.parse(scene.photoUri ?: "")) ?: return
    drawBitmapCenterCrop(
      canvas,
      photoBitmap,
      RectF(0f, 0f, config.outputWidth.toFloat(), config.outputHeight.toFloat()),
    )
    photoBitmap.recycle()
  }

  private fun drawMontageFrameScene(canvas: Canvas, config: ExportConfig, scene: ExportScene) {
    val photoUris = scene.photoUris.take(3)
    drawSceneHeading(canvas, config, scene)
    val surfaces = when (photoUris.size) {
      0 -> emptyList()
      1 -> config.layoutContract.montageRects.single.map { it.toRectF() }
      2 -> config.layoutContract.montageRects.pair.map { it.toRectF() }
      else -> config.layoutContract.montageRects.trio.map { it.toRectF() }
    }
    photoUris.forEachIndexed { index, uri ->
      if (index >= surfaces.size) {
        return@forEachIndexed
      }
      loadScaledBitmap(Uri.parse(uri))?.let { bitmap ->
        drawBitmapCenterCrop(
          canvas,
          bitmap,
          surfaces[index],
          radius = config.layoutContract.tileRadius.toFloat(),
        )
        bitmap.recycle()
      }
    }
  }

  private fun drawTitlePlateScene(canvas: Canvas, config: ExportConfig, scene: ExportScene) {
    if (!scene.photoUri.isNullOrBlank()) {
      loadScaledBitmap(Uri.parse(scene.photoUri))?.let { bitmap ->
        drawBitmapCenterCrop(
          canvas,
          bitmap,
          RectF(0f, 0f, config.outputWidth.toFloat(), config.outputHeight.toFloat()),
        )
        bitmap.recycle()
      }
      canvas.drawColor(Color.argb(168, 0, 0, 0))
    }
    drawSceneHeading(canvas, config, scene)
  }

  private fun drawSceneHeading(canvas: Canvas, config: ExportConfig, scene: ExportScene) {
    val titleSafeArea = config.layoutContract.titleSafeArea.toRectF()
    if (!scene.eyebrow.isNullOrBlank()) {
      drawEyebrow(
        canvas = canvas,
        text = scene.eyebrow,
        left = titleSafeArea.left,
        top = titleSafeArea.top,
        width = titleSafeArea.width(),
        textSizePx = config.layoutContract.typography.eyebrowSize.toFloat(),
      )
    }

    val titleTop = if (!scene.eyebrow.isNullOrBlank()) {
      titleSafeArea.top + config.layoutContract.typography.eyebrowSize + 18f
    } else {
      titleSafeArea.top + 4f
    }
    drawCenteredTextBlock(
      canvas = canvas,
      text = scene.title.ifBlank { config.eventTitle },
      width = titleSafeArea.width().toInt(),
      left = titleSafeArea.left,
      top = titleTop,
      textSizePx = config.layoutContract.typography.titleSize.toFloat(),
      lineSpacingExtraPx =
        (config.layoutContract.typography.titleLineHeight - config.layoutContract.typography.titleSize).toFloat(),
      color = Color.parseColor("#F8F8F2"),
      maxLines = 2,
      bold = true,
      serif = true,
    )
  }

  private fun drawSubtitleOverlay(canvas: Canvas, config: ExportConfig) {
    val overlayRect = config.layoutContract.subtitleOverlayRect.toRectF()
    val top = max(0f, overlayRect.top)
    val gradientPaint = Paint().apply {
      shader = LinearGradient(
        0f,
        top,
        0f,
        overlayRect.bottom,
        intArrayOf(Color.argb(0, 0, 0, 0), Color.argb(46, 0, 0, 0), Color.argb(97, 0, 0, 0)),
        null,
        Shader.TileMode.CLAMP,
      )
    }
    canvas.drawRect(
      overlayRect.left,
      top,
      overlayRect.right,
      overlayRect.bottom,
      gradientPaint,
    )
  }

  private fun drawSubtitleText(canvas: Canvas, config: ExportConfig, text: String) {
    val subtitleRect = config.layoutContract.subtitleSafeArea.toRectF()
    drawCenteredTextBlock(
      canvas = canvas,
      text = text,
      width = subtitleRect.width().toInt(),
      left = subtitleRect.left,
      top = subtitleRect.top,
      textSizePx = config.layoutContract.typography.subtitleSize.toFloat(),
      lineSpacingExtraPx =
        (config.layoutContract.typography.subtitleLineHeight - config.layoutContract.typography.subtitleSize).toFloat(),
      color = Color.parseColor("#FAF7F2"),
      maxLines = 2,
      shadowColor = Color.argb(184, 0, 0, 0),
      shadowRadiusPx = 10f,
      shadowDyPx = 2f,
    )
  }

  private fun drawEyebrow(
    canvas: Canvas,
    text: String,
    left: Float,
    top: Float,
    width: Float,
    textSizePx: Float,
  ) {
    val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#CA8A04")
      textAlign = Paint.Align.CENTER
      textSize = textSizePx
      isFakeBoldText = true
    }
    val baseline = top - textPaint.ascent()
    canvas.drawText(text, left + width / 2f, baseline, textPaint)
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
    serif: Boolean = false,
    shadowColor: Int = Color.TRANSPARENT,
    shadowRadiusPx: Float = 0f,
    shadowDyPx: Float = 0f,
  ) {
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      this.color = color
      textSize = textSizePx
      textAlign = Paint.Align.LEFT
      isFakeBoldText = bold
      if (shadowRadiusPx > 0f) {
        setShadowLayer(shadowRadiusPx, 0f, shadowDyPx, shadowColor)
      }
      if (serif) {
        typeface = Typeface.create(Typeface.SERIF, if (bold) Typeface.BOLD else Typeface.NORMAL)
      }
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

  private fun drawBitmapCenterCrop(
    canvas: Canvas,
    bitmap: Bitmap,
    destination: RectF,
    radius: Float = 0f,
  ) {
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
    if (radius > 0f) {
      val path = Path().apply {
        addRoundRect(destination, radius, radius, Path.Direction.CW)
      }
      canvas.save()
      canvas.clipPath(path)
      canvas.drawBitmap(bitmap, srcRect, destination, null)
      canvas.restore()
      return
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

  private fun parseConfig(rawConfig: JSONObject): ExportConfig {
    val scenes = rawConfig.array("scenes").map(::parseScene)
    val subtitles = rawConfig.array("subtitles").map(::parseSubtitleCue)
    val audioSegments = rawConfig.array("audioSegments").map(::parseAudioSegment)
    return ExportConfig(
      eventTitle = rawConfig.string("eventTitle") ?: "Travel Story",
      aspectMode = rawConfig.string("aspectMode") ?: "auto",
      resolvedAspectRatio = rawConfig.string("resolvedAspectRatio") ?: "9:16",
      layoutContract = parseLayoutContract(
        rawConfig.objectValue("layoutContract")
          ?: throw IllegalArgumentException("layoutContract is required"),
      ),
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

  private fun parseScene(raw: JSONObject): ExportScene {
    return ExportScene(
      id = raw.string("id") ?: throw IllegalArgumentException("scene.id is required"),
      type = raw.string("type") ?: "photo-frame",
      eyebrow = raw.string("eyebrow"),
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

  private fun parseSubtitleCue(raw: JSONObject): SubtitleCue {
    return SubtitleCue(
      startMs = raw.int("startMs") ?: 0,
      endMs = raw.int("endMs") ?: 0,
      text = raw.string("text") ?: "",
    )
  }

  private fun parseAudioSegment(raw: JSONObject): AudioSegment {
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

  private fun parseLayoutContract(raw: JSONObject): LayoutContract {
    return LayoutContract(
      canvas = parseCanvasRect(raw.objectValue("canvas") ?: throw IllegalArgumentException("layoutContract.canvas is required")),
      titleSafeArea = parseRect(
        raw.objectValue("titleSafeArea")
          ?: throw IllegalArgumentException("layoutContract.titleSafeArea is required"),
      ),
      stageRect = parseRect(
        raw.objectValue("stageRect") ?: throw IllegalArgumentException("layoutContract.stageRect is required"),
      ),
      subtitleSafeArea = parseRect(
        raw.objectValue("subtitleSafeArea")
          ?: throw IllegalArgumentException("layoutContract.subtitleSafeArea is required"),
      ),
      subtitleOverlayRect = parseRect(
        raw.objectValue("subtitleOverlayRect")
          ?: throw IllegalArgumentException("layoutContract.subtitleOverlayRect is required"),
      ),
      subtitleOverlayHeight = raw.int("subtitleOverlayHeight")
        ?: throw IllegalArgumentException("layoutContract.subtitleOverlayHeight is required"),
      stageGap = raw.int("stageGap") ?: throw IllegalArgumentException("layoutContract.stageGap is required"),
      stageRadius = raw.int("stageRadius")
        ?: throw IllegalArgumentException("layoutContract.stageRadius is required"),
      tileRadius = raw.int("tileRadius") ?: throw IllegalArgumentException("layoutContract.tileRadius is required"),
      montageRects = parseMontageRects(
        raw.objectValue("montageRects")
          ?: throw IllegalArgumentException("layoutContract.montageRects is required"),
      ),
      typography = parseTypography(
        raw.objectValue("typography")
          ?: throw IllegalArgumentException("layoutContract.typography is required"),
      ),
    )
  }

  private fun parseCanvasRect(raw: JSONObject): LayoutRect {
    return LayoutRect(
      x = raw.int("x") ?: 0,
      y = raw.int("y") ?: 0,
      width = raw.int("width") ?: throw IllegalArgumentException("layout canvas width is required"),
      height = raw.int("height") ?: throw IllegalArgumentException("layout canvas height is required"),
    )
  }

  private fun parseRect(raw: JSONObject): LayoutRect {
    return LayoutRect(
      x = raw.int("x") ?: throw IllegalArgumentException("layout rect x is required"),
      y = raw.int("y") ?: throw IllegalArgumentException("layout rect y is required"),
      width = raw.int("width") ?: throw IllegalArgumentException("layout rect width is required"),
      height = raw.int("height") ?: throw IllegalArgumentException("layout rect height is required"),
    )
  }

  private fun parseTypography(raw: JSONObject): TypographySpec {
    return TypographySpec(
      eyebrowSize = raw.int("eyebrowSize")
        ?: throw IllegalArgumentException("typography.eyebrowSize is required"),
      titleSize = raw.int("titleSize")
        ?: throw IllegalArgumentException("typography.titleSize is required"),
      titleLineHeight = raw.int("titleLineHeight")
        ?: throw IllegalArgumentException("typography.titleLineHeight is required"),
      subtitleSize = raw.int("subtitleSize")
        ?: throw IllegalArgumentException("typography.subtitleSize is required"),
      subtitleLineHeight = raw.int("subtitleLineHeight")
        ?: throw IllegalArgumentException("typography.subtitleLineHeight is required"),
      metaSize = raw.int("metaSize") ?: throw IllegalArgumentException("typography.metaSize is required"),
    )
  }

  private fun parseMontageRects(raw: JSONObject): MontageRects {
    return MontageRects(
      single = parseRectArray(raw.optJSONArray("single")),
      pair = parseRectArray(raw.optJSONArray("pair")),
      trio = parseRectArray(raw.optJSONArray("trio")),
    )
  }

  private fun parseRectArray(raw: JSONArray?): List<LayoutRect> {
    if (raw == null) {
      return emptyList()
    }
    return buildList(raw.length()) {
      for (index in 0 until raw.length()) {
        val item = raw.optJSONObject(index) ?: continue
        add(parseRect(item))
      }
    }
  }

  private data class ExportConfig(
    val eventTitle: String,
    val aspectMode: String,
    val resolvedAspectRatio: String,
    val layoutContract: LayoutContract,
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
    val eyebrow: String?,
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

  private data class LayoutContract(
    val canvas: LayoutRect,
    val titleSafeArea: LayoutRect,
    val stageRect: LayoutRect,
    val subtitleSafeArea: LayoutRect,
    val subtitleOverlayRect: LayoutRect,
    val subtitleOverlayHeight: Int,
    val stageGap: Int,
    val stageRadius: Int,
    val tileRadius: Int,
    val montageRects: MontageRects,
    val typography: TypographySpec,
  )

  private data class MontageRects(
    val single: List<LayoutRect>,
    val pair: List<LayoutRect>,
    val trio: List<LayoutRect>,
  )

  private data class LayoutRect(
    val x: Int,
    val y: Int,
    val width: Int,
    val height: Int,
  ) {
    fun toRectF(): RectF = RectF(x.toFloat(), y.toFloat(), (x + width).toFloat(), (y + height).toFloat())
  }

  private data class TypographySpec(
    val eyebrowSize: Int,
    val titleSize: Int,
    val titleLineHeight: Int,
    val subtitleSize: Int,
    val subtitleLineHeight: Int,
    val metaSize: Int,
  )
}

private fun JSONObject.string(key: String): String? =
  if (has(key) && !isNull(key)) optString(key, null) else null

private fun JSONObject.int(key: String): Int? =
  if (has(key) && !isNull(key)) optDouble(key).toInt() else null

private fun JSONObject.boolean(key: String): Boolean? =
  if (has(key) && !isNull(key)) optBoolean(key) else null

private fun JSONObject.objectValue(key: String): JSONObject? =
  if (has(key) && !isNull(key)) optJSONObject(key) else null

private fun JSONObject.array(key: String): List<JSONObject> =
  optJSONArray(key).map()

private fun JSONObject.stringList(key: String): List<String> =
  optJSONArray(key).mapStrings()

private fun JSONArray?.map(): List<JSONObject> {
  if (this == null) {
    return emptyList()
  }
  return buildList(length()) {
    for (index in 0 until length()) {
      optJSONObject(index)?.let(::add)
    }
  }
}

private fun JSONArray?.mapStrings(): List<String> {
  if (this == null) {
    return emptyList()
  }
  return buildList(length()) {
    for (index in 0 until length()) {
      val value = optString(index, null)
      if (!value.isNullOrBlank()) {
        add(value)
      }
    }
  }
}
