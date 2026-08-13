// Automatic session timer. Mounted by any practice surface; the learner never
// presses start. Commits on unmount, visibilitychange->hidden, and pagehide
// (iOS standalone never fires beforeunload). Elapsed time comes from
// wall-clock timestamps — JS timers freeze in the background.
//
// The commit path must not await anything before the write: iOS can freeze
// the page right after pagehide, and a session row that hasn't at least been
// handed to IndexedDB is lost. is_bonus is computed from a pre-loaded count.

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
  // Pre-loaded so the commit path never has to read before writing.
  const minutesBefore = useRef(0);

  useEffect(() => {
    segment.current = { id: uuid(), startedAt: Date.now(), committed: false };
    void minutesLoggedToday(userId).then((m) => {
      minutesBefore.current = m;
    });

    const commit = (): void => {
      const seg = segment.current;
      if (seg.committed) return;
      const elapsed = Date.now() - seg.startedAt;
      if (elapsed < MIN_COMMIT_MS) return;
      seg.committed = true;
      const minutes = Math.max(1, Math.round(elapsed / 60_000));
      // Write first — no reads in front of it. The Dexie put is issued
      // synchronously; sync catches up whenever the page next lives.
      void logSession({
        userId,
        type,
        minutes,
        isBonus: minutesBefore.current >= dailyTarget,
        at: new Date(seg.startedAt).toISOString(),
        id: seg.id,
      }).then(() => {
        minutesBefore.current += minutes;
        return runSync();
      });
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
