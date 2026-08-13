import { useState } from 'react';
import { login } from '../lib/auth';

// Single-user passcode sign-in. The passcode lives in the server's
// APP_PASSCODE env var; the server answers with a long-lived token.

export function SignIn({ onSignedIn }: { onSignedIn: () => void }): JSX.Element {
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    const ok = await login(passcode);
    setBusy(false);
    if (ok) onSignedIn();
    else setError('Wrong passcode.');
  }

  return (
    <div className="onboard-step" style={{ padding: '48px 16px' }}>
      <div>
        <p className="eyebrow">Seiscientas</p>
        <h1>Sign in</h1>
      </div>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (passcode && !busy) void submit();
        }}
      >
        <label className="muted" htmlFor="passcode">
          Passcode
        </label>
        <input
          id="passcode"
          type="password"
          autoComplete="current-password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
        />
        <button className="btn primary block" type="submit" disabled={busy || !passcode}>
          Sign in
        </button>
      </form>
      {error && <p className="error-line">{error}</p>}
    </div>
  );
}
