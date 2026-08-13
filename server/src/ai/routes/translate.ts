import type { FastifyInstance } from 'fastify';
import { translateRequestSchema, translateResponseSchema, coerceConcept } from '@seiscientas/shared';
import { env } from '../../env.js';
import { requireUser } from '../../auth.js';
import { budgetExceeded } from '../budget.js';
import { recordCall } from '../usage.js';
import { anthropic, MODELS, responseText, parseJsonLoose } from '../anthropic.js';
import { translateSystemPrompt, translateUserPrompt } from '../prompts/translate.js';
import { mockTranslate } from '../mock/fixtures.js';

export function registerTranslateRoute(app: FastifyInstance): void {
  app.post('/api/ai/translate', { preHandler: requireUser }, async (req, reply) => {
    const parsed = translateRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    if (budgetExceeded(reply)) return;

    if (env.aiMock) return translateResponseSchema.parse(mockTranslate);

    for (let attempt = 0; attempt < 2; attempt++) {
      const msg = await anthropic().messages.create({
        model: MODELS.translate,
        max_tokens: 600,
        system: translateSystemPrompt(),
        messages: [{ role: 'user', content: translateUserPrompt(parsed.data) }],
      });
      await recordCall({
        userId: req.userId,
        feature: 'translate',
        model: MODELS.translate,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      });
      try {
        const raw = parseJsonLoose(responseText(msg)) as { errors?: Array<Record<string, unknown>> };
        if (Array.isArray(raw?.errors)) {
          for (const e of raw.errors) e.concept = coerceConcept(String(e.concept ?? ''));
        }
        return translateResponseSchema.parse(raw);
      } catch {
        if (attempt === 1) return reply.code(502).send({ error: 'translate_failed' });
      }
    }
  });
}
