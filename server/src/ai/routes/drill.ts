import type { FastifyInstance } from 'fastify';
import { drillRequestSchema, drillResponseSchema } from '@seiscientas/shared';
import { env } from '../../env.js';
import { requireUser } from '../../auth.js';
import { budgetExceeded } from '../budget.js';
import { recordCall } from '../usage.js';
import { anthropic, MODELS, lastTextBlock, parseJsonLoose } from '../anthropic.js';
import { drillSystemPrompt, drillUserPrompt } from '../prompts/drill.js';
import { mockDrill } from '../mock/fixtures.js';

export function registerDrillRoute(app: FastifyInstance): void {
  app.post('/api/ai/drill', { preHandler: requireUser }, async (req, reply) => {
    const parsed = drillRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    if (budgetExceeded(reply)) return;

    if (env.aiMock) return drillResponseSchema.parse(mockDrill);

    for (let attempt = 0; attempt < 2; attempt++) {
      const msg = await anthropic().messages.create({
        model: MODELS.drill,
        max_tokens: 2000,
        system: drillSystemPrompt(),
        messages: [{ role: 'user', content: drillUserPrompt(parsed.data) }],
      });
      await recordCall({
        userId: req.userId,
        feature: 'drill',
        model: MODELS.drill,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      });
      try {
        return drillResponseSchema.parse(parseJsonLoose(lastTextBlock(msg)));
      } catch {
        if (attempt === 1) return reply.code(502).send({ error: 'drill_failed' });
      }
    }
  });
}
