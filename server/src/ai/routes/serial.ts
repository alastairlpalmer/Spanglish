// The daily serial: a continuing story at the learner's level, one short
// episode a day, ending on a small hook. The pull is narrative, not points.

import type { FastifyInstance } from 'fastify';
import { isBeginner, serialRequestSchema, serialResponseSchema, type SerialRequest } from '@seiscientas/shared';
import { env } from '../../env.js';
import { requireUser } from '../../auth.js';
import { budgetExceeded } from '../budget.js';
import { recordCall } from '../usage.js';
import { anthropic, MODELS, lastTextBlock, parseJsonLoose } from '../anthropic.js';
import { mockSerial } from '../mock/fixtures.js';

function systemPrompt(level: string): string {
  const beginner = isBeginner(level);
  const bodyRule = beginner
    ? 'Write 70–110 words of very simple Spanish: present tense where possible, one clause per sentence, the most common words available.'
    : 'Write 100–160 words of natural Spanish at the learner’s level: short sentences, real Spanish rather than textbook Spanish.';
  const glossRule = beginner
    ? 'The gloss covers 15–30 words or short phrases — everything a beginner is unlikely to know, including common verbs and connectors.'
    : 'The gloss covers 10–18 of the harder words.';
  return `You write one episode of a continuing story for a Spanish learner. Return ONLY a JSON object, no preamble, no markdown fences.

Rules:
- The story follows the same small cast across episodes: everyday people, real places in the Spanish-speaking world, small believable stakes (a lost key, a new neighbour, a job interview). Warm, concrete, never childish.
- ${bodyRule}
- Each episode continues from the provided summary and ends on a small hook that makes tomorrow's episode wanted. Episode 1 introduces the cast and the situation.
- "summary" is an updated running summary of the whole story so far (in English, max 150 words) — everything the next episode's writer needs.
- ${glossRule} Every gloss word must appear in the body exactly as written.

Output shape:
{"title":"<short Spanish episode title>","body":"<Spanish episode>","summary":"<updated English summary>","gloss":[{"word":"...","meaning":"..."}]}`;
}

function userPrompt(req: SerialRequest): string {
  const weak = req.weakConcepts.length
    ? `Where it fits naturally, let the episode exercise these grammar areas: ${req.weakConcepts.join(', ')}. Do not mention this.`
    : '';
  return `Episode number: ${req.episode}
Learner level: ${req.level}
${req.summary ? `Story so far: ${req.summary}` : 'This is the first episode — invent the cast and situation.'}
${weak}`.trim();
}

export function registerSerialRoute(app: FastifyInstance): void {
  app.post('/api/ai/serial', { preHandler: requireUser }, async (req, reply) => {
    const parsed = serialRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    if (budgetExceeded(reply)) return;

    if (env.aiMock) return serialResponseSchema.parse(mockSerial);

    for (let attempt = 0; attempt < 2; attempt++) {
      const msg = await anthropic().messages.create({
        model: MODELS.cards,
        max_tokens: 1500,
        system: systemPrompt(parsed.data.level),
        messages: [{ role: 'user', content: userPrompt(parsed.data) }],
      });
      await recordCall({
        userId: req.userId,
        feature: 'serial',
        model: MODELS.cards,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      });
      try {
        return serialResponseSchema.parse(parseJsonLoose(lastTextBlock(msg)));
      } catch (err) {
        if (attempt === 1) {
          req.log.error({ err }, 'serial episode failed validation');
          return reply.code(502).send({ error: 'serial_failed' });
        }
      }
    }
  });
}
