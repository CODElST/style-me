// CloudAiSync — pushes the persisted Settings into the AI layer once per
// settings change, so lib/ai.ts (and lib/cloud-ai.ts consumers) always see the
// current toggle, endpoint, model, key and photo consent. Kept at the root so
// screens never duplicate this plumbing.

import { useEffect } from 'react';

import { useAppSettings } from '@/hooks/use-settings';
import { setCloudAiConfig } from '@/lib/ai';
// Local-only fallbacks (git-ignored); deleted once keys become user input.
import { HARDCODED_CLOUD_MODEL, HARDCODED_KEYS } from '@/lib/cloud-ai.local';
import { AI_PRESETS, cloudConfigOf, presetSupportsVision, type CloudPresetId } from '@/lib/cloud-ai';

export function CloudAiSync() {
  const { settings } = useAppSettings();

  useEffect(() => {
    if (!settings) return;
    // Priority: user-entered values → local hardcoded key → provider presets.
    const endpoint = settings.cloudAiEndpoint || AI_PRESETS.gemini.endpoint;
    // The key must match the ACTIVE provider; resolve which preset is live.
    const presetId = (
      (Object.entries(AI_PRESETS).find(([, p]) => p.endpoint === endpoint)?.[0] ?? 'gemini')
    ) as CloudPresetId;
    const model = settings.cloudAiModel || HARDCODED_CLOUD_MODEL || AI_PRESETS.gemini.model;
    setCloudAiConfig(
      cloudConfigOf(
        settings.cloudAiEnabled,
        endpoint,
        model,
        settings.cloudAiKey || HARDCODED_KEYS[presetId] || '',
        settings.cloudAiPhotos,
        presetSupportsVision(endpoint, model),
      ),
    );
  }, [settings]);

  return null;
}
