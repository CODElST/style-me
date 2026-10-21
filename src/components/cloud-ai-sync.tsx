// CloudAiSync — pushes the persisted Settings into the AI layer once per
// settings change, so lib/ai.ts (and lib/cloud-ai.ts consumers) always see the
// current toggle, endpoint, model, key and photo consent. Kept at the root so
// screens never duplicate this plumbing.

import { useEffect } from 'react';

import { useAppSettings } from '@/hooks/use-settings';
import { setCloudAiConfig } from '@/lib/ai';
import { AI_PRESETS, cloudConfigOf } from '@/lib/cloud-ai';

export function CloudAiSync() {
  const { settings } = useAppSettings();

  useEffect(() => {
    if (!settings) return;
    // Empty endpoint/model means "provider presets" — default to Gemini.
    setCloudAiConfig(
      cloudConfigOf(
        settings.cloudAiEnabled,
        settings.cloudAiEndpoint || AI_PRESETS.gemini.endpoint,
        settings.cloudAiModel || AI_PRESETS.gemini.model,
        settings.cloudAiKey,
        settings.cloudAiPhotos,
      ),
    );
  }, [settings]);

  return null;
}
