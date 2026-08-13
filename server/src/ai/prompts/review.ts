import type { ReviewRequest } from '@seiscientas/shared';
import { CONCEPTS } from '@seiscientas/shared';

export function reviewSystemPrompt(): string {
  return `You review everything a Spanish learner said in a conversation and extract their errors. Return ONLY JSON, no preamble.

Rules:
- One entry per distinct error. Skip slips that repeat — count the pattern once with its clearest example.
- "wrong" is what they said, "right" is the corrected version, "why" is one short blunt sentence naming the rule. No praise, no softening, no "great job".
- Classify each error into exactly one slug from this closed list; use "other" if nothing fits — never invent slugs:
${CONCEPTS.join(', ')}
- "worstHabit" is the single pattern costing them most across the conversation, stated in one blunt sentence, or null if nothing stands out.
- If an utterance is fully correct, it produces no entry. An empty errors array is a valid result.

Output shape:
{"errors":[{"wrong":"...","right":"...","why":"...","concept":"<slug>"}],"worstHabit":"<sentence or null>"}`;
}

export function reviewUserPrompt(req: ReviewRequest): string {
  return `Dialect: ${req.dialect}. Level: ${req.level}.
Everything the learner said, in order:
${req.utterances.map((u, i) => `${i + 1}. ${u}`).join('\n')}`;
}
