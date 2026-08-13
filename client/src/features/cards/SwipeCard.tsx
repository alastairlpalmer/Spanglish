// Swipe-driven review card. Follows the finger with a small rotation and a
// colour wash (clay left = miss, sage right = got). Buttons remain an
// equal-weight alternative. Gestures starting near the left screen edge are
// ignored (iOS back-swipe).

import { useRef, useState, type PointerEvent } from 'react';
import type { Card } from '@seiscientas/shared';
import { speak } from '../../speech/synthesis';
import { localeForDialect } from '../../speech/recognition';

const SWIPE_THRESHOLD = 90;
const EDGE_GUARD_PX = 24;

export function SwipeCard({
  card,
  quietMode,
  dialect,
  wordFirst,
  reducedMotion,
  onGrade,
}: {
  card: Card;
  quietMode: boolean;
  dialect: string;
  /** Beginner presentation: the word alone on the front, the sentence as
   *  reinforcement on reveal. Raw vocab drilling without bare word pairs. */
  wordFirst: boolean;
  reducedMotion: boolean;
  onGrade: (grade: 'got' | 'miss') => void;
}): JSX.Element {
  const [revealed, setRevealed] = useState(false);
  const [dx, setDx] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);
  const pointerId = useRef<number | null>(null);

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
      {wordFirst ? (
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
      {!quietMode && (
        <button
          className="btn quiet"
          onClick={(e) => {
            e.stopPropagation();
            speak(wordFirst ? word || es : es, localeForDialect(dialect));
          }}
        >
          listen
        </button>
      )}
      {revealed ? (
        <div className="reveal">
          <p>
            <span className="mono" style={{ color: 'var(--ochre)' }}>
              {card.word}
            </span>{' '}
            — {card.word_en}
          </p>
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
          tap to reveal
        </p>
      )}
    </div>
  );
}
