// Small shared UI kit built on RN primitives + the theme tokens.

import * as Haptics from 'expo-haptics';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from './themed-text';
import { Spacing, Radius, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { hexOf } from '@/lib/taxonomy';
import type { ColorId } from '@/lib/types';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.backgroundElement,
          borderRadius: Radius.lg,
          padding: Spacing.three,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.hairline,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ color: t.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: Spacing.two }}>
      {children}
    </Text>
  );
}

export function Chip({
  label, selected, icon, onPress, size = 'md',
}: {
  label: string;
  selected: boolean;
  icon?: string;
  onPress: () => void;
  size?: 'sm' | 'md';
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.selectionAsync();
        onPress();
      }}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? t.accent : t.subtleFill,
          borderColor: selected ? t.accent : t.hairline,
        },
      ]}
      accessibilityState={{ selected }}
    >
      {icon ? <Text style={{ fontSize: size === 'sm' ? 13 : 15 }}>{icon} </Text> : null}
      <Text
        style={{
          color: selected ? '#FFF7F1' : t.text,
          fontWeight: selected ? '700' : '500',
          fontSize: size === 'sm' ? 12.5 : 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A horizontally scrollable row of chips (occasion / mood pickers). */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {children}
    </ScrollView>
  );
}

export function ColorDots({ colors, size = 12 }: { colors: ColorId[]; size?: number }) {
  return (
    <View style={[styles.row, styles.dots]}>
      {colors.slice(0, 3).map((c) => (
        <View
          key={c}
          style={{
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: hexOf(c), borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(0,0,0,0.18)',
          }}
        />
      ))}
    </View>
  );
}

/** Color swatch used in the item tagger. */
export function Swatch({
  color, selected, onPress,
}: { color: ColorId; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={color}
      accessibilityState={{ selected }}
      style={[
        styles.swatch,
        { backgroundColor: hexOf(color), borderColor: selected ? t.accent : 'transparent', borderWidth: selected ? 3 : 0 },
      ]}
    />
  );
}

export function ScoreRing({ score, size = 46 }: { score: number; size?: number }) {
  const t = useTheme();
  const colourFor = (s: number) => (s >= 74 ? t.accent : s >= 58 ? t.textSecondary : t.danger);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colourFor(score) + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colourFor(score), fontWeight: '800', fontSize: size * 0.34, fontFamily: Fonts.rounded }}>
        {score}
      </Text>
    </View>
  );
}

export function GradePill({ grade, score }: { grade: string; score: number }) {
  const t = useTheme();
  const strong = score >= 74;
  return (
    <View style={[
      styles.pill,
      { backgroundColor: strong ? t.accentSoft : t.subtleFill },
    ]}>
      <Text style={{ color: strong ? t.accent : t.textSecondary, fontWeight: '800', fontSize: 11.5, letterSpacing: 0.4 }}>
        {grade.toUpperCase()}
      </Text>
    </View>
  );
}

export function TagPill({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: t.subtleFill }]}>
      <Text style={{ color: t.textSecondary, fontWeight: '600', fontSize: 11.5 }}>{children}</Text>
    </View>
  );
}

export function PrimaryButton({
  label, onPress, disabled, tone = 'accent',
}: { label: string; onPress: () => void; disabled?: boolean; tone?: 'accent' | 'plain' }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.selectionAsync();
        onPress();
      }}
      disabled={disabled}
      style={[styles.button, {
        backgroundColor: disabled ? t.subtleFill : tone === 'accent' ? t.accent : t.backgroundElement,
        borderColor: tone === 'accent' ? 'transparent' : t.hairline,
        borderWidth: StyleSheet.hairlineWidth,
        opacity: disabled ? 0.6 : 1,
      }]}
    >
      <Text style={{
        color: disabled ? t.textSecondary : tone === 'accent' ? '#FFF7F1' : t.text,
        fontWeight: '700', fontSize: 15,
      }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconTextButton({
  label, icon, onPress, tone = 'plain',
}: { label: string; icon?: string; onPress: () => void; tone?: 'plain' | 'danger' }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.iconTextButton, { borderColor: tone === 'danger' ? t.danger : t.hairline }]}
    >
      {icon ? <Text style={{ fontSize: 14, marginRight: Spacing.one }}>{icon}</Text> : null}
      <Text style={{ color: tone === 'danger' ? t.danger : t.text, fontWeight: '600', fontSize: 13.5 }}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 42 }}>{icon}</Text>
      <ThemedText type="subtitle" style={{ fontSize: 22, lineHeight: 30, textAlign: 'center' }}>{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', maxWidth: 300 }}>
        {body}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 99,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipRow: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
  },
  row: { flexDirection: 'row' },
  dots: { gap: 4 },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 8,
  },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 99,
    alignSelf: 'flex-start',
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTextButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 99,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: 48,
  },
});

/** Spacer of themed hairline */
export function Divider({ inset = 0 }: { inset?: number }) {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.hairline, marginVertical: Spacing.three, marginHorizontal: inset }} />;
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

/** Wrapping flow of arbitrary chips (non-scrolling, for small counts). */
export function Flow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>{children}</View>;
}
