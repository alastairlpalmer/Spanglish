import { describe, it, expect } from 'vitest';
import { CONCEPTS, coerceConcept, conceptPhase } from './concepts';

describe('concept taxonomy', () => {
  it('has exactly 26 slugs (25 concepts + other)', () => {
    expect(CONCEPTS.length).toBe(26);
    expect(new Set(CONCEPTS).size).toBe(26);
  });

  it('coerces unknown slugs to other', () => {
    expect(coerceConcept('ser-vs-estar')).toBe('ser-vs-estar');
    expect(coerceConcept('invented-concept')).toBe('other');
    expect(coerceConcept(null)).toBe('other');
    expect(coerceConcept(undefined)).toBe('other');
    expect(coerceConcept('')).toBe('other');
  });

  it('assigns phases', () => {
    expect(conceptPhase('por-vs-para')).toBe('foundation');
    expect(conceptPhase('subjunctive-triggers')).toBe('output');
    expect(conceptPhase('si-clauses')).toBe('pressure');
    expect(conceptPhase('other')).toBe('other');
  });
});
