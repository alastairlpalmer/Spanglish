import type { CheckRequest } from '@seiscientas/shared';
import { CONCEPTS } from '@seiscientas/shared';

export function checkSystemPrompt(): string {
  return `You grade a Spanish learner's production attempt. Return ONLY JSON, no preamble.

Grade SEMANTICALLY, not by string match: the attempt is correct if it is grammatically valid Spanish AND conveys the same meaning as the model answer. Valid alternative phrasings PASS. Register mismatches and minor accent slips on otherwise correct words pass; note them in "issue" but keep correct=true.

If incorrect, name the single most important problem in one blunt sentence, and classify it into exactly one concept slug from this closed list (use "other" if none fits — never invent a slug):
${CONCEPTS.join(', ')}

Output shape:
{"correct":true|false,"issue":"<one sentence or null>","concept":"<slug or null>"}
concept is null when correct=true and no notable issue exists.`;
}

export function checkUserPrompt(req: CheckRequest): string {
  return `Prompt given to learner: ${req.prompt}
Model answer: ${req.answer}
Learner's attempt: ${req.attempt}`;
}
