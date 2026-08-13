import type { FastifyInstance } from 'fastify';
import { articleRequestSchema, articleResponseSchema } from '@seiscientas/shared';
import { env } from '../../env.js';
import { requireUser } from '../../auth.js';
import { budgetExceeded } from '../budget.js';
import { recordCall } from '../usage.js';
import { anthropic, MODELS, lastTextBlock, parseJsonLoose } from '../anthropic.js';
import { articleSystemPrompt, articleUserPrompt } from '../prompts/article.js';
import { mockArticle } from '../mock/fixtures.js';

const MAX_RESUMES = 4;

export function registerArticleRoute(app: FastifyInstance): void {
  app.post('/api/ai/article', { preHandler: requireUser }, async (req, reply) => {
    const parsed = articleRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    if (budgetExceeded(reply)) return;

    if (env.aiMock) return articleResponseSchema.parse(mockArticle);

    const client = anthropic();
    const messages: Parameters<typeof client.messages.create>[0]['messages'] = [
      { role: 'user', content: articleUserPrompt(parsed.data) },
    ];

    // Web search runs a server-side loop; it can pause with stop_reason
    // "pause_turn" — append the assistant turn and re-send to resume.
    let totalIn = 0;
    let totalOut = 0;
    try {
      for (let i = 0; i <= MAX_RESUMES; i++) {
        const msg = await client.messages.create({
          model: MODELS.article,
          max_tokens: 3000,
          system: articleSystemPrompt(),
          tools: [{ type: 'web_search_20260209' as never, name: 'web_search', max_uses: 4 } as never],
          messages,
        });
        totalIn += msg.usage.input_tokens;
        totalOut += msg.usage.output_tokens;

        if (msg.stop_reason === 'pause_turn' && i < MAX_RESUMES) {
          messages.push({ role: 'assistant', content: msg.content });
          continue;
        }

        // The final text block only — web search interleaves narration blocks.
        return articleResponseSchema.parse(parseJsonLoose(lastTextBlock(msg)));
      }
      req.log.error('article: exhausted pause_turn resumes');
      return reply.code(502).send({ error: 'article_failed' });
    } catch (err) {
      req.log.error({ err }, 'article generation failed');
      return reply.code(502).send({ error: 'article_failed' });
    } finally {
      await recordCall({
        userId: req.userId,
        feature: 'article',
        model: MODELS.article,
        inputTokens: totalIn,
        outputTokens: totalOut,
      });
    }
  });
}
