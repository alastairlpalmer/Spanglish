// Two-grade SM-2-style scheduler. Pure — no I/O, no Date.now().

export const INTERVALS_DAYS = [0, 1, 3, 7, 16, 35, 75] as const;
export const MAX_STEP = INTERVALS_DAYS.length - 1;
export const MISS_REQUEUE_MS = 8 * 60 * 1000;

export type Grade = 'got' | 'miss';

export interface SchedulableCard {
  step: number;
  seen: number;
}

export interface ScheduleResult {
  step: number;
  due: string; // ISO
  seen: number;
}

/** Local-midnight day boundary, so day-granular intervals land at day starts. */
export function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export function scheduleCard(card: SchedulableCard, grade: Grade, now: Date): ScheduleResult {
  const seen = card.seen + 1;
  if (grade === 'miss') {
    return {
      step: 0,
      due: new Date(now.getTime() + MISS_REQUEUE_MS).toISOString(),
      seen,
    };
  }
  const step = Math.min(Math.max(card.step, 0) + 1, MAX_STEP);
  const days = INTERVALS_DAYS[step] ?? INTERVALS_DAYS[MAX_STEP]!;
  // Day-granular: due at local midnight N days out. A card graded 'got' today
  // is never due again today (step>=1 => >=1 day).
  const due = addDays(startOfLocalDay(now), days);
  return { step, due: due.toISOString(), seen };
}
