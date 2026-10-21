// AI layer.
//
// Design (local-first, from the product spec):
//   1. Prefer on-device AI (Apple Intelligence on iOS 26+, Gemini Nano /
//      AICore on Android via the ML Kit Prompt API) through the local module
//      `modules/styleme-ai`, which is only present in development builds
//      (Expo Go cannot load it). The published hook points:
//        - getAiStatus(): capability readout for Settings (sync, presence)
//        - getAiModelStatus(): live model state (async; the Settings card)
//        - enableOnDeviceModel(): user-triggered one-time model download
//        - suggestTags(): deterministic tag fallback (always works)
//        - describeLookText(): rules-engine explanation (always works)
//        - describeLookEnhanced(): native phrasing — with the pieces' photos
//          — when the model is usable
//        - suggestTagsNative(): on-device tag prefill from product text+photo
//   2. Everything degrades gracefully to the deterministic rules engine, so the
//      app remains fully useful offline and on unsupported hardware. AI is
//      never a hard dependency, and nothing ever leaves the phone.

import type { ModelStatus } from '../../modules/styleme-ai';
import type { NativeBridge } from './ai-bridge';
import { evaluateLook } from './engine';
import { AI_PRESETS, cloudChat, cloudReady, presetSupportsVision, sliceJson, type CloudAiConfig, type CloudPresetId } from './cloud-ai';
import { HARDCODED_KEYS } from './cloud-ai.local';
import {
  FORMALITY_LABELS,
  MATERIALS,
  PALETTE,
  PATTERNS,
  TYPES,
  bandOf,
  occasionOf,
  suggestSeasons,
  typeOf,
} from './taxonomy';
import type {
  ColorId,
  Item,
  LookSlots,
  MaterialId,
  OutfitCandidate,
  PatternId,
  StyleContext,
} from './types';

// Lazy, failure-safe load of the optional native bridge. On Expo Go or web
// `requireNativeModule` throws and we stay with the rules engine.
let native: NativeBridge | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../../modules/styleme-ai') as { default?: NativeBridge };
  native = mod?.default ?? null;
} catch {
  native = null;
}

// Optional cloud layer — mirrored in from the DB by <CloudAiSync /> (root
// layout) and after every Settings save. Held here as the single source the
// async helpers consult.
let cloud: CloudAiConfig | null = null;

export function setCloudAiConfig(cfg: CloudAiConfig | null): void {
  cloud = cfg;
}

export function getCloudAiConfig(): CloudAiConfig | null {
  return cloud;
}

// ---- provider fallback chain ------------------------------------------------
// Each provider preset gets a turn only if a local key exists for it (the
// git-ignored cloud-ai.local.ts holds Gemini AND Groq). A failed primary is
// retried text-forward on the next provider so AI features survive a single
// vendor's bad day (Gemini 503 spikes, Groq 429s).

const GROQ_VISION_MODEL = 'qwen/qwen3.8-27b'; // the one vision model Groq runs (preview)

export function fallbackConfigOf(primary: CloudAiConfig): CloudAiConfig | null {
  const primaryId = (Object.entries(AI_PRESETS).find(
    ([, p]) => p.endpoint === primary.endpoint,
  )?.[0] ?? null) as CloudPresetId | null;
  const order: CloudPresetId[] = primaryId === 'gemini' ? ['groq'] : ['gemini', 'groq'];
  for (const id of order) {
    const key = HARDCODED_KEYS[id];
    if (!key) continue;
    const preset = AI_PRESETS[id];
    return {
      enabled: true,
      endpoint: preset.endpoint,
      model: preset.model,
      key,
      photos: primary.photos,
      vision: presetSupportsVision(preset.endpoint, preset.model),
    };
  }
  return null;
}

/**
 * Fire on the configured provider; on failure, retry on the fallback. When
 * the call NEEDS images and the fallback is Groq's text-only default (gpt-
 * oss), the request re-routes to Groq's single vision model so the visual
 * judgment is never silently skipped.
 */
async function chatWithFallback(args: Parameters<typeof cloudChat>[1]): Promise<string | null> {
  const primary = cloud;
  if (!primary || !cloudReady(primary)) return null;
  const first = await cloudChat(primary, args).catch(() => null);
  if (first) return first;

  const fallback = fallbackConfigOf(primary);
  if (!fallback || !cloudReady(fallback)) return null;
  const needsImages = (args.images?.length ?? 0) > 0 && primary.vision;
  const isGroq = /api\.groq\.com/.test(fallback.endpoint);
  const retryOn = needsImages && isGroq && !fallback.vision
    ? { ...fallback, model: GROQ_VISION_MODEL, vision: true }
    : fallback;
  const retryArgs = needsImages && !isGroq && !fallback.vision ? { ...args, images: [] } : args;
  if (__DEV__) console.warn(`[cloud-ai] primary failed — falling back to ${retryOn.model}`);
  return cloudChat(retryOn, retryArgs).catch(() => null);
}

export interface AiStatus {
  /** on-device AI bridge module is compiled into this build */
  nativeAvailable: boolean;
  label: string;
}

/** Sync, cheap presence readout (does NOT mean the model is downloaded). */
export function getAiStatus(): AiStatus {
  if (native) {
    return { nativeAvailable: true, label: 'On-device AI (native bridge active)' };
  }
  return {
    nativeAvailable: false,
    label: 'Rules engine (offline, deterministic). Native AI hook ready.',
  };
}

export type AiModelStatus = ModelStatus | 'absent';

/** Live model state for the Settings engine card; 'absent' = module missing. */
export async function getAiModelStatus(): Promise<AiModelStatus> {
  const bridge = native;
  if (!bridge?.getModelStatusAsync) return 'absent';
  try {
    return await bridge.getModelStatusAsync();
  } catch {
    return 'absent';
  }
}

/** Trigger the one-time Gemini Nano download through AICore (user-initiated). */
export async function enableOnDeviceModel(): Promise<boolean> {
  const bridge = native;
  if (!bridge?.enableModelAsync) {
    throw new Error('The on-device AI module only exists in the native app build (not Expo Go).');
  }
  return bridge.enableModelAsync();
}

/**
 * Deterministic weeks/season suggestion; the native layer can override this
 * when the model is available and the user opts in.
 */
export function suggestTags(item: Partial<Item>) {
  const seasons = suggestSeasons(item.warmth ?? 2, item.material ?? 'cotton');
  const def = typeOf(item.subtype ?? 'tshirt');
  return {
    warmth: item.warmth ?? def.warmth,
    formality: item.formality ?? def.formality,
    seasons,
    source: 'rules' as const,
  };
}

/** Human phrasing for a scored look. */
export function describeLookText(ctx: StyleContext, candidate: OutfitCandidate, items: Item[]): string {
  const band = bandOf(ctx.temp);
  const occ = occasionOf(ctx.occasion);
  const pieces = items.map((i) => typeOf(i.subtype).label.toLowerCase());
  const lead = candidate.score >= 88
    ? 'A strong pairing'
    : candidate.score >= 74
      ? 'A safe, nice pairing'
      : candidate.score >= 58
        ? 'A workable pairing'
        : 'A decent fallback';
  return `${lead} for ${occ.label.toLowerCase()} in ${band.label.toLowerCase()} weather — `
    + `${pieces.join(', ')}. The palette is the main story here; swap shoes or the outer leg to tune it.`;
}

/** Photos we may hand the model for a look: the outfit's own pieces, capped. */
function lookImages(items: Item[]): string[] {
  return items
    .filter((i) => i.category !== 'extra' && !!i.image)
    .map((i) => i.image)
    .slice(0, 4);
}

/**
 * Rules phrasing, upgraded in one sentence. Priority: cloud model (when the
 * user enabled it) → on-device Nano (photos!) → deterministic rules text.
 * The pieces' photos ride along only where consented/available.
 */
export async function describeLookEnhanced(
  ctx: StyleContext,
  candidate: OutfitCandidate,
  items: Item[],
): Promise<string> {
  const rulesText = describeLookText(ctx, candidate, items);
  const pieces = items
    .filter((i) => i.category !== 'extra')
    .map((i) => typeOf(i.subtype).label.toLowerCase());
  const occasion = occasionOf(ctx.occasion).label;
  const band = bandOf(ctx.temp).label;

  // 1) Cloud model — user opted in via Settings; images only when consented.
  if (cloudReady(cloud)) {
    const clouds = cloud!.photos ? lookImages(items) : [];
    const text = await chatWithFallback({
      system:
        'You are a personal stylist. Write ONE friendly sentence (max 25 words) describing why the given outfit suits the occasion and weather. Reply with the sentence only — no quotes, no explanation.',
      user:
        `Outfit: ${pieces.join(' + ')}. Occasion: ${occasion}. Weather: ${band}. ` +
        `Style score: ${Math.round(candidate.score)}/100. Photos (if attached) show the pieces — work in a revealed detail.`,
      images: clouds,
      reasoningEffort: 'low',
      maxTokens: 600,
    });
    if (text) return text;
  }

  // 2) On-device Nano — multimodal, nothing leaves the phone.
  const bridge = native;
  if (bridge?.describeLookAsync) {
    try {
      const images = lookImages(items);
      try {
        return await bridge.describeLookAsync(pieces, occasion, band, candidate.score, images);
      } catch (multimodalError) {
        // Model may be text-only on this device — retry without pictures once.
        if (images.length === 0) throw multimodalError;
        return await bridge.describeLookAsync(pieces, occasion, band, candidate.score, []);
      }
    } catch {
      // fall through to rules text
    }
  }

  return rulesText;
}

// ------------------------------------------------------------------ tag prefill

export interface SuggestedProductTags {
  subtype?: string;
  material?: MaterialId | null;
  pattern?: PatternId;
  colors?: ColorId[];
}

const TYPE_IDS = TYPES.map((t) => t.id);
const MATERIAL_IDS: MaterialId[] = MATERIALS.map((m) => m.id);
const PATTERN_IDS: PatternId[] = PATTERNS.map((p) => p.id);
const COLOR_IDS: ColorId[] = PALETTE.map((c) => c.id);

function inList<T>(list: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (list as readonly unknown[]).includes(value)
    ? (value as T)
    : null;
}

/** Validate a parsed {subtype, material, pattern, colors} object against the taxonomy. */
function validateTagJson(parsed: Record<string, unknown>): SuggestedProductTags {
  const result: SuggestedProductTags = {};
  const subtype = inList(TYPE_IDS, parsed.subtype);
  if (subtype) result.subtype = subtype;
  if ('material' in parsed) {
    const material = inList(MATERIAL_IDS, parsed.material);
    result.material = material; // null is meaningful ("no material found")
  }
  const pattern = inList(PATTERN_IDS, parsed.pattern);
  if (pattern) result.pattern = pattern;
  if (Array.isArray(parsed.colors)) {
    const colors = parsed.colors.map((c) => inList(COLOR_IDS, c)).filter((c) => c !== null);
    if (colors.length > 0) result.colors = colors as ColorId[];
  }
  return result;
}

const TAG_PROMPT =
  'Read this product info and, if provided, its photo. ' +
  'Choose EXACTLY one subtype from the type list, at most one material from the ' +
  'material list, exactly one pattern from the pattern list, and 1-3 colors from ' +
  'the color list. Use only ids from the lists. Look at the photo when judging ' +
  'color and pattern. Reply with JSON only: ' +
  '{"subtype":"...","material":"...","pattern":"...","colors":["..."]}' +
  ' — where the lists are: types=[%@TYPES%], materials=[%@MATERIALS%], ' +
  'patterns=[%@PATTERNS%], colors=[%@COLORS%], title=%@TITLE%, listing=%@TEXT%.';

function buildTagUserMessage(title: string, pageText: string): string {
  return TAG_PROMPT
    .replace('%@TYPES%', TYPE_IDS.join(','))
    .replace('%@MATERIALS%', MATERIAL_IDS.join(','))
    .replace('%@PATTERNS%', PATTERN_IDS.join(','))
    .replace('%@COLORS%', COLOR_IDS.join(','))
    .replace('%@TITLE%', title.slice(0, 160))
    .replace('%@TEXT%', pageText.slice(0, 900));
}

/**
 * On-device tag prefill for "add by link": the garment photo + the page's own
 * listing text go to Gemini Nano, which picks ids from our taxonomy. Any
 * failure (model missing, weird reply) returns null — caller keeps rule-based
 * tags. Runs only when the module is compiled in and the model is downloaded.
 */
/** Onion-skin guard: Nano on Samsung builds can hang; never block the cloud
 *  call behind it for longer than this. */
const NATIVE_TIMEOUT_MS = 12_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function suggestTagsNative(
  title: string,
  pageText: string,
  imageUri?: string | null,
): Promise<SuggestedProductTags | null> {
  const bridge = native;
  if (!bridge?.tagProductAsync) return null;
  try {
    const raw = await withTimeout(
      bridge.tagProductAsync(
        title.slice(0, 160),
        pageText.slice(0, 900),
        imageUri ? [imageUri] : [],
        TYPE_IDS.join(','),
        MATERIAL_IDS.join(','),
        PATTERN_IDS.join(','),
        COLOR_IDS.join(','),
      ),
      NATIVE_TIMEOUT_MS,
    );
    if (!raw) return null;
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    return validateTagJson(JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>);
  } catch {
    return null;
  }
}

/**
 * Cloud tag prefill (same contract as suggestTagsNative): photo + listing
 * text → the hosted model, validated against the taxonomy. Returns null when
 * cloud AI is off/absent or anything fails.
 */
export async function suggestTagsCloud(
  title: string,
  pageText: string,
  imageUri?: string | null,
): Promise<SuggestedProductTags | null> {
  if (!cloudReady(cloud)) return null;
  const raw = await chatWithFallback({
    system: 'You classify clothing products into a fixed tag taxonomy. Reply with JSON only.',
    user: buildTagUserMessage(title, pageText),
    images: imageUri && cloud!.photos ? [imageUri] : [],
    json: true,
    reasoningEffort: 'low',
    maxTokens: 700,
  });
  if (!raw) return null;
  const json = sliceJson(raw);
  if (!json) return null;
  try {
    return validateTagJson(JSON.parse(json) as Record<string, unknown>);
  } catch {
    return null;
  }
}

// ------------------------------------------------- per-item AI intelligence
//
// The vision work happens exactly once per item, at add time: the model sees
// the garment photo (only when the photo toggle is on) plus the page's listing
// text and writes TWO things in one call — a rich stylist description (stored
// on the item forever) and the normalized taxonomy tags (used to prefill the
// form). Everything downstream (tag prefill for photo-only adds, and the
// outfit styler in the Today flow) then runs purely on TEXT.

export interface ItemIntel {
  /** opinionated stylist description, ≤ ~55 words */
  desc: string;
  /** normalized taxonomy tags extracted from the same look/listening pass */
  tags: SuggestedProductTags;
}

/**
 * One multimodal call: description + tags, from photo + listing text.
 * With the photo toggle off the call still runs on listing text alone.
 * Any failure (network, quota, weird reply) returns null — the caller falls
 * back to the rules tags, and the item simply keeps an empty desc.
 */
export async function analyzeItemCloud(
  title: string,
  pageText: string,
  imageUri?: string | null,
): Promise<ItemIntel | null> {
  const cfg = cloud;
  if (!cfg || !cloudReady(cfg)) return null;
  const raw = await chatWithFallback({
    system:
      'You are a fashion archivist and personal stylist. Study the garment photo (if attached) and the listing text carefully. Reply with JSON only.',
    user:
      `Product title: ${title.slice(0, 160)}\nListing text: ${pageText.slice(0, 900)}\n\n` +
      'Write "desc": a concise, opinionated stylist description (max 55 words) of this garment — ' +
      'what it is, exact colors (naming undertone and saturation), the pattern and its scale, the fabric/weight ' +
      'impression, the vibe and formality register, and finish with 1–2 concrete pairing ideas ' +
      '(e.g. "pairs with cream chinos and loafers; skip busy tops").\n\n' +
      'Then "tags": {"subtype":"...","material":"...","pattern":"...","colors":["..."]} where each value ' +
      'must use ONLY these ids — types=[' + TYPE_IDS.join(',') + '], materials=[' + MATERIAL_IDS.join(',') +
      '], patterns=[' + PATTERN_IDS.join(',') + '], colors=[' + COLOR_IDS.join(',') + ']. ' +
      'Judge the real color, pattern and scale from the photo when one is attached; the listing text is secondary.',
    images: imageUri && cfg.photos ? [imageUri] : [],
    json: true,
    reasoningEffort: 'low',
    maxTokens: 700,
  } as Parameters<typeof cloudChat>[1]);
  if (!raw) return null;
  const json = sliceJson(raw);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const desc = typeof parsed.desc === 'string' ? parsed.desc.trim() : '';
    const tags = validateTagJson(parsed);
    if (!desc && Object.keys(tags).length === 0) return null;
    return { desc, tags };
  } catch {
    return null;
  }
}

// --------------------------------------------------------- AI outfit styler
//
// decideWithAI: given the whole available closet as TEXT (structured attrs +
// the AI-written descriptions), the model judges what should be worn together
// — neutrals anchoring, one accent, pattern scale, formality register, warmth,
// freshness — and returns complete looks. Results are re-run through the
// deterministic evaluator so the score ring stays honest, and any failure
// returns [] (the rules engine's looks stay on screen, unharmed).

const PICK_SYSTEM =
  'You are a personal stylist with strong, opinionated taste in color harmony, pattern pairing, formality and dressing for the weather. Reply with JSON only.';

interface RawLook {
  items?: unknown[];
  dress?: unknown;
  shoes?: unknown;
  outer?: unknown;
  extra?: unknown;
  thought?: unknown;
}

const LOOK_RULES = (band: string): string =>
  'Craft rules:\n' +
  '- Anchor the look in neutrals; ONE saturated accent color at most; two loud colors competing is a fail.\n' +
  '- At most one patterned piece unless the combination is an obviously intentional, scale-aware pairing.\n' +
  `- Keep every piece in the same formality register as the occasion.\n` +
  `- Dress for ${band} weather using each piece's warmth; add an outer layer only when it genuinely helps.\n` +
  '- Rotate: prefer pieces not worn in the past week, unless a favorite truly elevates the look.\n' +
  '- Use the AI descriptions when present — they name real undertones, pattern scale and pairing ideas — and follow their pairing advice when consistent.';

const LOOK_SHAPE =
  'Reply with JSON only: {"looks":[{"items":["n3","n9"],"shoes":"n12","outer":null,"dress":null,"extra":null,"thought":"<max 20 words on why this pairing works>"}]} ' +
  '— "items" holds two ids (top + bottom) and is empty when a dress id is used instead; use JSON null for absent outer/extra.';

/** Compact, id-aliased closet catalogue for the text-only stylist call. */
function itemCatalog(items: Item[], aliasOf: Map<Item, string>): string {
  return items
    .map((it) => {
      const a = aliasOf.get(it) ?? '?';
      const formality = FORMALITY_LABELS[it.formality] ?? `level ${it.formality}`;
      const days = it.lastWornAt != null ? Math.round((Date.now() - it.lastWornAt) / 86_400_000) : -1;
      const worn =
        it.wearCount === 0
          ? 'never worn'
          : days >= 0
            ? `worn ${it.wearCount}x, last ${days}d ago`
            : `worn ${it.wearCount}x`;
      const bits = [
        `id ${a}`,
        typeOf(it.subtype).label.toLowerCase(),
        `(category: ${it.category})`,
        it.colors.join('+'),
        it.pattern,
        it.material ?? 'unknown material',
        `warmth ${it.warmth}/5`,
        `formality ${formality}`,
        it.seasons.join('/'),
        it.favorite ? 'favorite' : null,
        worn,
        it.desc ? `AI notes: ${it.desc.slice(0, 200)}` : null,
        it.note ? `owner note: ${it.note.slice(0, 60)}` : null,
      ].filter(Boolean);
      return bits.join(', ');
    })
    .join('\n');
}

function parseRawLooks(raw: string | null): RawLook[] {
  if (!raw) return [];
  const json = sliceJson(raw);
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as { looks?: unknown };
    return Array.isArray(parsed.looks) ? (parsed.looks as RawLook[]) : [];
  } catch {
    return [];
  }
}

function toSlots(byAlias: Map<string, Item>, raw: RawLook): LookSlots | null {
  const pick = (v: unknown): Item | undefined => (typeof v === 'string' ? byAlias.get(v) : undefined);
  const pieces = (Array.isArray(raw.items) ? raw.items : [])
    .map((v) => pick(v))
    .filter((i): i is Item => i !== undefined);
  const top = pieces.find((i) => i.category === 'top');
  const bottom = pieces.find((i) => i.category === 'bottom');
  const dress = pick(raw.dress);
  const shoes = pick(raw.shoes);
  if (!dress && !(top && bottom)) return null;
  if (!shoes) return null;
  const slots: LookSlots = { shoes };
  if (dress) slots.dress = dress;
  else {
    slots.top = top;
    slots.bottom = bottom;
  }
  const outer = pick(raw.outer);
  if (outer) slots.outer = outer;
  const extra = pick(raw.extra);
  if (extra) slots.extra = extra;
  return slots;
}

/** Validate AI picks against the deterministic evaluator; truth scores stay honest. */
function toCandidates(
  ctx: StyleContext,
  byAlias: Map<string, Item>,
  raws: RawLook[],
): OutfitCandidate[] {
  const out: OutfitCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    const slots = toSlots(byAlias, raw);
    if (!slots) continue;
    const candidate = evaluateLook(ctx, slots);
    if (!candidate) continue;
    if (seen.has(candidate.key)) continue;
    seen.add(candidate.key);
    const thought =
      typeof raw.thought === 'string' && raw.thought.trim().length > 3 ? raw.thought.trim() : null;
    out.push({
      ...candidate,
      reasons: thought
        ? [thought, ...candidate.reasons.filter((r) => r !== thought)].slice(0, 3)
        : candidate.reasons,
      aiNote: thought ?? undefined,
    });
  }
  return out;
}

export interface PickLooksOptions {
  /** how many finalized looks to hand back (default 3, cap 5) */
  count?: number;
  /** item ids to steer AWAY from (e.g. just worn); may be ignored */
  avoid?: string[];
}

/**
 * The AI decides. One text-only call: the closet catalogue (ids, type, colors,
 * pattern, material, warmth, formality, seasons, freshness, AI desc) → N
 * complete looks. No photos leave the phone; the vision work already lives in
 * the per-item descriptions.
 */
export async function pickLooksCloud(
  ctx: StyleContext,
  items: Item[],
  opts: PickLooksOptions = {},
): Promise<OutfitCandidate[]> {
  const cfg = cloud;
  if (!cfg || !cloudReady(cfg)) return [];
  const count = Math.max(1, Math.min(opts.count ?? 3, 5));
  const available = items.filter((i) => i.available);
  if (available.length < 3) return [];
  const aliasOf = new Map<Item, string>();
  available.forEach((it, idx) => aliasOf.set(it, `n${idx}`));
  const byAlias = new Map<string, Item>();
  for (const [item, a] of aliasOf) byAlias.set(a, item);
  const occ = occasionOf(ctx.occasion).label;
  const band = bandOf(ctx.temp);
  const avoid = new Set(opts.avoid ?? []);
  const choices = available.filter((i) => !avoid.has(i.id)).length >= 6 ? available.filter((i) => !avoid.has(i.id)) : available;

  const raw = await chatWithFallback({
    system: PICK_SYSTEM,
    user:
      `Closet (one piece per line):\n${itemCatalog(choices, aliasOf)}\n\n` +
      `Occasion: ${occ}. Weather: ${band.label} (outer layer ${band.outerRequired ? 'is REQUIRED' : 'is optional in this band'}). Mood: ${ctx.mood}.\n\n` +
      `Propose ${count + 2} complete, DIFFERENT outfits from these ids.\n${LOOK_RULES(band.label)}\n\n${LOOK_SHAPE}`,
    json: true,
    reasoningEffort: 'low',
    maxTokens: 1000,
  });

  return toCandidates(ctx, byAlias, parseRawLooks(raw)).slice(0, count);
}
