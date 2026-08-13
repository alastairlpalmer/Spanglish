// Sync engine: IndexedDB is the working store; the server (Postgres) is
// durability. Push dirty rows via /api/sync/push, pull by updated_at cursor
// via /api/sync/pull. LWW on updated_at for mutable tables; sessions and
// error_examples are append-only — the server inserts with ON CONFLICT DO
// NOTHING, and the client never overwrites an existing local row. Losing
// logged hours to a sync race would undermine the app's only honest metric.

import { db, getMeta, setMeta, type Synced } from '../db/dexie';
import { storedToken } from '../lib/auth';

interface TableConfig {
  name: 'profile' | 'sessions' | 'cards' | 'error_concepts' | 'error_examples' | 'plans' | 'diary';
  appendOnly: boolean;
  /** Dexie primary key extractor, for dedupe + conflict checks. */
  key: (row: Record<string, unknown>) => string | [string, string];
  /** Columns the server sends back as Date-typed; normalised to ISO strings.
   *  updated_at is always normalised. */
  dateColumns: string[];
  /** Date-only columns (Postgres `date`) — normalised to YYYY-MM-DD. */
  dayColumns: string[];
}

const TABLES: TableConfig[] = [
  {
    name: 'profile',
    appendOnly: false,
    key: (r) => r.user_id as string,
    dateColumns: ['started_at'],
    dayColumns: ['target_date'],
  },
  { name: 'sessions', appendOnly: true, key: (r) => r.id as string, dateColumns: ['at'], dayColumns: [] },
  {
    name: 'cards',
    appendOnly: false,
    key: (r) => r.id as string,
    dateColumns: ['due', 'deleted_at'],
    dayColumns: [],
  },
  {
    name: 'error_concepts',
    appendOnly: false,
    key: (r) => [r.user_id as string, r.concept as string],
    dateColumns: ['first_seen', 'last_seen'],
    dayColumns: [],
  },
  {
    name: 'error_examples',
    appendOnly: true,
    key: (r) => r.id as string,
    dateColumns: ['at'],
    dayColumns: [],
  },
  {
    name: 'plans',
    appendOnly: false,
    key: (r) => [r.user_id as string, r.date as string],
    dateColumns: ['completed_at'],
    dayColumns: ['date'],
  },
  {
    name: 'diary',
    appendOnly: false,
    key: (r) => r.id as string,
    dateColumns: ['at'],
    dayColumns: [],
  },
];

let inFlight: Promise<void> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced sync request — call after any write. Safe to call constantly. */
export function requestSync(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void runSync(), 3000);
}

/** Immediate sync — app start, reconnect, visible, post-session-commit. */
export async function runSync(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = doSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function syncApi<T>(path: string, body: unknown): Promise<T | null> {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${storedToken()}`,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 503) return null; // server has no database configured
  if (!res.ok) throw new Error(`sync ${res.status}`);
  return (await res.json()) as T;
}

async function doSync(): Promise<void> {
  for (const table of TABLES) {
    try {
      const pushed = await pushTable(table);
      if (pushed === 'no_database') return; // dev without DB: stay local
      await pullTable(table);
    } catch {
      // Network or auth failure: leave rows dirty, try again next trigger.
      return;
    }
  }
}

async function pushTable(table: TableConfig): Promise<'ok' | 'no_database'> {
  const dexieTable = db[table.name];
  const dirty = (await dexieTable.where('dirty').equals(1).toArray()) as unknown as Array<
    Synced<Record<string, unknown>>
  >;
  if (dirty.length === 0) return 'ok';

  // Snapshot updated_at so a mid-flight edit keeps its dirty flag.
  const snapshots = new Map<string, string>();
  const rows = dirty.map((row) => {
    const { dirty: _d, ...clean } = row;
    snapshots.set(JSON.stringify(table.key(row)), row.updated_at as string);
    return clean;
  });

  const result = await syncApi<{ ok: boolean }>('/api/sync/push', {
    table: table.name,
    rows,
  });
  if (result === null) return 'no_database';

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
  return 'ok';
}

function normaliseRow(table: TableConfig, row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  for (const col of ['updated_at', ...table.dateColumns]) {
    const v = out[col];
    if (typeof v === 'string' && v.length > 0) out[col] = new Date(v).toISOString();
  }
  for (const col of table.dayColumns) {
    const v = out[col];
    if (typeof v === 'string' && v.length >= 10) out[col] = v.slice(0, 10);
  }
  return out;
}

async function pullTable(table: TableConfig): Promise<void> {
  const dexieTable = db[table.name];
  const cursorKey = `pull:${table.name}`;
  let cursor = await getMeta(cursorKey);

  for (;;) {
    const result = await syncApi<{ rows: Array<Record<string, unknown>> }>('/api/sync/pull', {
      table: table.name,
      cursor,
    });
    if (result === null || result.rows.length === 0) return;

    await db.transaction('rw', dexieTable, async () => {
      for (const raw of result.rows) {
        const remote = normaliseRow(table, raw);
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

    const last = result.rows[result.rows.length - 1]!;
    cursor = new Date(last.updated_at as string).toISOString();
    await setMeta(cursorKey, cursor);
    if (result.rows.length < 500) return;
  }
}

/** Wire global triggers once at app start. */
export function initSyncTriggers(): void {
  void runSync();
  window.addEventListener('online', () => void runSync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void runSync();
  });
}
