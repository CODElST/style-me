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
import { MATERIALS, PALETTE, PATTERNS, TYPES, bandOf, occasionOf, suggestSeasons, typeOf } from './taxonomy';
import type { ColorId, Item, MaterialId, OutfitCandidate, PatternId, StyleContext } from './types';

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
 * Rules phrasing, upgraded in one sentence by the on-device model. Sends the
 * pieces' photos when available (Gemini Nano is multimodal); if the multimodal
 * attempt fails, falls back to a text-only call, then the rules text.
 */
export async function describeLookEnhanced(
  ctx: StyleContext,
  candidate: OutfitCandidate,
  items: Item[],
): Promise<string> {
  const rulesText = describeLookText(ctx, candidate, items);
  const bridge = native;
  if (!bridge?.describeLookAsync) return rulesText;
  try {
    const pieces = items
      .filter((i) => i.category !== 'extra')
      .map((i) => typeOf(i.subtype).label.toLowerCase());
    const images = lookImages(items);
    try {
      return await bridge.describeLookAsync(
        pieces,
        occasionOf(ctx.occasion).label,
        bandOf(ctx.temp).label,
        candidate.score,
        images,
      );
    } catch (multimodalError) {
      // Model may be text-only on this device — retry without pictures once.
      if (images.length === 0) throw multimodalError;
      return await bridge.describeLookAsync(
        pieces,
        occasionOf(ctx.occasion).label,
        bandOf(ctx.temp).label,
        candidate.score,
        [],
      );
    }
  } catch {
    return rulesText;
  }
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

/**
 * On-device tag prefill for "add by link": the garment photo + the page's own
 * listing text go to Gemini Nano, which picks ids from our taxonomy. Any
 * failure (model missing, weird reply) returns null — caller keeps rule-based
 * tags. Runs only when the module is compiled in and the model is downloaded.
 */
export async function suggestTagsNative(
  title: string,
  pageText: string,
  imageUri?: string | null,
): Promise<SuggestedProductTags | null> {
  const bridge = native;
  if (!bridge?.tagProductAsync) return null;
  try {
    const raw = await bridge.tagProductAsync(
      title.slice(0, 160),
      pageText.slice(0, 900),
      imageUri ? [imageUri] : [],
      TYPE_IDS.join(','),
      MATERIAL_IDS.join(','),
      PATTERN_IDS.join(','),
      COLOR_IDS.join(','),
    );
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
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
  } catch {
    return null;
  }
}
