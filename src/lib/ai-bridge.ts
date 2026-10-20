// Shape of the optional `modules/styleme-ai` native bridge, as used by the
// JS layer. Kept here so `src/lib/ai.ts` has a typed contract even when the
// module cannot load (Expo Go, web, older devices).

export interface NativeBridge {
  isOnDeviceTextModelAvailable?: () => boolean;
  describeLookAsync?: (
    pieces: string[],
    occasion: string,
    band: string,
    score: number,
  ) => Promise<string>;
}
