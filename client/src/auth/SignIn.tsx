import { useState } from 'react';
import { supabase } from '../lib/supabase';

// Email OTP, not magic link: a link opens in Safari, not the installed PWA,
// stranding the session in the wrong browser context. A typed 6-digit code
// stays inside the app.

export function SignIn(): JSX.Element {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(): Promise<void> {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase()!.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (err) setError('Could not send the code. Check the address and retry.');
    else setStage('code');
  }

  async function verify(): Promise<void> {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase()!.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });
    setBusy(false);
    if (err) setError('Wrong or expired code. Check it and retry.');
    // Success flows through onAuthStateChange in useAuth.
  }

  return (
    <div className="onboard-step" style={{ padding: '48px 16px' }}>
      <div>
        <p className="eyebrow">Seiscientas</p>
        <h1>Sign in</h1>
      </div>
      {stage === 'email' ? (
        <div className="stack">
          <label className="muted" htmlFor="email">
            Email — a 6-digit code will be sent
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <button className="btn primary block" disabled={busy || !email.includes('@')} onClick={() => void sendCode()}>
            Send code
          </button>
        </div>
      ) : (
        <div className="stack">
          <label className="muted" htmlFor="code">
            Code sent to {email}
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="mono"
          />
          <button className="btn primary block" disabled={busy || code.length !== 6} onClick={() => void verify()}>
            Sign in
          </button>
          <button className="btn quiet block" onClick={() => setStage('email')}>
            Use a different email
          </button>
        </div>
      )}
      {error && <p className="error-line">{error}</p>}
    </div>
  );
}
