import * as Crypto from 'expo-crypto';

export function uid(): string {
  return Crypto.randomUUID();
}

/** Current timestamp in ms. Kept as a helper so event handlers stay lint-pure. */
export function now(): number {
  return Date.now();
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function mean(list: number[]): number {
  if (list.length === 0) return 0;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

/** Deterministic small PRNG so recommendation order varies by day but is stable within a day. */
export function daySeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function seededShuffle<T>(list: T[], seed: number): T[] {
  const arr = [...list];
  let s = seed >>> 0 || 1;
  const rand = () => {
    // mulberry32
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function relativeDate(ts: number | null): string {
  if (!ts) return 'never';
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function shortDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Fuzzy match over a label for closet search. */
export function matches(haystack: string, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}
