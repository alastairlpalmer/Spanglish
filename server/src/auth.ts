import type { FastifyReply, FastifyRequest } from 'fastify';
import { jwtVerify } from 'jose';
import { env, DEV_USER_ID } from './env.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

const secret = env.SUPABASE_JWT_SECRET
  ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
  : null;

/** preHandler: verifies the Supabase JWT locally (HS256). In dev (no secret
 *  configured) accepts `Bearer dev` and pins a fixed user id. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }

  if (!secret) {
    if (env.devAuth && token === 'dev') {
      req.userId = DEV_USER_ID;
      return;
    }
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, secret, {
      // Supabase signs user tokens with aud 'authenticated'.
      audience: 'authenticated',
    });
    if (typeof payload.sub !== 'string') throw new Error('no sub');
    req.userId = payload.sub;
  } catch {
    reply.code(401).send({ error: 'unauthorized' });
  }
}
