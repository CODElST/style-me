// Simple bottom-sheet style item picker used by the manual outfit builder.

import { Image } from 'expo-image';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from './kit';
import { itemTitle } from '@/lib/display';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CategoryId, Item } from '@/lib/types';

export function SlotPickerModal({
  visible, onClose, title, category, items, onPick,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  category: CategoryId | 'any';
  items: Item[];
  onPick: (item: Item) => void;
}) {
  const t = useTheme();
  const list = (category === 'any' ? items : items.filter((i) => i.category === category))
    .filter((i) => i.available);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.background }}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ padding: Spacing.three, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ color: t.textSecondary, fontSize: 15 }}>{'✕'}</Text>
            </Pressable>
          </View>
          <FlatList
            data={list}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: Spacing.three, paddingBottom: 40, gap: Spacing.two }}
            ListEmptyComponent={
              <Text style={{ color: t.textSecondary, padding: Spacing.four, textAlign: 'center' }}>
                Nothing available in this slot yet.
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onPick(item);
                  onClose();
                }}
                style={[styles.rowCard, { borderColor: t.hairline }]}
              >
                <Image
                  source={{ uri: item.image }}
                  style={[styles.thumb, { backgroundColor: t.subtleFill }]}
                  contentFit="cover"
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: '600' }}>{itemTitle(item)}</Text>
                  <Text style={{ color: t.textSecondary, fontSize: 12 }}>
                    formality {item.formality} · warmth {item.warmth}
                  </Text>
                </View>
              </Pressable>
            )}
          />
          <View style={{ padding: Spacing.three }}>
            <PrimaryButton label="Done" onPress={onClose} tone="plain" />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  rowCard: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
    padding: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    backgroundColor: 'transparent',
  },
  thumb: {
    width: 54,
    height: 66,
    borderRadius: 10,
  },
});
