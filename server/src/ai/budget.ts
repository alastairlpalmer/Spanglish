import type { FastifyReply } from 'fastify';
import { env } from '../env.js';
import { tokensUsedToday } from './usage.js';

/** Returns true (and sends the paused error) when the daily budget is spent. */
export function budgetExceeded(reply: FastifyReply): boolean {
  if (tokensUsedToday() < env.DAILY_TOKEN_BUDGET) return false;
  reply.code(429).send({
    error: 'budget_paused',
    message: 'AI features paused until tomorrow',
  });
  return true;
}
