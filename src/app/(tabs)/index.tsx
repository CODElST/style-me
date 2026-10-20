// Today — "What should I wear?"
// Local context in, generated looks out. Offline rules engine; the native AI
// layer refines phrasing when present.

import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Chip, ChipRow, EmptyState, PrimaryButton, SectionLabel,
} from '@/components/kit';
import { OutfitCard } from '@/components/outfit-card';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useWardrobe } from '@/hooks/use-wardrobe';
import { markItemsWorn, logWear, saveOutfit, setSetting } from '@/lib/db';
import { generateLooks } from '@/lib/engine';
import { MOODS, OCCASIONS, TEMP_BANDS, occasionOf } from '@/lib/taxonomy';
import type { MoodId, OccasionId, OutfitCandidate, StyleContext, TempBandId } from '@/lib/types';

export default function TodayScreen() {
  const t = useTheme();
  const db = useSQLiteContext();
  const { items } = useWardrobe();
  const [context, setContext] = useState<StyleContext>({ occasion: 'out', temp: 'mild', mood: 'classic' });
  const [looks, setLooks] = useState<OutfitCandidate[] | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    [],
  );

  const update = (patch: Partial<StyleContext>) => setContext((c) => ({ ...c, ...patch }));

  const generate = useCallback(() => {
    void setSetting(db, 'lastOccasion', context.occasion);
    void setSetting(db, 'lastTemp', context.temp);
    void setSetting(db, 'lastMood', context.mood);
    const result = generateLooks(context, items, 8);
    setLooks(result.looks);
    setHint(result.hint);
  }, [context, items, db]);

  const wearLook = useCallback(async (look: OutfitCandidate) => {
    const at = Date.now();
    await logWear(db, {
      outfitId: null,
      itemIds: look.itemIds,
      wornAt: at,
      occasion: context.occasion,
      temp: context.temp,
    });
    await markItemsWorn(db, look.itemIds, at);
    setFlash('Enjoy — logged in your wear history');
  }, [db, context]);

  const saveLook = useCallback(async (look: OutfitCandidate) => {
    await saveOutfit(db, {
      id: `${Date.now()}-m${Math.random().toString(36).slice(2, 6)}`,
      title: `${occasionOf(context.occasion).label} look`,
      itemIds: look.itemIds,
      occasion: context.occasion,
      mood: context.mood,
      favorite: false,
      wearCount: 0,
      lastWornAt: null,
      note: '',
      createdAt: Date.now(),
    });
    setFlash('Saved to your rack');
  }, [db, context]);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.pad}>
          <View style={styles.header}>
            <Text style={{ color: t.text, fontSize: 30, fontWeight: '700', fontFamily: 'ui-rounded' }}>
              Today
            </Text>
            <Text style={{ color: t.textSecondary, fontSize: 13 }}>{todayLabel}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: t.backgroundElement, borderColor: t.hairline }]}>
            <View style={{ gap: Spacing.three }}>
              <View>
                <SectionLabel>What for</SectionLabel>
                <ChipRow>
                  {OCCASIONS.map((o) => (
                    <Chip
                      key={o.id}
                      label={o.label}
                      icon={o.icon}
                      selected={context.occasion === o.id}
                      onPress={() => update({ occasion: o.id as OccasionId })}
                      size="sm"
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
                      onPress={() => update({ temp: b.id as TempBandId })}
                      size="sm"
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
                      onPress={() => update({ mood: m.id as MoodId })}
                      size="sm"
                    />
                  ))}
                </ChipRow>
              </View>
            </View>
            <View style={{ marginTop: Spacing.four }}>
              <PrimaryButton label="Suggest looks" onPress={generate} />
            </View>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {flash ? (
            <View style={[styles.flash, { backgroundColor: t.accentSoft }]}>
              <Text style={{ color: t.accent, fontWeight: '600', fontSize: 13 }}>{flash}</Text>
            </View>
          ) : null}
          {looks === null
            ? (
                <View>
                  <EmptyState
                    icon="🪞"
                    title="Let's dress you"
                    body="Pick the plan for today — occasion, how cold it is, and how you want to feel. I pair your clean pieces and explain why each look works."
                  />
                </View>
              )
            : looks.length === 0
              ? (
                  <View>
                    <EmptyState icon="🧺" title="No complete look yet" body={hint ?? 'Add a few more pieces and try again.'} />
                  </View>
                )
              : (
                  <View style={{ gap: Spacing.three }}>
                    {looks.map((look) => (
                      <OutfitCard
                        key={look.key}
                        items={look.items}
                        score={look.score}
                        grade={look.grade}
                        reasons={look.reasons}
                        tags={look.tags}
                        venues={look.venues}
                        onPressItem={(item) => router.push(`/item/${item.id}`)}
                        footer={(
                          <View style={[styles.actionsRow, { gap: Spacing.two }]}>
                            <PrimaryButton label="Save" onPress={() => void saveLook(look)} tone="plain" />
                            <PrimaryButton label="Wear" onPress={() => void wearLook(look)} />
                          </View>
                        )}
                      />
                    ))}
                  </View>
                )}
          {hint && looks && looks.length > 0 ? (
            <Text style={{ color: t.textSecondary, fontSize: 12, textAlign: 'center' }}>{hint}</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  header: { marginBottom: Spacing.three },
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  list: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: 140,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  flash: {
    padding: Spacing.three,
    borderRadius: 14,
  },
});
