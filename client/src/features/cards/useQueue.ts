import { useCallback, useEffect, useState } from 'react';
import type { Card } from '@seiscientas/shared';
import { db } from '../../db/dexie';

// Daily queue cap: an uncapped backlog after a missed week is how SRS users
// quit. Misses requeue mid-session (due = now + 8 min) and re-enter on refresh.
const DAILY_QUEUE_CAP = 60;

export interface QueueState {
  queue: Card[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useQueue(userId: string): QueueState {
  const [queue, setQueue] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const now = new Date().toISOString();
    // MVP scope: recognition only — the single place production cards will
    // unlock in step 7.
    const due = await db.cards
      .where('due')
      .belowOrEqual(now)
      .and(
        (c) =>
          c.user_id === userId &&
          c.deleted_at === null &&
          c.direction === 'recognition',
      )
      .sortBy('due');
    setQueue(due.slice(0, DAILY_QUEUE_CAP));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { queue, loading, refresh };
}
