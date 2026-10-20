import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GradePill, Row, ScoreRing, TagPill } from './kit';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { itemTitle } from '@/lib/display';
import { occasionOf } from '@/lib/taxonomy';
import type { Item, OccasionId } from '@/lib/types';

export interface OutfitCardProps {
  items: Item[];
  score: number;
  grade: string;
  reasons?: string[];
  tags?: string[];
  venues?: OccasionId[];
  title?: string | null;
  meta?: string | null;
  /** Extra styling copy rendered above `meta` (e.g. a <LookNote>). */
  note?: ReactNode;
  onPressItem?: (item: Item) => void;
  footer?: ReactNode;
}

/** Renders one look: thumbs, score, reasons and optional action footer. */
export function OutfitCard(props: OutfitCardProps) {
  const t = useTheme();
  const { items, score, grade, reasons = [], tags = [], venues = [], title, meta, note, onPressItem, footer } = props;

  const fashion = items.filter((i) => i.category !== 'extra');
  const extras = items.filter((i) => i.category === 'extra');

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: t.backgroundElement, borderColor: t.hairline },
      ]}
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          {title ? (
            <Text numberOfLines={1} style={{ color: t.text, fontWeight: '700', fontSize: 15 }}>
              {title}
            </Text>
          ) : null}
          <Row style={{ gap: Spacing.one, marginTop: title ? 2 : 0 }}>
            <GradePill grade={grade} score={score} />
            {venues.slice(0, 2).map((v) => (
              <Text key={v} style={{ color: t.textSecondary, fontSize: 11.5 }}>
                also {occasionOf(v).label.toLowerCase()}
              </Text>
            ))}
          </Row>
        </View>
        <ScoreRing score={score} />
      </Row>

      <View style={styles.thumbRow}>
        {fashion.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onPressItem?.(item)}
            style={[styles.thumb, { borderColor: t.hairline }]}
            accessibilityLabel={itemTitle(item)}
          >
            <Image
              source={{ uri: item.image }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={80}
            />
          </Pressable>
        ))}
        {extras.map((item) => (
          <View key={item.id} style={[styles.thumb, styles.thumbSmall, { borderColor: t.hairline }]}>
            <Text style={{ fontSize: 16 }}>
              {typeIcon(item.subtype)}
            </Text>
          </View>
        ))}
      </View>

      {reasons.length > 0 ? (
        <View style={{ gap: 3, marginTop: Spacing.two }}>
          {reasons.slice(0, 3).map((r, i) => (
            <Text key={i} style={{ color: t.textSecondary, fontSize: 12.5, lineHeight: 17 }}>
              {'· '}
              {r}
            </Text>
          ))}
        </View>
      ) : null}

      {tags.length > 0 ? (
        <View style={[styles.chips, { marginTop: Spacing.two }]}>
          {tags.map((tag) => (
            <TagPill key={tag}>{tag}</TagPill>
          ))}
        </View>
      ) : null}

      {note}

      {meta ? (
        <Text style={{ color: t.textSecondary, fontSize: 12, marginTop: Spacing.two }}>{meta}</Text>
      ) : null}

      {footer ? <View style={{ marginTop: Spacing.three }}>{footer}</View> : null}
    </View>
  );
}

const ICON_HINTS: Record<string, string> = {
  bag: '👜', cap: '🧢', hat: '👒', beanie: '🧶', scarf: '🧣', gloves: '🧤',
  belt: '🪢', watch: '⌚', sunglasses: '🕶️', jewellery: '💎',
};
function typeIcon(subtype: string): string {
  return ICON_HINTS[subtype] ?? '🧿';
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  thumbRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  thumb: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#EFEAE1',
  },
  thumbSmall: {
    flex: 0,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
