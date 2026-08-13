// Automatic session timer. Mounted by any practice surface; the learner never
// presses start. Commits on unmount, visibilitychange->hidden, and pagehide
// (iOS standalone never fires beforeunload). Elapsed time comes from
// wall-clock timestamps — JS timers freeze in the background.

import { useEffect, useRef } from 'react';
import type { SessionType } from '@seiscientas/shared';
import { logSession } from '../db/repo';
import { db } from '../db/dexie';
import { runSync } from '../sync/engine';
import { uuid } from '../lib/id';
import { localDateKey, startOfLocalDayDate } from '../lib/time';

const MIN_COMMIT_MS = 30_000;

async function minutesLoggedToday(userId: string): Promise<number> {
  const start = startOfLocalDayDate().toISOString();
  const rows = await db.sessions
    .where('at')
    .aboveOrEqual(start)
    .and((s) => s.user_id === userId && localDateKey(new Date(s.at)) === localDateKey())
    .toArray();
  return rows.reduce((sum, s) => sum + s.minutes, 0);
}

export function useSessionTimer(userId: string, type: SessionType, dailyTarget: number): void {
  const segment = useRef({ id: uuid(), startedAt: Date.now(), committed: false });

  useEffect(() => {
    segment.current = { id: uuid(), startedAt: Date.now(), committed: false };

    const commit = (): void => {
      const seg = segment.current;
      if (seg.committed) return;
      const elapsed = Date.now() - seg.startedAt;
      if (elapsed < MIN_COMMIT_MS) return;
      seg.committed = true;
      const minutes = Math.max(1, Math.round(elapsed / 60_000));
      const at = new Date(seg.startedAt).toISOString();
      // Fire-and-forget: Dexie write needs no network; sync catches up later.
      void minutesLoggedToday(userId)
        .then((before) =>
          logSession({ userId, type, minutes, isBonus: before >= dailyTarget, at, id: seg.id }),
        )
        .then(() => runSync());
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        commit();
      } else {
        // Fresh segment on return — backgrounded time never counts.
        segment.current = { id: uuid(), startedAt: Date.now(), committed: false };
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', commit);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', commit);
      commit();
    };
  }, [userId, type, dailyTarget]);
}
