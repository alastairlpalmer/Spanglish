// Swipe-driven review card. Follows the finger with a small rotation and a
// colour wash (clay left = miss, sage right = got). Buttons remain an
// equal-weight alternative. Gestures starting near the left screen edge are
// ignored (iOS back-swipe).

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Card } from '@seiscientas/shared';
import { speak } from '../../speech/synthesis';
import { localeForDialect } from '../../speech/recognition';

const SWIPE_THRESHOLD = 90;
const EDGE_GUARD_PX = 24;

export function SwipeCard({
  card,
  quietMode,
  dialect,
  wordFirst: wordFirstProp,
  listenFirst,
  leech,
  recall,
  reducedMotion,
  onGrade,
}: {
  card: Card;
  quietMode: boolean;
  dialect: string;
  /** Beginner presentation: the word alone on the front, the sentence as
   *  reinforcement on reveal. Raw vocab drilling without bare word pairs. */
  wordFirst: boolean;
  /** Ear training (frases): the sentence is SPOKEN, not shown — no text
   *  until reveal. Wins over wordFirst. */
  listenFirst?: boolean;
  /** Repeatedly-missed card: always show full sentence context (the bare
   *  word clearly is not sticking on its own). */
  leech?: boolean;
  /** Production card answered by self-report: the English prompt on the
   *  front, the Spanish on reveal, graded by the learner. Wins over every
   *  other presentation — this card is running backwards. */
  recall?: boolean;
  reducedMotion: boolean;
  onGrade: (grade: 'got' | 'miss') => void;
}): JSX.Element {
  // Leeches lose word-first: the bare word is not sticking, give it context.
  const wordFirst = wordFirstProp && !leech;
  const [revealed, setRevealed] = useState(false);
  const [dx, setDx] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);
  const pointerId = useRef<number | null>(null);

  // Listening card speaks itself as it arrives (the section chip tap
  // unlocked synthesis; each card is a fresh mount via its key).
  useEffect(() => {
    if (listenFirst && !quietMode && !recall) speak(card.es ?? '', localeForDialect(dialect));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(e: PointerEvent<HTMLDivElement>): void {
    if (e.clientX < EDGE_GUARD_PX) return; // leave the iOS back-swipe alone
    dragging.current = true;
    startX.current = e.clientX;
    pointerId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>): void {
    if (!dragging.current || e.pointerId !== pointerId.current) return;
    setDx(e.clientX - startX.current);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>): void {
    if (!dragging.current || e.pointerId !== pointerId.current) return;
    dragging.current = false;
    const finalDx = e.clientX - startX.current;
    if (Math.abs(finalDx) >= SWIPE_THRESHOLD) {
      onGrade(finalDx > 0 ? 'got' : 'miss');
    } else if (Math.abs(finalDx) < 6) {
      setRevealed(true); // a tap reveals
    }
    setDx(0);
  }

  const rotation = reducedMotion ? 0 : dx / 24;
  const washOpacity = Math.min(0.45, Math.abs(dx) / 220);
  const washColor = dx > 0 ? 'var(--sage)' : 'var(--clay)';

  // Underline the target word inside the sentence.
  const es = card.es ?? '';
  const word = card.word ?? '';
  const idx = word ? es.toLowerCase().indexOf(word.toLowerCase()) : -1;

  return (
    <div
      className="review-card"
      style={{
        transform: reducedMotion
          ? undefined
          : `translateX(${dx}px) rotate(${rotation}deg)`,
        transition: dragging.current ? 'none' : 'transform 180ms ease',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragging.current = false;
        setDx(0);
      }}
    >
      <div
        className="card-wash"
        style={{ background: washColor, opacity: dragging.current ? washOpacity : 0 }}
      />
      {leech && (
        <p className="mono" style={{ fontSize: 10, color: 'var(--clay)' }}>
          palabra dura — shown with context
        </p>
      )}
      {recall ? (
        <>
          <p className="eyebrow">recall the Spanish</p>
          <p style={{ fontSize: 32, lineHeight: 1.3 }}>{card.prompt ?? card.word_en ?? ''}</p>
        </>
      ) : listenFirst && !revealed ? (
        <p className="es" style={{ fontSize: 40, textAlign: 'center' }}>
          🔊
        </p>
      ) : wordFirst && !listenFirst ? (
        <p className="es" lang="es" style={{ fontSize: 32 }}>
          <span className="target">{word || es}</span>
        </p>
      ) : (
        <p className="es" lang="es">
          {idx >= 0 ? (
            <>
              {es.slice(0, idx)}
              <span className="target">{es.slice(idx, idx + word.length)}</span>
              {es.slice(idx + word.length)}
            </>
          ) : (
            es
          )}
        </p>
      )}
      {!quietMode && (!recall || revealed) && (
        <button
          className="btn quiet"
          // Pointer events must not bubble to the card: pointerup there reads
          // as a tap and reveals the answer before the learner recalls it.
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            const say = recall
              ? card.answer || word || es
              : wordFirst && !listenFirst
                ? word || es
                : es;
            speak(say, localeForDialect(dialect));
          }}
        >
          listen
        </button>
      )}
      {revealed && recall ? (
        <div className="reveal">
          <p className="es" lang="es" style={{ fontSize: 28 }}>
            <span className="target">{card.answer ?? card.word ?? ''}</span>
          </p>
          {/* The sentence it was learnt in, as context for the self-grade. */}
          {es && es !== card.answer && (
            <p lang="es" style={{ fontSize: 15 }}>
              {es}
            </p>
          )}
          {card.note && <p className="note">{card.note}</p>}
        </div>
      ) : revealed ? (
        <div className="reveal">
          {/* Phrase cards carry no word gloss — the sentence is the answer. */}
          {card.word_en && (
            <p>
              <span className="mono" style={{ color: 'var(--ochre)' }}>
                {card.word}
              </span>{' '}
              — {card.word_en}
            </p>
          )}
          {wordFirst ? (
            <>
              <p lang="es" style={{ fontSize: 15 }}>
                {es}
              </p>
              <p className="note">{card.en}</p>
            </>
          ) : (
            <p>{card.en}</p>
          )}
          {card.note && <p className="note">{card.note}</p>}
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 13 }}>
          {listenFirst && !recall ? 'listen, then tap to reveal' : 'tap to reveal'}
        </p>
      )}
    </div>
  );
}
