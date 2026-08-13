import type { FastifyInstance } from 'fastify';
import { articleRequestSchema, articleResponseSchema } from '@seiscientas/shared';
import { env } from '../../env.js';
import { requireUser } from '../../auth.js';
import { budgetExceeded } from '../budget.js';
import { recordCall } from '../usage.js';
import { anthropic, MODELS, lastTextBlock, parseJsonLoose } from '../anthropic.js';
import { articleSystemPrompt, articleUserPrompt } from '../prompts/article.js';
import { fetchNews } from '../news.js';
import { mockArticle } from '../mock/fixtures.js';

export function registerArticleRoute(app: FastifyInstance): void {
  app.post('/api/ai/article', { preHandler: requireUser }, async (req, reply) => {
    const parsed = articleRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    if (budgetExceeded(reply)) return;

    if (env.aiMock) return articleResponseSchema.parse(mockArticle);

    // Real headlines come from free news RSS; the model only rewrites.
    let items;
    try {
      items = await fetchNews(parsed.data.country, parsed.data.topic);
    } catch (err) {
      req.log.error({ err }, 'news feed fetch failed');
      return reply.code(502).send({ error: 'article_failed' });
    }
    if (items.length === 0) {
      req.log.error('news feed returned no items');
      return reply.code(502).send({ error: 'article_failed' });
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const msg = await anthropic().messages.create({
        model: MODELS.article,
        max_tokens: 1500,
        system: articleSystemPrompt(parsed.data.level),
        messages: [{ role: 'user', content: articleUserPrompt(parsed.data, items) }],
      });
      await recordCall({
        userId: req.userId,
        feature: 'article',
        model: MODELS.article,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      });
      try {
        return articleResponseSchema.parse(parseJsonLoose(lastTextBlock(msg)));
      } catch (err) {
        if (attempt === 1) {
          req.log.error({ err }, 'article rewrite failed validation');
          return reply.code(502).send({ error: 'article_failed' });
        }
      }
    }
  });
}
