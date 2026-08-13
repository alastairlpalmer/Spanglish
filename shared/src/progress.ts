// Concept states for the progress map. All derived from ledger and drill
// history — never set manually. locked → open → drilling → clean.

import { conceptPhase, type ConceptSlug } from './concepts';
import type { LearningPhase } from './plan';

export type ConceptState = 'locked' | 'open' | 'drilling' | 'clean';

const CLEAN_RUNS_REQUIRED = 3;
const CLEAN_QUIET_DAYS = 14;

const PHASE_ORDER: Record<LearningPhase, number> = {
  foundation: 0,
  output: 1,
  pressure: 2,
};

export interface ConceptLedgerRow {
  count: number;
  clean_runs: number;
  last_seen: string | null; // last error timestamp
}

export function conceptState(
  slug: ConceptSlug,
  learnerPhase: LearningPhase,
  row: ConceptLedgerRow | null,
  now: Date,
): ConceptState {
  const phase = conceptPhase(slug);
  const reached =
    phase === 'other' || PHASE_ORDER[phase as LearningPhase] <= PHASE_ORDER[learnerPhase];

  // An error on a locked concept opens it early — the learner's errors are
  // the syllabus, wherever they fall.
  if (row === null || (row.count === 0 && row.clean_runs === 0)) {
    return reached ? 'open' : 'locked';
  }

  const quietSince = row.last_seen
    ? (now.getTime() - new Date(row.last_seen).getTime()) / 86_400_000
    : Infinity;

  if (row.clean_runs >= CLEAN_RUNS_REQUIRED && quietSince >= CLEAN_QUIET_DAYS) {
    return 'clean';
  }
  if (row.clean_runs > 0) return 'drilling';
  return 'open';
}
