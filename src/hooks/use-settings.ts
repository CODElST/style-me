import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getSettings, setSetting } from '@/lib/db';
import type { AppSettings } from '@/lib/types';

/** Settings persisted in the local DB. */
export function useAppSettings() {
  const db = useSQLiteContext();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const reload = useCallback(async () => {
    setSettings(await getSettings(db));
  }, [db]);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  const update = useCallback(
    async (patch: Partial<AppSettings>) => {
      for (const [k, v] of Object.entries(patch)) {
        await setSetting(db, k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
      }
      await reload();
    },
    [db, reload],
  );
  return { settings, update, reload };
}
