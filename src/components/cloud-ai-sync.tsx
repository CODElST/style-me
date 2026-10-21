// CloudAiSync — pushes the persisted Settings into the AI layer once per
// settings change, so lib/ai.ts (and lib/cloud-ai.ts consumers) always see the
// current toggle, endpoint, model, key and photo consent. Kept at the root so
// screens never duplicate this plumbing.

import { useEffect } from 'react';

import { useAppSettings } from '@/hooks/use-settings';
import { setCloudAiConfig } from '@/lib/ai';
// Local-only fallbacks (git-ignored); deleted once keys become user input.
import { HARDCODED_CLOUD_KEY, HARDCODED_CLOUD_MODEL } from '@/lib/cloud-ai.local';
import { AI_PRESETS, cloudConfigOf } from '@/lib/cloud-ai';

export function CloudAiSync() {
  const { settings } = useAppSettings();

  useEffect(() => {
    if (!settings) return;
    // Priority: user-entered values → local hardcoded key → provider presets.
    setCloudAiConfig(
      cloudConfigOf(
        settings.cloudAiEnabled,
        settings.cloudAiEndpoint || AI_PRESETS.gemini.endpoint,
        settings.cloudAiModel || HARDCODED_CLOUD_MODEL || AI_PRESETS.gemini.model,
        settings.cloudAiKey || HARDCODED_CLOUD_KEY,
        settings.cloudAiPhotos,
      ),
    );
  }, [settings]);

  return null;
}
