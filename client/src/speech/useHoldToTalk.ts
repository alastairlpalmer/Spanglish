// Hold-to-talk state machine: idle -> holding/listening -> finalizing -> done|failed.
// Fresh recognition instance per press; started synchronously inside the
// gesture (iOS requirement). Sub-300ms presses discarded as accidental taps.

import { useCallback, useRef, useState } from 'react';
import { createRecognition, recognitionAvailable } from './recognition';
import { stopSpeaking, unlockSynthesis } from './synthesis';

export type HoldState = 'idle' | 'holding' | 'finalizing' | 'failed';

const MIN_HOLD_MS = 300;
const FINALIZE_TIMEOUT_MS = 1500;

export interface HoldToTalk {
  state: HoldState;
  interim: string;
  available: boolean;
  onPressStart: () => void;
  onPressEnd: () => void;
  reset: () => void;
}

export function useHoldToTalk(locale: string, onFinal: (text: string) => void): HoldToTalk {
  const [state, setState] = useState<HoldState>('idle');
  const [interim, setInterim] = useState('');
  const rec = useRef<ReturnType<typeof createRecognition>>(null);
  const pressStartedAt = useRef(0);
  const lastTranscript = useRef('');
  const finalizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settled = useRef(false);

  const settle = useCallback(
    (text: string | null) => {
      if (settled.current) return;
      settled.current = true;
      if (finalizeTimer.current) clearTimeout(finalizeTimer.current);
      setInterim('');
      if (text && text.trim()) {
        setState('idle');
        onFinal(text.trim());
      } else {
        // Empty transcript is transient (quiet room, short first attempt) —
        // stay usable. 'failed' is reserved for the permanent paths: no
        // recognition support or start() throwing.
        setState('idle');
      }
    },
    [onFinal],
  );

  const onPressStart = useCallback(() => {
    unlockSynthesis(); // first gesture of the session also unlocks TTS
    stopSpeaking(); // recognition and synthesis fight on iOS
    settled.current = false;
    lastTranscript.current = '';
    pressStartedAt.current = Date.now();

    const instance = createRecognition(locale);
    rec.current = instance;
    if (!instance) {
      setState('failed');
      return;
    }
    instance.onresult = (event) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i]![0].transcript;
      }
      lastTranscript.current = text;
      setInterim(text);
    };
    instance.onerror = () => settle(null);
    instance.onend = () => settle(lastTranscript.current);
    try {
      instance.start(); // synchronously, inside the gesture
      setState('holding');
      setInterim('');
    } catch {
      setState('failed');
    }
  }, [locale, settle]);

  const onPressEnd = useCallback(() => {
    const held = Date.now() - pressStartedAt.current;
    const instance = rec.current;
    if (!instance) return;
    if (held < MIN_HOLD_MS) {
      // Accidental tap: discard.
      settled.current = true;
      instance.abort();
      setState('idle');
      setInterim('');
      return;
    }
    setState('finalizing');
    instance.stop();
    // iOS sometimes fires onend without a final result — promote the last
    // interim after a timeout.
    finalizeTimer.current = setTimeout(() => settle(lastTranscript.current), FINALIZE_TIMEOUT_MS);
  }, [settle]);

  const reset = useCallback(() => {
    setState('idle');
    setInterim('');
  }, []);

  return {
    state,
    interim,
    available: recognitionAvailable(),
    onPressStart,
    onPressEnd,
    reset,
  };
}
