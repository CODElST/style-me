// Item detail — inspect, edit tags, wear tracking, web lookup references.

import { Image } from 'expo-image';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { useSQLiteContext } from 'expo-sqlite';

import { Chip, Card, IconTextButton, PrimaryButton, Row, SectionLabel, TagPill, Divider } from '@/components/kit';
import { TagForm, SEASON_LABELS, type TagDraft } from '@/components/tag-form';
import { pinterestQueriesCloud } from '@/lib/ai';
import { openPinterest, queriesForItem } from '@/lib/pinterest';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteItem, getItem, markItemsWorn, logWear, saveItem } from '@/lib/db';
import { deletePhoto } from '@/lib/photos';
import { webLookup } from '@/lib/lookup';
import { FORMALITY_LABELS, typeOf } from '@/lib/taxonomy';
import type { Item } from '@/lib/types';
import { now, relativeDate } from '@/lib/util';

export default function ItemScreen() {
  const t = useTheme();
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<Item | null>(null);
  const [draft, setDraft] = useState<TagDraft | null>(null);
  const [busy, setBusy] = useState<'lookup' | null>(null);
  const [refResults, setRefResults] = useState<{ title: string; url: string; source: string }[]>([]);
  /** Editable stylist desc — mirrors item.desc until the user changes it. */
  const seenDesc = item?.desc ?? '';
  const [descDraft, setDescDraft] = useState(seenDesc);
  const [lastSeenDesc, setLastSeenDesc] = useState(seenDesc);
  if (lastSeenDesc !== seenDesc) {
    setLastSeenDesc(seenDesc);
    setDescDraft(seenDesc);
  }
  /** AI-refined Pinterest searches (null → the tag-built ones render). */
  const [pinQueries, setPinQueries] = useState<string[] | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void getItem(db, String(id)).then((loaded) => {
        setItem(loaded);
        if (loaded) setDraft(toDraft(loaded));
      });
    }, [db, id]),
  );

  if (!item || !draft) {
    return (
      <View style={{ flex: 1, backgroundColor: t.background }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.textSecondary }}>Loading…</Text>
        </SafeAreaView>
      </View>
    );
  }

  const saveEdits = async () => {
    const updated: Item = {
      ...item,
      category: draft.category,
      subtype: draft.subtype,
      colors: draft.colors,
      pattern: draft.pattern,
      material: draft.material,
      warmth: draft.warmth,
      formality: draft.formality,
      seasons: draft.seasons,
      note: draft.note,
      desc: descDraft,
      favorite: draft.favorite,
      available: draft.available,
      updatedAt: now(),
    };
    await saveItem(db, updated);
    setDateItem(updated);
  };

  const setDateItem = (next: Item) => {
    setItem(next);
    setDraft(toDraft(next));
  };

  const deleteThis = () => {
    Alert.alert('Delete item?', 'The photo and tags will be removed from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void (async () => {
          await deleteItem(db, item.id);
          deletePhoto(item.image);
          router.back();
        })(),
      },
    ]);
  };

  const wearToday = async () => {
    const at = now();
    await logWear(db, {
      outfitId: null, itemIds: [item.id], wornAt: at, occasion: 'out', temp: 'mild',
    });
    await markItemsWorn(db, [item.id], at);
    const next = { ...item, wearCount: item.wearCount + 1, lastWornAt: at, updatedAt: at };
    setDateItem(next);
  };

  const findRefs = async () => {
    if (!draft.available) return;
    setBusy('lookup');
    const result = await webLookup(db, item.image);
    setBusy(null);
    if (result.ok) setRefResults(result.pages);
    else Alert.alert('Lookup', result.error);
  };

  const pickRef = async (url: string) => {
    const next: Item = { ...item, lookUrl: url, updatedAt: now() };
    await saveItem(db, next);
    setDateItem(next);
  };

  const askPinQueries = async () => {
    setPinBusy(true);
    try {
      const res = await pinterestQueriesCloud([item], null);
      if (res) setPinQueries(res);
      else Alert.alert('Pinterest', 'AI had nothing sharper right now — the tag-built queries still open.');
    } finally {
      setPinBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
          <Text
            onPress={() => router.back()}
            style={{ color: t.textSecondary, fontSize: 13.5, marginBottom: Spacing.three }}
          >
            ← Back
          </Text>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: t.text, fontSize: 24, fontWeight: '700', fontFamily: 'ui-rounded' }}>
              {typeOf(item.subtype).label}
            </Text>
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              <IconTextButton
                label={item.favorite ? 'Favourited' : 'Favourite'}
                icon={item.favorite ? '💗' : '🤍'}
                onPress={() => {
                  const next = { ...item, favorite: !item.favorite, updatedAt: now() };
                  setDateItem(next);
                  void saveItem(db, next);
                }}
              />
              <IconTextButton
                label={item.available ? 'Clean' : 'In wash'}
                icon="🧺"
                onPress={() => {
                  const next = { ...item, available: !item.available, updatedAt: now() };
                  setDateItem(next);
                  void saveItem(db, next);
                }}
              />
            </View>
          </Row>

          <Image
            source={{ uri: item.image }}
            style={[styles.hero, { borderRadius: Radius.lg }]}
            contentFit="cover"
            transition={150}
          />

          <Row style={{ gap: Spacing.two, flexWrap: 'wrap' }}>
            <TagPill>{`${typeOf(item.subtype).label.toLowerCase()}`}</TagPill>
            <TagPill>{item.colors.join(' · ')}</TagPill>
            <TagPill>{FORMALITY_LABELS[item.formality]}</TagPill>
            <TagPill>{draft.seasons.map((s) => SEASON_LABELS[[ 'spring', 'summer', 'autumn', 'winter' ].indexOf(s)]).join(', ')}</TagPill>
            <TagPill>warmth {item.warmth}/5</TagPill>
          </Row>

          <Text style={{ color: t.textSecondary, fontSize: 12.5, marginTop: Spacing.three }}>
            {`Worn ${item.wearCount}× · last ${relativeDate(item.lastWornAt)}\nAdded ${relativeDate(item.createdAt)}`}
          </Text>

          <View style={{ marginTop: Spacing.three }}>
            <SectionLabel>Stylist&apos;s notes</SectionLabel>
            <Text style={{ color: t.textSecondary, fontSize: 11.5, marginBottom: 6 }}>
              Fed verbatim to the AI look generator. Written by the AI or edit it to match your own
              judgment.
            </Text>
            <TextInput
              value={descDraft}
              onChangeText={setDescDraft}
              placeholder="Add a few lines: colors, pattern scale, fabric, vibe, pairings…"
              placeholderTextColor={t.textSecondary}
              multiline
              textAlignVertical="top"
              style={{
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: t.hairline,
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 14,
                fontSize: 13.5,
                minHeight: 96,
                color: t.text,
              }}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three }}>
            <IconTextButton label="Wear today" icon="👕" onPress={() => void wearToday()} />
            {item.lookUrl ? (
              <IconTextButton
                label="Open reference"
                icon="🔗"
                onPress={() => void WebBrowser.openBrowserAsync(item.lookUrl!)}
              />
            ) : null}
          </View>

          <Card style={{ marginTop: Spacing.three }}>
            <SectionLabel>Outfit ideas on Pinterest</SectionLabel>
            <Text style={{ color: t.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
              Searches written from this piece&apos;s tags. Tap one to open it on Pinterest — the
              app if installed, an in-app browser otherwise.
            </Text>
            <View style={styles.pinChips}>
              {(pinQueries ?? queriesForItem(item)).map((q) => (
                <Chip
                  key={q}
                  size="sm"
                  label={q}
                  selected={false}
                  icon="🅿️"
                  onPress={() => void openPinterest(q)}
                />
              ))}
            </View>
            <Row style={{ marginTop: Spacing.two }}>
              <IconTextButton
                label={pinBusy ? '✦ styling…' : pinQueries ? '✦ AI queries' : '✦ Ask AI for sharper queries'}
                icon={pinBusy ? undefined : '🎨'}
                onPress={() => void askPinQueries()}
              />
            </Row>
          </Card>

          <Divider />

          {(item.refs.length > 0 || item.lookUrl) ? (
            <Card style={{ marginBottom: Spacing.four }}>
              <SectionLabel>Reference links</SectionLabel>
              {item.lookUrl ? (
                <Row style={{ justifyContent: 'space-between', marginBottom: Spacing.two }}>
                  <Text style={{ color: t.accent, flex: 1 }} numberOfLines={1}>★ saved reference</Text>
                  <IconTextButton
                    label="Open"
                    icon="🔗"
                    onPress={() => void WebBrowser.openBrowserAsync(item.lookUrl!)}
                  />
                </Row>
              ) : null}
              {refResults.map((r) => (
                <Row key={r.url} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
                  <PressableText url={r.url} title={r.title} />
                  <IconTextButton label="Use" onPress={() => void pickRef(r.url)} />
                </Row>
              ))}
              <Text style={{ color: t.textSecondary, fontSize: 11.5, marginTop: Spacing.two }}>
                Links open in the browser; images and text stay with their source. Nothing is stored here beyond the URL.
              </Text>
            </Card>
          ) : null}

          <Card style={{ marginBottom: Spacing.four }}>
            <SectionLabel>Find clearer product images</SectionLabel>
            <Text style={{ color: t.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
              Sends a downscaled copy of this crop once to the lookup service (requires consent in Settings). The photo here on-device stays the master.
            </Text>
            <View style={{ marginTop: Spacing.three }}>
              <PrimaryButton label={busy === 'lookup' ? 'Searching…' : 'Search the web'} onPress={() => void findRefs()} />
            </View>
            {refResults.length > 0 && !(item.refs.length > 0 || item.lookUrl) ? (
              <View style={{ marginTop: Spacing.three, gap: Spacing.two }}>
                {refResults.map((r) => (
                  <Row key={r.url} style={{ justifyContent: 'space-between' }}>
                    <PressableText url={r.url} title={r.title} />
                    <IconTextButton label="Use" onPress={() => void pickRef(r.url)} />
                  </Row>
                ))}
              </View>
            ) : null}
          </Card>

          <Card style={{ marginBottom: Spacing.four }}>
            <SectionLabel>Edit tags</SectionLabel>
            <View style={{ marginTop: Spacing.three }}>
              <TagForm value={draft} onChange={setDraft} />
            </View>
            <View style={{ marginTop: Spacing.three }}>
              <PrimaryButton label="Save changes" onPress={() => void saveEdits()} />
            </View>
          </Card>

          <PrimaryButton label="Delete this item" tone="plain" onPress={deleteThis} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function PressableText({ url, title }: { url: string; title: string }) {
  return (
    <Text
      style={{ color: '#3C87F7', fontSize: 13.5 }}
      numberOfLines={1}
      onPress={() => void WebBrowser.openBrowserAsync(url)}
    >
      {title}
    </Text>
  );
}

// Draft <-> Item mapping
function toDraft(item: Item): TagDraft {
  return {
    category: item.category,
    subtype: item.subtype,
    colors: item.colors,
    pattern: item.pattern,
    material: item.material,
    warmth: item.warmth,
    formality: item.formality,
    seasons: item.seasons,
    note: item.note,
    favorite: item.favorite,
    available: item.available,
  };
}

const styles = StyleSheet.create({
  pad: { padding: Spacing.three, paddingBottom: 170 },
  hero: {
    width: '100%',
    aspectRatio: 3 / 4,
    marginTop: Spacing.three,
  },
  pinChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
