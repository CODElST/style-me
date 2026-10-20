# StyleMe 👗

A local-first wardrobe app for Android and iOS, built with [Expo](https://expo.dev) (SDK 58) and Expo Router.

Your closet is a private database on your phone: garments with photos and tags, outfits scored by a deterministic rules engine, and a wear log that learns from what you actually reach for. The web only appears — once, opt-in — when you ask for a clearer product image.

## How it works

```
┌──────── Phone ──────────────────────────────────────────────┐
│                                                             │
│  SQLite (src/lib/db.ts)      photos in app-private storage  │
│  ├─ items  (tags, colors,    (src/lib/photos.ts,            │
│  │         formality…)       expo-image-manipulator)        │
│  ├─ outfits (saved looks)                                   │
│  ├─ wears   (history)                                       │
│  └─ kvar    (settings, last context, consent)               │
│                                                             │
│  Engine (src/lib/engine.ts) ─ pure TypeScript               │
│  filter available/weather/occasion → color + formality      │
│  compatibility → complete looks → seeded per-day ranking    │
│  Deterministic rules work fully offline.                    │
│                                                             │
│  Screens (src/app)                                          │
│  Today · Closet · Builder · Saved · Settings                │
│  + Add Item and Item detail modals                          │
│                                                             │
└──────────┬──────────────────────────────────────────────────┘
           │ only if the user taps “Find clearer product images”
           ▼
┌──────── Small stateless proxy (server/) ────────────────────┐
│  POST /lookup: one downscaled crop ➜ Google Cloud Vision    │
│  webDetection ➜ { pages:[{title,url,source,thumb}],        │
│  entities } — logged nothing, cached nothing, no disk.      │
│  The provider API key lives here, never in the app.         │
└─────────────────────────────────────────────────────────────┘
```

Recommendations are scored and phrased by rules (color harmony, formality windows, warmth bands, freshness). The AI layer (`src/lib/ai.ts`) is a hook point: on-device models (Apple Foundation Models / Gemini Nano) via the local module `modules/styleme-ai` refine tags and phrasing — they are never a hard dependency, and everything degrades gracefully back to the rules engine.

## Privacy, in one line

Photos, tags, history and settings stay on the phone. The only network touch happens when *you* tap lookup, sends one downscaled cropped photo a single time, stores nothing but link references, and your item keeps its own photo.

## Screens

| Tab | What it does |
| --- | --- |
| **Today** | Weather/context-aware outfit suggestions for now, with scores, grades and reasons. |
| **Closet** | Searchable, filterable grid of your garments; availability (clean / in wash) toggles. |
| **Builder** | Compose looks manually or start from the engine; save and wear-log them. |
| **Saved** | Your rack of saved looks, favorites and the wear history. |
| **Settings** | Privacy choices, AI availability readout, lookup endpoint + consent, stats, full erase. |

Add Item walks photo → tags (with auto-suggested seasons you can override) → optional visual lookup → save. Every item keeps its own photo as the master.

## Get started

```bash
npm install
npm start          # expo start
npm run typecheck  # tsc --noEmit
npm run lint       # expo lint
```

### Native build (required)

Expo Go is enough for SQLite, photos and the UI, but native AI bridges need a development build:

```bash
npx expo run:android          # local build + run
npx expo run:ios              # needs macOS + Xcode
# or cloud-built, app installed via the Expo dev client:
bunx eas-cli build --profile development --platform android
```

### Windows long paths (local Android builds only)

React Native autolinking configures some codegen CMake targets with source paths so
deep that they exceed the Windows 260-char `MAX_PATH` limit, and `ninja` fails to
create them no matter which version is installed or what `LongPathsEnabled` says:

```
ninja: error: mkdir(...): No such file or directory
```

The workaround: shorten the two offending source trees with NTFS junctions and point
the packages' CMake source globs at the junctions. This is a `node_modules` patch,
so it must be re-applied after every fresh `npm install`:

```bash
node scripts/fix-windows-longpaths.js    # creates junctions + patches CMake globs (idempotent)
node -e "fs.rmSync('android/app/.cxx',{recursive:true,force:true})"   # if a failed build left .cxx behind
npx expo run:android
```

What the script does, so you can audit it:

- `react-native-gesture-handler`: junction `node_modules/.../shared/sn` →
  `shared/shadowNodes/react/renderer/components`, then its `android/CMakeLists.txt`
  globs sources via `../shared/sn/*.cpp`. The include dir stays on the original
  `../shared/shadowNodes` path — routing includes through the junction changes the
  header prefix and breaks `RNGestureHandlerDetector` descriptor resolution.
- `react-native-safe-area-context`: junction `node_modules/.../cj` →
  `android/build/generated/source/codegen/jni`, and `LIB_ANDROID_GENERATED_JNI_DIR`
  is set to `${LIB_ANDROID_DIR}/../cj`.

One manual, machine-local step remains: the Android SDK's bundled cmake ninja
(`%LOCALAPPDATA%\Android\Sdk\cmake\3.22.1\bin\ninja.exe`) should be 1.13.1+ — keep
the original as `ninja.exe.bak` when swapping.

## Visual web lookup (optional)

1. Enable the Vision API in [Google Cloud](https://cloud.google.com/vision/docs/setup) and create an API key.
2. In `server/`, copy `.env.example` to `.env`, paste the key, and run:

   ```bash
   node server.js          # http://<your-lan-ip>:8787
   ```
3. In the app: Settings → Lookup service URL (`http://<that-ip>:8787`) → enable **Allow web lookup**. The build can also seed this via `app.json` → `expo.extra.lookupEndpoint`.

The proxy is stateless: nothing persisted, per-IP rate limiting, 6 MB body cap, no logging of image data. You can run it only while doing lookups and kill it the rest of the time.

## Project structure

```
src/
├─ app/            # Expo Router screens: (tabs)/*, add-item, item/[id]
├─ components/     # kit.tsx, ItemCard, OutfitCard, TagForm, SlotPicker
├─ constants/      # theme.ts — warm ivory/clay tokens, light + dark
├─ hooks/          # theme, settings, wardrobe
└─ lib/
   ├─ engine.ts    # deterministic outfit scoring & generation
   ├─ db.ts        # schema, migrations, repositories
   ├─ taxonomy.ts  # garments, palette, occasions, temp bands
   ├─ ai.ts        # native-AI hook point + rules fallback
   ├─ photos.ts    # pick → crop → downscale → app-private storage
   ├─ lookup.ts    # consent-checked lookup client
   ├─ types.ts     # domain types
   └─ util.ts      # uid, dates, seeded shuffle
modules/
└─ styleme-ai/     # local Expo module: Apple Foundation Models (iOS 26+),
                   # Gemini Nano hook (Android), loaded only in dev builds
server/
└─ server.js       # zero-dependency Node lookup proxy
scripts/
└─ fix-windows-longpaths.js  # Windows dev-build helper (junction workaround)
```

## Roadmap

1. ✅ **Design** — domain model, tokens, screens.
2. ✅ **Offline foundation** — SQLite, photo pipeline, tagging flow.
3. ✅ **Outfit engine** — deterministic scoring, per-day seeded variety.
4. 🟡 **Native AI** — local module `modules/styleme-ai` scaffolded: Apple Foundation Models capability probe + look phrasing (iOS 26+, Xcode 26 required to compile); Android Gemini Nano hook ready behind a `false` capability check. Wire screens to `describeLookEnhanced()` when testing on a dev build.
5. ✅ **Web lookup** — consent-gated client + stateless proxy.
6. 🔜 **Polish** — empty states, haptics, transitions, error copy.
7. 🔜 **Extras** — weather prediction from wear logs, on-device backup export, optional encrypted sync.
