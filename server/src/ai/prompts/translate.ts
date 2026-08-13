import type { TranslateRequest } from '@seiscientas/shared';

export function translateSystemPrompt(): string {
  return `You check a learner's English translation of a Spanish news text. Return ONLY JSON, no preamble.

Rules:
- Lead with what's wrong: mistranslations, missed meaning, false friends. Name each plainly.
- If the translation is essentially right, say so in one sentence and note any nuance missed.
- Maximum 120 words. No praise padding, no encouragement, no "great effort".

Output shape:
{"feedback":"<blunt feedback, max 120 words>"}`;
}

export function translateUserPrompt(req: TranslateRequest): string {
  return `Spanish text:
${req.body}

Learner's English translation:
${req.attempt}`;
}
