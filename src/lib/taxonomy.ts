// Tag taxonomy + default heuristics for garment metadata.
// Deterministic defaults mean the app is useful fully offline; the
// on-device AI layer (see lib/ai.ts) refines these when supported.

import type {
  CategoryId, ColorId, MaterialId, MoodId, OccasionId,
  PatternId, SeasonId, TempBandId,
} from './types';

export interface CategoryDef {
  id: CategoryId;
  label: string;
  icon: string;
}

export interface GarmentTypeDef {
  id: string;
  label: string;
  category: CategoryId;
  warmth: number;
  formality: number;
  /** items that keep rain off / can get wet */
  waterOk?: boolean;
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'top', label: 'Tops', icon: '👕' },
  { id: 'bottom', label: 'Bottoms', icon: '👖' },
  { id: 'dress', label: 'Dresses', icon: '👗' },
  { id: 'outer', label: 'Jackets & coats', icon: '🧥' },
  { id: 'shoes', label: 'Shoes', icon: '👟' },
  { id: 'extra', label: 'Extras', icon: '🧣' },
];

export const TYPES: GarmentTypeDef[] = [
  // tops
  { id: 'tshirt', label: 'T-shirt', category: 'top', warmth: 2, formality: 1 },
  { id: 'polo', label: 'Polo', category: 'top', warmth: 2, formality: 2 },
  { id: 'shirt', label: 'Shirt', category: 'top', warmth: 2, formality: 2 },
  { id: 'blouse', label: 'Blouse', category: 'top', warmth: 2, formality: 3 },
  { id: 'tank', label: 'Tank / camisole', category: 'top', warmth: 1, formality: 1 },
  { id: 'crop', label: 'Crop top', category: 'top', warmth: 1, formality: 1 },
  { id: 'sweater', label: 'Sweater / knit', category: 'top', warmth: 4, formality: 2 },
  { id: 'hoodie', label: 'Hoodie', category: 'top', warmth: 3, formality: 0 },
  { id: 'sweatshirt', label: 'Sweatshirt', category: 'top', warmth: 3, formality: 1 },
  { id: 'vest', label: 'Vest / sleeveless knit', category: 'top', warmth: 3, formality: 2 },
  // bottoms
  { id: 'jeans', label: 'Jeans', category: 'bottom', warmth: 2, formality: 1 },
  { id: 'chinos', label: 'Chinos', category: 'bottom', warmth: 2, formality: 2 },
  { id: 'trousers', label: 'Trousers', category: 'bottom', warmth: 2, formality: 3 },
  { id: 'shorts', label: 'Shorts', category: 'bottom', warmth: 1, formality: 1 },
  { id: 'skirt', label: 'Skirt', category: 'bottom', warmth: 1, formality: 2 },
  { id: 'joggers', label: 'Joggers', category: 'bottom', warmth: 2, formality: 0 },
  { id: 'cargos', label: 'Cargo pants', category: 'bottom', warmth: 2, formality: 0 },
  { id: 'linen-pants', label: 'Linen pants', category: 'bottom', warmth: 1, formality: 2 },
  // dresses
  { id: 'day-dress', label: 'Day dress', category: 'dress', warmth: 1, formality: 1 },
  { id: 'midi-dress', label: 'Midi dress', category: 'dress', warmth: 2, formality: 2 },
  { id: 'knit-dress', label: 'Knit dress', category: 'dress', warmth: 3, formality: 2 },
  { id: 'evening-dress', label: 'Evening dress', category: 'dress', warmth: 2, formality: 4 },
  // outer
  { id: 'shirt-jacket', label: 'Shirt jacket', category: 'outer', warmth: 2, formality: 1 },
  { id: 'denim-jacket', label: 'Denim jacket', category: 'outer', warmth: 2, formality: 1 },
  { id: 'bomber', label: 'Bomber', category: 'outer', warmth: 3, formality: 1 },
  { id: 'blazer', label: 'Blazer', category: 'outer', warmth: 2, formality: 3 },
  { id: 'cardigan', label: 'Cardigan', category: 'outer', warmth: 3, formality: 2 },
  { id: 'trench', label: 'Trench coat', category: 'outer', warmth: 3, formality: 3 },
  { id: 'overcoat', label: 'Overcoat', category: 'outer', warmth: 5, formality: 3 },
  { id: 'puffer', label: 'Puffer', category: 'outer', warmth: 5, formality: 1 },
  { id: 'winter-coat', label: 'Winter coat', category: 'outer', warmth: 5, formality: 2 },
  { id: 'raincoat', label: 'Raincoat', category: 'outer', warmth: 3, formality: 1, waterOk: true },
  // shoes
  { id: 'sneakers', label: 'Sneakers', category: 'shoes', warmth: 2, formality: 1 },
  { id: 'running-shoes', label: 'Running shoes', category: 'shoes', warmth: 2, formality: 0 },
  { id: 'loafers', label: 'Loafers', category: 'shoes', warmth: 2, formality: 2 },
  { id: 'dress-shoes', label: 'Dress shoes', category: 'shoes', warmth: 2, formality: 3 },
  { id: 'boots', label: 'Boots', category: 'shoes', warmth: 3, formality: 2 },
  { id: 'chelsea-boots', label: 'Chelsea boots', category: 'shoes', warmth: 3, formality: 3 },
  { id: 'sandals', label: 'Sandals', category: 'shoes', warmth: 1, formality: 1 },
  { id: 'heels', label: 'Heels', category: 'shoes', warmth: 1, formality: 4 },
  { id: 'flats', label: 'Flats', category: 'shoes', warmth: 1, formality: 2 },
  { id: 'slides', label: 'Slides / flip-flops', category: 'shoes', warmth: 1, formality: 0 },
  // extras
  { id: 'bag', label: 'Bag', category: 'extra', warmth: 1, formality: 2 },
  { id: 'cap', label: 'Cap', category: 'extra', warmth: 1, formality: 0 },
  { id: 'hat', label: 'Sun hat', category: 'extra', warmth: 1, formality: 1 },
  { id: 'beanie', label: 'Beanie', category: 'extra', warmth: 3, formality: 0 },
  { id: 'scarf', label: 'Scarf', category: 'extra', warmth: 3, formality: 2 },
  { id: 'gloves', label: 'Gloves', category: 'extra', warmth: 3, formality: 2 },
  { id: 'belt', label: 'Belt', category: 'extra', warmth: 1, formality: 2 },
  { id: 'watch', label: 'Watch', category: 'extra', warmth: 1, formality: 3 },
  { id: 'sunglasses', label: 'Sunglasses', category: 'extra', warmth: 1, formality: 1 },
  { id: 'jewellery', label: 'Jewellery', category: 'extra', warmth: 1, formality: 3 },
];

export function typeOf(subtype: string): GarmentTypeDef {
  return TYPES.find((t) => t.id === subtype) ?? TYPES[0];
}

export function typesFor(category: CategoryId): GarmentTypeDef[] {
  return TYPES.filter((t) => t.category === category);
}

export const MATERIALS: { id: MaterialId; label: string }[] = [
  { id: 'cotton', label: 'Cotton' },
  { id: 'linen', label: 'Linen' },
  { id: 'denim', label: 'Denim' },
  { id: 'wool', label: 'Wool' },
  { id: 'cashmere', label: 'Cashmere' },
  { id: 'silk', label: 'Silk' },
  { id: 'leather', label: 'Leather' },
  { id: 'suede', label: 'Suede' },
  { id: 'knit', label: 'Knit' },
  { id: 'fleece', label: 'Fleece' },
  { id: 'synthetic', label: 'Synthetic / technical' },
  { id: 'other', label: 'Other' },
];

export const PATTERNS: { id: PatternId; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'striped', label: 'Striped' },
  { id: 'checked', label: 'Checked' },
  { id: 'printed', label: 'Printed' },
];

export const PALETTE: { id: ColorId; hex: string; neutral: boolean }[] = [
  { id: 'white', hex: '#F2F0EB', neutral: true },
  { id: 'cream', hex: '#EFE6D4', neutral: true },
  { id: 'beige', hex: '#D8C7AC', neutral: true },
  { id: 'tan', hex: '#C1A183', neutral: true },
  { id: 'brown', hex: '#77563E', neutral: true },
  { id: 'denim', hex: '#7C90AC', neutral: true },
  { id: 'grey', hex: '#9C9C9C', neutral: true },
  { id: 'black', hex: '#232323', neutral: true },
  { id: 'navy', hex: '#2C3A57', neutral: false },
  { id: 'blue', hex: '#4E78B2', neutral: false },
  { id: 'teal', hex: '#38797C', neutral: false },
  { id: 'green', hex: '#5D7C51', neutral: false },
  { id: 'olive', hex: '#7C7D53', neutral: false },
  { id: 'red', hex: '#B03A33', neutral: false },
  { id: 'orange', hex: '#D57C41', neutral: false },
  { id: 'yellow', hex: '#E2C352', neutral: false },
  { id: 'pink', hex: '#DB9FA9', neutral: false },
  { id: 'purple', hex: '#7C6098', neutral: false },
];

export function hexOf(color: ColorId): string {
  return PALETTE.find((p) => p.id === color)?.hex ?? '#9C9C9C';
}

export function isNeutral(color: ColorId): boolean {
  return PALETTE.find((p) => p.id === color)?.neutral ?? false;
}

/** Which hue family a colored palette id belongs to (for harmony rules). */
const HUE_FAMILY: Partial<Record<ColorId, string>> = {
  navy: 'blue', blue: 'blue', teal: 'teal', green: 'green', olive: 'green',
  red: 'red', orange: 'orange', yellow: 'yellow', pink: 'pink', purple: 'purple',
};

// Complementary hue pairs — used by the outfit engine's color-harmony rule.
const COMPLEMENT: Record<string, string> = {
  red: 'teal', orange: 'blue', yellow: 'purple', pink: 'teal',
  purple: 'yellow', teal: 'red', blue: 'orange', green: 'red',
};

export function hueFamilyOf(color: ColorId): string | null {
  return HUE_FAMILY[color] ?? null;
}

export function complementOf(family: string): string | null {
  return COMPLEMENT[family] ?? null;
}

// ---------------------------------------------------------------- occasions

export const OCCASIONS: { id: OccasionId; label: string; icon: string; window: [number, number] }[] = [
  { id: 'lounge', label: 'Lounging', icon: '🛋️', window: [0, 1] },
  { id: 'errands', label: 'Errands', icon: '🧺', window: [0, 2] },
  { id: 'out', label: 'Out & about', icon: '☕', window: [1, 2] },
  { id: 'work', label: 'Work', icon: '💼', window: [1, 3] },
  { id: 'date', label: 'Date', icon: '🌙', window: [1, 3] },
  { id: 'party', label: 'Party', icon: '🎉', window: [1, 3] },
  { id: 'formal', label: 'Formal', icon: '🥂', window: [3, 4] },
  { id: 'travel', label: 'Travel', icon: '✈️', window: [0, 2] },
  { id: 'sport', label: 'Sport', icon: '🏃', window: [0, 1] },
  { id: 'outdoor', label: 'Outdoors', icon: '🥾', window: [0, 2] },
];

export function occasionOf(id: OccasionId) {
  return OCCASIONS.find((o) => o.id === id)!;
}

// ---------------------------------------------------------------- weather

export const TEMP_BANDS: {
  id: TempBandId; label: string; avgC: number; seasons: SeasonId[];
  outerRequired: boolean; closedShoes: boolean;
}[] = [
  { id: 'cold', label: 'Freezing', avgC: 2, seasons: ['winter'], outerRequired: true, closedShoes: true },
  { id: 'chilly', label: 'Chilly', avgC: 10, seasons: ['autumn', 'winter', 'spring'], outerRequired: false, closedShoes: false },
  { id: 'mild', label: 'Mild', avgC: 19, seasons: ['spring', 'autumn'], outerRequired: false, closedShoes: false },
  { id: 'warm', label: 'Warm', avgC: 25, seasons: ['spring', 'summer'], outerRequired: false, closedShoes: false },
  { id: 'hot', label: 'Hot', avgC: 32, seasons: ['summer'], outerRequired: false, closedShoes: false },
];

export function bandOf(id: TempBandId) {
  return TEMP_BANDS.find((b) => b.id === id)!;
}

// ---------------------------------------------------------------- style

export const MOODS: { id: MoodId; label: string; blurb: string }[] = [
  { id: 'comfort', label: 'Comfort', blurb: 'soft, easy pieces' },
  { id: 'classic', label: 'Classic', blurb: 'clean, timeless lines' },
  { id: 'bold', label: 'Bold', blurb: 'color and pattern, louder shapes' },
  { id: 'minimal', label: 'Minimal', blurb: 'quiet neutrals, no fuss' },
];

export const FORMALITY_LABELS = ['Lounge', 'Casual', 'Smart casual', 'Business', 'Formal'];
export const WARMTH_LABELS = ['Feather', 'Light', 'Mid', 'Warm', 'Heavy'];

// ---------------------------------------------------------------- auto-tagging fallbacks

export const AUTO_SEASON_MATERIAL_COLD: Partial<Record<MaterialId, true>> = {
  wool: true, cashmere: true, knit: true, fleece: true, suede: true, leather: true,
};

export const AUTO_SEASON_MATERIAL_HOT: Partial<Record<MaterialId, true>> = {
  linen: true, silk: true, cotton: true,
};

/**
 * Deterministic season suggestion from warmth + material.
 * Warmth: 1 feather … 5 heavy.
 */
export function suggestSeasons(warmth: number, material: MaterialId | null): SeasonId[] {
  const m = material ?? 'cotton';
  let seasons: SeasonId[];
  if (warmth <= 1) seasons = ['spring', 'summer'];
  else if (warmth <= 2) seasons = ['spring', 'summer', 'autumn'];
  else if (warmth <= 3) seasons = ['spring', 'autumn'];
  else if (warmth <= 4) seasons = ['autumn', 'winter'];
  else seasons = ['winter'];
  if (AUTO_SEASON_MATERIAL_COLD[m]) {
    if (!seasons.includes('autumn')) seasons.push('autumn');
    if (!seasons.includes('winter')) seasons.push('winter');
  }
  if (AUTO_SEASON_MATERIAL_HOT[m]) {
    if (m === 'linen' || m === 'silk') {
      if (!seasons.includes('spring')) seasons.push('spring');
      if (!seasons.includes('summer')) seasons.push('summer');
    }
  }
  return seasons;
}
