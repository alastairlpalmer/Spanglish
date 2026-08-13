import { describe, it, expect } from 'vitest';
import { conceptState } from './progress';

const NOW = new Date('2026-08-13T12:00:00Z');
const daysAgo = (n: number): string =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe('conceptState', () => {
  it('locks concepts beyond the learner phase with no history', () => {
    expect(conceptState('si-clauses', 'foundation', null, NOW)).toBe('locked');
    expect(conceptState('subjunctive-triggers', 'foundation', null, NOW)).toBe('locked');
  });

  it('opens concepts within the learner phase', () => {
    expect(conceptState('ser-vs-estar', 'foundation', null, NOW)).toBe('open');
    expect(conceptState('subjunctive-triggers', 'output', null, NOW)).toBe('open');
    expect(conceptState('si-clauses', 'pressure', null, NOW)).toBe('open');
  });

  it('an error opens a locked concept early', () => {
    const row = { count: 2, clean_runs: 0, last_seen: daysAgo(1) };
    expect(conceptState('si-clauses', 'foundation', row, NOW)).toBe('open');
  });

  it('clean_runs in progress means drilling', () => {
    const row = { count: 5, clean_runs: 1, last_seen: daysAgo(20) };
    expect(conceptState('ser-vs-estar', 'foundation', row, NOW)).toBe('drilling');
  });

  it('clean requires 3 runs AND 14 quiet days', () => {
    expect(
      conceptState('ser-vs-estar', 'foundation', { count: 5, clean_runs: 3, last_seen: daysAgo(20) }, NOW),
    ).toBe('clean');
    // 3 runs but a recent error
    expect(
      conceptState('ser-vs-estar', 'foundation', { count: 5, clean_runs: 3, last_seen: daysAgo(3) }, NOW),
    ).toBe('drilling');
    // quiet but only 2 runs
    expect(
      conceptState('ser-vs-estar', 'foundation', { count: 5, clean_runs: 2, last_seen: daysAgo(20) }, NOW),
    ).toBe('drilling');
  });

  it('clean runs with no errors ever counts as clean', () => {
    const row = { count: 0, clean_runs: 3, last_seen: null };
    expect(conceptState('ser-vs-estar', 'foundation', row, NOW)).toBe('clean');
  });
});
