// Config plugin: keep the app installable on Android 7 (minSdk 24) while the
// `com.google.mlkit:genai-prompt` library (Gemini Nano / AICore) declares
// minSdk 26. The manifest merger gets a tools:overrideLibrary permission and
// every native call site is guarded at runtime by Build.VERSION.SDK_INT >= 26
// (see modules/styleme-ai/android/.../StyleMeAi.kt) — devices below API 26
// simply stay on the deterministic rules engine.
//
// The `android/` folder is CNG (generated, gitignored); this plugin is what
// makes the override survive `expo prebuild`.

const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const GENAI_LIBS = 'com.google.mlkit.genai.prompt,com.google.mlkit.genai.common';

function withStyleMeGenaiOverride(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    // The manifest-merger instruction must live on <uses-sdk>; make sure the
    // tools namespace is declared on <manifest>.
    manifest.$ = {
      ...manifest.$,
      'xmlns:tools': 'http://schemas.android.com/tools',
    };
    manifest['uses-sdk'] = [
      ...(manifest['uses-sdk'] ?? []),
      { $: { 'tools:overrideLibrary': GENAI_LIBS } },
    ];
    return cfg;
  });
}

module.exports = withStyleMeGenaiOverride;
