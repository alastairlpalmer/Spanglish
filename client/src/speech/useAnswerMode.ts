// Voice or typing, switchable in the moment. Distinct from profile.quiet_mode
// on purpose: quiet_mode is a synced preference about how the app behaves in
// general, this is "I am on a train right now". It lives on the device, never
// syncs, and every hold-to-talk surface reads the same value — flip it on a
// card and the diary and the tutor are already typing too.

import { useCallback, useSyncExternalStore } from 'react';

export type AnswerMode = 'voice' | 'type';

const KEY = 'answer-mode';

const read = (): AnswerMode => (localStorage.getItem(KEY) === 'type' ? 'type' : 'voice');

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
  typing: boolean;
  setMode: (mode: AnswerMode) => void;
  toggle: () => void;
}

export function useAnswerMode(): AnswerModeState {
  const mode = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'voice' as AnswerMode,
  );
  const toggle = useCallback(() => setMode(current === 'type' ? 'voice' : 'type'), []);
  return { mode, typing: mode === 'type', setMode, toggle };
}
