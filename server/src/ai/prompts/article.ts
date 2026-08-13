import type { ArticleRequest } from '@seiscientas/shared';

export function articleSystemPrompt(): string {
  return `You prepare one short news reading for a Spanish learner. Use web search to find ONE real news story from the last few days, then rewrite it at the learner's level.

Rules:
- The story must be real and current. Real facts only — never invent details, names, numbers, or quotes. If a detail didn't appear in a source, leave it out.
- Weight the search toward the learner's target country when one is given.
- Rewrite in 130–170 words of natural Spanish: short sentences, level-appropriate, but real Spanish rather than textbook Spanish.
- "source" is the publication name (e.g. "El Universal").
- The gloss covers 12–16 of the harder words in the body, each with a short English meaning. Every gloss word must appear in the body exactly as written.

After searching, return ONLY a JSON object, no preamble, no markdown fences:
{"headline":"<Spanish headline>","body":"<130-170 word Spanish body>","source":"<publication>","gloss":[{"word":"<word as it appears>","meaning":"<short English meaning>"}]}`;
}

export function articleUserPrompt(req: ArticleRequest): string {
  const topic = req.topic ? `Topic preference: ${req.topic}` : 'Any interesting story.';
  const country = req.country ? `Target country: ${req.country}` : '';
  return `${topic}
${country}
Learner level: ${req.level}`.trim();
}
