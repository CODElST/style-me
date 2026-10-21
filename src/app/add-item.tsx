// Add item — camera / library / product link → auto-crop → review tags →
// optional visual web lookup → save.
// Flow mirrors the product spec: AI/rules propose, the user confirms.

import { Image } from 'expo-image';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { Card, Divider, IconTextButton, PrimaryButton, Row, SectionLabel } from '@/components/kit';
import { TagForm, type TagDraft } from '@/components/tag-form';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppSettings } from '@/hooks/use-settings';
import { saveItem, setItemDesc } from '@/lib/db';
import { analyzeItemCloud, getCloudAiConfig, suggestTags, suggestTagsNative, suggestTagsCloud, type SuggestedProductTags } from '@/lib/ai';
import { cloudReady } from '@/lib/cloud-ai';
import { pickPhoto, finalizePhoto } from '@/lib/photos';
import { webLookup } from '@/lib/lookup';
import { analyzeImageFile, downloadAndPrepare, fetchProduct } from '@/lib/extract';
import { type AutoTags, type ExtractedPage, autoTagsFromProduct, topImages } from '@/lib/product-html';
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

/**
 * Fill tag gaps with on-device AI results — never fight clear rule matches:
 *   subtype: only when the rules fell back to the generic 'tshirt'
 *   material: only when the rules found none
 *   pattern: only when everything said 'solid' (the weak default)
 *   colors: only when the rules+pixels found fewer than two colors
 */
function mergeAiTags(
  d: TagDraft,
  auto: ReturnType<typeof autoTagsFromProduct>,
  ai: SuggestedProductTags,
): TagDraft {
  const merge = { ...d };
  if (ai.subtype && auto.subtype === 'tshirt' && ai.subtype !== 'tshirt') {
    merge.subtype = ai.subtype;
    const def = typeOf(ai.subtype);
    merge.category = def.category;
    merge.warmth = def.warmth;
    merge.formality = def.formality;
  }
  if (auto.material == null && ai.material) merge.material = ai.material;
  if (auto.pattern === 'solid' && ai.pattern && ai.pattern !== 'solid') merge.pattern = ai.pattern;
  if (auto.colors.length < 2 && ai.colors && ai.colors.length > 0) {
    const merged = [...ai.colors, ...auto.colors.filter((c) => !ai.colors!.includes(c))];
    merge.colors = merged.slice(0, 3);
  }
  return merge;
}

export default function AddItemScreen() {
  const t = useTheme();
  const db = useSQLiteContext();
  const { settings, update } = useAppSettings();
  const idRef = useRef(uid());
  /** true once saveItem succeeded — late-arriving AI desc goes to the DB then. */
  const savedRef = useRef(false);
  const [step, setStep] = useState<Step>('Photo');
  const [uri, setUri] = useState<string | null>(null);
  const [draft, setDraft] = useState<TagDraft>(toDraftDefault());
  const [busy, setBusy] = useState<'pick' | 'save' | 'lookup' | 'fetchLink' | 'useLink' | null>(null);
  const [refs, setRefs] = useState<(LookupRef)[]>([]);
  const [savingRef, setSavingRef] = useState<string | null>(null);
  /** AI stylist description for the piece being added (arrives mid-edit). */
  const [aiDesc, setAiDesc] = useState('');

  // product-link state
  const [linkInput, setLinkInput] = useState('');
  const [page, setPage] = useState<ExtractedPage | null>(null);
  const [selectedImg, setSelectedImg] = useState(0);
  const [autofillNote, setAutofillNote] = useState<string | null>(null);

  const addPhoto = async (source: 'camera' | 'library') => {
    setBusy('pick');
    try {
      const picked = await pickPhoto(source);
      if (!picked) return;
      const stored = await finalizePhoto(picked, idRef.current);
      setUri(stored);

      // Photo-only adds get the same one-time AI pass (no listing text to
      // send — just the garment picture, when photo consent is on). Its tags
      // fill only the weak-rule gaps, matching the link flow's merge rules.
      const mine = idRef.current;
      const emptyAuto: AutoTags = {
        subtype: 'tshirt',
        category: 'top',
        colors: [],
        pattern: 'solid',
        material: null,
        warmth: 2,
        formality: 1,
        seasons: [],
      };
      void analyzeItemCloud('', '', stored).then((intel) => {
        if (!intel || idRef.current !== mine) return;
        setAiDesc(intel.desc);
        setDraft((d) => mergeAiTags(d, emptyAuto, intel.tags));
        setAutofillNote(
          intel.desc
            ? 'AI wrote a stylist description from the photo. Review the tags before saving.'
            : 'Cloud AI had nothing to add for this piece.',
        );
      });
    } catch (e) {
      Alert.alert('Photo', `Could not use this photo: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const fetchLink = async () => {
    const raw = linkInput.trim();
    if (!/^https?:\/\//i.test(raw)) {
      Alert.alert('Link', 'Paste an https:// link to a product page.');
      return;
    }
    setBusy('fetchLink');
    try {
      const result = await fetchProduct(raw);
      setPage(result);
      setSelectedImg(0);
      setAutofillNote(null);
      if (result.images.length === 0) {
        Alert.alert(
          'Link',
          'Found the page but no product picture. The site probably lazy-loads images — screenshot the product and use the library instead.',
        );
      }
    } catch (e) {
      Alert.alert(
        'Link',
        `Could not read that page — ${(e as Error).message}. Many sites block automated reads; take a quick screenshot and use the library instead.`,
      );
    } finally {
      setBusy(null);
    }
  };

  const applyLinkImage = async () => {
    if (!page) return;
    const imageUrl = topImages(page, 6)[selectedImg];
    if (!imageUrl) return;
    setBusy('useLink');
    try {
      const stored = await downloadAndPrepare(imageUrl, idRef.current);
      setUri(stored);
      let pixel = null;
      try {
        pixel = await analyzeImageFile(stored);
      } catch {
        // pixel analysis is best-effort — text tags still apply
      }
      const auto = autoTagsFromProduct(page, pixel);
      setDraft((d) => ({
        ...d,
        ...auto,
        note: d.note || (page.title ? `from ${page.site ?? 'web'}: ${page.title}` : ''),
      }));
      setSavingRef(page.url);
      setAutofillNote(
        `Pre-filled from ${page.site ?? 'the product page'} — review type, colors and warmth before saving.`,
      );

      // Progressive AI refinement: rules tags are already applied; Nano
      // (photo + listing text) fills only the gaps the rules left, then the
      // cloud intel call (desc + tags in one) fills the rest — all opt-in.
      const mine = idRef.current;
      let aiTags = await suggestTagsNative(page.title ?? '', page.text, stored);
      if (!aiTags || Object.keys(aiTags).length === 0) {
        aiTags = (await suggestTagsCloud(page.title ?? '', page.text, stored)) ?? null;
      }
      if (aiTags && idRef.current === mine) {
        setDraft((d) => mergeAiTags(d, auto, aiTags!));
        if (Object.keys(aiTags).length > 0) {
          setAutofillNote('Pre-filled from the page; AI refined the tags. Review before saving.');
        }
      }

      // The AI stylist description — authored ONCE here. Tell the user when
      // cloud was expected to answer but didn't (toggle on, no reply).
      const intel = await analyzeItemCloud(page.title ?? '', page.text, stored);
      if (idRef.current !== mine) return;
      if (intel) {
        setAiDesc(intel.desc);
        if (Object.keys(intel.tags).length > 0) {
          setDraft((d) => mergeAiTags(d, auto, intel.tags));
          setAutofillNote('AI wrote a stylist description and refined the tags. Review before saving.');
        } else if (intel.desc) {
          setAutofillNote('AI wrote a stylist description. Review the tags before saving.');
        }
        if (savedRef.current) void setItemDesc(db, mine, intel.desc);
      } else {
        const cfgNow = getCloudAiConfig();
        if (cloudReady(cfgNow)) {
          setAutofillNote('Cloud AI was reached but had nothing to add — the engine tags above still apply.');
        } else {
          setAutofillNote(
            'Cloud AI is off — turn it on in Settings (Use cloud AI) for AI-written descriptions and picks.',
          );
        }
      }
    } catch (e) {
      Alert.alert('Link', `Could not use that image: ${(e as Error).message}`);
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
      desc: aiDesc,
      lookUrl: savingRef,
      refs: refs.slice(0, 3),
      createdAt: now,
      updatedAt: now,
    };
    try {
      await saveItem(db, item);
      savedRef.current = true;
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
                      Lay the piece on a plain background, or paste a product link below and
                      StyleMe will pull the shot itself. The crop is what gets resized and
                      stored on the phone.
                    </Text>
                    <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three }}>
                      <PrimaryButton label="Take photo" onPress={() => void addPhoto('camera')} />
                      <PrimaryButton label="Pick from library" tone="plain" onPress={() => void addPhoto('library')} />
                    </View>
                  </View>
                )}
              </Card>

              <Card style={{ marginTop: Spacing.three }}>
                <SectionLabel>Or pull it from a product link</SectionLabel>
                <Text style={{ color: t.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 2 }}>
                  Paste the product page URL. The app reads it once itself — nothing goes
                  through a server — picks the product shot, auto-crops it to 3:4 and
                  pre-fills the tags from the page&apos;s own description.
                </Text>
                <Row style={{ gap: Spacing.two, marginTop: Spacing.three }}>
                  <TextInput
                    value={linkInput}
                    onChangeText={setLinkInput}
                    placeholder="https:// shop.com/product…"
                    placeholderTextColor={t.textSecondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    style={[styles.linkInput, { color: t.text, borderColor: t.hairline }]}
                  />
                  <PrimaryButton
                    label={busy === 'fetchLink' ? '…' : 'Find'}
                    tone="plain"
                    onPress={() => void fetchLink()}
                    disabled={busy !== null}
                  />
                </Row>

                {page && page.images.length > 0 ? (
                  <>
                    <Text style={{ color: t.textSecondary, fontSize: 11.5, marginTop: Spacing.three }}>
                      {topImages(page, 6).length > 1 ? 'Tap the picture to use' : 'Picture found'}
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: Spacing.two, paddingVertical: Spacing.two }}
                    >
                      {topImages(page, 6).map((candidateUrl, i) => (
                        <Pressable
                          key={candidateUrl + i}
                          onPress={() => setSelectedImg(i)}
                          style={[
                            styles.candidate,
                            i === selectedImg && { borderColor: t.accent, borderWidth: 2 },
                          ]}
                          accessibilityLabel={`Product picture ${i + 1}`}
                        >
                          <Image
                            source={{ uri: candidateUrl }}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                            transition={150}
                          />
                        </Pressable>
                      ))}
                    </ScrollView>
                    {page.title ? (
                      <Text numberOfLines={2} style={{ color: t.textSecondary, fontSize: 12.5 }}>
                        {page.site ? `${page.site} · ` : ''}{page.title}
                      </Text>
                    ) : null}
                    <View style={{ marginTop: Spacing.three }}>
                      <PrimaryButton
                        label={busy === 'useLink' ? 'Preparing…' : 'Use this image'}
                        onPress={() => void applyLinkImage()}
                        disabled={busy !== null}
                      />
                    </View>
                  </>
                ) : busy === 'fetchLink' ? (
                  <Text style={{ color: t.textSecondary, fontSize: 12.5, marginTop: Spacing.three }}>
                    Reading the page…
                  </Text>
                ) : page && page.title ? (
                  <Text numberOfLines={2} style={{ color: t.textSecondary, fontSize: 12.5, marginTop: Spacing.three }}>
                    No product picture in the page HTML — screenshot it and use the library.
                  </Text>
                ) : null}
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
                <TagForm value={draft} onChange={setDraft} autofillNote={autofillNote} />
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
  linkInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 13.5,
  },
  candidate: {
    width: 84,
    height: 112,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    backgroundColor: '#EFEAE1',
  },
});
