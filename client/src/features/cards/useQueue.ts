import { useCallback, useEffect, useState } from 'react';
import type { Card } from '@seiscientas/shared';
import { db } from '../../db/dexie';

// Daily queue cap: an uncapped backlog after a missed week is how SRS users
// quit. Misses requeue mid-session (due = now + 8 min) and re-enter on refresh.
const DAILY_QUEUE_CAP = 60;

export interface QueueState {
  queue: Card[];
  /** Recognition-only window for the phrase view. Filtered from the FULL due
   *  list, not the mixed window — with a big backlog the earliest 60 could
   *  happen to be all production cards, and frases would wrongly show empty. */
  recognitionQueue: Card[];
  /** Full backlog size, not just the capped window — the honest number. */
  totalDue: number;
  /** Recognition-only slice of the backlog (the phrase view's population). */
  totalDueRecognition: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useQueue(userId: string): QueueState {
  const [queue, setQueue] = useState<Card[]>([]);
  const [recognitionQueue, setRecognitionQueue] = useState<Card[]>([]);
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
    const recognition = due.filter((c) => c.direction === 'recognition');
    setQueue(due.slice(0, DAILY_QUEUE_CAP));
    setRecognitionQueue(recognition.slice(0, DAILY_QUEUE_CAP));
    setTotalDue(due.length);
    setTotalDueRecognition(recognition.length);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { queue, recognitionQueue, totalDue, totalDueRecognition, loading, refresh };
}
