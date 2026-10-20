// Settings — privacy choices, AI availability, lookup endpoint, stats.

import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { Card, Divider, PrimaryButton, Row, SectionLabel } from '@/components/kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppSettings } from '@/hooks/use-settings';
import { getAiStatus } from '@/lib/ai';
import { getStats, listItems } from '@/lib/db';
import { deletePhoto } from '@/lib/photos';

export default function SettingsScreen() {
  const t = useTheme();
  const db = useSQLiteContext();
  const { settings, update } = useAppSettings();
  const [stats, setStats] = useState<{ total: number; outfits: number; wearsLogged: number } | null>(null);
  const ai = getAiStatus();

  useFocusEffect(
    useCallback(() => {
      void getStats(db).then(setStats);
    }, [db]),
  );

  // Keep the endpoint field in sync with the stored value (unless being edited).
  // Synchronous render-phase adjustment acc. to react.dev — no effect needed.
  const storedEndpoint = settings?.lookupEndpoint ?? '';
  const [seenEndpoint, setSeenEndpoint] = useState(storedEndpoint);
  const [endpointDraft, setEndpointDraft] = useState(storedEndpoint);
  if (seenEndpoint !== storedEndpoint) {
    setSeenEndpoint(storedEndpoint);
    setEndpointDraft(storedEndpoint);
  }
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
                {ai.nativeAvailable ? 'Rules + on-device AI' : 'Rules engine (offline)'}
              </Text>
            </Row>
            <Text style={{ color: t.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: Spacing.two }}>
              {ai.nativeAvailable
                ? 'Your phone\'s built-in AI (Apple Intelligence / Gemini Nano) is active. Look scoring and pairing always come from the deterministic style engine; the AI only refines phrasing and tag suggestions — fully on device, no network.'
                : 'Look scoring, pairing and tag suggestions come from the deterministic style engine — color, formality, season and freshness rules that run 100% offline on this phone. No AI model is active here yet: when the on-device bridge (Apple Intelligence / Gemini Nano) becomes available on a supported build, this card will say so, and it only ever upgrades wording — never a hard dependency.\n\nNew: adding items by product link also parses and tags on device; nothing goes through a server.'}
            </Text>
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
