// Pinterest outfit inspiration — zero APIs, zero scraping. Wardrobe tags
// already read like search terms ("navy flannel", "smart casual winter
// layers"), so we hand Pinterest a curated query and let its search surface
// real outfit photography styled by real people. The Pinterest app is tried
// first via deep link (no manifest <queries> needed — a missing app just
// rejects the open and we fall back to the in-app browser session).

import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { typeOf, occasionOf } from './taxonomy';
import type { Item, OccasionId } from './types';

const SEASON_WORDS: Record<string, string> = {
  spring: 'spring',
  summer: 'summer',
  autumn: 'autumn / fall',
  winter: 'winter',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "navy flannel" — human naming phrased the way people search. */
function searchWords(item: Item): string {
  const typeLabel = typeOf(item.subtype).label;
  const color = item.colors[0];
  if (!color || typeLabel.toLowerCase().includes(color)) return typeLabel;
  return `${cap(color)} ${typeLabel}`;
}

/** Curated searches for one piece — specific enough to be inspiring. */
export function queriesForItem(item: Item): string[] {
  const piece = searchWords(item);
  const queries: string[] = [`${piece} outfit`];

  const season = SEASON_WORDS[item.seasons[0] ?? ''];
  if (season) queries.push(`${season} ${piece} outfit`);

  const materialId = item.material;
  if (materialId && !piece.toLowerCase().includes(materialId)) {
    queries.push(`${cap(materialId)} ${piece.toLowerCase()} styled`);
  }

  return queries.slice(0, 3);
}

/** Curated searches for a whole look — the pairing + the occasion. */
export function queriesForLook(items: Item[], occasion: OccasionId | null): string[] {
  const fashion = items.filter((i) => i.category !== 'extra');
  const queries: string[] = [];

  if (fashion.length >= 2) {
    queries.push(
      `${searchWords(fashion[0])} and ${searchWords(fashion[1])} outfit`,
    );
  } else if (fashion.length === 1) {
    queries.push(`${searchWords(fashion[0])} outfit`);
  }

  if (occasion) {
    const occ = occasionOf(occasion).label.toLowerCase().replace(' & ', ' and ');
    queries.push(`${occ} outfit ideas`);
  }

  const main = fashion[0] ? searchWords(fashion[0]) : null;
  if (main) queries.push(`how to style ${main}`);

  return queries.slice(0, 3);
}

/** Opens the query in the Pinterest app when installed, web session otherwise. */
export async function openPinterest(query: string): Promise<void> {
  const q = encodeURIComponent(query);
  try {
    await Linking.openURL(`pinterest://search/pins/?q=${q}`);
  } catch {
    void WebBrowser.openBrowserAsync(`https://www.pinterest.com/search/pins/?q=${q}`);
  }
}
