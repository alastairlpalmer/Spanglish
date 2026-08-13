import type { CardsRequest } from '@seiscientas/shared';

export function cardsSystemPrompt(): string {
  return `You generate Spanish flashcards for a serious adult learner. Return ONLY a JSON object, no preamble, no markdown fences.

Rules:
- Exactly 8 cards.
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
  return `${topic}
Learner level: ${req.level}
Dialect: ${req.dialect}
${exclude}`.trim();
}
