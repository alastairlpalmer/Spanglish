// The Latin word lab: suffix rules that convert English words the learner
// already owns into Spanish. Entirely offline and free — the rules and lists
// ship with the app. Practice is self-graded and outside SM-2; any word can
// be pushed into the real deck with one tap.

import { useCallback, useEffect, useState } from 'react';
import { COGNATE_RULES, cognateRule, type CognateRule } from '@seiscientas/shared';
import { db } from '../../db/dexie';
import { useProfile } from '../../shell/ProfileContext';
import { speak, synthesisAvailable } from '../../speech/synthesis';
import { localeForDialect } from '../../speech/recognition';
import { addWordPair } from './createCards';

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function RulePractice({
  rule,
  userId,
  inDeck,
  onDeckChange,
  onClose,
}: {
  rule: CognateRule;
  userId: string;
  inDeck: Set<string>;
  onDeckChange: () => void;
  onClose: () => void;
}): JSX.Element {
  const { profile } = useProfile();
  const [order] = useState(() => shuffle(rule.words));
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [got, setGot] = useState(0);
  const [graded, setGraded] = useState(0);
  const [adding, setAdding] = useState(false);

  const current = order[index] ?? null;
  const canSpeak = !profile.quiet_mode && synthesisAvailable();

  function grade(hit: boolean): void {
    setGraded((g) => g + 1);
    if (hit) setGot((g) => g + 1);
    setRevealed(false);
    setIndex((i) => i + 1);
  }

  if (!current) {
    return (
      <div className="stack">
        <div className="panel" style={{ textAlign: 'center' }}>
          <p className="mono" style={{ fontSize: 28 }}>
            {got} / {graded}
          </p>
          <p className="muted" style={{ fontSize: 14 }}>
            {rule.pattern} — the rule does most of the work. Trust it.
          </p>
        </div>
        <button className="btn primary block" onClick={onClose}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="queue-count mono">
        {index + 1} / {order.length} · {rule.pattern}
      </p>
      <div className="panel stack" style={{ textAlign: 'center', gap: 8 }}>
        <p style={{ fontSize: 24 }}>{current.en}</p>
        {revealed ? (
          <p lang="es" style={{ fontSize: 24, color: 'var(--ochre)' }}>
            {current.es}
          </p>
        ) : (
          <button className="btn block" onClick={() => {
            setRevealed(true);
            if (canSpeak) speak(current.es, localeForDialect(profile.dialect));
          }}>
            say it in Spanish, then reveal
          </button>
        )}
      </div>
      {revealed && (
        <>
          <div className="grade-row">
            <button className="btn" style={{ borderColor: 'var(--clay)' }} onClick={() => grade(false)}>
              Missed it
            </button>
            <button className="btn" style={{ borderColor: 'var(--sage)' }} onClick={() => grade(true)}>
              Got it
            </button>
          </div>
          {inDeck.has(current.es.toLowerCase()) ? (
            <p className="mono muted" style={{ fontSize: 11, textAlign: 'center' }}>
              in the deck
            </p>
          ) : (
            <button
              className="btn quiet"
              disabled={adding}
              onClick={() => {
                setAdding(true);
                void addWordPair({
                  userId,
                  es: current.es,
                  en: current.en,
                  note: `Cognate rule ${rule.pattern}.${rule.caveat ? ` ${rule.caveat}` : ''}`,
                })
                  .then(onDeckChange)
                  .finally(() => setAdding(false));
              }}
            >
              add to deck
            </button>
          )}
        </>
      )}
      <button className="btn quiet" onClick={onClose}>
        quit
      </button>
    </div>
  );
}

export function CognateLab({ userId }: { userId: string }): JSX.Element {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [practicing, setPracticing] = useState(false);
  // Spanish words (lowercased) already in the deck, to label rows and gate
  // the add button. One indexed-free scan of word values, cheap at this scale.
  const [inDeck, setInDeck] = useState<Set<string>>(new Set());

  const refreshDeck = useCallback(async () => {
    const rows = await db.cards
      .where('dirty')
      .anyOf(0, 1)
      .and((c) => c.user_id === userId && c.deleted_at === null && !!c.word)
      .toArray();
    setInDeck(new Set(rows.map((c) => c.word!.trim().toLowerCase())));
  }, [userId]);

  useEffect(() => {
    void refreshDeck();
  }, [refreshDeck]);

  const rule = openSlug ? cognateRule(openSlug) : undefined;

  if (rule && practicing) {
    return (
      <div className="stack">
        <div className="row" style={{ minHeight: 0 }}>
          <span className="eyebrow">{rule.pattern}</span>
          <button className="btn quiet" onClick={() => setPracticing(false)}>
            back
          </button>
        </div>
        <RulePractice
          rule={rule}
          userId={userId}
          inDeck={inDeck}
          onDeckChange={() => void refreshDeck()}
          onClose={() => setPracticing(false)}
        />
      </div>
    );
  }

  if (rule) {
    const known = rule.words.filter((w) => inDeck.has(w.es.toLowerCase())).length;
    return (
      <div className="stack">
        <div className="row" style={{ minHeight: 0 }}>
          <span className="eyebrow">{rule.pattern}</span>
          <button className="btn quiet" onClick={() => setOpenSlug(null)}>
            back
          </button>
        </div>
        <div className="panel stack" style={{ gap: 6 }}>
          <p style={{ fontSize: 15 }}>{rule.explanation}</p>
          {rule.caveat && (
            <p className="muted" style={{ fontSize: 13 }}>
              {rule.caveat}
            </p>
          )}
          <p className="mono muted" style={{ fontSize: 11 }}>
            {rule.words.length} words · {known} in the deck
          </p>
        </div>
        <button className="btn primary block" onClick={() => setPracticing(true)}>
          Practice the rule
        </button>
        <div className="panel stack" style={{ gap: 2 }}>
          {rule.words.map((w) => (
            <div className="row" key={w.en} style={{ minHeight: 28, padding: '2px 0' }}>
              <span style={{ fontSize: 14 }}>
                {w.en}{' '}
                <span lang="es" style={{ color: 'var(--ochre)' }}>
                  {w.es}
                </span>
              </span>
              {inDeck.has(w.es.toLowerCase()) && (
                <span className="mono muted" style={{ fontSize: 11 }}>
                  ✓
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel stack" style={{ gap: 4 }}>
        <p className="eyebrow">palabras latinas</p>
        <p style={{ fontSize: 14 }}>
          A dozen suffix rules turn thousands of English words into Spanish you already own. Learn
          the rule, not the words.
        </p>
      </div>
      {COGNATE_RULES.map((r) => {
        const known = r.words.filter((w) => inDeck.has(w.es.toLowerCase())).length;
        return (
          <button
            className="row"
            key={r.slug}
            onClick={() => setOpenSlug(r.slug)}
            style={{
              minHeight: 44,
              background: 'none',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '8px 12px',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <span>
              <span className="mono" style={{ fontSize: 13, color: 'var(--ochre)' }}>
                {r.pattern}
              </span>
              <span className="muted" style={{ fontSize: 13 }}>
                {' '}
                — {r.label}
              </span>
            </span>
            <span className="mono muted" style={{ fontSize: 11 }}>
              {known}/{r.words.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}
