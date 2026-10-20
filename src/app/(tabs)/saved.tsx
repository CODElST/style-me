// Rack — saved looks, favorites and the wear history.

import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, EmptyState, IconTextButton, Row } from '@/components/kit';
import { OutfitCard } from '@/components/outfit-card';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useWardrobe } from '@/hooks/use-wardrobe';
import {
  deleteOutfit, deleteWear, listOutfits, listWears, markItemsWorn, logWear, saveOutfit,
} from '@/lib/db';
import { evaluateLook } from '@/lib/engine';
import { OCCASIONS, bandOf, occasionOf, typeOf } from '@/lib/taxonomy';
import type { Item, LookSlots, Outfit, WearEntry } from '@/lib/types';
import { relativeDate, shortDate } from '@/lib/util';

export default function SavedScreen() {
  const t = useTheme();
  const db = useSQLiteContext();
  const { items } = useWardrobe();
  const [tab, setTab] = useState<'outfits' | 'history'>('outfits');
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [wears, setWears] = useState<WearEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setOutfits(await listOutfits(db));
        setWears(await listWears(db));
      })();
    }, [db]),
  );

  const itemsOf = useCallback((ids: string[]): Item[] => {
    const byId = new Map(items.map((i) => [i.id, i]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as Item[];
  }, [items]);

  const wearOutfit = useCallback(async (outfit: Outfit) => {
    const at = Date.now();
    await logWear(db, {
      outfitId: outfit.id,
      itemIds: outfit.itemIds,
      wornAt: at,
      occasion: outfit.occasion,
      temp: 'mild',
    });
    await markItemsWorn(db, outfit.itemIds, at);
    await db.runAsync(
      'UPDATE outfits SET wear_count = wear_count + 1, last_worn_at = ? WHERE id = ?',
      [at, outfit.id],
    );
  }, [db]);

  const toggleFavorite = useCallback(async (outfit: Outfit) => {
    await saveOutfit(db, { ...outfit, favorite: !outfit.favorite });
  }, [db]);

  const remove = (outfit: Outfit) => {
    Alert.alert('Delete look?', `"${outfit.title}" will be removed from your rack.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void deleteOutfit(db, outfit.id),
      },
    ]);
  };

  const removeWear = (w: WearEntry) => {
    Alert.alert('Remove entry?', 'This wear entry will be deleted from history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteWear(db, w.id) },
    ]);
  };

  /** Real engine score for a kept look (so rack cards carry honest numbers). */
  const scoreOf = useCallback((outfit: Outfit): number => {
    const pieces = itemsOf(outfit.itemIds);
    const slots: LookSlots = {};
    for (const i of pieces) {
      if (i.category === 'top') slots.top = i;
      else if (i.category === 'bottom') slots.bottom = i;
      else if (i.category === 'dress') slots.dress = i;
      else if (i.category === 'outer') slots.outer = i;
      else if (i.category === 'shoes') slots.shoes = i;
      else slots.extra = i;
    }
    const ev = evaluateLook({ occasion: outfit.occasion, temp: 'mild', mood: outfit.mood }, slots);
    return ev?.score ?? 50;
  }, [itemsOf]);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.pad}>
          <Text style={{ color: t.text, fontSize: 30, fontWeight: '700', fontFamily: 'ui-rounded' }}>
            Rack
          </Text>
          <Text style={{ color: t.textSecondary, fontSize: 13, marginTop: 2 }}>
            Looks you kept and what you actually wore.
          </Text>

          <Row style={{ gap: Spacing.two, marginTop: Spacing.three, marginBottom: Spacing.three }}>
            <Chip label="Saved looks" selected={tab === 'outfits'} onPress={() => setTab('outfits')} size="sm" />
            <Chip label="Wear history" selected={tab === 'history'} onPress={() => setTab('history')} size="sm" />
          </Row>
        </View>

        {tab === 'outfits' ? (
          <FlatList
            data={outfits}
            keyExtractor={(o) => o.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <EmptyState
                icon="🪝"
                title="No looks kept yet"
                body="When the engine or the builder produces a look you like, hit Save — it lands here."
              />
            }
            renderItem={({ item: outfit }) => {
              const pieces = itemsOf(outfit.itemIds);
              const missing = outfit.itemIds.length !== pieces.length;
              return (
                <OutfitCard
                  items={pieces}
                  title={outfit.title}
                  score={scoreOf(outfit)}
                  grade={outfit.wearCount >= 3 ? 'Recurring' : 'Kept'}
                  venues={[outfit.occasion]}
                  reasons={missing ? ['One of its pieces has been deleted — rebuild from the items below.'] : undefined}
                  meta={`${outfit.wearCount}× worn · ${outfit.lastWornAt ? `last ${relativeDate(outfit.lastWornAt)}` : 'never worn'}`}
                  onPressItem={(it) => router.push(`/item/${it.id}`)}
                  footer={(
                    <Row style={{ gap: Spacing.two, justifyContent: 'flex-end' }}>
                      <IconTextButton
                        label={outfit.favorite ? 'Favourited' : 'Favourite'}
                        icon={outfit.favorite ? '💗' : '🤍'}
                        onPress={() => void toggleFavorite(outfit)}
                      />
                      <IconTextButton label="Wear" icon="👕" onPress={() => void wearOutfit(outfit)} />
                      <IconTextButton label="Delete" tone="danger" onPress={() => remove(outfit)} />
                    </Row>
                  )}
                />
              );
            }}
          />
        ) : (
          <FlatList
            data={wears}
            keyExtractor={(w) => w.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <EmptyState
                icon="📅"
                title="Nothing logged yet"
                body="Every look you wear (from Today or the Rack) is tracked here — use it to spot repeats before they happen."
              />
            }
            renderItem={({ item: w }) => (
              <View style={[styles.wearRow, { backgroundColor: t.backgroundElement, borderColor: t.hairline }]}>
                <Text style={{ fontSize: 22 }}>{OCCASIONS.find((o) => o.id === w.occasion)?.icon ?? '🧥'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: '600' }}>
                    {shortDate(w.wornAt)} · {bandOf(w.temp).label.toLowerCase()} · {occasionOf(w.occasion).label}
                  </Text>
                  <Text style={{ color: t.textSecondary, fontSize: 12 }} numberOfLines={2}>
                    {itemsOf(w.itemIds).map((i) => typeOf(i.subtype).label).join(' + ') || 'items deleted'}
                  </Text>
                </View>
                <IconTextButton label="" icon="🗑️" onPress={() => removeWear(w)} />
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  list: {
    paddingHorizontal: Spacing.three,
    paddingBottom: 170,
    gap: Spacing.three,
  },
  wearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
