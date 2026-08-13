import { currentAccessToken } from './supabase';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
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
