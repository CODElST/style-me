// Local database (expo-sqlite). The entire wardrobe lives on the phone.
// Schema is versioned with PRAGMA user_version, matching the Expo docs pattern.

import type { SQLiteDatabase } from 'expo-sqlite';
import Constants from 'expo-constants';
import type {
  AppSettings, ColorId, Item, LookupRef, MaterialId, MoodId, OccasionId,
  Outfit, PatternId, SeasonId, TempBandId, WearEntry,
} from './types';

const DB_VERSION = 1;

export async function migrateDatabaseIfNeeded(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= DB_VERSION) return;

  if (current === 0) {
    await db.execAsync(`
PRAGMA journal_mode = 'wal';
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY NOT NULL,
  image TEXT NOT NULL,
  category TEXT NOT NULL,
  subtype TEXT NOT NULL,
  colors TEXT NOT NULL,
  pattern TEXT NOT NULL DEFAULT 'solid',
  material TEXT,
  warmth INTEGER NOT NULL DEFAULT 2,
  formality INTEGER NOT NULL DEFAULT 1,
  seasons TEXT NOT NULL DEFAULT '[]',
  available INTEGER NOT NULL DEFAULT 1,
  favorite INTEGER NOT NULL DEFAULT 0,
  wear_count INTEGER NOT NULL DEFAULT 0,
  last_worn_at INTEGER,
  note TEXT NOT NULL DEFAULT '',
  look_url TEXT,
  refs TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_category ON items (category);
CREATE TABLE IF NOT EXISTS outfits (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  item_ids TEXT NOT NULL,
  occasion TEXT NOT NULL,
  mood TEXT NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0,
  wear_count INTEGER NOT NULL DEFAULT 0,
  last_worn_at INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wears (
  id TEXT PRIMARY KEY NOT NULL,
  outfit_id TEXT,
  item_ids TEXT NOT NULL,
  worn_at INTEGER NOT NULL,
  occasion TEXT NOT NULL,
  temp TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wears_worn_at ON wears (worn_at DESC);
CREATE TABLE IF NOT EXISTS kvar (
  k TEXT PRIMARY KEY NOT NULL,
  v TEXT NOT NULL
);
`);
  }
  // -- future migrations go here (if current === 1) --

  await db.execAsync(`PRAGMA user_version = ${DB_VERSION}`);
}

// ---------------------------------------------------------------- row mappers

interface ItemRow {
  id: string; image: string; category: string; subtype: string;
  colors: string; pattern: string; material: string | null;
  warmth: number; formality: number; seasons: string;
  available: number; favorite: number; wear_count: number;
  last_worn_at: number | null; note: string; look_url: string | null;
  refs: string; created_at: number; updated_at: number;
}

export function itemFromRow(r: ItemRow): Item {
  return {
    id: r.id,
    image: r.image,
    category: r.category as Item['category'],
    subtype: r.subtype,
    colors: safeJsonList<ColorId>(r.colors),
    pattern: r.pattern as PatternId,
    material: (r.material as MaterialId | null) ?? null,
    warmth: r.warmth,
    formality: r.formality,
    seasons: safeJsonList<SeasonId>(r.seasons),
    available: !!r.available,
    favorite: !!r.favorite,
    wearCount: r.wear_count,
    lastWornAt: r.last_worn_at,
    note: r.note,
    lookUrl: r.look_url,
    refs: safeJsonList<LookupRef>(r.refs),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function safeJsonList<T>(raw: string): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v as T[] : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- items

export async function listItems(db: SQLiteDatabase): Promise<Item[]> {
  const rows = await db.getAllAsync<ItemRow>(
    'SELECT * FROM items ORDER BY updated_at DESC',
  );
  return rows.map(itemFromRow);
}

export async function getItem(db: SQLiteDatabase, id: string): Promise<Item | null> {
  const row = await db.getFirstAsync<ItemRow>('SELECT * FROM items WHERE id = ?', [id]);
  return row ? itemFromRow(row) : null;
}

export async function saveItem(db: SQLiteDatabase, item: Item): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO items
        (id, image, category, subtype, colors, pattern, material, warmth, formality,
         seasons, available, favorite, wear_count, last_worn_at, note, look_url, refs,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         image=excluded.image, category=excluded.category, subtype=excluded.subtype,
         colors=excluded.colors, pattern=excluded.pattern, material=excluded.material,
         warmth=excluded.warmth, formality=excluded.formality, seasons=excluded.seasons,
         available=excluded.available, favorite=excluded.favorite, wear_count=excluded.wear_count,
         last_worn_at=excluded.last_worn_at, note=excluded.note, look_url=excluded.look_url,
         refs=excluded.refs, updated_at=excluded.updated_at`,
      [
        item.id, item.image, item.category, item.subtype,
        JSON.stringify(item.colors), item.pattern, item.material, item.warmth,
        item.formality, JSON.stringify(item.seasons),
        item.available ? 1 : 0, item.favorite ? 1 : 0,
        item.wearCount, item.lastWornAt, item.note, item.lookUrl,
        JSON.stringify(item.refs), item.createdAt, item.updatedAt,
      ],
    );
  });
}

export async function deleteItem(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM items WHERE id = ?', [id]);
}

/** After an item was worn. */
export async function markItemsWorn(db: SQLiteDatabase, itemIds: string[], at: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const id of itemIds) {
      await db.runAsync(
        'UPDATE items SET wear_count = wear_count + 1, last_worn_at = ?, updated_at = ? WHERE id = ?',
        [at, at, id],
      );
    }
  });
}

// ---------------------------------------------------------------- outfits

interface OutfitRow {
  id: string; title: string; item_ids: string; occasion: string; mood: string;
  favorite: number; wear_count: number; last_worn_at: number | null;
  note: string; created_at: number;
}

function outfitFromRow(r: OutfitRow): Outfit {
  return {
    id: r.id,
    title: r.title,
    itemIds: safeJsonList<string>(r.item_ids),
    occasion: r.occasion as OccasionId,
    mood: r.mood as MoodId,
    favorite: !!r.favorite,
    wearCount: r.wear_count,
    lastWornAt: r.last_worn_at,
    note: r.note,
    createdAt: r.created_at,
  };
}

export async function listOutfits(db: SQLiteDatabase): Promise<Outfit[]> {
  const rows = await db.getAllAsync<OutfitRow>(
    'SELECT * FROM outfits ORDER BY favorite DESC, created_at DESC',
  );
  return rows.map(outfitFromRow);
}

export async function getOutfit(db: SQLiteDatabase, id: string): Promise<Outfit | null> {
  const row = await db.getFirstAsync<OutfitRow>('SELECT * FROM outfits WHERE id = ?', [id]);
  return row ? outfitFromRow(row) : null;
}

export async function saveOutfit(db: SQLiteDatabase, outfit: Outfit): Promise<void> {
  await db.runAsync(
    `INSERT INTO outfits
      (id, title, item_ids, occasion, mood, favorite, wear_count, last_worn_at, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title, item_ids=excluded.item_ids, occasion=excluded.occasion,
       mood=excluded.mood, favorite=excluded.favorite, wear_count=excluded.wear_count,
       last_worn_at=excluded.last_worn_at, note=excluded.note`,
    [
      outfit.id, outfit.title, JSON.stringify(outfit.itemIds), outfit.occasion,
      outfit.mood, outfit.favorite ? 1 : 0, outfit.wearCount, outfit.lastWornAt,
      outfit.note, outfit.createdAt,
    ],
  );
}

export async function deleteOutfit(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM outfits WHERE id = ?', [id]);
}

// ---------------------------------------------------------------- wear history

export async function logWear(
  db: SQLiteDatabase,
  entry: Omit<WearEntry, 'id'>,
): Promise<WearEntry> {
  const id = `${entry.wornAt}-${Math.random().toString(36).slice(2, 8)}`;
  const full: WearEntry = { id, ...entry };
  await db.runAsync(
    'INSERT INTO wears (id, outfit_id, item_ids, worn_at, occasion, temp) VALUES (?, ?, ?, ?, ?, ?)',
    [full.id, full.outfitId, JSON.stringify(full.itemIds), full.wornAt, full.occasion, full.temp],
  );
  return full;
}

export async function listWears(db: SQLiteDatabase, limit = 40): Promise<WearEntry[]> {
  const rows = await db.getAllAsync<{
    id: string; outfit_id: string | null; item_ids: string;
    worn_at: number; occasion: string; temp: string;
  }>('SELECT * FROM wears ORDER BY worn_at DESC LIMIT ?', [limit]);
  return rows.map((r) => ({
    id: r.id,
    outfitId: r.outfit_id,
    itemIds: safeJsonList<string>(r.item_ids),
    wornAt: r.worn_at,
    occasion: r.occasion as OccasionId,
    temp: r.temp as TempBandId,
  }));
}

export async function deleteWear(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM wears WHERE id = ?', [id]);
}

// ---------------------------------------------------------------- settings (kv)

export interface RawSettings {
  lookupConsent: string;
  lookupEndpoint: string;
  lastOccasion: string;
  lastTemp: string;
  lastMood: string;
}

// Lookup endpoint can be pre-seeded by the build via app.json `extra`
// (e.g. a personal server on the LAN); the user can always override in Settings.
const DEFAULT_LOOKUP_ENDPOINT = String(
  (Constants.expoConfig?.extra as { lookupEndpoint?: string } | undefined)?.lookupEndpoint ?? '',
);

const SETTINGS_DEFAULTS: AppSettings = {
  lookupConsent: false,
  lookupEndpoint: DEFAULT_LOOKUP_ENDPOINT,
  cloudAiEnabled: false,
  cloudAiEndpoint: '',
  cloudAiModel: '',
  cloudAiKey: '',
  cloudAiPhotos: false,
  lastOccasion: 'out' as OccasionId,
  lastTemp: 'mild' as TempBandId,
  lastMood: 'classic' as MoodId,
};

export async function getSettings(db: SQLiteDatabase): Promise<AppSettings> {
  const rows = await db.getAllAsync<{ k: string; v: string }>('SELECT * FROM kvar');
  const kv = new Map(rows.map((r) => [r.k, r.v]));
  return {
    lookupConsent: kv.get('lookupConsent') === '1',
    lookupEndpoint: kv.get('lookupEndpoint') ?? SETTINGS_DEFAULTS.lookupEndpoint,
    cloudAiEnabled: kv.get('cloudAiEnabled') === '1',
    cloudAiEndpoint: kv.get('cloudAiEndpoint') ?? SETTINGS_DEFAULTS.cloudAiEndpoint,
    cloudAiModel: kv.get('cloudAiModel') ?? SETTINGS_DEFAULTS.cloudAiModel,
    cloudAiKey: kv.get('cloudAiKey') ?? SETTINGS_DEFAULTS.cloudAiKey,
    cloudAiPhotos: kv.get('cloudAiPhotos') === '1',
    lastOccasion: (kv.get('lastOccasion') as OccasionId) ?? SETTINGS_DEFAULTS.lastOccasion,
    lastTemp: (kv.get('lastTemp') as TempBandId) ?? SETTINGS_DEFAULTS.lastTemp,
    lastMood: (kv.get('lastMood') as MoodId) ?? SETTINGS_DEFAULTS.lastMood,
  };
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO kvar (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
    [key, value],
  );
}

// ---------------------------------------------------------------- stats

export interface WardrobeStats {
  total: number;
  available: number;
  favorites: number;
  outfits: number;
  wearsLogged: number;
}

export async function getStats(db: SQLiteDatabase): Promise<WardrobeStats> {
  const a = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM items');
  const b = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM items WHERE available = 1');
  const c = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM items WHERE favorite = 1');
  const d = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM outfits');
  const e = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM wears');
  return {
    total: a?.c ?? 0,
    available: b?.c ?? 0,
    favorites: c?.c ?? 0,
    outfits: d?.c ?? 0,
    wearsLogged: e?.c ?? 0,
  };
}
