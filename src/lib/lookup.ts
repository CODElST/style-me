// Visual web lookup (Step 5 in the product plan).
//
// Consent model:
//  - The wardrobe item and its photo NEVER leave the phone except:
//    when the user explicitly taps "Find clearer product images", we send a
//    one-time, downscaled copy of the cropped garment photo to a small
//    stateless proxy, which forwards it to the web-search provider,
//    returns matches, and keeps nothing. The API key lives on the proxy.
//  - We only store source URLs / thumbnails, shown as linked references.
//    The item's photo stays the user's own, on the phone.

import * as ImageManipulatorPkg from 'expo-image-manipulator';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getSettings } from './db';
import type { LookupRef } from './types';

const ImageManipulator = ImageManipulatorPkg.ImageManipulator;
const SaveFormat = ImageManipulatorPkg.SaveFormat;

export type LookupOutcome =
  | { ok: true; pages: LookupRef[]; entities: string[] }
  | { ok: false; error: string };

function hostOf(url: string): string {
  const m = /https?:\/\/([^/?#]+)/.exec(url);
  return m ? m[1].replace(/^www\./, '') : 'web';
}

/** Downscale the photo and send it to the stateless proxy for web matching. */
export async function webLookup(
  db: SQLiteDatabase,
  imageUri: string,
  explicitEndpoint?: string,
): Promise<LookupOutcome> {
  const settings = await getSettings(db);
  const endpoint = (explicitEndpoint ?? settings.lookupEndpoint).trim();
  if (!endpoint) {
    return { ok: false, error: 'No lookup service configured yet — add the endpoint in Settings.' };
  }

  // Downscale aggressively: the lookup only needs a recognisable garment.
  const context = ImageManipulator.manipulate(imageUri, { maxWidth: 512 });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.7,
    base64: true,
  });
  if (!saved.base64) return { ok: false, error: 'Could not prepare the photo for lookup.' };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(`${endpoint.replace(/\/$/, '')}/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: saved.base64 }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 502) return { ok: false, error: 'Lookup service could not reach the provider.' };
      if (res.status === 429) return { ok: false, error: 'Lookup service is rate-limited — try again shortly.' };
      return { ok: false, error: `Lookup failed (${res.status}). ${text.slice(0, 120)}` };
    }
    const data = (await res.json()) as {
      pages?: ({ title?: string; url?: string; source?: string; thumb?: string })[];
      entities?: ({ name?: string } | string)[];
    };

    const pages: LookupRef[] = (data.pages ?? [])
      .filter((p) => p.url)
      .map((p) => ({
        title: p.title || 'Untitled result',
        url: p.url!,
        source: p.source || hostOf(p.url!),
        thumb: p.thumb,
      }));
    const entities = (data.entities ?? [])
      .map((e) => (typeof e === 'string' ? e : e.name ?? ''))
      .filter(Boolean)
      .slice(0, 6);

    return { ok: true, pages, entities };
  } catch (err) {
    const msg = (err as Error)?.name === 'AbortError'
      ? 'Lookup timed out.'
      : 'Lookup failed — is the endpoint reachable from this device?';
    return { ok: false, error: msg };
  }
}
