import { currentAccessToken } from './auth';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/** One place for user-facing AI error copy — nine call sites were mapping
 *  budget_paused by hand and drifting. */
export function friendlyApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.code === 'budget_paused') {
    return 'AI features paused until tomorrow.';
  }
  return fallback;
}

/** Authed JSON POST to /api/*. Throws ApiError with the server's error code. */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const token = await currentAccessToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let code = 'request_failed';
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) code = data.error;
    } catch {
      // non-JSON error body; keep generic code
    }
    throw new ApiError(res.status, code);
  }
  return (await res.json()) as T;
}
