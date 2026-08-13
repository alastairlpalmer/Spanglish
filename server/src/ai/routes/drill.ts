import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';

// Seam for build step 8 (progress map + drills). Schema already exists in
// shared/schemas.ts; this route goes live when drills do.
export function registerDrillRoute(app: FastifyInstance): void {
  app.post('/api/ai/drill', { preHandler: requireUser }, async (_req, reply) => {
    return reply.code(501).send({ error: 'not_yet' });
  });
}
