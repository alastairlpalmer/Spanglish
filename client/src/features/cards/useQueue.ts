import { useCallback, useEffect, useState } from 'react';
import type { Card } from '@seiscientas/shared';
import { db } from '../../db/dexie';

// Daily queue cap: an uncapped backlog after a missed week is how SRS users
// quit. Misses requeue mid-session (due = now + 8 min) and re-enter on refresh.
const DAILY_QUEUE_CAP = 60;

export interface QueueState {
  queue: Card[];
  /** Full backlog size, not just the capped window — the honest number. */
  totalDue: number;
  /** Recognition-only slice of the backlog (the phrase view's population). */
  totalDueRecognition: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useQueue(userId: string): QueueState {
  const [queue, setQueue] = useState<Card[]>([]);
  const [totalDue, setTotalDue] = useState(0);
  const [totalDueRecognition, setTotalDueRecognition] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const now = new Date().toISOString();
    const due = await db.cards
      .where('due')
      .belowOrEqual(now)
      .and((c) => c.user_id === userId && c.deleted_at === null)
      .sortBy('due');
    setQueue(due.slice(0, DAILY_QUEUE_CAP));
    setTotalDue(due.length);
    setTotalDueRecognition(due.filter((c) => c.direction === 'recognition').length);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { queue, totalDue, totalDueRecognition, loading, refresh };
}
