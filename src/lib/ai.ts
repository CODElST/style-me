// AI layer.
//
// Design (local-first, from the product spec):
//   1. Prefer on-device AI (Apple Foundation Models on iOS, Gemini Nano /
//      ML Kit on Android) via a native module — added as a dev-build native
//      module later (see README "Step 4"). The app publishes the hook points:
//        - getAiStatus(): capability readout for Settings
//        - suggestSeasonsHeuristics(): deterministic tag fallback (always works)
//        - describeLookText(): text explanation (rules engine by default)
//   2. Everything degrades gracefully to the deterministic rules engine, so the
//      app remains fully useful offline and on unsupported hardware.

import type { Item, OutfitCandidate, StyleContext } from './types';
import { bandOf, occasionOf, suggestSeasons, typeOf } from './taxonomy';

// Hook point for the native module. Once `npx create-expo-module styleme-ai`
// (or similar) is added to the workspace and installed, import it here behind
// a lazy require so JS-only builds never crash.
let native: any = null;
try {
  // optional native peer; add the real module in step 4 (see README)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native = require('styleme-ai');
} catch {
  native = null;
}

export interface AiStatus {
  /** native on-device model bridge available */
  nativeAvailable: boolean;
  label: string;
}

export function getAiStatus(): AiStatus {
  if (native?.getCapabilities?.()?.onDeviceTextModel) {
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
