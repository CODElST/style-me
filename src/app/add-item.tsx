// Add item — camera → crop → review tags → optional visual web lookup → save.
// Flow mirrors the product spec: AI/rules propose, the user confirms.

import { Image } from 'expo-image';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { Card, Divider, IconTextButton, PrimaryButton, Row, SectionLabel } from '@/components/kit';
import { TagForm, type TagDraft } from '@/components/tag-form';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppSettings } from '@/hooks/use-settings';
import { saveItem } from '@/lib/db';
import { suggestTags } from '@/lib/ai';
import { pickPhoto, finalizePhoto } from '@/lib/photos';
import { webLookup } from '@/lib/lookup';
import { typeOf } from '@/lib/taxonomy';
import type { Item, LookupRef } from '@/lib/types';
import { uid } from '@/lib/util';

const STEPS = ['Photo', 'Tags'] as const;
type Step = (typeof STEPS)[number];

function toDraftDefault(subtype = 'tshirt'): TagDraft {
  return {
    category: 'top',
    subtype,
    colors: [],
    pattern: 'solid',
    material: 'cotton',
    warmth: 2,
    formality: 1,
    seasons: ['spring', 'summer'],
    note: '',
    favorite: false,
    available: true,
  };
}

export default function AddItemScreen() {
  const t = useTheme();
  const db = useSQLiteContext();
  const { settings, update } = useAppSettings();
  const idRef = useRef(uid());
  const [step, setStep] = useState<Step>('Photo');
  const [uri, setUri] = useState<string | null>(null);
  const [draft, setDraft] = useState<TagDraft>(toDraftDefault());
  const [busy, setBusy] = useState<'pick' | 'save' | 'lookup' | null>(null);
  const [refs, setRefs] = useState<(LookupRef)[]>([]);
  const [savingRef, setSavingRef] = useState<string | null>(null);

  const addPhoto = async (source: 'camera' | 'library') => {
    setBusy('pick');
    try {
      const picked = await pickPhoto(source);
      if (!picked) return;
      const stored = await finalizePhoto(picked, idRef.current);
      setUri(stored);
    } catch (e) {
      Alert.alert('Photo', `Could not use this photo: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const goTags = () => {
    const suggestions = suggestTags({ subtype: draft.subtype, warmth: draft.warmth, material: draft.material });
    setDraft((d) => ({
      ...d,
      warmth: suggestions.warmth,
      formality: suggestions.formality,
      seasons: suggestions.seasons,
    }));
    setStep('Tags');
  };

  const doLookup = async () => {
    if (!uri) return;
    if (!settings?.lookupConsent) {
      Alert.alert(
        'Web lookup consent',
        'To search the web, this one photo of the garment is sent to the lookup service (URL configured in Settings). Nothing is stored remotely; results are links you can attach or ignore. Your closet stays on the phone.',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'I understand',
            onPress: () => {
              void update({ lookupConsent: true });
              void runLookup();
            },
          },
        ],
      );
      return;
    }
    await runLookup();
  };

  const runLookup = async () => {
    if (!uri) return;
    setBusy('lookup');
    const result = await webLookup(db, uri);
    setBusy(null);
    if (result.ok) setRefs(result.pages);
    else Alert.alert('Lookup', result.error);
  };

  const save = async () => {
    if (!uri) return;
    if (draft.colors.length === 0) {
      Alert.alert('Colors', 'Pick at least one color swatch (up to 3) — the engine needs it for pairing.');
      return;
    }
    setBusy('save');
    const now = Date.now();
    const item: Item = {
      id: idRef.current,
      image: uri,
      category: draft.category,
      subtype: draft.subtype,
      colors: draft.colors,
      pattern: draft.pattern,
      material: draft.material,
      warmth: draft.warmth,
      formality: draft.formality,
      seasons: draft.seasons,
      available: draft.available,
      favorite: draft.favorite,
      wearCount: 0,
      lastWornAt: null,
      note: draft.note,
      lookUrl: savingRef,
      refs: refs.slice(0, 3),
      createdAt: now,
      updatedAt: now,
    };
    try {
      await saveItem(db, item);
      router.back();
    } catch (e) {
      Alert.alert('Save', `Could not save: ${(e as Error).message}`);
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <Row style={[styles.header, { marginHorizontal: Spacing.three, marginTop: Spacing.two }]}>
          <Row style={{ gap: Spacing.two }}>
            {STEPS.map((s, i) => (
              <Text
                key={s}
                style={{
                  color: STEPS.indexOf(step) === i ? t.accent : t.textSecondary,
                  fontWeight: '700',
                  fontSize: 14,
                }}
              >
                {`0${i + 1} ${s}`}
              </Text>
            ))}
          </Row>
          <Text onPress={() => router.back()} style={{ color: t.textSecondary }}>
            Close
          </Text>
        </Row>

        <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
          {step === 'Photo' ? (
            <>
              <Card>
                <SectionLabel>The garment</SectionLabel>
                {uri ? (
                  <>
                    <Image
                      source={{ uri }}
                      style={[styles.preview, { borderRadius: Radius.md }]}
                      contentFit="cover"
                      transition={100}
                    />
                    <Row style={{ gap: Spacing.two, marginTop: Spacing.three }}>
                      <IconTextButton label="Camera" icon="📷" onPress={() => void addPhoto('camera')} />
                      <IconTextButton label="Library" icon="🖼️" onPress={() => void addPhoto('library')} />
                      <PrimaryButton label="Looks right →" onPress={goTags} />
                    </Row>
                  </>
                ) : (
                  <View style={styles.placeholder}>
                    <Text style={{ color: t.textSecondary, fontSize: 13.5, textAlign: 'center', lineHeight: 20 }}>
                      Lay the piece on a plain background and crop to just the garment. The crop is
                      what gets resized and stored on the phone.
                    </Text>
                    <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three }}>
                      <PrimaryButton label="Take photo" onPress={() => void addPhoto('camera')} />
                      <PrimaryButton label="Pick from library" tone="plain" onPress={() => void addPhoto('library')} />
                    </View>
                  </View>
                )}
              </Card>
            </>
          ) : (
            <>
              <Row style={{ gap: Spacing.three, marginBottom: Spacing.three }}>
                <Image
                  source={{ uri: uri ?? '' }}
                  style={[styles.previewSmall, { borderRadius: Radius.sm }]}
                  contentFit="cover"
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>
                    {typeOf(draft.subtype).label}
                  </Text>
                  <Text style={{ color: t.textSecondary, fontSize: 12 }}>
                    Review the tags — accuracy here is what makes pairings good.
                  </Text>
                </View>
              </Row>

              <Card style={{ marginBottom: Spacing.four }}>
                <TagForm value={draft} onChange={setDraft} />
              </Card>

              <Card style={{ marginBottom: Spacing.four }}>
                <SectionLabel>Find clearer product images (optional)</SectionLabel>
                <Text style={{ color: t.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
                  Your crop is sent once to the lookup service. Results are links only — your photo
                  stays the local master. Consent:{' '}
                  <Text style={{ color: t.accent, fontWeight: '600' }}>
                    {settings?.lookupConsent ? 'granted' : 'not granted yet'}
                  </Text>
                </Text>
                <View style={{ marginTop: Spacing.three }}>
                  <PrimaryButton
                    label={busy === 'lookup' ? 'Searching…' : refs.length ? 'Search again' : 'Search the web'}
                    tone="plain"
                    onPress={() => void doLookup()}
                  />
                </View>
                {refs.length > 0 ? (
                  <View style={{ marginTop: Spacing.three }}>
                    <Divider />
                    <Text style={{ color: t.textSecondary, fontSize: 11.5, marginBottom: 8 }}>
                      Tap ‘Use’ to store the link as a reference — the item keeps your own photo.
                    </Text>
                    {refs.slice(0, 4).map((r) => (
                      <Row key={r.url} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
                        <Text numberOfLines={1} style={{ color: '#3C87F7', flex: 1, fontSize: 13.5 }}>
                          {r.title} · {r.source}
                        </Text>
                        <IconTextButton
                          label={savingRef === r.url ? '★ saved' : 'Use'}
                          onPress={() => setSavingRef(r.url)}
                        />
                      </Row>
                    ))}
                  </View>
                ) : null}
              </Card>

              <NavigateToggles draft={draft} onChange={setDraft} />

              <PrimaryButton
                label={busy === 'save' ? 'Saving…' : 'Add to closet'}
                onPress={() => void save()}
                disabled={!uri || busy === 'save'}
              />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** favorite/available quick toggles at the end of the tag step. */
function NavigateToggles({ draft, onChange }: { draft: TagDraft; onChange: (d: TagDraft) => void }) {
  const t = useTheme();
  return (
    <Card style={{ marginBottom: Spacing.four }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: t.text }}>Mark as favourite</Text>
        <Switch
          value={draft.favorite}
          onValueChange={(v) => onChange({ ...draft, favorite: v })}
          trackColor={{ true: t.accent, false: t.backgroundSelected }}
        />
      </Row>
      <View style={{ height: Spacing.three }} />
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: t.text }}>
          {draft.available ? 'Ready to wear (clean)' : 'In laundry / stored away'}
        </Text>
        <Switch
          value={draft.available}
          onValueChange={(v) => onChange({ ...draft, available: v })}
          trackColor={{ true: t.accent, false: t.backgroundSelected }}
        />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pad: { padding: Spacing.three, paddingBottom: 160 },
  preview: {
    width: '100%',
    aspectRatio: 3 / 4,
  },
  previewSmall: {
    width: 72,
    height: 92,
  },
  placeholder: {
    padding: Spacing.three,
    alignItems: 'center',
  },
});
