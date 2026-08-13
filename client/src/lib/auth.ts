// Client auth: a server-issued token in localStorage. Defaults to the 'dev'
// token so local development (server with no APP_PASSCODE) needs no sign-in;
// a production server rejects 'dev' with 401, which surfaces the passcode
// screen. No third-party auth dependency.

const TOKEN_KEY = 'seis-token';
const USER_KEY = 'seis-user';

export const LOCAL_USER_ID = '00000000-0000-4000-8000-000000000001';

export function storedToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? 'dev';
}

export function storedUserId(): string {
  return localStorage.getItem(USER_KEY) ?? LOCAL_USER_ID;
}

export async function currentAccessToken(): Promise<string> {
  return storedToken();
}

export async function login(passcode: string): Promise<boolean> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { token: string; userId: string };
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, data.userId);
  return true;
}

/** Ask the server whether the current token is accepted.
 *  'ok' | 'unauthorized' | 'offline' — offline is not a sign-out. */
export async function checkAuth(): Promise<'ok' | 'unauthorized' | 'offline'> {
  try {
    const res = await fetch('/api/auth/me', {
      headers: { authorization: `Bearer ${storedToken()}` },
    });
    if (res.ok) {
      const data = (await res.json()) as { userId: string };
      localStorage.setItem(USER_KEY, data.userId);
      return 'ok';
    }
    return res.status === 401 ? 'unauthorized' : 'offline';
  } catch {
    return 'offline';
  }
}
