package expo.modules.stylemeai

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// StyleMe on-device AI bridge (Android).
//
// The Android path targets Gemini Nano via AICore / ML Kit GenAI APIs, which
// are wired up in a later build once validated against a real device
// (requires a development build — Expo Go cannot load this module).
// Until then every call reports false / throws, and the JS layer degrades to
// the deterministic rules engine automatically.

class StyleMeAi : Module() {
  override fun definition() = ModuleDefinition {
    Name("StyleMeAi")

    Function("isOnDeviceTextModelAvailable") {
      false
    }

    AsyncFunction("describeLookAsync") {
      (pieces: List<String>, occasion: String, band: String, score: Double) ->
      throw Exception("Gemini Nano bridge not wired up yet — rules engine applies")
    }
  }
}
