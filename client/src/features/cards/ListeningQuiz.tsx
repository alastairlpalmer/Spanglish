// Bucket listening quiz: hear a word, pick its meaning. Pure ear training —
// free, offline, and deliberately outside SM-2. The scheduler tests recall;
// this tests whether the word survives contact with sound.

import { useEffect, useState } from 'react';
import { speak, stopSpeaking } from '../../speech/synthesis';
import { localeForDialect } from '../../speech/recognition';

export interface QuizWord {
  es: string;
  en: string;
}

const ROUNDS = 10;
const OPTIONS = 4;

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

interface Round {
  word: QuizWord;
  options: string[];
}

function buildRounds(words: QuizWord[]): Round[] {
  return shuffle(words)
    .slice(0, ROUNDS)
    .map((word) => {
      const distractors = shuffle(words.filter((w) => w.en !== word.en))
        .slice(0, OPTIONS - 1)
        .map((w) => w.en);
      return { word, options: shuffle([word.en, ...distractors]) };
    });
}

export function ListeningQuiz({
  words,
  dialect,
  onClose,
}: {
  words: QuizWord[];
  dialect: string;
  onClose: () => void;
}): JSX.Element {
  // State initializer, not useMemo: the parent rebuilds `words` every render,
  // and reshuffling mid-quiz would swap the answer under the learner.
  const [rounds] = useState(() => buildRounds(words));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const locale = localeForDialect(dialect);

  const round = rounds[index] ?? null;

  // Speak each new word as it arrives; the quiz opened from a tap, so the
  // synthesis gate is already unlocked.
  useEffect(() => {
    if (round) speak(round.word.es, locale);
    return stopSpeaking;
  }, [round, locale]);

  if (!round) {
    return (
      <div className="stack">
        <div className="panel" style={{ textAlign: 'center' }}>
          <p className="mono" style={{ fontSize: 28 }}>
            {score} / {rounds.length}
          </p>
          <p className="muted" style={{ fontSize: 14 }}>
            {score === rounds.length
              ? 'Every word landed by ear alone.'
              : 'The misses are the words you only know on paper.'}
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
        {index + 1} / {rounds.length}
      </p>
      <button className="btn block" onClick={() => speak(round.word.es, locale)}>
        {picked === null ? '🔊 hear it again' : `🔊 ${round.word.es}`}
      </button>
      <div className="stack" style={{ gap: 8 }}>
        {round.options.map((opt) => {
          const isRight = opt === round.word.en;
          const style =
            picked === null
              ? undefined
              : isRight
                ? { borderColor: 'var(--sage)' }
                : opt === picked
                  ? { borderColor: 'var(--clay)' }
                  : { opacity: 0.4 };
          return (
            <button
              key={opt}
              className="btn block"
              style={style}
              disabled={picked !== null}
              onClick={() => {
                setPicked(opt);
                if (isRight) setScore((s) => s + 1);
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <button
          className="btn primary block"
          onClick={() => {
            setPicked(null);
            setIndex(index + 1);
          }}
        >
          {index + 1 < rounds.length ? 'Next' : 'Finish'}
        </button>
      )}
      <button className="btn quiet" onClick={onClose}>
        quit
      </button>
    </div>
  );
}
