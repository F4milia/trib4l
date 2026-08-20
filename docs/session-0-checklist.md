# Session 0 — Operational Baseline

Tracks progress against the Session 0 acceptance criteria in
[`trib4l-build-from-zero.md`](./trib4l-build-from-zero.md#session-0--operational-baseline):

> *Done means:* a deliberately broken build fails CI, an exception in staging
> appears in Sentry, and someone has restored a backup and written down how
> long it took.

## Done in-repo

- [x] Next.js (App Router, TypeScript) app scaffolded, pushed to `F4milia/trib4l`.
- [x] `npm run lint`, `npm run typecheck`, `npm test` (Vitest), `npm run build` all green locally.
- [x] `.github/workflows/ci.yml` runs all four on every PR and on push to `main`.
- [x] `supabase/config.toml` initialized for local Supabase dev (`supabase start`).
- [x] `.env.example` lists every env var the app will need through Session 4, grouped by provider.
- [x] Sentry wizard run (`npx @sentry/wizard@latest -i nextjs`) — client/server/edge config, `instrumentation.ts`, `global-error.tsx`, and `next.config.ts` source-map wrapping all generated and committed. `SENTRY_AUTH_TOKEN` set in Vercel (Production + Preview, build-time only, not exposed to browser).
- [x] **Exception in staging confirmed in Sentry.** Threw the wizard's test errors from a deployed instance; both `SentryExampleFrontendError` and `SentryExampleAPIError` showed up in the `brandlamb` org's `javascript-nextjs` project with readable (non-minified) stack traces pointing at real source lines — confirms both error capture and source-map upload work. Test fixture (`app/sentry-example-page`, `app/api/sentry-example-api`) removed afterward.
- [x] Vercel project created, deployed, and confirmed working (page loads at the deployed URL).

## Manual steps — accounts and projects

These need a human in a browser; I can't create third-party accounts. Do
them in this order, since later steps depend on earlier ones.

1. ~~**Supabase — three projects.**~~ Done — `trib4l-staging` and `trib4l-production`
   created as separate projects, their URL/anon key/service role key wired into
   Vercel's Preview and Production env var scopes respectively. Local dev
   (`.env.local`, `supabase start`) is still open — see below.

2. **GitHub secrets.** In `F4milia/trib4l` → Settings → Secrets and variables →
   Actions, nothing is needed yet for the current CI job (it doesn't touch
   Supabase). Session 1 will add a staging `SUPABASE_ACCESS_TOKEN` and
   `SUPABASE_DB_URL` once migrations exist, to lint/dry-run them in CI.

3. ~~**Vercel project.**~~ Done — `F4milia/trib4l` imported, env vars set per
   environment, deploy confirmed working end to end (page loads, Sentry
   errors captured).

4. ~~**Sentry.**~~ Done — wizard ran against the `brandlamb` org / `javascript-nextjs`
   project (SaaS, not self-hosted). It hardcoded the DSN directly into
   `instrumentation-client.ts`, `sentry.server.config.ts`, and
   `sentry.edge.config.ts` (not a secret, fine to commit), and the org/project
   slugs into `next.config.ts`. The one actual secret, `SENTRY_AUTH_TOKEN`
   (used only at build time to upload source maps), lives in
   `.env.sentry-build-plugin` locally (gitignored) and in Vercel's Production
   + Preview env vars (build-time only, not exposed to the browser).

   It also added a manual test fixture: `app/sentry-example-page` (a button
   that throws a client error and hits a deliberately-broken API route) and
   `app/global-error.tsx` (catches uncaught errors app-wide and reports them).
   Left in place for now — visiting `/sentry-example-page` on the staging
   deploy and clicking the button is exactly how to satisfy Session 0's "an
   exception in staging appears in Sentry" requirement below. Remove the
   example page once that's confirmed; keep `global-error.tsx`, `instrumentation.ts`,
   and the three `sentry.*.config.ts` files permanently.

   One default worth revisiting once there's real traffic, not now:
   `tracesSampleRate: 1` sends 100% of transactions — fine at zero volume,
   expensive once the app has actual users.

5. **Local dev env.** Still open. Copy `.env.example` to `.env.local` and
   either run `supabase start` (needs Docker, spins up a fully local Postgres
   — no hosted project needed) or point it at `trib4l-staging`'s keys if
   Docker isn't set up yet.

6. **Stripe and Mux test modes.** Create both accounts now so the org exists
   under whatever legal entity you'll use, but there's nothing to wire until
   Sessions 13 and 11 respectively. Note the decision from open question 1
   in the plan (which company this is) before naming the Stripe account.

## Manual steps — CI migrations gate

Deferred until Session 1 produces real migrations: `supabase/migrations/`
is currently empty (just a `.gitkeep`). Wiring a migrations-lint CI job
against zero migrations would either no-op silently or fail on missing
secrets — neither proves anything. Add this job in Session 1 alongside the
first migration.

## Manual steps — realistic staging data

Also deferred to Session 1: seeding three orgs with overlapping members and
populated cohorts needs the `organizations` / `memberships` / `cohorts`
tables, which don't exist until Session 1's schema lands. Write the seed
script in Session 1, run it against `trib4l-staging` as part of that
session's "done" checklist.

## Manual steps — backup/restore drill

Do this once `trib4l-staging` holds real data (after Session 1, before
Session 2 sign-off) — restoring an empty database proves nothing.

1. In the Supabase dashboard for `trib4l-staging`: Database → Backups.
   Confirm Point-in-Time-Recovery (PITR) is enabled if the plan tier
   supports it; otherwise note the daily backup schedule.
2. Trigger a manual restore of the most recent backup **into a new,
   throwaway Supabase project** (never restore over a live project as
   the drill itself). Start a timer when you click "restore."
3. Stop the timer when the restored project is queryable and row counts
   match the source. Record: wall-clock time, which backup type was used
   (PITR vs. daily snapshot), and any manual steps beyond clicking
   "restore" (e.g. re-pointing env vars, re-running migrations).
4. Write the result into this file, in the table below, and delete the
   throwaway project.
5. Repeat the drill after any major schema change that could plausibly
   break a restore (e.g. after adding RLS policies in Session 2).

| Date | Backup type | Time to restore | Notes |
|---|---|---|---|
| _pending_ | | | |
