# Seiscientas

A Spanish coaching app for one committed learner on a six-month clock. Local-first PWA (React + Dexie) with a thin Fastify backend proxying the Anthropic API, Supabase Postgres as the durable store, deployed as one Railway service.

Two horizons: **readiness** (200 hours by the trip) and **fluency** (600 hours, no deadline). Hours are the honest metric. See the spec for the full product brief.

## Local development (no accounts needed)

```bash
npm install
npm run dev
```

Server runs on :3000 with mock AI (`AI_MOCK` defaults on when no `ANTHROPIC_API_KEY`), client on :5173 with `VITE_LOCAL_MODE` implied (no Supabase env vars → fixed local user, sync disabled). The full app works: onboarding, cards, Today, Talk (mock tutor), Log.

```bash
npm test          # scheduler, plan composer, taxonomy unit tests
npm run build     # shared typecheck + client build + server bundle
npm start         # serve built app from Fastify on :3000 — the Railway path
```

## Go-live wiring (when accounts exist)

1. **Supabase**: create a project. Run `supabase/migrations/0001_schema.sql` then `0002_rls.sql` in the SQL editor. Enable the Email provider with OTP (the app uses `signInWithOtp` + `verifyOtp` — a typed 6-digit code, not a magic link, because links open in Safari rather than the installed PWA).
2. **Server env** (Railway variables): `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` (dashboard → Settings → API), `DAILY_TOKEN_BUDGET`, and remove/unset `AI_MOCK`.
3. **Client env** (Railway build vars): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. **Railway**: create a service from this GitHub repo. `railway.json` covers build/start/healthcheck. Auto-deploys from `main`.
5. **iPhone**: open the Railway URL in Safari, sign in, Share → Add to Home Screen.

### Device acceptance checklist (spec §17)

- [ ] Hold-to-talk works in Safari on a real device; typed fallback appears where recognition is unavailable
- [ ] Audio plays after first user gesture; ringer-switch note appears once
- [ ] Installed to home screen: launches without browser chrome, correct icon and status bar
- [ ] Airplane mode: cards run, Talk explains itself, nothing hangs on a spinner
- [ ] No layout jump when the address bar collapses; nothing under the home indicator
- [ ] RLS blocks reads with another user's JWT
- [ ] Killing the network mid-session loses no logged minutes once reconnected
- [ ] No Anthropic key reachable from the client bundle or network tab

## Architecture

```
client/   React SPA — IndexedDB (Dexie) is the working store; sync layer pushes
          dirty rows / pulls by updated_at cursor. LWW except sessions and
          error_examples (append-only, deduped by id).
server/   Fastify — /api/ai/* proxy (prompts + key server-side only), zod-validated,
          daily token budget enforced against ai_calls. Serves the built SPA.
shared/   Types, zod schemas, closed 25-concept taxonomy, SM-2 scheduler,
          plan composer — all pure, unit-tested.
supabase/ Schema + RLS migrations.
```

Deferred (seams in place): Read (reading room + mining), production cards (`direction`/`prompt`/`accepts` columns exist; queue filters in one place), progress map (reads existing tables), drills (`/api/ai/drill` returns 501; schemas shipped).
