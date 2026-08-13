// The Read tab: news, the daily story, and the Spanish diary in one place.
// News and story open the light reading room; the diary stays on the app
// surface — writing happens in the instrument, reading in the room.

import { useState } from 'react';
import { ReadView } from './ReadView';
import { DiarySection } from '../log/DiarySection';

type Segment = 'news' | 'story' | 'diary';

export function ReadTab({ userId }: { userId: string }): JSX.Element {
  const [segment, setSegment] = useState<Segment>(
    () => (localStorage.getItem('read-segment') as Segment) ?? 'news',
  );

  function pick(s: Segment): void {
    setSegment(s);
    localStorage.setItem('read-segment', s);
  }

  return (
    <div>
      <div className="segment-row">
        {(['news', 'story', 'diary'] as const).map((s) => (
          <button key={s} className={segment === s ? 'active' : ''} onClick={() => pick(s)}>
            {s === 'diary' ? 'diario' : s}
          </button>
        ))}
      </div>

      {segment === 'diary' ? (
        <DiarySection userId={userId} />
      ) : (
        <ReadView
          key={segment}
          userId={userId}
          embedded
          modeOverride={segment}
          onClose={() => {}}
        />
      )}
    </div>
  );
}
