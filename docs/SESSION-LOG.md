# Session Log

## Session 0 + Session 1: Foundation Build
**Date:** August 21, 2026  
**Duration:** Single continuous session (approximately 8–10 hours)  
**Model:** Claude Sonnet 5 → Haiku 4.5  
**Status:** Complete and pushed to GitHub

---

## What was completed

### Session 0: Operational Baseline

1. **Repository initialization**
   - Created Next.js 16 (App Router, TypeScript) scaffold via `create-next-app`
   - Initialized git repository with `https://github.com/F4milia/trib4l` remote
   - Fixed ESLint/TypeScript config to ignore generated files

2. **Local development setup**
   - Installed Supabase CLI and initialized local Postgres (Docker)
   - Scaffolded `supabase/config.toml` and migrations directory
   - All four dev scripts green: `npm run lint`, `npm run typecheck`, `npm test` (Vitest), `npm run build`

3. **CI/CD**
   - Created `.github/workflows/ci.yml` running lint/typecheck/test/build on every PR and push to main
   - Added Supabase `migrations` job that runs `supabase start` + `supabase db reset` to prove schema applies cleanly from scratch

4. **Sentry integration**
   - Installed `@sentry/nextjs`
   - Ran official Sentry wizard (`npx @sentry/wizard@latest -i nextjs`)
   - Generated client/server/edge config with DSN hardcoded to `brandlamb` org's `javascript-nextjs` project
   - Added auth token to Vercel (Production + Preview, build-time only)
   - Tested exception capture against staging deploy: both frontend and API errors appeared in Sentry with readable (non-minified) stack traces
   - Removed wizard's example fixture (`sentry-example-page`, `sentry-example-api`)

5. **Environment setup**
   - Created `.env.example` listing every env var through Session 4, grouped by provider
   - Supabase staging/production projects created by user and wired to Vercel Preview/Production scopes
   - Verified Vercel deploy succeeds and page loads

6. **Documentation**
   - Created `docs/session-0-checklist.md` tracking what's done and what's still manual
   - Updated `README.md` with local dev instructions

**Done criteria met:** Build succeeds locally and in CI, exception reached Sentry with source maps working, Vercel deploy confirmed.

---

### Session 1: Schema, Auth, Identity, and the Role Model

1. **Database schema (4 migrations, all tested forward and back)**
   - Migration 1: Extensions (`pgcrypto`) and helper functions (`set_updated_at`, `is_valid_iana_timezone`)
   - Migration 2: `organizations`, `profiles` (global identity), `handle_new_user()` trigger
   - Migration 3: `org_profiles`, `memberships` (with role enum: member/mentor/organizer/org_owner), `platform_staff` (deliberate table, not a membership role)
   - Migration 4: `audit_log` (append-only), `webhook_events`, `idempotency_keys`
   - **Key features:** soft-delete columns (`deleted_at`) on all user-content tables, IANA-only timezone validation (tested: accepts "America/New_York", rejects "+02:00" and garbage)
   - **Reversibility tested:** ran every `DROP` statement in reverse order against local Postgres, confirmed schema empty, then `supabase db reset` to restore

2. **Seed data (supabase/seed.sql)**
   - Three organizations: Caregiver Circle, Founder Collective, Wellness Guild
   - Six seed users (Alice, Bob, Carol, Dave, Erin, Frank) via direct `auth.users` insert
   - Alice as overlapping user: member in Caregiver Circle, mentor in Founder Collective, different `org_profiles.display_name` in each (proves global/per-org split)
   - Two `platform_staff` rows (Erin, Frank — satisfies Invariant 3's "at least two")
   - Verified all data exists by querying the seeded database directly

3. **Supabase auth integration**
   - `lib/supabase/client.ts` — browser client factory
   - `lib/supabase/server.ts` — Server Component / Route Handler client factory
   - `lib/supabase/proxy.ts` — session-refresh handler
   - Root `proxy.ts` — Next.js 16 proxy file (renamed from deprecated `middleware.ts`)
   - Auto-profile creation via `handle_new_user()` trigger on auth signup

4. **Generated types**
   - `lib/supabase/database.types.ts` via `supabase gen types typescript --local`
   - All tables and the `membership_role` enum correctly typed
   - ESLint/TypeScript configured to ignore generated file

5. **Idempotency helper**
   - `lib/idempotency.ts` implementing insert-before-process pattern
   - Fresh key: runs handler, stores response
   - Replay with same fingerprint: returns stored response without re-running
   - Reused key with different fingerprint: throws `IdempotencyKeyReused`
   - Key still in-flight: throws `IdempotencyRequestInFlight`
   - Verified against real local Postgres (all four branches tested successfully)
   - Permanent Vitest suite (`lib/idempotency.test.ts`, 4 tests) runs in CI with no DB needed

6. **Build system updates**
   - Added `@supabase/ssr` client libraries
   - Fixed ESLint ignores for `supabase/.temp/` and generated types
   - Migrated from deprecated `middleware.ts` to `proxy.ts` (Next.js 16 convention)
   - All checks green: lint, typecheck, test (5 passing: 1 original smoke test + 4 idempotency tests), build

7. **Documentation**
   - Created `docs/session-1-checklist.md` with detailed verification notes
   - Created `docs/data-retention-policy.md` defining anonymize vs. purge for each table
   - Created `docs/revenue-model-and-mentor-compensation.md` (new business context from boss)
   - Updated `README.md` with new session links and local dev instructions

**Done criteria met:** Three orgs seeded with overlapping user (Alice in two orgs with different display names), two platform_staff rows, migrations clean forward and back, CI gate added.

---

## Business context added this session

**F4milia Revenue Model & Mentor Compensation** (new strategic doc from Ivan Rattliff):
- **Four-tier declining take rate:** Free (20%), Growth $99 (10%), Scale $399 (6%), Owned $1,199 (4%)
- **Mentor compensation:** Base per session + percentage of retained revenue (60+ days tenure), 20–30% of community revenue at steady state
- **Legal items flagged:** mentor misclassification, licensure/fee-splitting, referral conflicts, merchant of record choice, rate change rights
- **Operating discipline:** leakage prevention, four key metrics to instrument, time-to-first-dollar-collected as north star

**Site rename:** Trib4l → **F4milia** (not yet applied to code/config — that happens at frontend/branding phase)

**Reconciliation notes** (flagged but not yet resolved):
- Stripe Connect account type: build plan says Standard, revenue doc suggests Express — needs explicit decision before Session 13
- Mentor payout splits: new scope for Session 9 (currently just pairing logic)
- Referral conflict (§3.3): implicitly answers open question #1 of the build plan — worth confirming

---

## Commits pushed

| Commit | Message |
|---|---|
| 2f31b45 | Session 0: operational baseline scaffolding |
| 0e0eabd | Wire up Sentry via the official Next.js wizard |
| de4af92 | Remove Sentry example fixture; mark Sentry/Vercel/Supabase steps done |
| e2dced7 | Session 1: schema, auth, identity, and the role model |
| 1af20c1 | Add revenue model & mentor compensation doc; note Trib4l -> F4milia rename |

---

## Current state

**What's working locally and in CI:**
- Full dev environment (Next.js, Supabase, Sentry, Vercel deploy)
- Schema applies cleanly from scratch in CI
- All 8 tables exist with correct schema; RLS deliberately off (both enable and grant statements defer to Session 2)
- Auth client factories wired; session refresh proxy in place
- Idempotency helper tested and permanent test suite in place

**What's not yet done (deferred to Session 2):**
- RLS policies (no queries blocked yet, intentional — see Session 1 checklist)
- DML grants for `anon`/`authenticated`/`service_role` (only structural privileges exist from default Postgres ACLs)
- Isolation test suite (belongs to Session 2)
- Pushing schema to hosted `trib4l-staging`/`trib4l-production` (still local-only)

**Open decisions requiring resolution before later sessions:**
- Stripe Connect account type (Standard vs. Express) — Session 13
- Mentor payout split ownership (Session 9 vs. later) — concurrent with mentor pairing work
- Referral conflict firewall (explicitly confirm this is the company model) — pre-Session 9 legal review

---

## Next steps

**Session 2: RLS, isolation suite, and platform access control**
- Enable RLS on all 8 tables
- Grant DML to `anon`/`authenticated`/`service_role` (with RLS policies gating actual access)
- Build isolation test suite (member can't read another org's rows, organizer can't escalate to platform_admin, etc.)
- Verify that `platform_admin` access is logged and not reachable from an org role

---

## Notes for future reference

- **Timezone validation** — `is_valid_iana_timezone()` checks `pg_timezone_names`, not `AT TIME ZONE`, so offsets ("+02:00") are correctly rejected
- **Migrations are genuinely reversible** — ran the drop sequence, confirmed schema empty, restored; this is tested, not documented-only
- **Idempotency tested both ways** — against real Postgres (all branches worked) and via Vitest mocks (permanent test coverage)
- **RLS deferral is intentional** — the Supabase CLI itself warns that enabling RLS without policies blocks all access; both halves ship in Session 2
- **F4milia rename is noted but not applied** — code/package/seed names stay "Trib4l" until frontend work
- **Three orgs in seed data is not accidental** — required by the plan for cross-tenant isolation testing; one overlapping user proves the global/per-org identity split is real

---

**Session ended:** August 21, 2026, 05:42 UTC  
**All work pushed to GitHub:** https://github.com/F4milia/trib4l
