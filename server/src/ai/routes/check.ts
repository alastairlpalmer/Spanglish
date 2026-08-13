import type { FastifyInstance } from 'fastify';
import { checkRequestSchema, checkResponseSchema, coerceConcept } from '@seiscientas/shared';
import { env } from '../../env.js';
import { requireUser } from '../../auth.js';
import { budgetExceeded } from '../budget.js';
import { recordCall } from '../usage.js';
import { anthropic, MODELS, lastTextBlock, parseJsonLoose } from '../anthropic.js';
import { checkSystemPrompt, checkUserPrompt } from '../prompts/check.js';
import { mockCheckCorrect, mockCheckWrong } from '../mock/fixtures.js';

export function registerCheckRoute(app: FastifyInstance): void {
  app.post('/api/ai/check', { preHandler: requireUser }, async (req, reply) => {
    const parsed = checkRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    if (budgetExceeded(reply)) return;

    if (env.aiMock) {
      // Deterministic mock: attempts containing "soy" grade wrong so the
      // error path is exercisable in dev.
      const wrong = /\bsoy\b/i.test(parsed.data.attempt);
      return checkResponseSchema.parse(wrong ? mockCheckWrong : mockCheckCorrect);
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const msg = await anthropic().messages.create({
        model: MODELS.check,
        max_tokens: 300,
        system: checkSystemPrompt(),
        messages: [{ role: 'user', content: checkUserPrompt(parsed.data) }],
      });
      await recordCall({
        userId: req.userId,
        feature: 'check',
        model: MODELS.check,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      });
      try {
        const raw = parseJsonLoose(lastTextBlock(msg)) as Record<string, unknown>;
        // Enforce the closed taxonomy server-side, not just in the prompt.
        if (raw && typeof raw === 'object' && raw.concept != null) {
          raw.concept = coerceConcept(String(raw.concept));
        }
        return checkResponseSchema.parse(raw);
      } catch {
        if (attempt === 1) return reply.code(502).send({ error: 'check_failed' });
      }
    }
  });
}
