// Product-link orchestration — the "add by link" pipeline.
//
// Privacy model (matches the app's local-first spec):
//   • ONE page fetch, done by the app itself with a browser user agent — no
//     proxy, no server, nothing stored remotely.
//   • ONE image download of the picture the user picked.
//   • Cropping, resizing, storage and pixel/tag analysis all happen on device.

import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import jpeg from 'jpeg-js';

import { finalizePhoto } from './photos';
import {
  type ExtractedPage,
  type PixelTags,
  analyzePixels,
  parseProductHtml,
} from './product-html';

const UA = 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

/** Fetch the product page once and parse it. Throws readable errors. */
export async function fetchProduct(url: string): Promise<ExtractedPage> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(
        res.status === 403 || res.status === 429
          ? 'the site blocked automated access'
          : `site answered HTTP ${res.status}`,
      );
    }
    html = await res.text();
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('timed out');
    throw new Error((e as Error).message || 'network error');
  } finally {
    clearTimeout(timer);
  }

  const page = parseProductHtml(html.slice(0, 900_000), url);
  if (!page.title && page.images.length === 0) {
    throw new Error('page renders with JavaScript — screenshot it and use the library instead');
  }
  return page;
}

/** Download the chosen picture to cache and run the standard photo pipeline. */
export async function downloadAndPrepare(url: string, id: string): Promise<string> {
  const dir = new Directory(Paths.cache, 'product');
  if (!dir.exists) dir.create();
  const file = await File.downloadFileAsync(url, dir);

  const ext = (file.extension ?? '').toLowerCase();
  if (['.html', '.htm', '.json', '.xml', ''].includes(ext)) {
    if (file.size < 20000) {
      try { file.delete(); } catch { /* cache cleanup later is fine */ }
      throw new Error('not a picture — try a different product image');
    }
  }
  const stored = await finalizePhoto(file.uri, id);
  try { file.delete(); } catch { /* non-critical */ }
  return stored;
}

/**
 * On-device pixel analysis of a stored photo:
 * resize tiny → JPEG decode → dominant colors + pattern heuristic.
 */
export async function analyzeImageFile(uri: string): Promise<PixelTags> {
  const ctx = ImageManipulator.manipulate(uri, { maxWidth: 96, maxHeight: 128 });
  const loaded = await ctx.renderAsync();
  const saved = await loaded.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  const bytes = await new File(saved.uri).bytes();
  const decoded = jpeg.decode(bytes, { useTArray: true });
  return analyzePixels(decoded.data, decoded.width, decoded.height);
}
