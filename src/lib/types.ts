// Core domain types for StyleMe.
//
// The wardrobe is local-first: everything here is stored in on-device SQLite
// and app-private files. Cloud sync (if ever added) will build on this model.

export type CategoryId = 'top' | 'bottom' | 'dress' | 'outer' | 'shoes' | 'extra';
export type PatternId = 'solid' | 'striped' | 'checked' | 'printed';
export type MaterialId =
  | 'cotton' | 'linen' | 'denim' | 'wool' | 'cashmere'
  | 'silk' | 'leather' | 'suede' | 'synthetic' | 'knit' | 'fleece' | 'other';
export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';
export type OccasionId =
  | 'lounge' | 'errands' | 'out' | 'work' | 'date'
  | 'party' | 'formal' | 'travel' | 'sport' | 'outdoor';
export type TempBandId = 'cold' | 'chilly' | 'mild' | 'warm' | 'hot';
export type MoodId = 'comfort' | 'classic' | 'bold' | 'minimal';
export type ColorId =
  | 'white' | 'cream' | 'beige' | 'tan' | 'brown' | 'grey' | 'black'
  | 'navy' | 'blue' | 'denim' | 'teal' | 'green' | 'olive'
  | 'red' | 'orange' | 'yellow' | 'pink' | 'purple';

/** A link shown as a reference on an item (web lookup). We never store the image itself, only the source URL. */
export interface LookupRef {
  title: string;
  url: string;
  source: string;
  thumb?: string;
}

export interface Item {
  id: string;
  /** Locally stored photo (app-private file on device). */
  image: string;
  category: CategoryId;
  /** Garment type id, see taxonomy.TYPES */
  subtype: string;
  /** 1–3 colors chosen from the palette */
  colors: ColorId[];
  pattern: PatternId;
  material: MaterialId | null;
  /** 1 (feather-light) .. 5 (heavy) */
  warmth: number;
  /** 0 lounge .. 4 formal */
  formality: number;
  seasons: SeasonId[];
  /** true = clean & available, false = in laundry / unpacked / stored away */
  available: boolean;
  favorite: boolean;
  wearCount: number;
  lastWornAt: number | null;
  /** user's own words (persistent, optional) */
  note: string;
  /** AI-written stylist description, authored once at add time (photo + listing
   *  text are studied there); reused as text for tags and look picking. */
  desc: string;
  /** Preferred web reference (product page), stored as URL only. */
  lookUrl: string | null;
  refs: LookupRef[];
  createdAt: number;
  updatedAt: number;
}

export interface Outfit {
  id: string;
  title: string;
  itemIds: string[];
  occasion: OccasionId;
  mood: MoodId;
  favorite: boolean;
  wearCount: number;
  lastWornAt: number | null;
  note: string;
  createdAt: number;
}

export interface WearEntry {
  id: string;
  outfitId: string | null;
  itemIds: string[];
  wornAt: number;
  occasion: OccasionId;
  temp: TempBandId;
}

export interface StyleContext {
  occasion: OccasionId;
  temp: TempBandId;
  mood: MoodId;
}

export interface OutfitCandidate {
  key: string;
  itemIds: string[];
  items: Item[];
  /** 0–99 */
  score: number;
  /** grade label derived from score */
  grade: string;
  reasons: string[];
  /** other occasions this look would also work for */
  venues: OccasionId[];
  tags: string[];
  /** present only on AI-proposed looks: the AI's own styling rationale */
  aiNote?: string;
}

export interface LookSlots {
  top?: Item;
  bottom?: Item;
  dress?: Item;
  outer?: Item;
  shoes?: Item;
  extra?: Item;
}

export interface AppSettings {
  /** consent to send a cropped photo to the lookup service */
  lookupConsent: boolean;
  lookupEndpoint: string;
  /** optional cloud AI (OpenRouter/Groq-style OpenAI-compatible endpoint) */
  cloudAiEnabled: boolean;
  cloudAiEndpoint: string;
  cloudAiModel: string;
  cloudAiKey: string;
  /** include item photos with cloud requests (photos leave the phone) */
  cloudAiPhotos: boolean;
  /** last context used on Today (persists across sessions) */
  lastOccasion: OccasionId;
  lastTemp: TempBandId;
  lastMood: MoodId;
}
