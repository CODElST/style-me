package expo.modules.stylemeai

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Content
import com.google.mlkit.genai.prompt.GenerateContentRequest
import com.google.mlkit.genai.prompt.GenerateContentResponse
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.ImagePart
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.roundToInt

// StyleMe on-device AI bridge (Android) — ML Kit GenAI Prompt API.
//
// Talks to Gemini Nano through AICore entirely on device: nothing leaves the
// phone, no network is used for inference. The base model may need a one-time
// download (via AICore, user-initiated from Settings); feature-specific
// adapters are small. All failures surface as rejections so the JS layer can
// fall back to the deterministic rules engine silently.
//
// Status model (mirrors ML Kit FeatureStatus):
//   unavailable — Gemini Nano isn't supported/configured on this device
//   downloadable — supported; user can trigger the one-time download
//   downloading — model download in progress (caller re-polls)
//   available — ready for inference (text + images, up to 10 per request)

class StyleMeAi : Module() {
  private var cachedModel: GenerativeModel? = null

  private fun obtain(): GenerativeModel {
    if (Build.VERSION.SDK_INT < API_LEVEL_REQUIRED) {
      throw coded("MODEL_UNAVAILABLE", "On-device AI needs Android 8.0+ (this device is ${Build.VERSION.SDK_INT})")
    }
    return cachedModel ?: Generation.getClient().also { cachedModel = it }
  }

  private fun statusOf(status: Int): String = when (status) {
    FeatureStatus.AVAILABLE -> "available"
    FeatureStatus.DOWNLOADABLE -> "downloadable"
    FeatureStatus.DOWNLOADING -> "downloading"
    else -> "unavailable"
  }

  private suspend fun requireReady(): GenerativeModel {
    val model = obtain()
    if (model.checkStatus() != FeatureStatus.AVAILABLE) {
      throw coded("MODEL_NOT_READY", "Gemini Nano not ready — enable it in Settings first")
    }
    return model
  }

  private fun coded(code: String, message: String): CodedException =
    CodedException(code, RuntimeException(message))

  /** Decode a local photo (file:// path) capped to maxDim on its long edge. */
  private fun decodeScaled(path: String, maxDim: Int = 1024): Bitmap? {
    val file = path.removePrefix("file://")
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > maxDim) sample *= 2
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    return BitmapFactory.decodeFile(file, opts)
  }

  /** Multimodal request: up to 4 images, then the instruction text. */
  private fun request(instruction: String, images: List<String>): GenerateContentRequest {
    val builders = images.take(MAX_IMAGES)
      .map { decodeScaled(it) }
      .filterNotNull()
      .take(MAX_IMAGES)
    val content = Content.Builder()
    if (builders.isEmpty()) {
      content.text(instruction)
    } else {
      content.parts(*builders.map { ImagePart(it) }.toTypedArray(), TextPart(instruction))
    }
    return GenerateContentRequest.Builder(content.build()).build()
  }

  private fun extract(response: GenerateContentResponse): String {
    val text = response.candidates.firstOrNull()?.text
      ?.trim()
      ?.removeSurrounding("\"") ?: ""
    if (text.isBlank()) {
      throw coded("EMPTY_RESPONSE", "The model returned nothing")
    }
    return text
  }

  override fun definition() = ModuleDefinition {
    Name("StyleMeAi")

    /** One-shot availability readout for the Settings card. */
    AsyncFunction("getModelStatusAsync").Coroutine<String> {
      try {
        statusOf(obtain().checkStatus())
      } catch (e: Throwable) {
        "unavailable"
      }
    }

    /**
     * User-consented one-time model download via AICore.
     * Resolves true when available afterwards, false while still downloading.
     */
    AsyncFunction("enableModelAsync").Coroutine<Boolean> {
      val model = obtain()
      when (model.checkStatus()) {
        FeatureStatus.AVAILABLE -> true
        FeatureStatus.DOWNLOADING -> false // already in flight; caller re-polls
        FeatureStatus.DOWNLOADABLE -> {
          model.download().collect { status ->
            if (status is DownloadStatus.DownloadFailed) {
              throw coded(
                "MODEL_DOWNLOAD_FAILED",
                status.e.message ?: "Gemini Nano download failed"
              )
            }
          }
          true
        }
        else -> throw coded(
          "MODEL_UNAVAILABLE",
          "Gemini Nano isn't offered on this device — check that the AICore app is installed and the bootloader is locked"
        )
      }
    }

    /**
     * Look phrasing: one stylist sentence for the scored outfit.
     * `images` are local file:// paths of the pieces' photos — Gemini Nano is
     * multimodal, so the picture set (when present) sharpens the wording.
     */
    AsyncFunction("describeLookAsync") Coroutine { pieces: List<String>, occasion: String, band: String, score: Double, images: List<String> ->
      val model = requireReady()
      val prompt =
        "You are a personal stylist. The outfit: ${pieces.joinToString(" + ")}. " +
          "Occasion: $occasion. Weather: $band. Style score: ${score.roundToInt()}/100. " +
          "The attached photos show the pieces. " +
          "Write ONE friendly sentence (20 words max) describing why this outfit works; " +
          "if the photos reveal a detail (texture, pattern, color), work it in. " +
          "Reply with the sentence only — no quotes, no explanation."
      extract(model.generateContent(request(prompt, images)))
    }

    /**
     * Tag prefill for "add by link": given the page's product text and (usually)
     * the product photo, pick tags from supplied taxonomy id lists.
     * Reply is a small JSON object; parsing/validating happens in JS.
     */
    AsyncFunction("tagProductAsync") Coroutine {
        title: String,
        pageText: String,
        images: List<String>,
        typesCsv: String,
        materialsCsv: String,
        patternsCsv: String,
        colorsCsv: String ->
      val model = requireReady()
      val instruction =
        "Read this product info and, if provided, its photo. " +
          "title=$title\nlisting=${pageText.take(900)}\n" +
          "Choose EXACTLY one subtype from [$typesCsv], at most one material " +
          "from [$materialsCsv], exactly one pattern from [$patternsCsv], and 1-3 " +
          "colors from [$colorsCsv]. Use only ids from the lists. " +
          "Look at the photo when judging color and pattern. " +
          "Reply with JSON only: {\"subtype\":\"...\",\"material\":\"...\",\"pattern\":\"...\",\"colors\":[\"...\"]}"
      extract(model.generateContent(request(instruction, images)))
    }
  }

  private companion object {
    const val API_LEVEL_REQUIRED = 26
    const val MAX_IMAGES = 4
  }
}
