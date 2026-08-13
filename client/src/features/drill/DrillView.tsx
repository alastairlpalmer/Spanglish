// A drill run: 8 fresh production items attacking one concept, generated
// against the learner's actual logged errors. 8/8 is a clean run; any error
// resets the counter (via recordError inside checkProduction's path).
// Explanation gets two sentences, attached to the drill — never freestanding.

import { useEffect, useState } from 'react';
import type { ConceptSlug, DrillResponse, CheckResponse } from '@seiscientas/shared';
import { coerceConcept } from '@seiscientas/shared';
import { apiPost, ApiError } from '../../lib/api';
import { db } from '../../db/dexie';
import { recordCleanRun, recordError } from '../../db/repo';
import { useProfile } from '../../shell/ProfileContext';
import { useSessionTimer } from '../../session/useSessionTimer';

interface DrillItem {
  prompt: string;
  answer: string;
  accepts: string[];
}

type Stage =
  | { name: 'loading' }
  | { name: 'error'; message: string }
  | { name: 'item'; index: number; misses: number }
  | { name: 'feedback'; index: number; misses: number; correct: boolean; issue: string | null }
  | { name: 'done'; misses: number };

export function DrillView({
  userId,
  concept,
  onClose,
}: {
  userId: string;
  concept: ConceptSlug;
  onClose: () => void;
}): JSX.Element {
  const { profile } = useProfile();
  const [items, setItems] = useState<DrillItem[]>([]);
  const [stage, setStage] = useState<Stage>({ name: 'loading' });
  const [typed, setTyped] = useState('');
  const [checking, setChecking] = useState(false);

  useSessionTimer(userId, 'grammar', profile.daily_minutes);

  useEffect(() => {
    void (async () => {
      try {
        const examples = await db.error_examples
          .where('concept')
          .equals(concept)
          .and((e) => e.user_id === userId)
          .sortBy('at');
        const res = await apiPost<DrillResponse>('/api/ai/drill', {
          concept,
          level: profile.level,
          recentErrors: examples.slice(-5).map((e) => ({
            wrong: e.wrong ?? '',
            right: e.right_ ?? '',
            why: e.why ?? '',
            concept,
          })),
        });
        setItems(res.cards);
        setStage({ name: 'item', index: 0, misses: 0 });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'budget_paused')
          setStage({ name: 'error', message: 'AI features paused until tomorrow.' });
        else setStage({ name: 'error', message: 'Could not build the drill. Retry.' });
      }
    })();
  }, [concept, userId, profile.level]);

  async function submit(): Promise<void> {
    if (stage.name !== 'item' || !typed.trim() || checking) return;
    const item = items[stage.index]!;
    const attempt = typed.trim();
    setChecking(true);

    // Local accept-list first — an exact alternative needs no API call.
    const normalise = (s: string): string =>
      s.toLowerCase().replace(/[.!?¿¡,]/g, '').trim();
    const locallyCorrect = [item.answer, ...item.accepts].some(
      (a) => normalise(a) === normalise(attempt),
    );

    let correct = locallyCorrect;
    let issue: string | null = null;
    if (!locallyCorrect) {
      try {
        const res = await apiPost<CheckResponse>('/api/ai/check', {
          prompt: item.prompt,
          answer: item.answer,
          attempt,
        });
        correct = res.correct;
        issue = res.issue;
      } catch {
        // Drills are online-only (generation needs the network); if the check
        // dies mid-run, accept the answer rather than punishing the learner.
        correct = true;
      }
    }

    if (!correct) {
      await recordError({
        userId,
        concept: coerceConcept(concept),
        wrong: attempt,
        right: item.answer,
        why: issue,
      });
    }

    setChecking(false);
    setTyped('');
    setStage({
      name: 'feedback',
      index: stage.index,
      misses: stage.misses + (correct ? 0 : 1),
      correct,
      issue,
    });
  }

  async function next(): Promise<void> {
    if (stage.name !== 'feedback') return;
    const nextIndex = stage.index + 1;
    if (nextIndex >= items.length) {
      if (stage.misses === 0) await recordCleanRun(userId, concept);
      setStage({ name: 'done', misses: stage.misses });
    } else {
      setStage({ name: 'item', index: nextIndex, misses: stage.misses });
    }
  }

  return (
    <div className="stack">
      <div className="row" style={{ minHeight: 0 }}>
        <span className="eyebrow">drill — {concept}</span>
        <button className="btn quiet" onClick={onClose}>
          close
        </button>
      </div>

      {stage.name === 'loading' && <p className="muted">building the drill from your errors</p>}

      {stage.name === 'error' && (
        <div className="stack">
          <p className="error-line">{stage.message}</p>
          <button className="btn block" onClick={onClose}>
            Back
          </button>
        </div>
      )}

      {(stage.name === 'item' || stage.name === 'feedback') && (
        <>
          <p className="queue-count mono">
            {(stage.name === 'item' ? stage.index : stage.index) + 1} / {items.length}
            {stage.misses > 0 && ` · ${stage.misses} missed`}
          </p>
          <div className="panel stack">
            <p className="eyebrow">say it in Spanish</p>
            <p style={{ fontSize: 19, lineHeight: 1.4 }}>
              {items[stage.name === 'item' ? stage.index : stage.index]!.prompt}
            </p>

            {stage.name === 'item' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
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
                  disabled={checking || !typed.trim()}
                  style={{ marginTop: 8 }}
                >
                  {checking ? 'checking' : 'Check it'}
                </button>
              </form>
            ) : (
              <div className="stack">
                {stage.correct ? (
                  <p style={{ color: 'var(--sage)' }}>accepted</p>
                ) : (
                  <>
                    <p style={{ color: 'var(--clay)' }}>{stage.issue ?? 'not quite'}</p>
                    <p lang="es">{items[stage.index]!.answer}</p>
                  </>
                )}
                <button className="btn primary block" onClick={() => void next()}>
                  {stage.index + 1 >= items.length ? 'Finish' : 'Next'}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {stage.name === 'done' && (
        <div className="stack">
          <div className="panel">
            {stage.misses === 0 ? (
              <p>
                8/8 — a clean run. <span className="muted">Three in a row marks this concept clean.</span>
              </p>
            ) : (
              <p>
                {items.length - stage.misses}/{items.length}.{' '}
                <span className="muted">Misses are logged; the counter resets.</span>
              </p>
            )}
          </div>
          <button className="btn primary block" onClick={onClose}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
