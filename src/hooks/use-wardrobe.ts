import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { listItems } from '@/lib/db';
import type { Item } from '@/lib/types';

/** Loads the wardrobe (and refreshes on every focus). */
export function useWardrobe() {
  const db = useSQLiteContext();
  const [items, setItems] = useState<Item[]>([]);
  const reload = useCallback(async () => {
    setItems(await listItems(db));
  }, [db]);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  return { items, reload };
}
