// Production card: English prompt, learner produces Spanish. Voice mode is
// hold-to-talk (one gesture per attempt — the iOS constraint made
// intentional); typing is always one tap away, because "I cannot speak right
// now" is a fact about the room, not a settings trip. Checking is semantic,
// never string comparison.

import { useState } from 'react';
import type { Card, CheckResponse } from '@seiscientas/shared';
import { useAnswerMode } from '../../speech/useAnswerMode';
import { useHoldToTalk } from '../../speech/useHoldToTalk';
import { localeForDialect } from '../../speech/recognition';
import { checkProduction } from './checks';

type Stage =
  | { name: 'answering' }
  | { name: 'checking' }
  | { name: 'result'; correct: boolean; issue: string | null; queued: boolean };

export function ProductionCard({
  card,
  userId,
  quietMode,
  dialect,
  onGrade,
}: {
  card: Card;
  userId: string;
  quietMode: boolean;
  dialect: string;
  onGrade: (grade: 'got' | 'miss') => void;
}): JSX.Element {
  const [typed, setTyped] = useState('');
  const [attempt, setAttempt] = useState('');
  const [stage, setStage] = useState<Stage>({ name: 'answering' });

  const hold = useHoldToTalk(localeForDialect(dialect), (text) => void submit(text));
  const answer = useAnswerMode();

  async function submit(text: string): Promise<void> {
    if (!text.trim() || stage.name !== 'answering') return;
    setAttempt(text.trim());
    setStage({ name: 'checking' });
    const outcome = await checkProduction({
      userId,
      cardId: card.id,
      prompt: card.prompt ?? '',
      answer: card.answer ?? '',
      attempt: text.trim(),
    });
    if (outcome.kind === 'queued') {
      // Offline: provisionally correct; the queue reconciles later.
      setStage({ name: 'result', correct: true, issue: null, queued: true });
    } else {
      const r: CheckResponse = outcome.result;
      setStage({ name: 'result', correct: r.correct, issue: r.issue, queued: false });
    }
  }

  // Voice is unavailable (or broken) => typing, with no way back. Otherwise
  // the learner's in-the-moment choice decides, and the switch stays offered.
  const voicePossible = !quietMode && hold.available && hold.state !== 'failed';
  const showTyped = !voicePossible || answer.typing;

  if (stage.name === 'result') {
    return (
      <div className="review-card" style={{ position: 'relative' }}>
        <p className="muted" style={{ fontSize: 14 }}>
          {card.prompt}
        </p>
        <p className="es" lang="es" style={{ fontSize: 18 }}>
          {attempt}
        </p>
        <div className="reveal">
          {stage.correct ? (
            <p style={{ color: 'var(--sage)' }}>
              {stage.queued ? 'captured — will check when back online' : 'accepted'}
            </p>
          ) : (
            <>
              <p style={{ color: 'var(--clay)' }}>{stage.issue ?? 'not quite'}</p>
              <p lang="es">{card.answer}</p>
            </>
          )}
        </div>
        <button
          className="btn primary block"
          onClick={() => onGrade(stage.correct ? 'got' : 'miss')}
        >
          Next
        </button>
      </div>
    );
  }

  return (
    <div className="review-card" style={{ position: 'relative' }}>
      <p className="eyebrow">{showTyped ? 'write it in Spanish' : 'say it in Spanish'}</p>
      <p style={{ fontSize: 20, lineHeight: 1.4 }}>{card.prompt}</p>

      {stage.name === 'checking' ? (
        <p className="muted">checking</p>
      ) : showTyped ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(typed);
          }}
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Escribe en español"
            lang="es"
            autoCapitalize="off"
            autoFocus
          />
          <button
            className="btn primary block"
            type="submit"
            disabled={!typed.trim()}
            style={{ marginTop: 8 }}
          >
            Check it
          </button>
        </form>
      ) : (
        <div>
          <p className="interim">{hold.interim || (hold.state === 'holding' ? 'listening' : '')}</p>
          <button
            className={`hold-btn ${hold.state === 'holding' ? 'holding' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              hold.onPressStart();
            }}
            onPointerUp={hold.onPressEnd}
            onPointerCancel={hold.onPressEnd}
            onContextMenu={(e) => e.preventDefault()}
          >
            {hold.state === 'holding'
              ? 'release to check'
              : hold.state === 'finalizing'
                ? 'checking'
                : 'hold to answer'}
          </button>
        </div>
      )}

      {/* Only offered when voice is actually possible — when it isn't, typing
          is the only path and a switch that leads nowhere is noise. */}
      {stage.name !== 'checking' && voicePossible && (
        <button className="btn quiet block" style={{ marginTop: 8 }} onClick={answer.toggle}>
          {answer.typing ? 'speak it instead' : 'type it instead'}
        </button>
      )}
    </div>
  );
}
