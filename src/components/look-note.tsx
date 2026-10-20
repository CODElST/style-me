// LookNote — the one-sentence styling note on an outfit card.
//
// Renders the deterministic rules text instantly (never blocks the UI), then
// swaps in the on-device model's phrasing if the native bridge is usable. Any
// failure keeps the rules text, so this is purely additive.

import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { describeLookEnhanced, describeLookText } from '@/lib/ai';
import type { Item, OutfitCandidate, StyleContext } from '@/lib/types';

export interface LookNoteProps {
  ctx: StyleContext;
  candidate: OutfitCandidate;
  items: Item[];
  /**
   * Stable string that changes only when the underlying look (or context)
   * changes. Engine looks have a `key`; manual mixes must build one from
   * item ids + context, since `evaluateLook` returns a fresh object each pass.
   */
  noteKey: string;
}

interface NoteCache {
  key: string;
  text: string;
  upgraded: boolean;
}

export function LookNote({ ctx, candidate, items, noteKey }: LookNoteProps) {
  const t = useTheme();
  const [cache, setCache] = useState<NoteCache>(() => ({
    key: noteKey,
    text: describeLookText(ctx, candidate, items),
    upgraded: false,
  }));

  // Adjust state during render when the look changed — the canonical React
  // pattern for "derived state from props", avoiding sync setState in effects.
  if (cache.key !== noteKey) {
    setCache({
      key: noteKey,
      text: describeLookText(ctx, candidate, items),
      upgraded: false,
    });
  }

  // The async native upgrade lands in a callback (never synchronously), so
  // this is the only place an effect touches state.
  useEffect(() => {
    if (cache.upgraded) return;
    let live = true;
    describeLookEnhanced(ctx, candidate, items)
      .then((upgraded) => {
        if (live) setCache((c) => (c.key === noteKey && c.text !== upgraded ? { ...c, text: upgraded, upgraded: true } : c));
      })
      .catch(() => {
        /* describeLookEnhanced never rejects; keep the rules text anyway */
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- noteKey covers ctx/candidate/items identity
  }, [noteKey]);

  return (
    <Text style={[styles.note, { color: t.textSecondary }]}>
      {cache.text}
    </Text>
  );
}

const styles = StyleSheet.create({
  note: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: Spacing.two,
  },
});
