import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { migrate } from './db.js';
import { hydrateTally } from './ai/usage.js';
import { registerAuthRoutes } from './auth.js';
import { registerSyncRoutes } from './sync/routes.js';
import { registerArticleRoute } from './ai/routes/article.js';
import { registerTranslateRoute } from './ai/routes/translate.js';
import { registerWordRoute } from './ai/routes/word.js';
import { registerCardsRoute } from './ai/routes/cards.js';
import { registerCheckRoute } from './ai/routes/check.js';
import { registerTalkRoute } from './ai/routes/talk.js';
import { registerReviewRoute } from './ai/routes/review.js';
import { registerDrillRoute } from './ai/routes/drill.js';

const app = Fastify({ logger: true });

app.get('/api/health', async () => ({
  ok: true,
  mock: env.aiMock,
  db: env.hasDb,
}));

registerAuthRoutes(app);
registerSyncRoutes(app);
registerArticleRoute(app);
registerTranslateRoute(app);
registerWordRoute(app);
registerCardsRoute(app);
registerCheckRoute(app);
registerTalkRoute(app);
registerReviewRoute(app);
registerDrillRoute(app);

// Serve the built SPA when it exists (production / Railway). In dev, Vite
// serves the client and proxies /api here.
const here = dirname(fileURLToPath(import.meta.url));
const clientDist = resolve(here, '../../client/dist');
if (existsSync(clientDist)) {
  app.register(fastifyStatic, { root: clientDist });
  // SPA fallback: any non-API GET returns index.html.
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    reply.code(404).send({ error: 'not_found' });
  });
}

async function main(): Promise<void> {
  await migrate();
  await hydrateTally();
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
