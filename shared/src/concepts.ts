// Closed concept taxonomy. Errors that fit nowhere go to 'other'.
// This list is the syllabus spine — do not extend it casually; the whole
// error-ledger design depends on it staying closed.

export const FOUNDATION_CONCEPTS = [
  'ser-vs-estar',
  'gender-agreement',
  'present-irregulars',
  'preterite-vs-imperfect',
  'reflexive-verbs',
  'object-pronouns',
  'por-vs-para',
  'gustar-constructions',
] as const;

export const OUTPUT_CONCEPTS = [
  'future-and-conditional',
  'present-perfect',
  'subjunctive-triggers',
  'subjunctive-present-forms',
  'commands-formal-informal',
  'relative-pronouns',
  'saber-vs-conocer',
  'comparatives-superlatives',
] as const;

export const PRESSURE_CONCEPTS = [
  'imperfect-subjunctive',
  'si-clauses',
  'pluperfect-and-sequence',
  'passive-and-se-impersonal',
  'pronominal-verb-shifts',
  'prepositional-verb-pairs',
  'discourse-connectors',
  'register-and-softening',
  'dialect-specific',
] as const;

export const CONCEPTS = [
  ...FOUNDATION_CONCEPTS,
  ...OUTPUT_CONCEPTS,
  ...PRESSURE_CONCEPTS,
  'other',
] as const;

export type ConceptSlug = (typeof CONCEPTS)[number];

const conceptSet: ReadonlySet<string> = new Set(CONCEPTS);

/** Coerce any string to a valid slug; unknown values become 'other'. */
export function coerceConcept(value: string | null | undefined): ConceptSlug {
  if (value && conceptSet.has(value)) return value as ConceptSlug;
  return 'other';
}

export type ConceptPhase = 'foundation' | 'output' | 'pressure';

export function conceptPhase(slug: ConceptSlug): ConceptPhase | 'other' {
  if ((FOUNDATION_CONCEPTS as readonly string[]).includes(slug)) return 'foundation';
  if ((OUTPUT_CONCEPTS as readonly string[]).includes(slug)) return 'output';
  if ((PRESSURE_CONCEPTS as readonly string[]).includes(slug)) return 'pressure';
  return 'other';
}
