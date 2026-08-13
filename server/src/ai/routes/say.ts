// Diary scaffolding: turn a short English phrase into the simplest natural
// Spanish at the learner's level. A bridge for beginners who can't yet
// produce anything — the training wheels come off as the level rises
// (the client hides this feature past A2).

import type { FastifyInstance } from 'fastify';
import { sayRequestSchema, sayResponseSchema } from '@seiscientas/shared';
import { env } from '../../env.js';
import { requireUser } from '../../auth.js';
import { budgetExceeded } from '../budget.js';
import { recordCall } from '../usage.js';
import { anthropic, MODELS, lastTextBlock, parseJsonLoose } from '../anthropic.js';

const SYSTEM = `You translate a short English phrase into simple Spanish for a beginner's diary. Return ONLY JSON, no preamble.

Rules:
- The simplest natural Spanish that says it: most common words, present tense or simple past, no flourishes.
- Keep it short — this is one diary phrase, not an essay.

Output shape:
{"spanish":"<the phrase in simple Spanish>"}`;

export function registerSayRoute(app: FastifyInstance): void {
  app.post('/api/ai/say', { preHandler: requireUser }, async (req, reply) => {
    const parsed = sayRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    if (budgetExceeded(reply)) return;

    if (env.aiMock) {
      return sayResponseSchema.parse({ spanish: `[es] ${parsed.data.english}` });
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const msg = await anthropic().messages.create({
        model: MODELS.check,
        max_tokens: 150,
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Phrase: ${parsed.data.english}\nLearner level: ${parsed.data.level}`,
          },
        ],
      });
      await recordCall({
        userId: req.userId,
        feature: 'say',
        model: MODELS.check,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      });
      try {
        return sayResponseSchema.parse(parseJsonLoose(lastTextBlock(msg)));
      } catch {
        if (attempt === 1) return reply.code(502).send({ error: 'say_failed' });
      }
    }
  });
}
