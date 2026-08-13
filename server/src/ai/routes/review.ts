import type { FastifyInstance } from 'fastify';
import { reviewRequestSchema, reviewResponseSchema, coerceConcept } from '@seiscientas/shared';
import { env } from '../../env.js';
import { requireUser } from '../../auth.js';
import { budgetExceeded } from '../budget.js';
import { recordCall } from '../usage.js';
import { anthropic, MODELS, responseText, parseJsonLoose } from '../anthropic.js';
import { reviewSystemPrompt, reviewUserPrompt } from '../prompts/review.js';
import { mockReview } from '../mock/fixtures.js';

export function registerReviewRoute(app: FastifyInstance): void {
  app.post('/api/ai/review', { preHandler: requireUser }, async (req, reply) => {
    const parsed = reviewRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    if (budgetExceeded(reply)) return;

    if (env.aiMock) return reviewResponseSchema.parse(mockReview);

    for (let attempt = 0; attempt < 2; attempt++) {
      const msg = await anthropic().messages.create({
        model: MODELS.review,
        max_tokens: 2000,
        system: reviewSystemPrompt(),
        messages: [{ role: 'user', content: reviewUserPrompt(parsed.data) }],
      });
      await recordCall({
        userId: req.userId,
        feature: 'review',
        model: MODELS.review,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      });
      try {
        const raw = parseJsonLoose(responseText(msg)) as { errors?: Array<Record<string, unknown>> };
        // Coerce concepts before schema validation — the taxonomy is enforced
        // here, not merely requested in the prompt.
        if (Array.isArray(raw?.errors)) {
          for (const e of raw.errors) e.concept = coerceConcept(String(e.concept ?? ''));
        }
        return reviewResponseSchema.parse(raw);
      } catch {
        if (attempt === 1) return reply.code(502).send({ error: 'review_failed' });
      }
    }
  });
}
