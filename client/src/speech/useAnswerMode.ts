// How you answer a production card, switchable in the moment. Distinct from
// profile.quiet_mode on purpose: quiet_mode is a synced preference about how
// the app behaves in general, this is "I am on a train right now". It lives on
// the device, never syncs, and every surface reads the same value.
//
// Three modes, and they trade accuracy against volume:
//   recall — reveal and self-report. No network, no grading, fastest by far.
//            The default, because rattling through fifty words beats being
//            precise about eight.
//   type   — write it, graded semantically by the API.
//   voice  — say it, graded semantically by the API.
// Only 'voice' involves speaking, so Talk and the diary read `typing` and
// treat recall and type identically.

import { useCallback, useSyncExternalStore } from 'react';

export type AnswerMode = 'recall' | 'type' | 'voice';

export const ANSWER_MODES: ReadonlyArray<{ mode: AnswerMode; label: string; hint: string }> = [
  { mode: 'recall', label: 'recall', hint: 'Reveal it and mark yourself. Fastest — no checking.' },
  { mode: 'type', label: 'type', hint: 'Write it. Checked properly, mistakes feed your drills.' },
  { mode: 'voice', label: 'speak', hint: 'Say it. Checked properly, mistakes feed your drills.' },
];

const KEY = 'answer-mode';

const read = (): AnswerMode => {
  const stored = localStorage.getItem(KEY);
  // Anything unrecognised (including a first run) lands on recall.
  return stored === 'type' || stored === 'voice' ? stored : 'recall';
};

let current: AnswerMode = read();
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setMode(mode: AnswerMode): void {
  if (mode === current) return;
  current = mode;
  localStorage.setItem(KEY, mode);
  for (const fn of listeners) fn();
}

export interface AnswerModeState {
  mode: AnswerMode;
  /** True whenever the learner is not speaking — recall and type both. Talk
   *  and the diary only care about this distinction. */
  typing: boolean;
  /** True when the card should be self-reported rather than graded. */
  recall: boolean;
  setMode: (mode: AnswerMode) => void;
  toggle: () => void;
}

export function useAnswerMode(): AnswerModeState {
  const mode = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'voice' as AnswerMode,
  );
  // The two-way toggle used by Talk and the diary, where recall has no
  // meaning: it only moves between speaking and not speaking.
  const toggle = useCallback(() => setMode(current === 'voice' ? 'type' : 'voice'), []);
  return { mode, typing: mode !== 'voice', recall: mode === 'recall', setMode, toggle };
}
