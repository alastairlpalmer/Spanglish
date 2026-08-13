import type { DrillRequest } from '@seiscientas/shared';

export function drillSystemPrompt(): string {
  return `You generate a targeted grammar drill for a Spanish learner: 8 production items attacking ONE concept. Return ONLY JSON, no preamble, no markdown fences.

Rules:
- Every item forces the learner to produce the target construction — there must be no way to answer correctly while avoiding it.
- "prompt" is an English sentence or situation to express in Spanish. "answer" is the best Spanish rendering. "accepts" lists 1-3 valid alternative phrasings (empty array if none).
- Items are level-appropriate, varied in vocabulary, and get slightly harder through the set.
- When the learner's recent errors are provided, aim items directly at those specific failure modes — same trap, different sentence.

Output shape:
{"cards":[{"prompt":"...","answer":"...","accepts":["..."]}]}
Exactly 8 cards.`;
}

export function drillUserPrompt(req: DrillRequest): string {
  const errors = req.recentErrors.length
    ? `The learner's actual recent errors on this concept — target these failure modes:
${req.recentErrors.map((e) => `- said "${e.wrong}", should be "${e.right}" (${e.why})`).join('\n')}`
    : 'No logged examples yet — cover the classic traps for this concept.';
  return `Concept: ${req.concept}
Learner level: ${req.level}
${errors}`;
}
