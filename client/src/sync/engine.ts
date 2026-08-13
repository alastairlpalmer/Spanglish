// Sync engine: IndexedDB is the working store; Supabase is durability.
// Push dirty rows, pull by keyset cursor (updated_at, id). LWW on updated_at
// for mutable tables; sessions and error_examples are append-only — insert
// with ignoreDuplicates, never overwrite. Losing logged hours to a sync race
// would undermine the app's only honest metric.

import { db, getMeta, setMeta, type Synced } from '../db/dexie';
import { LOCAL_MODE, supabase, currentUserId } from '../lib/supabase';

interface TableConfig {
  name: 'profile' | 'sessions' | 'cards' | 'error_concepts' | 'error_examples' | 'plans';
  appendOnly: boolean;
  /** Dexie primary key extractor, for dedupe + conflict checks. */
  key: (row: Record<string, unknown>) => string | [string, string];
  conflict: string; // Postgres upsert conflict target
}

const TABLES: TableConfig[] = [
  { name: 'profile', appendOnly: false, key: (r) => r.user_id as string, conflict: 'user_id' },
  { name: 'sessions', appendOnly: true, key: (r) => r.id as string, conflict: 'id' },
  { name: 'cards', appendOnly: false, key: (r) => r.id as string, conflict: 'id' },
  {
    name: 'error_concepts',
    appendOnly: false,
    key: (r) => [r.user_id as string, r.concept as string],
    conflict: 'user_id,concept',
  },
  { name: 'error_examples', appendOnly: true, key: (r) => r.id as string, conflict: 'id' },
  {
    name: 'plans',
    appendOnly: false,
    key: (r) => [r.user_id as string, r.date as string],
    conflict: 'user_id,date',
  },
];

let inFlight: Promise<void> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced sync request — call after any write. Safe to call constantly. */
export function requestSync(): void {
  if (LOCAL_MODE) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void runSync(), 3000);
}

/** Immediate sync — app start, reconnect, visible, post-session-commit. */
export async function runSync(): Promise<void> {
  if (LOCAL_MODE) return;
  if (inFlight) return inFlight;
  inFlight = doSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doSync(): Promise<void> {
  const client = supabase();
  const userId = await currentUserId();
  if (!client || !userId) return; // signed out: local data stays, sync pauses

  for (const table of TABLES) {
    try {
      await pushTable(table);
      await pullTable(table, userId);
    } catch {
      // Network or auth failure: leave rows dirty, try again next trigger.
      return;
    }
  }
}

async function pushTable(table: TableConfig): Promise<void> {
  const client = supabase()!;
  const dexieTable = db[table.name];
  const dirty = (await dexieTable.where('dirty').equals(1).toArray()) as unknown as Array<
    Synced<Record<string, unknown>>
  >;
  if (dirty.length === 0) return;

  // Snapshot updated_at so a mid-flight edit keeps its dirty flag.
  const snapshots = new Map<string, string>();
  const rows = dirty.map((row) => {
    const { dirty: _d, ...clean } = row;
    snapshots.set(JSON.stringify(table.key(row)), row.updated_at as string);
    return clean;
  });

  const query = client.from(table.name);
  const { error } = table.appendOnly
    ? await query.upsert(rows, { onConflict: table.conflict, ignoreDuplicates: true })
    : await query.upsert(rows, { onConflict: table.conflict });
  if (error) throw error;

  await db.transaction('rw', dexieTable, async () => {
    for (const row of dirty) {
      const keyStr = JSON.stringify(table.key(row));
      const current = (await dexieTable.get(table.key(row) as never)) as
        | Synced<Record<string, unknown>>
        | undefined;
      if (current && current.updated_at === snapshots.get(keyStr)) {
        await dexieTable.put({ ...current, dirty: 0 } as never);
      }
    }
  });
}

async function pullTable(table: TableConfig, userId: string): Promise<void> {
  const client = supabase()!;
  const dexieTable = db[table.name];
  const cursorKey = `pull:${table.name}`;
  const rawCursor = await getMeta(cursorKey);
  const cursor = rawCursor ? (JSON.parse(rawCursor) as { u: string; id: string }) : null;

  for (;;) {
    let query = client
      .from(table.name)
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: true })
      .limit(500);
    if (cursor) query = query.gt('updated_at', cursor.u);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) return;

    await db.transaction('rw', dexieTable, async () => {
      for (const remote of data as Array<Record<string, unknown>>) {
        const key = table.key(remote);
        const local = (await dexieTable.get(key as never)) as
          | Synced<Record<string, unknown>>
          | undefined;
        if (table.appendOnly) {
          if (!local) await dexieTable.put({ ...remote, dirty: 0 } as never);
          continue;
        }
        // LWW: a dirty local row that is at least as new wins; otherwise remote.
        if (
          local &&
          local.dirty === 1 &&
          (local.updated_at as string) >= (remote.updated_at as string)
        ) {
          continue;
        }
        await dexieTable.put({ ...remote, dirty: 0 } as never);
      }
    });

    const last = data[data.length - 1] as Record<string, unknown>;
    await setMeta(
      cursorKey,
      JSON.stringify({ u: last.updated_at as string, id: String(table.key(last)) }),
    );
    if (data.length < 500) return;
  }
}

/** Wire global triggers once at app start. */
export function initSyncTriggers(): void {
  if (LOCAL_MODE) return;
  void runSync();
  window.addEventListener('online', () => void runSync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void runSync();
  });
}
