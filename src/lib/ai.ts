// AI layer.
//
// Design (local-first, from the product spec):
//   1. Prefer on-device AI (Apple Foundation Models on iOS 26+, Gemini Nano /
//      AICore on Android) via the local module `modules/styleme-ai`, which is
//      only present in development builds (Expo Go cannot load it). The
//      published hook points:
//        - getAiStatus(): capability readout for Settings
//        - suggestTags(): deterministic tag fallback (always works)
//        - describeLookText(): rules-engine explanation (always works)
//        - describeLookEnhanced(): native phrasing when the model is usable
//   2. Everything degrades gracefully to the deterministic rules engine, so the
//      app remains fully useful offline and on unsupported hardware.

import type { NativeBridge } from './ai-bridge';
import { bandOf, occasionOf, suggestSeasons, typeOf } from './taxonomy';
import type { Item, OutfitCandidate, StyleContext } from './types';

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
  /** native on-device model bridge available */
  nativeAvailable: boolean;
  label: string;
}

export function getAiStatus(): AiStatus {
  if (native?.isOnDeviceTextModelAvailable?.()) {
    return { nativeAvailable: true, label: 'On-device AI (native bridge active)' };
  }
  return {
    nativeAvailable: false,
    label: 'Rules engine (offline, deterministic). Native AI hook ready.',
  };
}

/**
 * Deterministic weeks/season suggestion; the native layer will override this
 * once its vision tagging lands.
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

/**
 * Rules phrasing, upgraded in one sentence by the on-device model when the
 * native bridge says it is usable. Any failure silently returns the rules text.
 */
export async function describeLookEnhanced(
  ctx: StyleContext,
  candidate: OutfitCandidate,
  items: Item[],
): Promise<string> {
  const rulesText = describeLookText(ctx, candidate, items);
  const bridge = native;
  if (!bridge?.describeLookAsync || !getAiStatus().nativeAvailable) return rulesText;
  try {
    const pieces = items
      .filter((i) => i.category !== 'extra')
      .map((i) => typeOf(i.subtype).label.toLowerCase());
    return await bridge.describeLookAsync(
      pieces,
      occasionOf(ctx.occasion).label,
      bandOf(ctx.temp).label,
      candidate.score,
    );
  } catch {
    return rulesText;
  }
}
