// Shape of the optional `modules/styleme-ai` native bridge, as used by the
// JS layer. Kept here so `src/lib/ai.ts` has a typed contract even when the
// module cannot load (Expo Go, web, older devices).

import type { ModelStatus } from '../../modules/styleme-ai';

export interface NativeBridge {
  getModelStatusAsync?: () => Promise<ModelStatus>;
  enableModelAsync?: () => Promise<boolean>;
  describeLookAsync?: (
    pieces: string[],
    occasion: string,
    band: string,
    score: number,
    images: string[],
  ) => Promise<string>;
  tagProductAsync?: (
    title: string,
    pageText: string,
    images: string[],
    typesCsv: string,
    materialsCsv: string,
    patternsCsv: string,
    colorsCsv: string,
  ) => Promise<string>;
}
