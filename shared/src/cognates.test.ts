import { describe, expect, it } from 'vitest';
import { COGNATE_RULES, COGNATE_WORD_COUNT, cognateRule } from './cognates';

// Suffixes each rule's Spanish words may legitimately end with. The es- rule
// is a prefix rule: null here, checked separately below.
const ALLOWED_ES_SUFFIXES: Record<string, string[] | null> = {
  cion: ['ción'],
  sion: ['sión'],
  dad: ['dad', 'tad'],
  al: ['al'],
  ante: ['ante', 'ente', 'iente'],
  ble: ['ble'],
  ico: ['ico'],
  oso: ['oso'],
  encia: ['encia', 'ancia'],
  ista: ['ista', 'ismo'],
  ivo: ['ivo'],
  ario: ['ario', 'orio'],
  mente: ['mente'],
  ar: ['ar'],
  ificar: ['ificar'],
  izar: ['izar'],
  cionverb: ['ar'],
  mento: ['mento'],
  ura: ['ura'],
  ido: ['ido'],
  or: ['or'],
  es: null,
};

describe('cognate rules', () => {
  it('has unique slugs and a suffix allowance for each', () => {
    const slugs = COGNATE_RULES.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(ALLOWED_ES_SUFFIXES[slug]).toBeDefined();
  });

  it('every Spanish word matches its rule pattern', () => {
    for (const rule of COGNATE_RULES) {
      const allowed = ALLOWED_ES_SUFFIXES[rule.slug];
      for (const w of rule.words) {
        if (allowed === null) {
          expect(w.es.startsWith('es'), `${rule.slug}: ${w.es}`).toBe(true);
        } else {
          expect(
            allowed!.some((s) => w.es.endsWith(s)),
            `${rule.slug}: ${w.es}`,
          ).toBe(true);
        }
      }
    }
  });

  it('has no duplicate English words across rules and no empty entries', () => {
    const seen = new Set<string>();
    for (const rule of COGNATE_RULES) {
      for (const w of rule.words) {
        expect(w.en.length).toBeGreaterThan(0);
        expect(w.es.length).toBeGreaterThan(0);
        expect(seen.has(w.en), `duplicate: ${w.en}`).toBe(false);
        seen.add(w.en);
      }
    }
  });

  it('carries a useful load: every rule has at least 12 words', () => {
    for (const rule of COGNATE_RULES) {
      expect(rule.words.length, rule.slug).toBeGreaterThanOrEqual(12);
    }
    expect(COGNATE_WORD_COUNT).toBeGreaterThanOrEqual(350);
  });

  it('looks up rules by slug', () => {
    expect(cognateRule('cion')?.pattern).toBe('-tion → -ción');
    expect(cognateRule('nope')).toBeUndefined();
  });
});
