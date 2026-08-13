import type { ArticleRequest } from '@seiscientas/shared';
import type { NewsItem } from '../news.js';

export function articleSystemPrompt(): string {
  return `You prepare one short news reading for a Spanish learner from real headlines provided to you. Return ONLY a JSON object, no preamble, no markdown fences.

Rules:
- Pick the single most interesting story from the provided items (items about the same event may be combined).
- Write 90–170 words of natural Spanish at the learner's level: short sentences, but real Spanish rather than textbook Spanish.
- STRICT FACTS: use only facts stated in the provided titles and snippets. Never invent names, numbers, quotes, causes, or outcomes. If the material is thin, write a shorter piece rather than padding with invented detail.
- "source" is the publication name of the chosen item.
- The gloss covers 10–16 of the harder words in the body, each with a short English meaning. Every gloss word must appear in the body exactly as written.

Output shape:
{"headline":"<Spanish headline>","body":"<90-170 word Spanish body>","source":"<publication>","gloss":[{"word":"<word as it appears>","meaning":"<short English meaning>"}]}`;
}

export function articleUserPrompt(req: ArticleRequest, items: NewsItem[]): string {
  const list = items
    .map(
      (it, i) =>
        `${i + 1}. [${it.source}] ${it.title}${it.snippet ? ` — ${it.snippet}` : ''} (${it.date})`,
    )
    .join('\n');
  const weak = req.weakConcepts.length
    ? `Where it fits naturally, let the rewrite exercise these grammar areas the learner is weak on, and prefer gloss words connected to them: ${req.weakConcepts.join(', ')}. Do not mention this.`
    : '';
  return `Today's headlines:
${list}

Learner level: ${req.level}
${weak}`.trim();
}
