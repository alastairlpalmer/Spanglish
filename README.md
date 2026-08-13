# Seiscientas

A Spanish coaching app for one committed learner on a six-month clock. Local-first PWA (React + Dexie) with a thin Fastify backend proxying the Anthropic API, Railway Postgres as the durable store, deployed as one Railway service.

Two horizons: **readiness** (200 hours by the trip) and **fluency** (600 hours, no deadline). Hours are the honest metric. See the spec for the full product brief.

## Local development (no accounts needed)

```bash
npm install
npm run dev
```

Server runs on :3000 with mock AI (`AI_MOCK` defaults on when no `ANTHROPIC_API_KEY`) and dev auth (no `APP_PASSCODE` → `Bearer dev` accepted, no sign-in screen). No database needed — sync endpoints return 503 and the client stays purely local in IndexedDB. Client on :5173. The full app works: onboarding, cards, Today, Talk (mock tutor), Log.

```bash
npm test          # scheduler, plan composer, taxonomy unit tests
npm run build     # shared typecheck + client build + server bundle
npm start         # serve built app from Fastify on :3000 — the Railway path
```

## Go-live wiring (Railway)

1. **Railway**: create a service from this GitHub repo (`railway.json` covers build/start/healthcheck; auto-deploys from `master`). Add a **Postgres** database to the project.
2. **Service variables**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (reference variable)
   - `ANTHROPIC_API_KEY` = your key (and remove `AI_MOCK`)
   - `APP_PASSCODE` = the passcode you'll type to sign in
   - `AUTH_SECRET` = any long random string (signs the session token)
   - `DAILY_TOKEN_BUDGET` = e.g. `2000000`
3. Schema is applied automatically at boot — no migration step.
4. **iPhone**: open the Railway URL in Safari, enter the passcode, Share → Add to Home Screen.

Auth model: single user, passcode → server-signed token (180-day expiry), stored on-device. No third-party auth service. The server stamps `user_id` on every synced row, so the client can never write anyone else's data.

### Device acceptance checklist (spec §17)

- [ ] Hold-to-talk works in Safari on a real device; typed fallback appears where recognition is unavailable
- [ ] Audio plays after first user gesture; ringer-switch note appears once
- [ ] Installed to home screen: launches without browser chrome, correct icon and status bar
- [ ] Airplane mode: cards run, Talk explains itself, nothing hangs on a spinner
- [ ] No layout jump when the address bar collapses; nothing under the home indicator
- [ ] Killing the network mid-session loses no logged minutes once reconnected
- [ ] No Anthropic key reachable from the client bundle or network tab
- [ ] Wrong passcode is rejected; correct passcode signs in once and persists

## Architecture

```
client/   React SPA — IndexedDB (Dexie) is the working store; sync layer pushes
          dirty rows / pulls by updated_at cursor via /api/sync/*. LWW except
          sessions and error_examples (append-only, deduped by id).
server/   Fastify — /api/ai/* proxy (prompts + key server-side only), zod-validated,
          daily token budget enforced against ai_calls. /api/sync/* owns the
          Postgres connection; schema applied idempotently at boot. /api/auth/*
          issues the single-user session token. Serves the built SPA.
shared/   Types, zod schemas, closed 25-concept taxonomy, SM-2 scheduler,
          plan composer — all pure, unit-tested.
```

Deferred (seams in place): Read (reading room + mining), production cards (`direction`/`prompt`/`accepts` columns exist; queue filters in one place), progress map (reads existing tables), drills (`/api/ai/drill` returns 501; schemas shipped).
