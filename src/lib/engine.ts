// The local outfit engine.
//
// Pipeline (offline-first): filter available items → keep items suited to the
// weather band and the occasion's formality window → assemble complete
// candidates → score by deterministic rules (color harmony, pattern,
// freshness, mood) → explain the score. The on-device AI layer, when present,
// layers preference tuning and phrasing on top; it never gates usefulness.

import type {
  Item, LookSlots, OccasionId, OutfitCandidate, StyleContext,
} from './types';
import {
  FORMALITY_LABELS, bandOf, complementOf, hueFamilyOf, isNeutral,
  occasionOf, typeOf,
} from './taxonomy';
import { daySeed, seededShuffle } from './util';

const GRADES: [number, string, string][] = [
  [88, 'Excellent', 'accent'],
  [74, 'Great', 'accent'],
  [58, 'Good', 'neutral'],
  [0, 'Fair', 'neutral'],
];

const CLOSED_SHOES = new Set([
  'boots', 'chelsea-boots', 'sneakers', 'running-shoes', 'dress-shoes', 'loafers',
]);

const IDEAL_WARMTH: Record<'top' | 'bottom' | 'shoes' | 'outer', Record<string, number>> = {
  top: { cold: 3.8, chilly: 3, mild: 2.2, warm: 1.4, hot: 0.8 },
  bottom: { cold: 3.4, chilly: 2.7, mild: 2.1, warm: 1.3, hot: 0.8 },
  shoes: { cold: 3.2, chilly: 2.7, mild: 2, warm: 1.3, hot: 1 },
  outer: { cold: 4.6, chilly: 3.6, mild: 2.4, warm: 1.2, hot: 1 },
};

export interface EvaluateResult {
  ok: boolean;
  issue?: string;
  candidate?: OutfitCandidate;
}

function fashionItems(slots: LookSlots): Item[] {
  return ([
    slots.dress, slots.top, slots.bottom, slots.outer, slots.shoes,
  ].filter(Boolean) as Item[]);
}

function seasonPass(item: Item, seasons: string[]): boolean {
  return item.seasons.length === 0 || item.seasons.some((s) => seasons.includes(s));
}

function formalityDistance(value: number, window: [number, number]): number {
  if (value < window[0]) return window[0] - value;
  if (value > window[1]) return value - window[1];
  return 0;
}

// ---------------------------------------------------------------- harmony

interface HarmonyResult { score: number; reason: string | null; tag: string | null }

function harmonyScore(items: Item[], ctx: StyleContext): HarmonyResult {
  const primaries = items.map((i) => i.colors[0]).filter(Boolean) as Item['colors'];
  const saturated = primaries.filter((c) => !isNeutral(c));
  const families = [...new Set(saturated.map(hueFamilyOf).filter(Boolean))] as string[];
  let score = 0;
  let reason: string | null = null;
  let tag: string | null = null;

  if (saturated.length === 0) {
    score = 10;
    reason = 'Quiet all-neutral palette — hard to get wrong';
    tag = 'neutral base';
  } else if (families.length === 1) {
    score = 9;
    reason = `${cap(primaries[0])} as the single accent keeps it considered`;
    tag = 'one accent';
  } else if (families.length === 2) {
    if (families[0] === families[1]) {
      score = 7;
      reason = 'Tone-on-tone layers read as deliberate';
      tag = 'tone-on-tone';
    } else if (complementOf(families[0]) === families[1]) {
      score = 8;
      reason = `Complementary ${saturated[0]} and ${saturated[1]} pop in a controlled way`;
      tag = 'complementary';
      if (ctx.mood === 'bold') score += 2;
    } else if (hueNeighbors(families[0], families[1])) {
      score = 4;
      reason = 'Near-adjacent hues blend softly';
    } else {
      score = 0;
      reason = 'Two competing hues — works if values differ enough';
    }
  } else {
    score = ctx.mood === 'bold' ? 2 : -6;
    reason = ctx.mood === 'bold' ? 'Maximalist color story' : 'Lots of competing color';
  }

  if (ctx.mood === 'minimal') {
    score += saturated.length <= 1 ? 3 : -3;
  }
  if (ctx.mood === 'comfort' && saturated.length <= 1) {
    score += 1;
  }

  // pattern discipline
  const patterns = items.filter((i) => i.pattern !== 'solid');
  if (patterns.length > 1) {
    score -= 5;
    reason = 'More than one pattern is tricky to balance';
  } else if (patterns.length === 1) {
    const formal = items.reduce((a, b) => a + b.formality, 0) / items.length;
    if (formal >= 3.5) {
      score -= 3;
      reason = 'Pattern at this level of dress reads busy';
    } else if (saturated.length <= 1) {
      score += 2;
      reason = 'A single pattern against solids adds depth';
      tag = 'pattern play';
    }
  }
  return { score: Math.max(-10, Math.min(14, score)), reason, tag };
}

const HUE_RING = ['yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'teal', 'green'];

function hueNeighbors(a: string, b: string): boolean {
  const ia = HUE_RING.indexOf(a);
  const ib = HUE_RING.indexOf(b);
  return ia >= 0 && ib >= 0 && (Math.abs(ia - ib) === 1 || Math.abs(ia - ib) === 7);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------- core scoring

/**
 * Scores a concrete set of picked items for a style context. `null` means the
 * combination is not weather-feasible (e.g. sandals when freezing).
 */
export function evaluateLook(ctx: StyleContext, slots: LookSlots): OutfitCandidate | null {
  const check = validate(ctx, slots);
  if (!check.ok) return null;

  const band = bandOf(ctx.temp);
  const occ = occasionOf(ctx.occasion);
  const items = fashionItems(slots);
  const woExtra = items;

  // formality
  const avgFormality = woExtra.reduce((a, b) => a + b.formality, 0) / woExtra.length;
  const dist = formalityDistance(avgFormality, occ.window);
  const formalityScore = 16 - dist * 7;

  // weather
  const roleOf = (i: Item): 'top' | 'bottom' | 'shoes' | 'outer' => {
    if (i.category === 'top') return 'top';
    if (i.category === 'dress') return 'top';
    if (i.category === 'bottom') return 'bottom';
    if (i.category === 'shoes') return 'shoes';
    return 'outer';
  };
  let wCost = 0;
  for (const item of woExtra) {
    const role = roleOf(item);
    wCost += Math.abs(item.warmth - IDEAL_WARMTH[role][ctx.temp]);
  }
  const avgWCost = wCost / woExtra.length;
  let weatherScore = 14 - avgWCost * 4.2;
  if (slots.outer) {
    if (band.avgC >= 24) weatherScore -= 4; // unneeded layer
    else if (band.outerRequired) weatherScore += 3;
  }

  const harmony = harmonyScore(woExtra, ctx);

  // freshness
  const now = Date.now();
  let freshPerItem = 0;
  for (const item of woExtra) {
    if (item.wearCount === 0) freshPerItem += 5;
    else {
      const days = (now - (item.lastWornAt ?? now)) / 86_400_000;
      if (days < 3) freshPerItem -= 3;
      else if (days < 7) freshPerItem += 0.5;
      else if (days < 18) freshPerItem += 2.5;
      else freshPerItem += 3.5;
    }
  }
  const freshScore = Math.max(-6, Math.min(6, freshPerItem / woExtra.length));

  const favCount = woExtra.filter((i) => i.favorite).length;
  const favScore = favCount >= 3 ? 3 : favCount * 1.2;

  const total = 52 + formalityScore + weatherScore + harmony.score + favScore + freshScore;
  const score = Math.max(5, Math.min(99, Math.round(total)));

  const grade = GRADES.find(([min]) => score >= min)![1];

  // reasons
  const reasons: string[] = [];
  if (harmony.reason && harmony.score >= 4) reasons.push(harmony.reason);
  if (dist <= 0) {
    reasons.push(`All pieces sit at "${FORMALITY_LABELS[Math.round(avgFormality)]}" — right for ${occ.label.toLowerCase()}`);
  } else {
    const nearest = avgFormality < occ.window[0] ? occ.window[0] : occ.window[1];
    reasons.push(`Leans ${FORMALITY_LABELS[Math.round(avgFormality)].toLowerCase()} while ${occ.label.toLowerCase()} calls for ${FORMALITY_LABELS[nearest].toLowerCase()}`);
  }
  if (band.outerRequired) reasons.push(`Layered for ${band.avgC}°C — a warm outer coat is doing the work`);
  else if (band.avgC <= 12 && slots.outer) reasons.push(`An outer layer takes off the ${band.avgC}°C chill`);
  else if (band.avgC >= 29) reasons.push(`Light, breathable pieces for ${band.avgC}°C`);
  if (freshScore <= -2) reasons.push('You have worn something from this look in the last few days');
  else if (freshScore >= 2.5) reasons.push('Good rotation — most of these are overdue for a wear');
  if (harmony.reason && harmony.score < 4) reasons.push(harmony.reason);

  const tags = [harmony.tag, freshScore >= 2.5 ? 'fresh rotation' : null].filter(Boolean) as string[];

  // other occasions it would suit
  const venues = OCCASION_IDS.filter((id) => {
    if (id === ctx.occasion) return false;
    const w = occasionOf(id).window;
    return formalityDistance(avgFormality, w) <= 1.1;
  });

  const itemIds = [
    slots.dress, slots.top, slots.bottom, slots.outer, slots.shoes, slots.extra,
  ].filter(Boolean).map((i) => (i as Item).id);

  return {
    key: itemIds.join('|'),
    itemIds,
    items: [...woExtra, ...(slots.extra ? [slots.extra] : [])],
    score,
    grade,
    reasons: reasons.slice(0, 4),
    venues,
    tags,
  };
}

const OCCASION_IDS: OccasionId[] = ['lounge', 'errands', 'out', 'work', 'date', 'party', 'formal', 'travel', 'sport', 'outdoor'];

/** Explains why a manual pick can't be scored (used by the builder UI). */
function validate(ctx: StyleContext, slots: LookSlots): EvaluateResult {
  const band = bandOf(ctx.temp);
  const coverageOk = (slots.top && slots.bottom) || !!slots.dress;
  if (!coverageOk) {
    return { ok: false, issue: slots.dress || slots.top
      ? 'Add the missing half — a dress covers both, or pair a top with bottoms.'
      : 'Pick the essentials first: a top and bottoms (or a dress).' };
  }
  if (!slots.shoes) return { ok: false, issue: 'Shoes are required — pick a pair to complete the look.' };
  if (band.outerRequired) {
    if (!slots.outer) return { ok: false, issue: `It's ${band.avgC}°C — you need a proper coat or jacket for this.` };
    if (slots.outer.warmth < 3.5) return { ok: false, issue: 'That outer layer is too light for this temperature.' };
  }
  if (band.closedShoes && !CLOSED_SHOES.has(slots.shoes.subtype)) {
    return { ok: false, issue: `Open shoes at ${band.avgC}°C? Closed footwear for this one.` };
  }
  if (band.avgC >= 29 && (slots.top?.warmth ?? slots.dress?.warmth ?? 1) >= 4) {
    return { ok: false, issue: 'That knit would be sweltering in this heat.' };
  }
  if (band.avgC <= 5 && (slots.top?.warmth ?? slots.dress?.warmth ?? 3) <= 1) {
    return { ok: false, issue: 'A base layer that thin will leave you cold — pick something warmer.' };
  }
  if (slots.dress && slots.top) {
    return { ok: false, issue: 'Either a dress or a separate top — not both.' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- generation

export interface GenerateResult {
  looks: OutfitCandidate[];
  hint: string | null;
}

function partition(items: Item[]) {
  const buckets: Record<string, Item[]> = { top: [], bottom: [], dress: [], outer: [], shoes: [], extra: [] };
  for (const item of items) buckets[item.category].push(item);
  return buckets;
}

function capList(list: Item[], seasons: string[], limit: number, ctx: StyleContext): Item[] {
  const occ = occasionOf(ctx.occasion);
  const eq = (i: Item) => formalityDistance(i.formality, occ.window) * 6
    + Math.abs(i.warmth - IDEAL_WARMTH[roleKey(i)][ctx.temp]) * 2;
  return list
    .filter((i) => seasonPass(i, seasons))
    .sort((a, b) => eq(a) - eq(b))
    .slice(0, limit);
}

function roleKey(i: Item): 'top' | 'bottom' | 'shoes' | 'outer' {
  if (i.category === 'top' || i.category === 'dress') return 'top';
  if (i.category === 'bottom') return 'bottom';
  if (i.category === 'shoes') return 'shoes';
  return 'outer';
}

/**
 * Generates ranked looks for a context. Deterministic per-day (seeded shuffle)
 * so Today feels fresh without being random noise. Pass `seed` to reshuffle.
 */
export function generateLooks(
  ctx: StyleContext,
  allItems: Item[],
  maxLooks = 8,
  seed?: number,
): GenerateResult {
  const band = bandOf(ctx.temp);
  const avail = allItems.filter((i) => i.available);
  const p = partition(avail);

  if (p.shoes.length === 0) return { looks: [], hint: 'No available shoes yet — add a pair so looks can be completed.' };
  if (!(p.top.length && p.bottom.length) && !p.dress.length) {
    return { looks: [], hint: 'Add a top and bottoms (or a dress) and I can start pairing.' };
  }

  const activeSeed = seed ?? daySeed();
  const seasons = band.seasons;
  const tops = seededShuffle(capList(p.top, seasons, 10, ctx), activeSeed);
  const bottoms = seededShuffle(capList(p.bottom, seasons, 10, ctx), activeSeed + 1);
  const dresses = seededShuffle(capList(p.dress, seasons, 8, ctx), activeSeed + 2);
  const shoes = seededShuffle(
    band.closedShoes ? p.shoes.filter((s) => CLOSED_SHOES.has(s.subtype)) : p.shoes,
    activeSeed + 3,
  ).slice(0, 6);
  const outers = seededShuffle(capList(p.outer, seasons, 5, ctx), activeSeed + 4);

  if (!tops.length && !dresses.length) return { looks: [], hint: `Nothing season-right for ${band.label.toLowerCase()} weather. Try a milder temperature or add warmer pieces.` };
  if (!shoes.length) return { looks: [], hint: `No closed shoes for ${band.label.toLowerCase()} weather — sandals and slides can't do this one.` };

  // base combos top×bottom×shoes, no outer
  const baseCandidates: OutfitCandidate[] = [];
  const pushCombo = (slots: LookSlots) => {
    const c = evaluateLook(ctx, slots);
    if (c) baseCandidates.push(c);
  };

  const shoeCap = shoes.slice(0, 5);
  for (const top of tops) {
    for (const bottom of bottoms) {
      pushCombo({ top, bottom, shoes: shoeCap[0], extra: undefined });
      if (shoeCap[1]) pushCombo({ top, bottom, shoes: shoeCap[1] });
    }
  }
  for (const dress of dresses) {
    for (const s of shoeCap) pushCombo({ dress, shoes: s });
  }

  if (!baseCandidates.length) return { looks: [], hint: 'The pieces you have do not form a complete look for this. Try changing the occasion or temperature.' };

  baseCandidates.sort((a, b) => b.score - a.score);
  const base = baseCandidates.slice(0, 24);

  // ERM: attach outerwear variants for cold-ish bands
  const withOuter: OutfitCandidate[] = [];
  const needs = band.outerRequired ? 'required' : band.avgC <= 16 ? 'optional' : 'none';
  for (const c of base) {
    const slots = candidateSlots(ctx, c);
    if (needs === 'none') {
      withOuter.push(c);
      continue;
    }
    if (needs === 'required' || (needs === 'optional' && withOuter.length % 2 === 0)) {
      let best: OutfitCandidate | null = null;
      for (const o of outers) {
        const evaluated = evaluateLook(ctx, { ...slots, outer: o });
        if (evaluated && (!best || evaluated.score > best.score)) best = evaluated;
      }
      if (needs === 'required') {
        if (best) withOuter.push(best);
      } else {
        if (best && withOuter.length % 2 === 0) withOuter.push(best);
        withOuter.push(c);
      }
    } else {
      withOuter.push(c);
    }
  }

  // diversity: dedupe, limit repeats per item
  const uses = new Map<string, number>();
  const results: OutfitCandidate[] = [];
  withOuter.sort((a, b) => b.score - a.score);
  for (const c of withOuter) {
    if (results.some((r) => r.key === c.key)) continue;
    const overused = c.itemIds.some((id) => (uses.get(id) ?? 0) >= 3);
    if (overused) continue;
    for (const id of c.itemIds) uses.set(id, (uses.get(id) ?? 0) + 1);
    results.push(c);
    if (results.length >= maxLooks) break;
  }
  return { looks: results, hint: results.length ? null : 'These pieces do not complete each other for this context — try another temperature, or top up the closet.' };
}

/** Rebuilds slots from a candidate for re-evaluation (outer variants). */
function candidateSlots(_ctx: StyleContext, c: OutfitCandidate): LookSlots {
  const slots: LookSlots = {};
  for (const item of c.items) {
    if (item.category === 'top') slots.top = item;
    else if (item.category === 'bottom') slots.bottom = item;
    else if (item.category === 'dress') slots.dress = item;
    else if (item.category === 'outer') slots.outer = item;
    else if (item.category === 'shoes') slots.shoes = item;
    else slots.extra = item;
  }
  return slots;
}

/**
 * Style note text for an outfit — deterministic description used everywhere
 * (and replaced by richer on-device AI phrasing when the native layer exists).
 */
export function describeLook(ctx: StyleContext, c: OutfitCandidate): string {
  const pieces = c.items.map((i) => `${i.colors[0] ?? ''} ${typeOf(i.subtype).label.toLowerCase()}`.trim());
  const band = bandOf(ctx.temp);
  const lead = GRADES.find(([min]) => c.score >= min)![1];
  const tail = c.tags.map((t) => t).join(', ');
  return `${lead} for ${band.label.toLowerCase()} weather — ${pieces.join(', ')}${tail ? ` (${tail})` : ''}.`;
}
