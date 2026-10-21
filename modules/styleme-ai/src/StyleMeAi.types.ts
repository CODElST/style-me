/** Gemini Nano/AICore model state, mirroring ML Kit FeatureStatus. */
export type ModelStatus = 'unavailable' | 'downloadable' | 'downloading' | 'available';

/** Outfit context passed to the native stylist prompt. */
export interface DescribeLookParams {
  pieces: string[];
  occasion: string;
  band: string;
  score: number;
  /** local file:// paths of the pieces' photos (empty = text-only request) */
  images: string[];
}

/** Payload for "add by link" tag prefill; reply is parsed in JS. */
export interface TagProductParams {
  title: string;
  pageText: string;
  images: string[];
  typesCsv: string;
  materialsCsv: string;
  patternsCsv: string;
  colorsCsv: string;
}
