// The error ledger, pointed forwards: territory cleared, not a league table
// of failures. Headline is error rate over time, falling — the number that
// shows improvement even while raw error counts climb.

import { useCallback, useEffect, useState } from 'react';
import {
  CONCEPTS,
  FOUNDATION_CONCEPTS,
  OUTPUT_CONCEPTS,
  PRESSURE_CONCEPTS,
  conceptState,
  phaseFor,
  type ConceptSlug,
  type ConceptState,
  type ErrorConcept,
  type ErrorExample,
  type LearningPhase,
} from '@seiscientas/shared';
import { db } from '../../db/dexie';
import { Sheet } from '../../components/Sheet';

const PHASE_GROUPS: Array<{ label: string; slugs: readonly ConceptSlug[] }> = [
  { label: 'foundation', slugs: FOUNDATION_CONCEPTS },
  { label: 'output', slugs: OUTPUT_CONCEPTS },
  { label: 'pressure', slugs: PRESSURE_CONCEPTS },
];

interface WeekRate {
  label: string;
  rate: number; // errors per practice hour
}

export function ProgressMap({
  userId,
  onDrill,
}: {
  userId: string;
  onDrill: (concept: ConceptSlug) => void;
}): JSX.Element {
  const [rows, setRows] = useState<Map<string, ErrorConcept>>(new Map());
  const [phase, setPhase] = useState<LearningPhase>('foundation');
  const [rates, setRates] = useState<WeekRate[]>([]);
  const [detail, setDetail] = useState<ConceptSlug | null>(null);
  const [examples, setExamples] = useState<ErrorExample[]>([]);

  const reload = useCallback(async () => {
    const ec = await db.error_concepts
      .where('[user_id+concept]')
      .between([userId, ''], [userId, '￿'])
      .toArray();
    setRows(new Map(ec.map((r) => [r.concept, r])));

    const sessions = await db.sessions
      .where('at')
      .aboveOrEqual('')
      .and((s) => s.user_id === userId)
      .toArray();
    const totalMinutes = sessions.reduce((sum, s) => sum + s.minutes, 0);
    setPhase(phaseFor(totalMinutes / 60));

    // Error rate per week over the last 4 weeks. Examples are pruned to the
    // 5 most recent per concept, so old weeks under-count — the trend is
    // recent-weighted, which is the part that matters.
    const allExamples = await db.error_examples
      .where('at')
      .aboveOrEqual('')
      .and((e) => e.user_id === userId)
      .toArray();
    const weekOf = (iso: string): number =>
      Math.floor((Date.now() - new Date(iso).getTime()) / (7 * 86_400_000));
    const weekRates: WeekRate[] = [];
    for (let w = 3; w >= 0; w--) {
      const errors = allExamples.filter((e) => weekOf(e.at) === w).length;
      const minutes = sessions
        .filter((s) => weekOf(s.at) === w)
        .reduce((sum, s) => sum + s.minutes, 0);
      const hours = minutes / 60;
      weekRates.push({
        label: w === 0 ? 'now' : `-${w}w`,
        rate: hours > 0 ? errors / hours : 0,
      });
    }
    setRates(weekRates);
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!detail) return;
    void db.error_examples
      .where('concept')
      .equals(detail)
      .and((e) => e.user_id === userId)
      .sortBy('at')
      .then((list) => setExamples(list.reverse()));
  }, [detail, userId]);

  const now = new Date();
  const stateFor = (slug: ConceptSlug): ConceptState =>
    conceptState(slug, phase, rows.get(slug) ?? null, now);

  const current = rates[rates.length - 1]?.rate ?? 0;
  const maxRate = Math.max(0.001, ...rates.map((r) => r.rate));
  const cleanCount = CONCEPTS.filter((c) => c !== 'other' && stateFor(c) === 'clean').length;

  return (
    <div className="panel stack">
      <div className="row" style={{ padding: 0, minHeight: 0 }}>
        <div>
          <p className="rate-display mono">{current.toFixed(1)}</p>
          <p className="eyebrow">errors per hour, this week</p>
        </div>
        <div className="rate-trend" aria-hidden="true">
          {rates.map((r, i) => (
            <div
              key={r.label}
              className={`bar ${i === rates.length - 1 ? 'current' : ''}`}
              style={{ height: `${Math.max(8, (r.rate / maxRate) * 100)}%` }}
            />
          ))}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        {cleanCount} of 25 concepts clean
      </p>

      {PHASE_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="eyebrow" style={{ marginBottom: 6 }}>
            {group.label}
          </p>
          <div className="concept-grid">
            {group.slugs.map((slug) => {
              const state = stateFor(slug);
              return (
                <button
                  key={slug}
                  className={`concept-cell ${state}`}
                  disabled={state === 'locked'}
                  onClick={() => setDetail(slug)}
                >
                  {slug}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {detail && (
        <Sheet title={detail} onClose={() => setDetail(null)}>
          <div className="stack">
            <p className="muted">
              {rows.get(detail)?.count ?? 0} errors ·{' '}
              {rows.get(detail)?.clean_runs ?? 0}/3 clean runs · {stateFor(detail)}
            </p>
            {examples.slice(0, 3).map((e) => (
              <div key={e.id} style={{ fontSize: 14 }}>
                <p style={{ color: 'var(--clay)' }} lang="es">
                  {e.wrong}
                </p>
                <p style={{ color: 'var(--sage)' }} lang="es">
                  {e.right_}
                </p>
                {e.why && <p className="muted">{e.why}</p>}
              </div>
            ))}
            <button
              className="btn primary block"
              onClick={() => {
                const target = detail;
                setDetail(null);
                onDrill(target);
              }}
            >
              Drill this now
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
