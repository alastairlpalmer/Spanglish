// Tap-any-word lookup: define a word as used in its sentence. The most
// frequent Read call at beginner level, so it stays tiny — Haiku, ~100
// tokens per lookup.

import type { FastifyInstance } from 'fastify';
import { wordRequestSchema, wordResponseSchema } from '@seiscientas/shared';
import { env } from '../../env.js';
import { requireUser } from '../../auth.js';
import { budgetExceeded } from '../budget.js';
import { recordCall } from '../usage.js';
import { anthropic, MODELS, lastTextBlock, parseJsonLoose } from '../anthropic.js';

const SYSTEM = `You define one Spanish word or phrase as it is used in the given sentence, for an English-speaking learner. Return ONLY JSON, no preamble.

Rules:
- "meaning" is the short English meaning of the word AS USED HERE (a few words, not a dictionary entry). If it's a conjugated verb, give the meaning and name the infinitive, e.g. "opened (inaugurar)".
- "note" is one short usage remark ONLY when genuinely useful (false friend, idiom, irregular form); otherwise null.

Output shape:
{"meaning":"<short meaning as used>","note":"<one line or null>"}`;

export function registerWordRoute(app: FastifyInstance): void {
  app.post('/api/ai/word', { preHandler: requireUser }, async (req, reply) => {
    const parsed = wordRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    if (budgetExceeded(reply)) return;

    if (env.aiMock) {
      return wordResponseSchema.parse({
        meaning: `mock meaning of "${parsed.data.word}"`,
        note: null,
      });
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const msg = await anthropic().messages.create({
        model: MODELS.check,
        max_tokens: 150,
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Word: ${parsed.data.word}\nSentence: ${parsed.data.sentence}\nLearner level: ${parsed.data.level}`,
          },
        ],
      });
      await recordCall({
        userId: req.userId,
        feature: 'word',
        model: MODELS.check,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      });
      try {
        return wordResponseSchema.parse(parseJsonLoose(lastTextBlock(msg)));
      } catch {
        if (attempt === 1) return reply.code(502).send({ error: 'word_failed' });
      }
    }
  });
}
