// The tag form — shared by Add Item and Item Detail (edit).
// User review is central to accuracy (per product flow): AI/rules suggest,
// the user confirms.

import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip, Flow, Row, SectionLabel, Swatch } from './kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORIES, MATERIALS, PALETTE, PATTERNS, WARMTH_LABELS, FORMALITY_LABELS, typesFor } from '@/lib/taxonomy';
import type { CategoryId, ColorId, MaterialId, PatternId, SeasonId } from '@/lib/types';

export interface TagDraft {
  category: CategoryId;
  subtype: string;
  colors: ColorId[];
  pattern: PatternId;
  material: MaterialId | null;
  warmth: number;
  formality: number;
  seasons: SeasonId[];
  note: string;
  favorite: boolean;
  available: boolean;
}

const SEASONS: SeasonId[] = ['spring', 'summer', 'autumn', 'winter'];

export function TagForm({
  value, onChange, autofillNote,
}: {
  value: TagDraft;
  onChange: (next: TagDraft) => void;
  autofillNote?: string | null;
}) {
  const t = useTheme();

  const setCategory = (category: CategoryId) => {
    const first = typesFor(category)[0];
    onChange({
      ...value,
      category,
      subtype: first.id,
      warmth: first.warmth,
      formality: first.formality,
    });
  };

  const toggleColor = (c: ColorId) => {
    const has = value.colors.includes(c);
    const colors = has
      ? value.colors.filter((x) => x !== c)
      : [...value.colors, c].slice(-3); // keep max 3
    onChange({ ...value, colors });
  };

  const toggleSeason = (s: SeasonId) => {
    const has = value.seasons.includes(s);
    const seasons = has ? value.seasons.filter((x) => x !== s) : [...value.seasons, s];
    onChange({ ...value, seasons });
  };

  return (
    <View style={{ gap: Spacing.four }}>
      {autofillNote ? (
        <View style={{ backgroundColor: t.accentSoft, borderRadius: 12, padding: Spacing.three }}>
          <Row>
            <Text style={{ marginRight: 6 }}>{'✨'}</Text>
            <Text style={{ color: t.text, flex: 1, fontSize: 13 }}>{autofillNote}</Text>
          </Row>
        </View>
      ) : null}

      <View>
        <SectionLabel>Category</SectionLabel>
        <Flow>
          {CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              icon={c.icon}
              selected={value.category === c.id}
              size="sm"
              onPress={() => setCategory(c.id)}
            />
          ))}
        </Flow>
      </View>

      <View>
        <SectionLabel>Type</SectionLabel>
        <Flow>
          {typesFor(value.category).map((ty) => (
            <Chip
              key={ty.id}
              label={ty.label}
              selected={value.subtype === ty.id}
              size="sm"
              onPress={() => onChange({ ...value, subtype: ty.id, warmth: ty.warmth, formality: ty.formality })}
            />
          ))}
        </Flow>
      </View>

      <View>
        <SectionLabel>Colors (up to 3)</SectionLabel>
        <Row style={{ flexWrap: 'wrap', gap: 0 }}>
          {PALETTE.map((p) => (
            <Swatch key={p.id} color={p.id} selected={value.colors.includes(p.id)} onPress={() => toggleColor(p.id)} />
          ))}
        </Row>
      </View>

      <View>
        <SectionLabel>Pattern</SectionLabel>
        <Flow>
          {PATTERNS.map((p) => (
            <Chip
              key={p.id}
              label={p.label}
              selected={value.pattern === p.id}
              onPress={() => onChange({ ...value, pattern: p.id })}
              size="sm"
            />
          ))}
        </Flow>
      </View>

      <View>
        <SectionLabel>Material</SectionLabel>
        <Flow>
          {MATERIALS.map((m) => (
            <Chip
              key={m.id}
              label={m.label}
              selected={value.material === m.id}
              onPress={() => onChange({ ...value, material: value.material === m.id ? null : m.id })}
              size="sm"
            />
          ))}
        </Flow>
      </View>

      <View>
        <SectionLabel>Warmth</SectionLabel>
        <Flow>
          {WARMTH_LABELS.map((label, i) => {
            const v = i + 1;
            return (
              <Chip
                key={label}
                label={label}
                selected={value.warmth === v}
                onPress={() => onChange({ ...value, warmth: v })}
                size="sm"
              />
            );
          })}
        </Flow>
      </View>

      <View>
        <SectionLabel>Formality (how dressy is it?)</SectionLabel>
        <Flow>
          {FORMALITY_LABELS.map((label, i) => (
            <Chip
              key={label}
              label={label}
              selected={value.formality === i}
              onPress={() => onChange({ ...value, formality: i })}
              size="sm"
            />
          ))}
        </Flow>
      </View>

      <View>
        <SectionLabel>Seasons</SectionLabel>
        <Flow>
          {SEASONS.map((s, i) => (
            <Chip
              key={s}
              label={SEASON_LABELS[i]}
              selected={value.seasons.includes(s)}
              onPress={() => toggleSeason(s)}
              size="sm"
            />
          ))}
        </Flow>
      </View>

      <View>
        <SectionLabel>Note (optional)</SectionLabel>
        <TextInput
          value={value.note}
          onChangeText={(note) => onChange({ ...value, note })}
          placeholder="e.g. slightly cropped, size M, hides well under a blazer…"
          placeholderTextColor={t.textSecondary}
          style={[styles.note, { color: t.text, borderColor: t.hairline }]}
          multiline
        />
      </View>
    </View>
  );
}

export const SEASON_LABELS = ['Spring', 'Summer', 'Autumn', 'Winter'];

const styles = StyleSheet.create({
  note: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
    minHeight: 60,
  },
});
