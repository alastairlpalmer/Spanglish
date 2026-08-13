// Daily plan composer. Pure — composed once per local day, persisted, never
// recomposed the same day. Block completion is derived from logged minutes,
// not stored per block.

import type { PlanBlock, SessionType } from './types';

export interface ComposePlanInput {
  dailyMinutes: number;
  dueCardCount: number;
  daysSinceLastActive: number; // 0 = active today/yesterday counts handled by caller
  quietMode: boolean;
}

export interface ComposedPlan {
  blocks: PlanBlock[];
  reduced: boolean; // true when re-entry plan after a break
}

const REENTRY_GAP_DAYS = 3;

export function composePlan(input: ComposePlanInput): ComposedPlan {
  const reduced = input.daysSinceLastActive >= REENTRY_GAP_DAYS;
  const budget = reduced
    ? Math.max(15, Math.round(input.dailyMinutes / 2))
    : input.dailyMinutes;

  // Cards sized to the due queue (~30s/card), clamped to [5, 40% of budget].
  const cardsMinutes = Math.min(
    Math.max(5, Math.round(input.dueCardCount * 0.5)),
    Math.max(5, Math.round(budget * 0.4)),
  );

  const blocks: PlanBlock[] = [
    { type: 'cards', label: 'Cards', minutes: cardsMinutes },
  ];

  let remaining = budget - cardsMinutes;

  // Read is a once-daily block. It only fits when the day has room for it
  // alongside a real talk block — reduced re-entry days skip it.
  if (!reduced && remaining >= 25) {
    const readMinutes = Math.min(12, Math.round(remaining * 0.3));
    blocks.push({ type: 'read', label: 'Read the news', minutes: readMinutes });
    remaining -= readMinutes;
  }

  // Talk takes the bulk of the remainder. In quiet mode it still appears —
  // typed conversation is a real session — but capped smaller.
  const talkMinutes = input.quietMode
    ? Math.min(15, Math.max(10, Math.round(remaining * 0.5)))
    : Math.max(10, Math.round(remaining * 0.7));
  const talk = Math.min(talkMinutes, remaining);
  if (talk >= 5) {
    blocks.push({ type: 'talk', label: 'Talk', minutes: talk });
    remaining -= talk;
  }

  // Drill placeholder (seam for step 8). Small fixed block when room remains.
  if (remaining >= 5) {
    blocks.push({ type: 'drill', label: 'Drill', minutes: Math.min(10, remaining) });
    remaining -= Math.min(10, remaining);
  }

  // Any leftover goes back to cards so the plan honestly totals the budget.
  if (remaining > 0 && blocks[0]) blocks[0].minutes += remaining;

  return { blocks, reduced };
}

/** Which blocks are complete, derived from today's logged minutes by type. */
export function blockCompletion(
  blocks: PlanBlock[],
  minutesByType: Partial<Record<SessionType | 'drill', number>>,
): boolean[] {
  // Consume logged minutes against blocks in order, per type, so two blocks of
  // the same type don't both complete off the same minutes.
  const pool: Record<string, number> = {};
  for (const [k, v] of Object.entries(minutesByType)) pool[k] = v ?? 0;
  // Drill sessions log as 'grammar'.
  return blocks.map((b) => {
    const key = b.type === 'drill' ? 'grammar' : b.type;
    const have = pool[key] ?? 0;
    if (have >= b.minutes) {
      pool[key] = have - b.minutes;
      return true;
    }
    return false;
  });
}

// ---- learning phase ----
// Derived from accumulated hours toward the 200h readiness target. Drives the
// production-card ratio and (in step 8) which concepts unlock.

export type LearningPhase = 'foundation' | 'output' | 'pressure';

// Level tiers — the single source for beginner gating. The boundary is a
// product decision; it must not be re-derived as array literals per feature.
export function isBeginner(level: string): boolean {
  return level === 'A0' || level === 'A1';
}

/** Levels that still get writing scaffolds (starters, cómo-se-dice). */
export function isScaffoldLevel(level: string): boolean {
  return isBeginner(level) || level === 'A2';
}

export function phaseFor(totalHours: number): LearningPhase {
  if (totalHours < 70) return 'foundation';
  if (totalHours < 140) return 'output';
  return 'pressure';
}

/** Share of generated cards that get a production counterpart. Production
 *  rises with phase — automatic, never a setting: given the choice the
 *  learner picks recognition, because it's easier and feels like progress. */
export function productionRatio(phase: LearningPhase): number {
  switch (phase) {
    case 'foundation': return 0.4;
    case 'output': return 0.6;
    case 'pressure': return 0.7;
  }
}

export interface PaceInput {
  totalHours: number;
  targetHours: number; // 200 readiness
  startedAt: Date;
  now: Date;
}

/** Projected completion date at current average pace; null if no pace yet. */
export function projectedDate(input: PaceInput): Date | null {
  const daysElapsed = Math.max(1, (input.now.getTime() - input.startedAt.getTime()) / 86_400_000);
  const hoursPerDay = input.totalHours / daysElapsed;
  if (hoursPerDay <= 0) return null;
  const hoursLeft = Math.max(0, input.targetHours - input.totalHours);
  const daysLeft = hoursLeft / hoursPerDay;
  return new Date(input.now.getTime() + daysLeft * 86_400_000);
}

/** Minutes/day needed to hit targetHours by targetDate; null if past. */
export function minutesPerDayToRecover(
  totalHours: number,
  targetHours: number,
  now: Date,
  targetDate: Date,
): number | null {
  const daysLeft = (targetDate.getTime() - now.getTime()) / 86_400_000;
  if (daysLeft <= 0) return null;
  const hoursLeft = Math.max(0, targetHours - totalHours);
  return Math.ceil((hoursLeft * 60) / daysLeft);
}
