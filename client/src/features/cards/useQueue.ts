import { useCallback, useEffect, useState } from 'react';
import type { Card } from '@seiscientas/shared';
import { isPhraseCard } from '@seiscientas/shared';
import { db } from '../../db/dexie';

// Daily queue cap: an uncapped backlog after a missed week is how SRS users
// quit. Misses requeue mid-session (due = now + 8 min) and re-enter on refresh.
const DAILY_QUEUE_CAP = 60;

export interface QueueState {
  /** The vocabulary deck: word cards only, seconds each. This is "the queue"
   *  everywhere else in the app — the daily number, the badge, the plan. */
  queue: Card[];
  /** The phrase deck, scheduled by the same SM-2 but counted separately. It
   *  never inflates the daily vocabulary number: sentence work is a longer
   *  sitting the learner opts into, not a tax on a five-minute break. */
  phraseQueue: Card[];
  /** Full vocabulary backlog, not just the capped window — the honest number. */
  totalDue: number;
  /** Full phrase backlog. */
  totalDuePhrase: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useQueue(userId: string): QueueState {
  const [queue, setQueue] = useState<Card[]>([]);
  const [phraseQueue, setPhraseQueue] = useState<Card[]>([]);
  const [totalDue, setTotalDue] = useState(0);
  const [totalDuePhrase, setTotalDuePhrase] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const now = new Date().toISOString();
    const due = await db.cards
      .where('due')
      .belowOrEqual(now)
      .and((c) => c.user_id === userId && c.deleted_at === null)
      .sortBy('due');
    // Split from the FULL due list, not the capped window: with a big backlog
    // the earliest 60 could all be one deck and the other would read empty.
    const words = due.filter((c) => !isPhraseCard(c));
    const phrases = due.filter((c) => isPhraseCard(c));
    setQueue(words.slice(0, DAILY_QUEUE_CAP));
    setPhraseQueue(phrases.slice(0, DAILY_QUEUE_CAP));
    setTotalDue(words.length);
    setTotalDuePhrase(phrases.length);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { queue, phraseQueue, totalDue, totalDuePhrase, loading, refresh };
}
