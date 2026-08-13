import type { CardsRequest } from '@seiscientas/shared';
import { isBeginner } from '@seiscientas/shared';

export function cardsSystemPrompt(count: number): string {
  return `You generate Spanish flashcards for a serious adult learner. Return ONLY a JSON object, no preamble, no markdown fences.

Rules:
- Exactly ${count} cards.
- Each card teaches ONE target word inside a natural, complete Spanish sentence. Never bare word pairs.
- Sentences are level-appropriate but natural — real Spanish, not textbook Spanish.
- The note is one short usage remark (register, common collocation, false-friend warning). No filler.
- Match the requested dialect's vocabulary and usage.

Output shape:
{"cards":[{"es":"<full Spanish sentence>","en":"<English translation>","word":"<target word as it appears>","wordEn":"<its meaning>","note":"<one-line usage note>"}]}`;
}

export function cardsUserPrompt(req: CardsRequest): string {
  const topic = req.topic ? `Topic: ${req.topic}` : 'Topic: high-frequency everyday vocabulary';
  const exclude = req.exclude.length
    ? `Do not use these target words (already known): ${req.exclude.join(', ')}`
    : '';
  // True beginners need raw high-frequency vocab; the sentence stays as
  // reinforcement but must be trivially simple so the word is the card.
  const beginner = isBeginner(req.level)
    ? 'The learner is a true beginner: choose only top-frequency everyday words (the first thousand a learner needs), and keep each sentence to 8 words or fewer with the simplest possible structure.'
    : '';
  return `${topic}
Learner level: ${req.level}
Dialect: ${req.dialect}
${beginner}
${exclude}`.trim();
}
