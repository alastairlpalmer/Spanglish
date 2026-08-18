// The power-verb engine: five conjugated openers drive any infinitive, which
// means five memorised forms × hundreds of -ar cognate verbs = thousands of
// real sentences on day one. Pick an engine, pick a verb, hear the sentence.

import { useMemo, useState } from 'react';
import { COGNATE_RULES } from '@seiscientas/shared';
import { useProfile } from '../../shell/ProfileContext';
import { speak, synthesisAvailable } from '../../speech/synthesis';
import { localeForDialect } from '../../speech/recognition';

const POWER_VERBS = [
  { es: 'Quiero', en: 'I want to' },
  { es: 'Puedo', en: 'I can' },
  { es: 'Necesito', en: 'I need to' },
  { es: 'Tengo que', en: 'I have to' },
  { es: 'Voy a', en: "I'm going to" },
] as const;

// Every infinitive the lab teaches (the -ate, -ify, -ize and -ción→-ar rules).
const VERB_RULE_SLUGS = new Set(['ar', 'ificar', 'izar', 'cionverb']);
const INFINITIVES = COGNATE_RULES.filter((r) => VERB_RULE_SLUGS.has(r.slug)).flatMap(
  (r) => r.words,
);

function sample<T>(arr: T[], n: number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out.slice(0, n);
}

export function PowerVerbs(): JSX.Element {
  const { profile } = useProfile();
  const [power, setPower] = useState(0);
  const [verbs, setVerbs] = useState(() => sample(INFINITIVES, 6));
  const [verb, setVerb] = useState(0);
  const canSpeak = !profile.quiet_mode && synthesisAvailable();

  const chosen = POWER_VERBS[power]!;
  const inf = verbs[verb]!;
  const sentence = `${chosen.es} ${inf.es.toLowerCase()}.`;
  const gloss = `${chosen.en} ${inf.en.replace(/ \(.*\)$/, '')}.`;

  const chipStyle = useMemo(
    () => (active: boolean) => ({
      border: `1px solid ${active ? 'var(--ochre)' : 'var(--line)'}`,
      color: active ? 'var(--ochre)' : 'var(--muted)',
      borderRadius: 999,
      padding: '6px 12px',
      minHeight: 40,
      fontSize: 13,
      cursor: 'pointer',
      background: 'none',
    }),
    [],
  );

  return (
    <div className="panel stack" style={{ gap: 10 }}>
      <p className="eyebrow">motores — power verbs</p>
      <p style={{ fontSize: 14 }}>
        Conjugate five verbs once and every infinitive becomes a sentence. These five openers all
        take a verb straight after them — no further grammar needed.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {POWER_VERBS.map((p, i) => (
          <button key={p.es} style={chipStyle(i === power)} onClick={() => setPower(i)}>
            <span lang="es">{p.es}</span> · {p.en}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {verbs.map((v, i) => (
          <button key={v.es} style={chipStyle(i === verb)} onClick={() => setVerb(i)}>
            <span lang="es">{v.es}</span>
          </button>
        ))}
        <button
          style={chipStyle(false)}
          onClick={() => {
            setVerbs(sample(INFINITIVES, 6));
            setVerb(0);
          }}
        >
          más verbos ↻
        </button>
      </div>
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <p lang="es" style={{ fontSize: 20, color: 'var(--ochre)' }}>
          {sentence}
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          {gloss}
        </p>
      </div>
      {canSpeak && (
        <button
          className="btn block"
          onClick={() => speak(sentence, localeForDialect(profile.dialect))}
        >
          🔊 say it
        </button>
      )}
    </div>
  );
}
