export interface StyleMeAiCapabilities {
  /** an on-device text model (Apple Intelligence / Gemini Nano) is usable */
  onDeviceTextModel: boolean;
}

export interface DescribeLookParams {
  pieces: string[];
  occasion: string;
  band: string;
  score: number;
}
