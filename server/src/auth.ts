// Single-user auth: passcode in, server-signed JWT out. Simpler than email
// OTP and with no third-party dependency. Dev mode (no APP_PASSCODE or
// AUTH_SECRET configured) accepts `Bearer dev` with a fixed user id.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SignJWT, jwtVerify } from 'jose';
import { timingSafeEqual } from 'node:crypto';
import { env, APP_USER_ID } from './env.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

const secret = env.AUTH_SECRET ? new TextEncoder().encode(env.AUTH_SECRET) : null;

function passcodeMatches(attempt: string): boolean {
  const expected = Buffer.from(env.APP_PASSCODE ?? '');
  const given = Buffer.from(attempt);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }

  if (env.devAuth) {
    if (token === 'dev') {
      req.userId = APP_USER_ID;
      return;
    }
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, secret!, { audience: 'seiscientas' });
    if (typeof payload.sub !== 'string') throw new Error('no sub');
    req.userId = payload.sub;
  } catch {
    reply.code(401).send({ error: 'unauthorized' });
  }
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post('/api/auth/login', async (req, reply) => {
    const body = (req.body ?? {}) as { passcode?: string };

    if (env.devAuth) {
      // No passcode configured: local dev — hand out the dev identity.
      return { token: 'dev', userId: APP_USER_ID };
    }
    if (typeof body.passcode !== 'string' || !passcodeMatches(body.passcode)) {
      return reply.code(401).send({ error: 'wrong_passcode' });
    }
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(APP_USER_ID)
      .setAudience('seiscientas')
      .setIssuedAt()
      .setExpirationTime('180d')
      .sign(secret!);
    return { token, userId: APP_USER_ID };
  });

  app.get('/api/auth/me', { preHandler: requireUser }, async (req) => ({
    userId: req.userId,
  }));
}
