// The Latin word lab: suffix rules that convert English words the learner
// already owns into Spanish. Entirely offline and free — the rules and lists
// ship with the app. Practice is self-graded and outside SM-2; any word can
// be pushed into the real deck with one tap.

import { useCallback, useEffect, useState } from 'react';
import { COGNATE_RULES, cognateRule, type CognatePair, type CognateRule } from '@seiscientas/shared';
import { db } from '../../db/dexie';
import { useProfile } from '../../shell/ProfileContext';
import { speak, synthesisAvailable } from '../../speech/synthesis';
import { localeForDialect } from '../../speech/recognition';
import { addWordPair } from './createCards';
import { PowerVerbs } from './PowerVerbs';

const MIX_SIZE = 20;

// Per-rule practice memory (local only): "got/total" of the last completed
// single-rule run. Shown on rule rows; weak rules get double weight in the
// random mix.
const scoreKey = (slug: string): string => `cognate-score-${slug}`;

function lastScore(slug: string): { got: number; total: number } | null {
  const raw = localStorage.getItem(scoreKey(slug));
  if (!raw) return null;
  const [got, total] = raw.split('/').map(Number);
  return Number.isFinite(got) && Number.isFinite(total) && total! > 0
    ? { got: got!, total: total! }
    : null;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A practice item carries its rule so mixed sessions can explain each word. */
interface PracticeItem extends CognatePair {
  rule: CognateRule;
}

const ALL_ITEMS: PracticeItem[] = COGNATE_RULES.flatMap((rule) =>
  rule.words.map((w) => ({ ...w, rule })),
);

function Practice({
  items,
  mixed,
  userId,
  inDeck,
  onDeckChange,
  onClose,
}: {
  items: PracticeItem[];
  /** Mixed sessions show each word's own pattern; single-rule ones already
   *  have it in the header. */
  mixed: boolean;
  userId: string;
  inDeck: Set<string>;
  onDeckChange: () => void;
  onClose: () => void;
}): JSX.Element {
  const { profile } = useProfile();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [got, setGot] = useState(0);
  const [graded, setGraded] = useState(0);
  const [adding, setAdding] = useState(false);
  const [missed, setMissed] = useState<PracticeItem[]>([]);
  const [harvested, setHarvested] = useState(false);

  const current = items[index] ?? null;
  const canSpeak = !profile.quiet_mode && synthesisAvailable();
  const finished = current === null;

  function grade(hit: boolean): void {
    setGraded((g) => g + 1);
    if (hit) setGot((g) => g + 1);
    else if (current) setMissed((m) => [...m, current]);
    setRevealed(false);
    setIndex((i) => i + 1);
  }

  // A completed single-rule run is the rule's score memory.
  useEffect(() => {
    if (finished && !mixed && graded === items.length && graded > 0) {
      localStorage.setItem(scoreKey(items[0]!.rule.slug), `${got}/${graded}`);
    }
  }, [finished, mixed, graded, got, items]);

  if (finished) {
    const harvestable = missed.filter((m) => !inDeck.has(m.es.toLowerCase()));
    return (
      <div className="stack">
        <div className="panel" style={{ textAlign: 'center' }}>
          <p className="mono" style={{ fontSize: 28 }}>
            {got} / {graded}
          </p>
          <p className="muted" style={{ fontSize: 14 }}>
            {mixed
              ? 'The rules do most of the work across every suffix. Trust them.'
              : `${items[0]!.rule.pattern} — the rule does most of the work. Trust it.`}
          </p>
        </div>
        {missed.length > 0 && (
          <div className="panel stack" style={{ gap: 6 }}>
            <p className="eyebrow">your misses — the words worth keeping</p>
            {missed.map((m) => (
              <p key={m.es} style={{ fontSize: 14 }}>
                <span lang="es" style={{ color: 'var(--ochre)' }}>
                  {m.es}
                </span>{' '}
                <span className="muted">— {m.en}</span>
              </p>
            ))}
            {harvestable.length > 0 && !harvested ? (
              <button
                className="btn block"
                disabled={adding}
                onClick={() => {
                  setAdding(true);
                  void (async () => {
                    for (const m of harvestable) {
                      await addWordPair({
                        userId,
                        es: m.es,
                        en: m.en,
                        note: `Cognate rule ${m.rule.pattern}. You missed this in practice.`,
                      });
                    }
                  })()
                    .then(() => {
                      setHarvested(true);
                      onDeckChange();
                    })
                    .finally(() => setAdding(false));
                }}
              >
                {adding ? 'adding' : `Add ${harvestable.length} misses to the deck`}
              </button>
            ) : (
              <p className="mono muted" style={{ fontSize: 11 }}>
                {missed.length > 0 && harvestable.length === 0 && !harvested
                  ? 'all already in the deck'
                  : harvested
                    ? 'in the deck'
                    : ''}
              </p>
            )}
          </div>
        )}
        <button className="btn primary block" onClick={onClose}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="queue-count mono">
        {index + 1} / {items.length} · {current.rule.pattern}
      </p>
      {/* The rule rides along during practice — apply it, don't recall it. */}
      <p className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
        {current.rule.explanation}
      </p>
      <div className="panel stack" style={{ textAlign: 'center', gap: 8 }}>
        <p style={{ fontSize: 24 }}>{current.en}</p>
        {revealed ? (
          <>
            <p lang="es" style={{ fontSize: 24, color: 'var(--ochre)' }}>
              {current.es}
            </p>
            {current.rule.caveat && (
              <p className="muted" style={{ fontSize: 12 }}>
                {current.rule.caveat}
              </p>
            )}
          </>
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
                  note: `Cognate rule ${current.rule.pattern}.${current.rule.caveat ? ` ${current.rule.caveat}` : ''}`,
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
  // Session items are drawn once when a practice button is tapped, never on
  // re-render — reshuffling mid-session would swap words underfoot.
  const [session, setSession] = useState<{ title: string; mixed: boolean; items: PracticeItem[] } | null>(
    null,
  );
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

  if (session !== null) {
    return (
      <div className="stack">
        <div className="row" style={{ minHeight: 0 }}>
          <span className="eyebrow">{session.title}</span>
          <button className="btn quiet" onClick={() => setSession(null)}>
            back
          </button>
        </div>
        <Practice
          items={session.items}
          mixed={session.mixed}
          userId={userId}
          inDeck={inDeck}
          onDeckChange={() => void refreshDeck()}
          onClose={() => setSession(null)}
        />
      </div>
    );
  }

  const rule = openSlug ? cognateRule(openSlug) : undefined;

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
        <button
          className="btn primary block"
          onClick={() =>
            setSession({
              title: rule.pattern,
              mixed: false,
              items: shuffle(rule.words.map((w) => ({ ...w, rule }))),
            })
          }
        >
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
          {COGNATE_RULES.length} rules turn thousands of English words into Spanish you already
          own. Learn the rule, not the words — then drive the verbs with a power verb below.
        </p>
      </div>
      <button
        className="btn primary block"
        onClick={() => {
          // Weak rules (last score under 70%) get double weight in the draw.
          const pool = ALL_ITEMS.flatMap((item) => {
            const s = lastScore(item.rule.slug);
            return s && s.got / s.total < 0.7 ? [item, item] : [item];
          });
          const drawn: PracticeItem[] = [];
          const seen = new Set<string>();
          for (const item of shuffle(pool)) {
            if (seen.has(item.es)) continue;
            seen.add(item.es);
            drawn.push(item);
            if (drawn.length >= MIX_SIZE) break;
          }
          setSession({ title: 'práctica aleatoria', mixed: true, items: drawn });
        }}
      >
        Práctica aleatoria — {MIX_SIZE} words, every rule
      </button>
      <PowerVerbs />
      {COGNATE_RULES.map((r) => {
        const known = r.words.filter((w) => inDeck.has(w.es.toLowerCase())).length;
        const score = lastScore(r.slug);
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
              {score && (
                <span
                  style={{
                    color: score.got / score.total < 0.7 ? 'var(--clay)' : 'var(--sage)',
                    marginRight: 6,
                  }}
                >
                  {score.got}/{score.total}
                </span>
              )}
              {known}/{r.words.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}
