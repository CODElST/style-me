// Closet — visual wardrobe grid with filters and availability control.

import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import {
  FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, EmptyState } from '@/components/kit';
import { ItemCard } from '@/components/item-card';
import { Spacing, Radius, BottomTabInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useWardrobe } from '@/hooks/use-wardrobe';
import { itemTitle } from '@/lib/display';
import { CATEGORIES } from '@/lib/taxonomy';
import type { CategoryId } from '@/lib/types';
import { matches } from '@/lib/util';

const COLUMNS = 2;

export default function ClosetScreen() {
  const t = useTheme();
  useSQLiteContext();
  const { items } = useWardrobe();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryId | 'all'>('all');
  const [cleanOnly, setCleanOnly] = useState(false);
  const { width } = useWindowDimensions();

  const tileWidth = (Math.min(width, 520) - Spacing.three * 3) / COLUMNS;

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (cleanOnly && !i.available) return false;
      if (category !== 'all' && i.category !== category) return false;
      if (!query.trim()) return true;
      const hay = [
        itemTitle(i),
        i.subtype,
        i.note,
        i.colors.join(' '),
        i.material ?? '',
        i.pattern,
        ...i.seasons,
      ].join(' ');
      return matches(hay, query);
    });
  }, [items, category, query, cleanOnly]);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.pad}>
          <View style={styles.headerRow}>
            <Text style={{ color: t.text, fontSize: 30, fontWeight: '700', fontFamily: 'ui-rounded' }}>
              Closet
            </Text>
            <Text style={{ color: t.textSecondary, fontSize: 13 }}>
              {items.filter((i) => i.available).length} clean · {items.length} total
            </Text>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search type, color, note…"
            placeholderTextColor={t.textSecondary}
            style={[styles.search, { color: t.text, borderColor: t.hairline, backgroundColor: t.backgroundElement }]}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            <Chip label="All" selected={category === 'all'} onPress={() => setCategory('all')} size="sm" />
            {CATEGORIES.map((c) => (
              <Chip
                key={c.id}
                label={c.label}
                icon={c.icon}
                selected={category === c.id}
                onPress={() => setCategory(c.id)}
                size="sm"
              />
            ))}
            <Chip
              label="Clean only"
              icon={cleanOnly ? '🧼' : '🧺'}
              selected={cleanOnly}
              onPress={() => setCleanOnly((v) => !v)}
              size="sm"
            />
          </ScrollView>
        </View>

        <FlatList
          data={filtered}
          numColumns={COLUMNS}
          key={`${category}-${cleanOnly}`}
          contentContainerStyle={{ paddingHorizontal: Spacing.three, paddingBottom: 170, gap: Spacing.three }}
          columnWrapperStyle={{ gap: Spacing.three }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="🪶"
              title={items.length === 0 ? 'Your closet is empty' : 'Nothing matches'}
              body={items.length === 0
                ? 'Add your first piece with the + button — a photo plus a few tags is all it takes.'
                : 'Try another filter or clear the search.'}
            />
          }
          renderItem={({ item }) => (
            <ItemCard
              item={item}
              width={tileWidth}
              onPress={(it) => router.push(`/item/${it.id}`)}
            />
          )}
        />

        <Pressable
          onPress={() => router.push('/add-item')}
          style={[styles.fab, { backgroundColor: t.accent }]}
          accessibilityLabel="Add item"
        >
          <Text style={{ color: '#FFF7F1', fontSize: 24, fontWeight: '600' }}>+</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: Spacing.three,
  },
  search: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    fontSize: 15,
  },
  filters: {
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  fab: {
    position: 'absolute',
    right: Spacing.four,
    bottom: BottomTabInset + Spacing.three,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
