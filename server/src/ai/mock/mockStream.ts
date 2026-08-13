// Word-by-word mock SSE emitter for /api/ai/talk in mock mode. Emits the same
// event format as the live route so the client streaming code is identical.

import type { FastifyReply } from 'fastify';

export async function streamMockReply(reply: FastifyReply, text: string): Promise<void> {
  const raw = reply.raw;
  const words = text.split(' ');
  for (let i = 0; i < words.length; i++) {
    const chunk = i === 0 ? words[i]! : ` ${words[i]!}`;
    raw.write(`data: ${JSON.stringify({ type: 'delta', text: chunk })}\n\n`);
    await new Promise((r) => setTimeout(r, 40));
  }
  raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  raw.end();
}
