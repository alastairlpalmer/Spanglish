import { describe, it, expect } from 'vitest';
import { composePlan, blockCompletion, projectedDate, minutesPerDayToRecover } from './plan';

describe('composePlan', () => {
  it('totals exactly the daily budget on a normal day', () => {
    const { blocks, reduced } = composePlan({
      dailyMinutes: 60, dueCardCount: 40, daysSinceLastActive: 0, quietMode: false,
    });
    expect(reduced).toBe(false);
    const total = blocks.reduce((s, b) => s + b.minutes, 0);
    expect(total).toBe(60);
    expect(blocks[0]!.type).toBe('cards');
    expect(blocks.some((b) => b.type === 'read')).toBe(true);
    expect(blocks.some((b) => b.type === 'talk')).toBe(true);
  });

  it('skips the read block on reduced re-entry days', () => {
    const { blocks } = composePlan({
      dailyMinutes: 60, dueCardCount: 40, daysSinceLastActive: 5, quietMode: false,
    });
    expect(blocks.some((b) => b.type === 'read')).toBe(false);
  });

  it('halves the budget after a 3+ day break (min 15)', () => {
    const { blocks, reduced } = composePlan({
      dailyMinutes: 60, dueCardCount: 100, daysSinceLastActive: 5, quietMode: false,
    });
    expect(reduced).toBe(true);
    expect(blocks.reduce((s, b) => s + b.minutes, 0)).toBe(30);
  });

  it('never goes below 15 minutes even for a 30-minute target', () => {
    const { blocks } = composePlan({
      dailyMinutes: 30, dueCardCount: 10, daysSinceLastActive: 10, quietMode: false,
    });
    expect(blocks.reduce((s, b) => s + b.minutes, 0)).toBe(15);
  });

  it('sizes cards to the due queue, clamped to 40% of budget', () => {
    const small = composePlan({ dailyMinutes: 60, dueCardCount: 4, daysSinceLastActive: 0, quietMode: false });
    // Small queues get the 5-minute floor; leftover redistribution may add to it,
    // but it must stay well under the 40% clamp used for big queues.
    const bigQueue = composePlan({ dailyMinutes: 60, dueCardCount: 500, daysSinceLastActive: 0, quietMode: false });
    const bigCards = bigQueue.blocks[0]!.minutes;
    expect(bigCards).toBeLessThanOrEqual(24 + 10); // 40% clamp + possible leftover
    expect(small.blocks[0]!.minutes).toBeLessThan(bigCards);
  });

  it('keeps talk in quiet mode but capped', () => {
    const { blocks } = composePlan({
      dailyMinutes: 60, dueCardCount: 40, daysSinceLastActive: 0, quietMode: true,
    });
    const talk = blocks.find((b) => b.type === 'talk');
    expect(talk).toBeDefined();
    expect(talk!.minutes).toBeLessThanOrEqual(15);
  });
});

describe('blockCompletion', () => {
  it('derives completion from logged minutes by type', () => {
    const blocks = [
      { type: 'cards' as const, label: 'Cards', minutes: 20 },
      { type: 'talk' as const, label: 'Talk', minutes: 20 },
      { type: 'drill' as const, label: 'Drill', minutes: 10 },
    ];
    expect(blockCompletion(blocks, { cards: 22, talk: 5 })).toEqual([true, false, false]);
    expect(blockCompletion(blocks, { cards: 20, talk: 20, grammar: 10 })).toEqual([true, true, true]);
  });

  it('does not complete two same-type blocks off the same minutes', () => {
    const blocks = [
      { type: 'cards' as const, label: 'Cards', minutes: 10 },
      { type: 'cards' as const, label: 'Cards 2', minutes: 10 },
    ];
    expect(blockCompletion(blocks, { cards: 10 })).toEqual([true, false]);
  });
});

describe('pace', () => {
  const start = new Date('2026-08-01T00:00:00Z');
  const now = new Date('2026-08-11T00:00:00Z'); // 10 days in

  it('projects completion from average pace', () => {
    // 10 hours in 10 days = 1h/day; 190 left => ~190 days out
    const p = projectedDate({ totalHours: 10, targetHours: 200, startedAt: start, now });
    expect(p).not.toBeNull();
    const days = (p!.getTime() - now.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(190);
  });

  it('returns null with zero pace', () => {
    expect(projectedDate({ totalHours: 0, targetHours: 200, startedAt: start, now })).toBeNull();
  });

  it('computes recovery minutes per day', () => {
    const target = new Date('2026-09-10T00:00:00Z'); // 30 days out
    // 170 hours left over 30 days = 340 min/day
    expect(minutesPerDayToRecover(30, 200, now, target)).toBe(340);
    expect(minutesPerDayToRecover(30, 200, now, new Date('2026-08-01T00:00:00Z'))).toBeNull();
  });
});
