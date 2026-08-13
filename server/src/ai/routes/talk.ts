import type { FastifyInstance } from 'fastify';
import { talkRequestSchema } from '@seiscientas/shared';
import { env } from '../../env.js';
import { requireUser } from '../../auth.js';
import { budgetExceeded } from '../budget.js';
import { recordCall } from '../usage.js';
import { anthropic, MODELS } from '../anthropic.js';
import { talkSystemPrompt } from '../prompts/talk.js';
import { mockTalkReplies } from '../mock/fixtures.js';
import { streamMockReply } from '../mock/mockStream.js';

export function registerTalkRoute(app: FastifyInstance): void {
  app.post('/api/ai/talk', { preHandler: requireUser }, async (req, reply) => {
    const parsed = talkRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    if (budgetExceeded(reply)) return;

    const body = parsed.data;

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    // Hijack: we write to raw from here on.
    reply.hijack();

    if (env.aiMock) {
      const turn = body.messages.filter((m) => m.role === 'user').length - 1;
      const text = mockTalkReplies[turn % mockTalkReplies.length]!;
      await streamMockReply(reply, text);
      return;
    }

    try {
      const stream = anthropic().messages.stream({
        model: MODELS.talk,
        max_tokens: 400,
        // System prompt + scenario are stable for the whole conversation —
        // cache them so per-turn cost is history-only.
        system: [
          {
            type: 'text',
            text: talkSystemPrompt(body),
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: body.messages,
      });

      stream.on('text', (delta) => {
        reply.raw.write(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`);
      });

      const final = await stream.finalMessage();
      await recordCall({
        userId: req.userId,
        feature: 'talk',
        model: MODELS.talk,
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
      });
      reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch {
      reply.raw.write(
        `data: ${JSON.stringify({ type: 'error', message: 'conversation failed' })}\n\n`,
      );
    } finally {
      reply.raw.end();
    }
  });
}
