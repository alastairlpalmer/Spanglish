// The phrase deck. Two decks, one scheduler: vocabulary cards teach a word in
// seconds, phrase cards ask for a whole sentence and take a minute. Mixing
// them was the bug — a five-minute break turns into three sentences and the
// vocabulary never moves.
//
// A phrase is not generated, it is UNLOCKED: every vocabulary card already
// carries the sentence its word was taught in, so mastering the word both
// ways mints the sentence as a phrase card. No AI call, and nothing arrives
// before the words inside it are known.

import { MASTERY_STEP } from './buckets';
import type { CardScope } from './types';

/** Legacy rows and rows pulled from a pre-column server read as 'word'. */
export function cardScope(row: { scope?: string | null }): CardScope {
  return row.scope === 'phrase' ? 'phrase' : 'word';
}

export function isPhraseCard(row: { scope?: string | null }): boolean {
  return cardScope(row) === 'phrase';
}

/** A word earns its sentence at the same bar as bucket mastery: both
 *  directions held through a 16-day interval. */
export const PHRASE_UNLOCK_STEP = MASTERY_STEP;

export interface PhraseSourceRow {
  bucket: string | null | undefined;
  word: string | null;
  es: string | null;
  en: string | null;
  note: string | null;
  direction: 'recognition' | 'production';
  step: number;
  scope?: string | null;
  deleted_at: string | null;
}

export interface PhraseUnlock {
  bucket: string | null;
  word: string;
  es: string;
  en: string;
  note: string | null;
}

// NUL separator, matching bucketMastery: a space would let a two-word entry
// collide with a differently-split neighbour.
const key = (bucket: string | null, word: string): string =>
  `${bucket ?? ''}\u0000${word.trim().toLowerCase()}`;

/** Mastered words whose sentence is not yet in the phrase deck, in mastery
 *  order (longest-held first — the most solid sentences unlock first).
 *
 *  Pure. Callers pass every non-deleted card row for the user. */
export function unlockablePhrases(rows: PhraseSourceRow[]): PhraseUnlock[] {
  const words = new Map<
    string,
    { bucket: string | null; word: string; es: string | null; en: string | null; note: string | null; rec: number; prod: number }
  >();
  const alreadyPhrase = new Set<string>();

  for (const row of rows) {
    if (row.deleted_at !== null || !row.word) continue;
    const bucket = row.bucket ?? null;
    const k = key(bucket, row.word);
    if (isPhraseCard(row)) {
      alreadyPhrase.add(k);
      continue;
    }
    let entry = words.get(k);
    if (!entry) {
      entry = { bucket, word: row.word.trim(), es: null, en: null, note: null, rec: -1, prod: -1 };
      words.set(k, entry);
    }
    // The sentence lives on the recognition side; the production row's es was
    // rewritten to the bare word by design.
    if (row.direction === 'recognition') {
      entry.rec = Math.max(entry.rec, row.step);
      if (row.es) entry.es = row.es;
      if (row.en) entry.en = row.en;
      if (row.note) entry.note = row.note;
    } else {
      entry.prod = Math.max(entry.prod, row.step);
    }
  }

  const out: Array<PhraseUnlock & { held: number }> = [];
  for (const [k, e] of words) {
    if (alreadyPhrase.has(k)) continue;
    if (e.rec < PHRASE_UNLOCK_STEP || e.prod < PHRASE_UNLOCK_STEP) continue;
    // A one-word "sentence" (mined vocabulary) has no phrase to teach.
    if (!e.es || !e.en || e.es.trim().split(/\s+/).length < 3) continue;
    out.push({ bucket: e.bucket, word: e.word, es: e.es, en: e.en, note: e.note, held: e.rec + e.prod });
  }
  out.sort((a, b) => b.held - a.held || a.word.localeCompare(b.word));
  return out.map(({ held: _held, ...rest }) => rest);
}
