import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ColorDots } from './kit';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { itemTitle } from '@/lib/display';
import type { Item } from '@/lib/types';

/** Grid tile for the closet. */
export function ItemCard({
  item, onPress, width,
}: {
  item: Item;
  onPress: (item: Item) => void;
  width: number;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => onPress(item)}
      onLongPress={() => onPress(item)}
      style={[
        {
          width,
          backgroundColor: t.subtleFill,
          borderRadius: Radius.md,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.hairline,
        },
        styles.shadow,
      ]}
    >
      <Image
        source={{ uri: item.image }}
        style={{ width: '100%', aspectRatio: 3 / 4 }}
        contentFit="cover"
        transition={120}
        accessibilityLabel={itemTitle(item)}
      />
      <View style={{ padding: Spacing.two }}>
        <Text numberOfLines={1} style={{ color: t.text, fontWeight: '600', fontSize: 13 }}>
          {itemTitle(item)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, justifyContent: 'space-between' }}>
          <ColorDots colors={item.colors} size={10} />
          <Text style={{ fontSize: 11, color: t.textSecondary }}>
            {!item.available ? '🧺' : item.wearCount > 0 ? `${item.wearCount}×` : '✨'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: {
    // soft, minimal elevation (iOS web unsupported; safe everywhere)
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
