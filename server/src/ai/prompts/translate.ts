import type { TranslateRequest } from '@seiscientas/shared';
import { CONCEPTS } from '@seiscientas/shared';

export function translateSystemPrompt(): string {
  return `You check a learner's English translation of a Spanish news text. Return ONLY JSON, no preamble.

Rules:
- Lead with what's wrong: mistranslations, missed meaning, false friends. Name each plainly.
- If the translation is essentially right, say so in one sentence and note any nuance missed.
- "feedback" is maximum 120 words. No praise padding, no encouragement, no "great effort".
- "errors" lists each comprehension error that reveals a grammar misunderstanding: "wrong" is what their translation implied about the Spanish, "right" is what the Spanish actually says, "why" is one short sentence. Classify each into exactly one slug from this closed list, or "other" — never invent slugs:
${CONCEPTS.join(', ')}
- Pure vocabulary misses (didn't know a word) are feedback only, not errors. An empty errors array is a valid result.

Output shape:
{"feedback":"<max 120 words>","errors":[{"wrong":"...","right":"...","why":"...","concept":"<slug>"}]}`;
}

export function translateUserPrompt(req: TranslateRequest): string {
  return `Spanish text:
${req.body}

Learner's English translation:
${req.attempt}`;
}
