// Settings — privacy choices, AI availability, lookup endpoint, stats.

import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { Card, Chip, ChipRow, Divider, PrimaryButton, Row, SectionLabel } from '@/components/kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppSettings } from '@/hooks/use-settings';
import { enableOnDeviceModel, getAiModelStatus, type AiModelStatus } from '@/lib/ai';
import { AI_PRESETS, cloudChat, cloudConfigOf, presetSupportsVision, type CloudPresetId } from '@/lib/cloud-ai';
// Local-only fallbacks (git-ignored) — removed once the key becomes user input.
import { HARDCODED_KEYS } from '@/lib/cloud-ai.local';
import { getStats, listItems } from '@/lib/db';
import { deletePhoto } from '@/lib/photos';

export default function SettingsScreen() {
  const t = useTheme();
  const db = useSQLiteContext();
  const { settings, update } = useAppSettings();
  const [stats, setStats] = useState<{ total: number; outfits: number; wearsLogged: number } | null>(null);
  const [aiModel, setAiModel] = useState<AiModelStatus>('absent');
  const [aiBusy, setAiBusy] = useState<'download' | 'refresh' | null>(null);
  const loadAi = useCallback(async () => {
    setAiModel(await getAiModelStatus());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void getStats(db).then(setStats);
      void loadAi();
    }, [db, loadAi]),
  );

  const downloadModel = async () => {
    setAiBusy('download');
    try {
      const ok = await enableOnDeviceModel();
      const state = await getAiModelStatus();
      setAiModel(state);
      if (ok) {
        Alert.alert('On-device AI ready', 'The engine is now Rules + on-device AI. Everything keeps running locally on this phone.');
      }
    } catch (e) {
      Alert.alert(
        'On-device AI',
        `Couldn't download the model: ${(e as Error).message}\n\nThis needs a supported phone (Android 8+, locked bootloader, AICore installed via Google Play) and a network connection — the rules engine keeps working meanwhile.`,
      );
    } finally {
      setAiBusy(null);
    }
  };

  // Keep the endpoint field in sync with the stored value (unless being edited).
  // Synchronous render-phase adjustment acc. to react.dev — no effect needed.
  const storedEndpoint = settings?.lookupEndpoint ?? '';
  const [seenEndpoint, setSeenEndpoint] = useState(storedEndpoint);
  const [endpointDraft, setEndpointDraft] = useState(storedEndpoint);
  if (seenEndpoint !== storedEndpoint) {
    setSeenEndpoint(storedEndpoint);
    setEndpointDraft(storedEndpoint);
  }

  // Draft fields for the (local-only) cloud AI key and model name.
  const storedKey = settings?.cloudAiKey ?? '';
  const [seenKey, setSeenKey] = useState(storedKey);
  const [keyDraft, setKeyDraft] = useState(storedKey);
  if (seenKey !== storedKey) {
    setSeenKey(storedKey);
    setKeyDraft(storedKey);
  }
  const storedModel = settings?.cloudAiModel ?? '';
  const [seenModel, setSeenModel] = useState(storedModel);
  const [modelDraft, setModelDraft] = useState(storedModel);
  if (seenModel !== storedModel) {
    setSeenModel(storedModel);
    setModelDraft(storedModel);
  }
  const [cloudBusy, setCloudBusy] = useState(false);
  // Endpoint draft — synced from storage with the render-phase adjust pattern.
  const storedCloudEp = settings?.cloudAiEndpoint ?? '';
  const [seenCloudEp, setSeenCloudEp] = useState(storedCloudEp);
  const [cloudEpDraft, setCloudEpDraft] = useState(storedCloudEp);
  if (seenCloudEp !== storedCloudEp) {
    setSeenCloudEp(storedCloudEp);
    setCloudEpDraft(storedCloudEp);
  }

  const testCloud = async () => {
    const endpoint = settings?.cloudAiEndpoint || AI_PRESETS.groq.endpoint;
    const model = settings?.cloudAiModel || AI_PRESETS.groq.model;
    // Same priority as CloudAiSync; the key must belong to the active provider.
    const presetId = (
      (Object.entries(AI_PRESETS).find(([, p]) => p.endpoint === endpoint)?.[0] ?? 'groq')
    ) as CloudPresetId;
    const key = (keyDraft || storedKey || HARDCODED_KEYS[presetId] || '').trim();
    const vision = presetSupportsVision(endpoint, model);
    if (!key) {
      Alert.alert('Cloud AI', 'Paste an API key first — get one free at console.groq.com/keys');
      return;
    }
    setCloudBusy(true);
    try {
      const reply = await cloudChat(
        cloudConfigOf(true, endpoint, model, key, false, vision),
        { system: 'Answer with a single word.', user: 'Say ready.', reasoningEffort: 'low', maxTokens: 300 },
      );
      Alert.alert(
        'Cloud AI',
        reply ? `Connected — ${model} replied: "${reply}"` : `No reply from ${model}. Check the model name, the key (from ${AI_PRESETS.groq.keyUrl}) and your network.`,
      );
    } finally {
      setCloudBusy(false);
    }
  };

  const wipe = () => {
    Alert.alert(
      'Erase everything?',
      'This deletes all items, photos, saved looks and history from this device. Cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
        text: 'Erase all',
        style: 'destructive',
        onPress: () => void (async () => {
          const items = await listItems(db);
          for (const item of items) deletePhoto(item.image);
          await db.execAsync('DELETE FROM wears; DELETE FROM outfits; DELETE FROM items; DELETE FROM kvar; VACUUM;');
        })(),
      },
      ],
    );
  };

  const endpoint = endpointDraft;

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
          <Text style={{ color: t.text, fontSize: 30, fontWeight: '700', fontFamily: 'ui-rounded' }}>
            Settings
          </Text>
          <Text style={{ color: t.textSecondary, fontSize: 13, marginTop: 2, marginBottom: Spacing.four }}>
            Your closet lives entirely on this phone.
          </Text>

          <Card style={{ marginBottom: Spacing.four }}>
            <SectionLabel>Intelligence</SectionLabel>
            <Row style={{ justifyContent: 'space-between', paddingVertical: 2 }}>
              <Text style={{ color: t.textSecondary }}>Engine now running on this phone</Text>
              <Text style={{ color: t.accent, fontWeight: '700' }}>
                {aiModel === 'available' ? 'Rules + on-device AI' : 'Rules engine (offline)'}
              </Text>
            </Row>
            {aiModel === 'available' && (
              <Text style={{ color: t.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: Spacing.two }}>
                Your phone&apos;s built-in Gemini Nano is active, entirely on device — no network, nothing leaves this
                phone. Look scoring and pairing always come from the deterministic style engine; the AI refines the
                look phrasing and helps fill tags when you add an item. It never changes your scores or acts as a
                hard dependency.
              </Text>
            )}
            {aiModel === 'downloadable' && (
              <>
                <Text style={{ color: t.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: Spacing.two }}>
                  This phone supports Gemini Nano, but its model hasn&apos;t been downloaded yet. It&apos;s a one-time,
                  free ~2 GB download through Google AICore — after that everything runs locally, forever offline.
                </Text>
                <PrimaryButton
                  label={aiBusy === 'download' ? 'Downloading model…' : 'Download on-device model'}
                  onPress={() => void downloadModel()}
                  disabled={aiBusy === 'download'}
                  tone="plain"
                />
              </>
            )}
            {aiModel === 'downloading' && (
              <>
                <Text style={{ color: t.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: Spacing.two }}>
                  The Gemini Nano model is downloading right now (through Google AICore). Keep this phone online and
                  come back in a while — then the engine switches itself to Rules + on-device AI.
                </Text>
                <PrimaryButton
                  label={aiBusy === 'refresh' ? 'Checking…' : 'Check status again'}
                  onPress={() => {
                    setAiBusy('refresh');
                    void loadAi().finally(() => setAiBusy(null));
                  }}
                  tone="plain"
                />
              </>
            )}
            {aiModel === 'unavailable' && (
              <>
                <Text style={{ color: t.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: Spacing.two }}>
                  Look scoring, pairing and tag suggestions come from the deterministic style engine — color,
                  formality, season and freshness rules that run 100% offline on this phone. Gemini Nano isn&apos;t
                  enabled on this device yet (it needs Android 8+, a locked bootloader and an up-to-date AICore
                  app) — after a device restart AICore usually fetches the final configuration within minutes to
                  a few hours, and this card switches on its own.
                </Text>
                <PrimaryButton
                  label={aiBusy === 'refresh' ? 'Checking…' : 'Check status again'}
                  onPress={() => {
                    setAiBusy('refresh');
                    void loadAi().finally(() => setAiBusy(null));
                  }}
                  tone="plain"
                />
              </>
            )}
            {aiModel === 'absent' && (
              <Text style={{ color: t.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: Spacing.two }}>
                Look scoring, pairing and tag suggestions come from the deterministic style engine — color,
                formality, season and freshness rules that run 100% offline on this phone. The on-device AI bridge
                (Gemini Nano) isn&apos;t compiled into this build — it activates on the native app build.
              </Text>
            )}
          </Card>

          <Card style={{ marginBottom: Spacing.four }}>
            <SectionLabel>Cloud AI (optional)</SectionLabel>
            <Text style={{ color: t.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
              Purely opt-in. When enabled, the AI takes real jobs: at add time it studies the
              item (photo + listing text) once and writes a stylist description that later
              guides look picking and tags; on Today, it decides what to wear together.
              Falls back to the offline rules engine whenever anything fails. Keys stay in
              this phone&apos;s local database; photos leave the phone only when you allow it
              below — the one-time item analysis needs them for color judgment.
            </Text>
            <Row style={{ marginTop: Spacing.three, justifyContent: 'space-between' }}>
              <Text style={{ color: t.text }}>Use cloud AI</Text>
              <Switch
                value={settings?.cloudAiEnabled ?? false}
                onValueChange={(v) => void update({ cloudAiEnabled: v })}
                trackColor={{ true: t.accent, false: t.backgroundSelected }}
              />
            </Row>
            <Divider />
            <Text style={{ color: t.text, marginBottom: 6 }}>Provider</Text>
            <ChipRow>
              {(['groq', 'openrouter'] as const).map((id) => (
                <Chip
                  key={id}
                  size="sm"
                  label={AI_PRESETS[id].label}
                  selected={
                    (cloudEpDraft || AI_PRESETS.groq.endpoint) === AI_PRESETS[id].endpoint
                  }
                  onPress={() => {
                    setCloudEpDraft(AI_PRESETS[id].endpoint);
                    setModelDraft(AI_PRESETS[id].model);
                  }}
                />
              ))}
            </ChipRow>
            <Text style={{ color: t.textSecondary, fontSize: 11.5, marginTop: 4 }}>
              Chips prefill endpoint + model below. Keys must match the provider — leave empty
              to use the built-in local Groq key.
            </Text>
            <Row style={{ marginTop: Spacing.three, justifyContent: 'space-between' }}>
              <Text style={{ color: t.text }}>Use cloud AI</Text>
              <Switch
                value={settings?.cloudAiEnabled ?? false}
                onValueChange={(v) => void update({ cloudAiEnabled: v })}
                trackColor={{ true: t.accent, false: t.backgroundSelected }}
              />
            </Row>
            <Divider />
            <Text style={{ color: t.text, marginBottom: 6 }}>API key (aistudio.google.com/apikey)</Text>
            <TextInput
              value={keyDraft}
              onChangeText={setKeyDraft}
              placeholder="AIza…"
              placeholderTextColor={t.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={[styles.input, { color: t.text, borderColor: t.hairline }]}
            />
            <View style={{ marginTop: Spacing.two }}>
              <PrimaryButton
                label="Save key"
                tone="plain"
                onPress={() => void update({ cloudAiKey: keyDraft.trim() })}
              />
            </View>
            <Text style={{ color: t.text, marginTop: Spacing.three, marginBottom: 6 }}>Endpoint</Text>
            <TextInput
              value={cloudEpDraft}
              onChangeText={setCloudEpDraft}
              placeholder={AI_PRESETS.groq.endpoint}
              placeholderTextColor={t.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: t.text, borderColor: t.hairline }]}
            />
            <Text style={{ color: t.text, marginTop: Spacing.three, marginBottom: 6 }}>Model name</Text>
            <TextInput
              value={modelDraft}
              onChangeText={setModelDraft}
              placeholder={AI_PRESETS.groq.model}
              placeholderTextColor={t.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: t.text, borderColor: t.hairline }]}
            />
            <View style={{ marginTop: Spacing.two }}>
              <PrimaryButton
                label="Save provider"
                tone="plain"
                onPress={() => void update({ cloudAiEndpoint: cloudEpDraft.trim(), cloudAiModel: modelDraft.trim() })}
              />
            </View>
            <Row style={{ marginTop: Spacing.three, justifyContent: 'space-between' }}>
              <Text style={{ color: t.text }}>Include item photos</Text>
              <Switch
                value={settings?.cloudAiPhotos ?? false}
                onValueChange={(v) => void update({ cloudAiPhotos: v })}
                trackColor={{ true: t.accent, false: t.backgroundSelected }}
              />
            </Row>
            <View style={{ marginTop: Spacing.three }}>
              <PrimaryButton
                label={cloudBusy ? 'Testing…' : 'Test connection'}
                tone="plain"
                disabled={cloudBusy}
                onPress={() => void testCloud()}
              />
            </View>
          </Card>

          <Card style={{ marginBottom: Spacing.four }}>
            <SectionLabel>Visual web lookup</SectionLabel>
            <Text style={{ color: t.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
              Only when you tap “Find clearer product images”, a downscaled copy of the crop is
              sent once to a small stateless service, which fetches matching product pages and
              keeps nothing. Your item stays on the phone; we store links only.
            </Text>
            <Row style={{ marginTop: Spacing.three, justifyContent: 'space-between' }}>
              <Text style={{ color: t.text }}>Allow web lookup</Text>
              <Switch
                value={settings?.lookupConsent ?? false}
                onValueChange={(v) => void update({ lookupConsent: v })}
                trackColor={{ true: t.accent, false: t.backgroundSelected }}
              />
            </Row>
            <Divider />
            <Text style={{ color: t.text, marginBottom: 6 }}>Lookup service URL</Text>
            <TextInput
              value={endpoint}
              onChangeText={setEndpointDraft}
              placeholder="http://192.168.1.10:8787"
              placeholderTextColor={t.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.input, { color: t.text, borderColor: t.hairline }]}
            />
            <View style={{ marginTop: Spacing.three }}>
              <PrimaryButton
                label="Save endpoint"
                tone="plain"
                onPress={() => void update({ lookupEndpoint: endpoint.trim() }).then(() => setEndpointDraft(endpoint.trim()))}
              />
            </View>
          </Card>

          <Card style={{ marginBottom: Spacing.four }}>
            <SectionLabel>This wardrobe</SectionLabel>
            <StatRow label="Items" value={stats?.total ?? '…'} />
            <StatRow label="Saved looks" value={stats?.outfits ?? '…'} />
            <StatRow label="Wear entries" value={stats?.wearsLogged ?? '…'} />
          </Card>

          <Card style={{ marginBottom: Spacing.four }}>
            <SectionLabel>Data</SectionLabel>
            <Text style={{ color: t.textSecondary, fontSize: 12.5, lineHeight: 18, marginBottom: Spacing.three }}>
              Export and cloud backup arrive later; the local data model won&apos;t change.
            </Text>
            <Pressable onPress={wipe}>
              <Text style={{ color: t.danger, fontWeight: '600' }}>Erase all data…</Text>
            </Pressable>
          </Card>

          <Text style={{ color: t.textSecondary, fontSize: 12, textAlign: 'center', paddingBottom: Spacing.three }}>
            StyleMe · offline-first wardrobe · on-device AI when your phone supports it
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  const t = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ color: t.textSecondary }}>{label}</Text>
      <Text style={{ color: t.text, fontWeight: '700' }}>{value}</Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  pad: { padding: Spacing.three, paddingBottom: 170 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    fontSize: 14,
  },
});
