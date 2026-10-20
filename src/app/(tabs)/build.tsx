// Outfit Builder — generated combinations AND manual mixing.
// The engine scores everything live as you swap pieces, so manual edits stay
// as guided as the generated ones.

import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import {
  Card, Chip, ChipRow, Flow, PrimaryButton, Row, SectionLabel,
} from '@/components/kit';
import { OutfitCard } from '@/components/outfit-card';
import { LookNote } from '@/components/look-note';
import { SlotPickerModal } from '@/components/slot-picker';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useWardrobe } from '@/hooks/use-wardrobe';
import { useAppSettings } from '@/hooks/use-settings';
import { markItemsWorn, logWear, saveOutfit } from '@/lib/db';
import { evaluateLook, generateLooks } from '@/lib/engine';
import { MOODS, OCCASIONS, TEMP_BANDS, occasionOf, typeOf } from '@/lib/taxonomy';
import type {
  Item, LookSlots, MoodId, OccasionId, OutfitCandidate, StyleContext, TempBandId,
} from '@/lib/types';

type SlotKey = 'top' | 'bottom' | 'dress' | 'outer' | 'shoes' | 'extra';

const SLOTS: { key: SlotKey; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'bottom', label: 'Bottoms' },
  { key: 'dress', label: 'Dress' },
  { key: 'outer', label: 'Layer' },
  { key: 'shoes', label: 'Shoes' },
  { key: 'extra', label: 'Extra' },
];

export default function BuilderScreen() {
  const t = useTheme();
  const db = useSQLiteContext();
  const { items } = useWardrobe();
  const { settings } = useAppSettings();

  const [context, setContext] = useState<StyleContext>({
    occasion: settings?.lastOccasion ?? 'out',
    temp: settings?.lastTemp ?? 'mild',
    mood: settings?.lastMood ?? 'classic',
  });
  const [looks, setLooks] = useState<OutfitCandidate[] | null>(null);
  const [slots, setSlots] = useState<LookSlots>({});
  const [picker, setPicker] = useState<SlotKey | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const manual = evaluateLook(context, slots);
  const issue = manual === null ? manualIssue(context, slots) : null;

  const updateContext = (patch: Partial<StyleContext>) => setContext((c) => ({ ...c, ...patch }));

  const generate = useCallback(() => {
    const result = generateLooks(context, items, 6, Date.now());
    setLooks(result.looks);
    setFlash(result.hint);
  }, [context, items]);

  const pickFor = (slot: SlotKey) => (item: Item) => {
    if (slot === 'dress') {
      setSlots((s) => ({ ...s, dress: item, top: undefined, bottom: undefined }));
      return;
    }
    if (slot === 'top' || slot === 'bottom') {
      setSlots((s) => ({ ...s, [slot]: item, dress: undefined }));
      return;
    }
    setSlots((s) => ({ ...s, [slot]: item }));
  };

  const slotItem = (key: SlotKey): Item | undefined => {
    if (key === 'top') return slots.top;
    if (key === 'bottom') return slots.bottom;
    if (key === 'dress') return slots.dress;
    if (key === 'outer') return slots.outer;
    if (key === 'shoes') return slots.shoes;
    return slots.extra;
  };

  const wearIds = useCallback(async (ids: string[]) => {
    const at = Date.now();
    await logWear(db, {
      outfitId: null,
      itemIds: ids,
      wornAt: at,
      occasion: context.occasion,
      temp: context.temp,
    });
    await markItemsWorn(db, ids, at);
    setFlash('Enjoy — logged in your wear history');
  }, [db, context]);

  const saveManual = useCallback(async () => {
    if (!manual) return;
    await saveOutfit(db, {
      id: `${Date.now()}-b${Math.random().toString(36).slice(2, 6)}`,
      title: `Built · ${occasionOf(context.occasion).label}`,
      itemIds: manual.itemIds,
      occasion: context.occasion,
      mood: context.mood,
      favorite: false,
      wearCount: 0,
      lastWornAt: null,
      note: '',
      createdAt: Date.now(),
    });
    setFlash('Saved to your rack');
  }, [manual, db, context]);

  const wearManual = useCallback(async () => {
    if (!manual) return;
    await wearIds(manual.itemIds);
  }, [manual, wearIds]);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
          <Text style={{ color: t.text, fontSize: 30, fontWeight: '700', fontFamily: 'ui-rounded' }}>
            Builder
          </Text>
          <Text style={{ color: t.textSecondary, fontSize: 13, marginTop: 2, marginBottom: Spacing.four }}>
            Compose your own, or start from the engine.
          </Text>

          {flash ? (
            <View style={[styles.flash, { backgroundColor: t.accentSoft }]}>
              <Text style={{ color: t.accent, fontWeight: '600', fontSize: 13 }}>{flash}</Text>
            </View>
          ) : null}

          <Card style={{ marginBottom: Spacing.four }}>
            <View style={{ gap: Spacing.three }}>
              <View>
                <SectionLabel>Occasion</SectionLabel>
                <ChipRow>
                  {OCCASIONS.map((o) => (
                    <Chip
                      key={o.id}
                      label={o.label}
                      icon={o.icon}
                      selected={context.occasion === o.id}
                      size="sm"
                      onPress={() => updateContext({ occasion: o.id as OccasionId })}
                    />
                  ))}
                </ChipRow>
              </View>
              <View>
                <SectionLabel>Temperature</SectionLabel>
                <ChipRow>
                  {TEMP_BANDS.map((b) => (
                    <Chip
                      key={b.id}
                      label={b.label}
                      selected={context.temp === b.id}
                      size="sm"
                      onPress={() => updateContext({ temp: b.id as TempBandId })}
                    />
                  ))}
                </ChipRow>
              </View>
              <View>
                <SectionLabel>Mood</SectionLabel>
                <ChipRow>
                  {MOODS.map((m) => (
                    <Chip
                      key={m.id}
                      label={m.label}
                      selected={context.mood === m.id}
                      size="sm"
                      onPress={() => updateContext({ mood: m.id as MoodId })}
                    />
                  ))}
                </ChipRow>
              </View>
              <PrimaryButton label="Generate looks" onPress={generate} />
            </View>
          </Card>

          {looks && looks.length > 0 ? (
            <>
              <SectionLabel>Engine picks</SectionLabel>
              <View style={{ gap: Spacing.three, marginBottom: Spacing.four }}>
                {looks.map((look) => (
                  <OutfitCard
                    key={look.key}
                    items={look.items}
                    score={look.score}
                    grade={look.grade}
                    reasons={look.reasons}
                    tags={look.tags}
                    venues={look.venues}
                    note={<LookNote ctx={context} candidate={look} items={look.items} noteKey={look.key} />}
                    onPressItem={(item) => router.push(`/item/${item.id}`)}
                    footer={
                      <Row style={{ justifyContent: 'flex-end' }}>
                        <PrimaryButton label="Wear" onPress={() => void wearIds(look.itemIds)} />
                      </Row>
                    }
                  />
                ))}
              </View>
            </>
          ) : null}

          <SectionLabel>Manual mix</SectionLabel>
          <Card>
            <Flow>
              {SLOTS.map(({ key, label }) => {
                const item = slotItem(key);
                return (
                  <Chip
                    key={key}
                    label={item ? typeOf(item.subtype).label : label}
                    icon={item ? '✓' : undefined}
                    selected={!!item}
                    onPress={() => setPicker(key)}
                  />
                );
              })}
            </Flow>

            {manual ? (
              <OutfitCard
                items={manual.items}
                score={manual.score}
                grade={manual.grade}
                reasons={manual.reasons}
                tags={manual.tags}
                venues={manual.venues}
                note={
                  <LookNote
                    ctx={context}
                    candidate={manual}
                    items={manual.items}
                    noteKey={`m:${manual.itemIds.join('|')}:${context.occasion}:${context.temp}:${context.mood}`}
                  />
                }
                onPressItem={(item) => router.push(`/item/${item.id}`)}
                footer={
                  <Row style={{ justifyContent: 'flex-end' }}>
                    <PrimaryButton label="Save" tone="plain" onPress={() => void saveManual()} />
                    <PrimaryButton label="Wear" onPress={() => void wearManual()} />
                  </Row>
                }
              />
            ) : issue ? (
              <Text style={{ color: t.textSecondary, marginTop: Spacing.three, lineHeight: 19 }}>{issue}</Text>
            ) : null}
          </Card>

          <SlotPickerModal
            visible={picker !== null}
            onClose={() => setPicker(null)}
            title={picker ? SLOTS.find((s) => s.key === picker)!.label : 'Pick'}
            category={picker === 'top' ? 'top' : picker === 'bottom' ? 'bottom' : picker === 'dress' ? 'dress' : picker === 'outer' ? 'outer' : picker === 'shoes' ? 'shoes' : 'extra'}
            items={items}
            onPick={picker ? pickFor(picker) : () => {}}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: Spacing.three, paddingBottom: 160 },
  flash: {
    padding: Spacing.three,
    borderRadius: 14,
    marginBottom: Spacing.three,
  },
});

/** Validation copy for the manual builder when the engine rejects a draft. */
function manualIssue(ctx: StyleContext, slots: LookSlots): string {
  if (slots.dress && slots.top) return 'Either a dress or separates — not both.';
  if (!(slots.top || slots.dress)) return 'Pick a top or a dress to begin.';
  if (slots.top && !slots.bottom) return 'Good — now pick bottoms.';
  if (!slots.shoes) return 'Shoes finish the look.';
  const band = TEMP_BANDS.find((b) => b.id === ctx.temp)!;
  if (band.outerRequired && !slots.outer) return `Freezing outside — a proper coat is required.`;
  return 'This draft hits a rule wall — try swapping one piece.';
}
