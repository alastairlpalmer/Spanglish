// Curated Spanish podcasts by level. Static and free: listening happens in
// the learner's own podcast app; the button here just logs the input time,
// because most input hours happen outside the app and a tracker that only
// counts in-app time reads as a lie.

import type { Level } from '@seiscientas/shared';

export interface Podcast {
  name: string;
  blurb: string;
  url: string;
  levels: Level[];
}

export const PODCASTS: Podcast[] = [
  {
    name: 'Language Transfer',
    blurb: 'Free audio course building Spanish from zero, in English.',
    url: 'https://www.languagetransfer.org/complete-spanish',
    levels: ['A0', 'A1'],
  },
  {
    name: 'Coffee Break Spanish',
    blurb: 'Short structured lessons from absolute beginner up.',
    url: 'https://coffeebreaklanguages.com/coffeebreakspanish/',
    levels: ['A0', 'A1', 'A2'],
  },
  {
    name: 'Duolingo Spanish Podcast',
    blurb: 'True stories in slow Spanish with English scaffolding.',
    url: 'https://podcast.duolingo.com/spanish',
    levels: ['A1', 'A2', 'B1'],
  },
  {
    name: 'News in Slow Spanish',
    blurb: "The week's news, deliberately slowed down.",
    url: 'https://www.newsinslowspanish.com/',
    levels: ['A2', 'B1'],
  },
  {
    name: 'Español con Juan',
    blurb: 'Natural rambling Spanish, funny and repetitive in the good way.',
    url: 'https://www.1001reasonstolearnspanish.com/podcast/',
    levels: ['A2', 'B1', 'B2'],
  },
  {
    name: 'Hoy Hablamos',
    blurb: 'A daily topic in clear everyday Spanish.',
    url: 'https://www.hoyhablamos.com/',
    levels: ['B1', 'B2'],
  },
  {
    name: 'Radio Ambulante',
    blurb: 'NPR-quality Latin American stories, full native speed.',
    url: 'https://radioambulante.org/',
    levels: ['B2'],
  },
];

export function podcastsFor(level: Level): Podcast[] {
  return PODCASTS.filter((p) => p.levels.includes(level));
}
