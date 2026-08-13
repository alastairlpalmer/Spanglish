import type { FastifyInstance } from 'fastify';
import { cardsRequestSchema, cardsResponseSchema } from '@seiscientas/shared';
import { env } from '../../env.js';
import { requireUser } from '../../auth.js';
import { budgetExceeded } from '../budget.js';
import { recordCall } from '../usage.js';
import { anthropic, MODELS, responseText, parseJsonLoose } from '../anthropic.js';
import { cardsSystemPrompt, cardsUserPrompt } from '../prompts/cards.js';
import { mockCards } from '../mock/fixtures.js';

export function registerCardsRoute(app: FastifyInstance): void {
  app.post('/api/ai/cards', { preHandler: requireUser }, async (req, reply) => {
    const parsed = cardsRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    if (budgetExceeded(reply)) return;

    if (env.aiMock) return cardsResponseSchema.parse(mockCards);

    const body = parsed.data;
    for (let attempt = 0; attempt < 2; attempt++) {
      const msg = await anthropic().messages.create({
        model: MODELS.cards,
        max_tokens: 4000,
        system: cardsSystemPrompt(body.count),
        messages: [{ role: 'user', content: cardsUserPrompt(body) }],
      });
      await recordCall({
        userId: req.userId,
        feature: 'cards',
        model: MODELS.cards,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      });
      try {
        return cardsResponseSchema.parse(parseJsonLoose(responseText(msg)));
      } catch {
        if (attempt === 1) return reply.code(502).send({ error: 'generation_failed' });
      }
    }
  });
}
