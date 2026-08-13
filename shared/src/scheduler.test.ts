import { describe, it, expect } from 'vitest';
import { scheduleCard, INTERVALS_DAYS, MAX_STEP, MISS_REQUEUE_MS } from './scheduler';

const NOW = new Date('2026-08-13T14:30:00');

describe('scheduleCard', () => {
  it('advances step on got and lands due at a local day boundary', () => {
    for (let step = 0; step < MAX_STEP; step++) {
      const r = scheduleCard({ step, seen: step }, 'got', NOW);
      expect(r.step).toBe(step + 1);
      const due = new Date(r.due);
      expect(due.getHours()).toBe(0);
      expect(due.getMinutes()).toBe(0);
      const days = Math.round((due.getTime() - new Date('2026-08-13T00:00:00').getTime()) / 86_400_000);
      expect(days).toBe(INTERVALS_DAYS[step + 1]);
    }
  });

  it('caps step at MAX_STEP', () => {
    const r = scheduleCard({ step: MAX_STEP, seen: 40 }, 'got', NOW);
    expect(r.step).toBe(MAX_STEP);
  });

  it('a got card is never due again the same day', () => {
    const r = scheduleCard({ step: 0, seen: 0 }, 'got', NOW);
    expect(new Date(r.due).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('miss resets to step 0 and requeues in ~8 minutes', () => {
    const r = scheduleCard({ step: 5, seen: 20 }, 'miss', NOW);
    expect(r.step).toBe(0);
    expect(new Date(r.due).getTime()).toBe(NOW.getTime() + MISS_REQUEUE_MS);
  });

  it('increments seen on both grades', () => {
    expect(scheduleCard({ step: 2, seen: 7 }, 'got', NOW).seen).toBe(8);
    expect(scheduleCard({ step: 2, seen: 7 }, 'miss', NOW).seen).toBe(8);
  });

  it('normalises a negative step defensively', () => {
    const r = scheduleCard({ step: -1, seen: 0 }, 'got', NOW);
    expect(r.step).toBe(1);
  });
});
