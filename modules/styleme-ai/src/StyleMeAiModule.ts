import { NativeModule, requireNativeModule } from 'expo';

import type { ModelStatus } from './StyleMeAi.types';

declare class StyleMeAi extends NativeModule<{}> {
  /** 'unavailable' | 'downloadable' | 'downloading' | 'available' */
  getModelStatusAsync(): Promise<ModelStatus>;
  /** user-consented one-time model download via AICore */
  enableModelAsync(): Promise<boolean>;
  describeLookAsync(
    pieces: string[],
    occasion: string,
    band: string,
    score: number,
    images: string[],
  ): Promise<string>;
  tagProductAsync(
    title: string,
    pageText: string,
    images: string[],
    typesCsv: string,
    materialsCsv: string,
    patternsCsv: string,
    colorsCsv: string,
  ): Promise<string>;
}

export default requireNativeModule<StyleMeAi>('StyleMeAi');
