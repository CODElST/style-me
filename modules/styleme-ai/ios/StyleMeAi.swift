// StyleMe on-device AI bridge (iOS).
//
// Apple Intelligence / Foundation Models (iOS 26+) refine tags and phrasing.
// Everything here is optional: the JS layer falls back to the deterministic
// rules engine whenever this bridge is missing, unavailable, or the model
// cannot be used.

import ExpoModulesCore

let NoModelError = NSError(
  domain: "app.styleme.ai",
  code: 1,
  userInfo: [NSLocalizedDescriptionKey: "No on-device text model available"]
)

public class StyleMeAi: Module {
  public func definition() -> ModuleDefinition {
    Name("StyleMeAi")

    Function("isOnDeviceTextModelAvailable") { () -> Bool in
      return Self.textModelAvailable()
    }

    AsyncFunction("describeLookAsync") {
      (pieces: [String], occasion: String, band: String, score: Double) -> String in
      return try await Self.describeLook(
        pieces: pieces, occasion: occasion, band: band, score: score
      )
    }
  }

  // MARK: - Apple Foundation Models (canImport-guarded so the pod still
  // builds with older Xcode versions that pre-date FoundationModels).

  static func textModelAvailable() -> Bool {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      return SystemLanguageModel.default.availability == .available
    }
    #endif
    return false
  }

  static func describeLook(
    pieces: [String], occasion: String, band: String, score: Double
  ) async throws -> String {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      let model = SystemLanguageModel.default
      guard model.availability == .available else { throw NoModelError }

      let instructions = """
        You are a warm, concise personal stylist inside the StyleMe wardrobe app.
        Write ONE short sentence (max 24 words, plain language, no emoji) describing
        the pairing. Mention how well it suits the occasion and temperature band.
        Never claim items are unsuitable — this look was already chosen by the
        deterministic engine with score \(Int(score)) out of 100.
        """
      let session = LanguageModelSession(instructions: instructions)
      let prompt = """
        Pieces: \(pieces.joined(separator: ", ")).
        Occasion: \(occasion). Temperature: \(band). Engine score: \(Int(score)).
        """
      let response = try await session.respond(to: prompt)
      return response.content
    }
    #endif
    throw NoModelError
  }
}
