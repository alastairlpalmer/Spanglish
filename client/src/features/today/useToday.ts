import { useCallback, useEffect, useState } from 'react';
import {
  composePlan,
  blockCompletion,
  projectedDate,
  minutesPerDayToRecover,
  type Plan,
  type SessionType,
} from '@seiscientas/shared';
import { db } from '../../db/dexie';
import { getPlan, savePlan } from '../../db/repo';
import { useProfile } from '../../shell/ProfileContext';
import { localDateKey, startOfLocalDayDate, daysBetween } from '../../lib/time';

export interface TodayState {
  plan: Plan | null;
  completion: boolean[];
  minutesToday: number;
  bonusMinutes: number;
  dayNumber: number;
  reduced: boolean;
  behind: { projected: Date; recoverMinutes: number | null } | null;
  refresh: () => Promise<void>;
}

export function useToday(userId: string): TodayState {
  const { profile } = useProfile();
  // Depend on the fields used, not the profile object - object identity
  // changes on every provider reload and would double the full-table scans.
  const { daily_minutes, quiet_mode, target_date, started_at, level } = profile;
  const [state, setState] = useState<TodayState>({
    plan: null,
    completion: [],
    minutesToday: 0,
    bonusMinutes: 0,
    dayNumber: 1,
    reduced: false,
    behind: null,
    refresh: async () => {},
  });

  const refresh = useCallback(async (): Promise<void> => {
    const today = localDateKey();
    const startToday = startOfLocalDayDate().toISOString();

    const sessions = await db.sessions
      .where('at')
      .aboveOrEqual('')
      .and((s) => s.user_id === userId)
      .toArray();

    const todaySessions = sessions.filter((s) => s.at >= startToday);
    const minutesToday = todaySessions.reduce((sum, s) => sum + s.minutes, 0);
    const byType: Partial<Record<SessionType, number>> = {};
    for (const s of todaySessions) byType[s.type] = (byType[s.type] ?? 0) + s.minutes;

    // Last active day before today, for re-entry detection.
    const pastSessions = sessions.filter((s) => s.at < startToday);
    let daysSinceLastActive = 0;
    if (pastSessions.length > 0) {
      const lastAt = pastSessions.reduce((max, s) => (s.at > max ? s.at : max), '');
      daysSinceLastActive = daysBetween(startOfLocalDayDate(new Date(lastAt)), startOfLocalDayDate());
    }

    // Plan: composed once per local day, persisted, never recomposed same-day.
    let plan = await getPlan(userId, today);
    let reduced = false;
    if (!plan) {
      const now = new Date().toISOString();
      const dueCards = await db.cards
        .where('due')
        .belowOrEqual(now)
        .and((c) => c.user_id === userId && c.deleted_at === null)
        .count();
      const composed = composePlan({
        dailyMinutes: daily_minutes,
        dueCardCount: dueCards,
        daysSinceLastActive,
        quietMode: quiet_mode,
        level,
      });
      reduced = composed.reduced;
      plan = {
        user_id: userId,
        date: today,
        blocks: composed.blocks,
        completed_at: null,
        bonus_minutes: 0,
        updated_at: now,
      };
      await savePlan(plan);
    } else {
      reduced = plan.blocks.reduce((s, b) => s + b.minutes, 0) < daily_minutes;
    }

    const completion = blockCompletion(plan.blocks, byType);
    const bonusMinutes = Math.max(0, minutesToday - daily_minutes);

    // Mark completion once, when the target is first reached.
    if (minutesToday >= daily_minutes && !plan.completed_at) {
      plan = { ...plan, completed_at: new Date().toISOString(), bonus_minutes: bonusMinutes };
      await savePlan(plan);
    } else if (plan.completed_at && plan.bonus_minutes !== bonusMinutes) {
      plan = { ...plan, bonus_minutes: bonusMinutes };
      await savePlan(plan);
    }

    // Falling behind: only when a target date exists and projection drifts past it.
    let behind: TodayState['behind'] = null;
    if (target_date) {
      const totalHours = sessions.reduce((sum, s) => sum + s.minutes, 0) / 60;
      const projected = projectedDate({
        totalHours,
        targetHours: 200,
        startedAt: new Date(started_at),
        now: new Date(),
      });
      const target = new Date(target_date);
      if (projected && projected.getTime() > target.getTime()) {
        behind = {
          projected,
          recoverMinutes: minutesPerDayToRecover(totalHours, 200, new Date(), target),
        };
      }
    }

    const dayNumber = Math.max(1, daysBetween(new Date(started_at), new Date()) + 1);

    setState({
      plan,
      completion,
      minutesToday,
      bonusMinutes,
      dayNumber,
      reduced,
      behind,
      refresh,
    });
  }, [userId, daily_minutes, quiet_mode, target_date, started_at, level]);

  useEffect(() => {
    void refresh();
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  return state;
}
