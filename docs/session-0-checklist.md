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
- [x] `@sentry/nextjs` added as a dependency (config wiring is a manual step below — it needs a real DSN).

## Manual steps — accounts and projects

These need a human in a browser; I can't create third-party accounts. Do
them in this order, since later steps depend on earlier ones.

1. **Supabase — three projects.** Create `trib4l-local` (or use `supabase start` for a
   fully local Postgres via Docker — no project needed for local), `trib4l-staging`,
   and `trib4l-production` as **separate** Supabase projects. Never point staging
   and production at the same project — the plan's environment-separation rule
   exists specifically so a bad migration or a bad `DELETE` in staging can't touch
   real data. Copy each project's URL/anon key/service role key into the matching
   `.env.local` (local), and into Vercel's Preview and Production env var scopes
   (staging/production) once the Vercel project exists (step 3).

2. **GitHub secrets.** In `F4milia/trib4l` → Settings → Secrets and variables →
   Actions, nothing is needed yet for the current CI job (it doesn't touch
   Supabase). Session 1 will add a staging `SUPABASE_ACCESS_TOKEN` and
   `SUPABASE_DB_URL` once migrations exist, to lint/dry-run them in CI.

3. **Vercel project.** Import `F4milia/trib4l`. Set the Preview environment's
   env vars from `trib4l-staging`, and Production's from `trib4l-production`.
   Leave Stripe/Mux/Resend vars blank until their sessions (4, 11, 13).

4. **Sentry.** Create an org, then either one project with three environments
   (`local`/`staging`/`production` tagged via `SENTRY_ENVIRONMENT`) or three
   projects — one project with environment tags is simpler to start with and
   is what the wizard sets up by default. Then run, locally:

   ```
   npx @sentry/wizard@latest -i nextjs
   ```

   The wizard logs you into Sentry, detects the already-installed
   `@sentry/nextjs` dependency, and writes the client/server/edge config and
   `next.config.ts` wrapping for the exact SDK version installed — hand-writing
   these ahead of the wizard risks drifting from what the current major
   version actually expects. Commit what it generates. Add the resulting DSN
   to `.env.local` and to both Vercel env scopes.

5. **Stripe and Mux test modes.** Create both accounts now so the org exists
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
