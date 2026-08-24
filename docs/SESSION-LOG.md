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

---

## Session 8 (completion) + Session 9: Content Gating Fix and Mentorship

**Date:** August 21, 2026 (UTC)
**Model:** Claude Sonnet 5
**Status:** Complete and pushed to GitHub and to hosted Supabase (staging + production)

---

## What was completed

### Session 8 (in progress at session start): a real RLS bug found and fixed

Session 8 itself (stages, progression, and content gating) had already been
built earlier; this session picked up mid-debugging on a failing isolation
test.

1. **Root cause found:** `posts_select` (and the equivalent
   `comments_select`/`reactions_select`) ANDed
   `is_at_or_past_stage(org_id, required_stage_id)` directly onto Session
   6's `can_see_org_cohort_content(org_id, cohort_id)`. That helper's staff
   bypass (`organizer`/`org_owner`/`platform_admin` see everything) only
   covered cohort scoping — the raw `AND` re-imposed the stage gate on
   staff too. Concretely: an organizer with no personal stage got a
   `42501` RLS error inserting *their own* gated post, because Postgres
   checks `INSERT ... RETURNING` against the table's `SELECT` policy.
   Diagnosed by evaluating each disjunct of the policy independently via
   RPC (`has_org_role` true, `is_at_or_past_stage` false) and reasoning
   through Postgres's `RETURNING` behavior, not by guessing.
2. **Fix:** replaced the two-helper `AND` pattern with one combined
   function, `can_see_gated_content(org_id, cohort_id, required_stage_id)`,
   applying the staff bypass once, across cohort and stage together, used
   by all six affected policies.
3. Re-ran the full isolation suite (38 tests, all passing), ran the
   escalation ritual (loosened `posts_select`, confirmed the specific test
   failed loudly with the real visible row printed, restored), then built
   and manually verified the Session 8 UI end-to-end with real accounts
   through the dev server: a stages management page, a stage-gate selector
   on the post form, and a live confirmation that a plain member below the
   gate can't see a post, gains access after being moved to the required
   stage, and the organizer author sees it throughout despite having no
   stage themselves.
4. A methodology snag along the way (not a real bug): a manual check
   against seeded Alice appeared to show the gate failing, because an
   earlier full isolation-suite run had durably promoted her role in the
   same shared local database. Resolved by resetting to clean seed data
   before redoing the manual pass.
5. Wrote `docs/session-8-checklist.md`, pushed both new migrations to
   `trib4l-staging` and `trib4l-production`, committed and pushed.

### Session 9: Mentorship — designation, pairing, and lifecycle

1. **`designate_mentor(target_org_id, target_profile_id)`** — the
   plan's explicit "member → mentor transition," not a bare role edit.
   Writes an `audit_log` entry in the same transaction as the role change.
   Restricted to promoting a plain `'member'`; gated to `org_owner`
   specifically, reusing a Session 2 policy (`memberships_update`) rather
   than granting anything new — `'mentor'` had existed as a
   `membership_role` since the original schema but had never been checked
   by any policy before this.
2. **`mentor_pairings`** table — `proposed → active → completed`, plus a
   `declined` exit from `proposed`. A partial unique index enforces at
   most one live (`proposed` or `active`) pairing per mentee per org;
   nothing constrains the mentor side. Profile references are nullable
   with `on delete set null` (not cascade), matching the data retention
   policy's requirement that pairing history survive either party's
   deletion request.
3. **Lifecycle rules live in a trigger, not an RPC** — a deliberate
   departure from Sessions 5/8's assign/transition RPC pattern. A status
   change is a single `UPDATE`, so a plain `.update({ status })` suffices
   once `check_mentor_pairing_transition` (a `BEFORE UPDATE` trigger)
   enforces a caller-specific state machine that a single RLS boolean
   expression can't express cleanly: only the mentor can accept
   (`proposed → active`); the mentor, mentee, or staff can decline or
   complete; anything else is rejected outright. RLS's own
   `mentor_pairings_update` policy is deliberately only a coarse
   "you're a party or you're staff" gate.
4. 7 new isolation tests (`tests/isolation/mentorship.test.ts`), taking
   the suite to 45 total. One test's first draft assumed a blocked update
   would come back as a silent empty result (matching Session 8's gating
   tests); running it revealed the real behavior instead — the mentee and
   staff both pass RLS's coarse gate, so the trigger's explicit exception
   is what blocks them, a real error rather than a silent exclusion. Fixed
   the assertions to match reality once observed.
5. Escalation ritual run and confirmed: a loosened trigger made the
   right two tests fail loudly with the real (missing) errors shown;
   restoring brought all 45 back.
6. UI: a staff settings page (`/o/[slug]/settings/mentorship` — designate
   a mentor, propose a pairing, staff-level decline/complete controls) and
   a member-facing page (`/o/[slug]/mentorship` — your own pairings, with
   whichever actions your role and the pairing's status actually permit).
   One shared server action handles every transition on both pages; the
   trigger, not the action, decides who's allowed to do what.
7. Manually verified the full lifecycle end-to-end with real accounts
   through the dev server: invited two fresh members via the real invite
   flow, designated one as a mentor through the real form (confirmed the
   `audit_log` row directly), proposed a pairing, had the mentor accept it
   from her own page, had the mentee mark it complete from his, and
   confirmed an uninvolved third member's own mentorship page stayed
   empty throughout.
8. Wrote `docs/session-9-checklist.md`, pushed both new migrations to
   `trib4l-staging` and `trib4l-production`, committed and pushed.

**Done criteria met:** both sessions' schema + RLS + triggers verified
against a real local Postgres via the isolation suite (45/45 passing),
the escalation-test ritual re-confirmed for each session's new policies,
UI built and manually driven through the real dev server rather than
merely typechecked, and both sessions' migrations live on staging and
production.

---

## Commits pushed this session

| Commit | Message |
|---|---|
| 2e1a61a | Session 8: stages, transitions, and content gating |
| 191f8b4 | Session 9: mentorship -- designation, pairing, and lifecycle |

---

## Notes for future reference

- **RLS bugs can hide behind a helper function's own bypass logic** — a
  policy that ANDs a new check onto an existing helper doesn't inherit
  that helper's staff bypass unless the bypass is re-applied at the same
  level. The Session 8 bug is the concrete example: fix by consolidating
  into one function that applies the bypass once, rather than layering
  checks with a raw `AND`.
- **`INSERT ... RETURNING` is checked against the table's `SELECT`
  policy, not just its `INSERT` policy** — this is what turned a
  select-policy bug into an insert-time error and made it initially look
  like the `INSERT` policy itself was wrong.
- **A state machine with a different allowed caller per edge belongs in a
  trigger, not an RPC or a single RLS expression** — Session 9's mentor
  pairing lifecycle is the concrete example; Sessions 5/8's RPCs existed
  for atomicity across multiple writes, which doesn't apply to a
  single-statement status change.
- **Shared local isolation-test database state keeps causing manual
  verification confusion** — recurring across Sessions 6, 7, 8, and 9 now.
  Always run `supabase db reset` (not just `test:isolation`, which resets
  once but then leaves test-mutated state behind) immediately before any
  manual UI walkthrough that uses seeded accounts.

---

**Session ended:** August 21, 2026, 22:00 UTC
**All work pushed to GitHub:** https://github.com/F4milia/trib4l

---

## Session 10: Meetups

**Date:** August 24, 2026 (UTC)
**Model:** Claude Sonnet 5
**Status:** Complete and pushed to GitHub and to hosted Supabase (staging + production)

---

## What was completed

1. **`meetup_series` and `meetups` as two deliberately separate tables**
   — a series is the recurrence template (cadence, timezone, meeting
   info); a row in `meetups` is one concrete, bookable occurrence.
   RSVPs and attendance attach to a specific occurrence, which needs a
   stable id a computed-on-the-fly recurrence rule wouldn't have, so
   occurrences are generated as real rows via an explicit RPC
   (`generate_meetup_occurrences`), not derived from a view.
2. **DST-safe recurrence, verified twice, not just designed correctly on
   paper.** A series stores a local calendar date, a local time, and an
   IANA timezone; each occurrence reinterprets that same wall-clock time
   fresh, on its own date, via Postgres's own timezone database
   (`local_datetime_to_utc`), rather than adding a fixed UTC interval.
   Checked directly against the actual 2026-03-08 US spring-forward: a
   raw SQL check first, then an isolation test driving the real
   generation RPC end-to-end, both confirming 6pm Eastern stays 6pm
   Eastern across the transition (23:00 UTC before, 22:00 UTC after).
3. **`meeting_provider` kept as plain `text`**, deliberately not an enum
   or a `CHECK`-constrained list, matching the plan's explicit
   requirement that adding a future provider (e.g. `'livekit'`) be a
   swap, not a migration.
4. **Attendance as its own manually-marked table**, independent of RSVP
   and of `meeting_provider` — exactly the plan's "first-class record ...
   survives regardless of where the call happens," with zero dependency
   on any video-platform integration (none exists yet; that's Session
   11+).
5. 6 new isolation tests (`tests/isolation/meetups.test.ts`), taking the
   suite to 51 total. Escalation ritual run and confirmed: a loosened
   `meetups_select` policy made the cohort-scoping test fail loudly with
   the real visible row printed; restoring brought all 51 back.
6. **The same shared-local-DB manual-verification gotcha from Sessions 8
   and 9 recurred, and was caught the same way**: checking Alice's access
   right after a full isolation-suite run showed her incorrectly passing
   a staff-only check, because an earlier test file in that run had
   durably promoted her role. Confirmed via a direct query before
   concluding it wasn't a real bug, then reset to clean seed data and
   redid the check properly.
7. UI: a staff settings page (`/o/[slug]/settings/meetups` — create a
   one-off meetup or a recurring series, generate occurrences, see RSVP
   counts, mark/unmark attendance) and a member-facing page
   (`/o/[slug]/meetups` — upcoming meetups with an RSVP control), both
   linked from the org nav. Manually verified end-to-end on a clean
   database: created a one-off meetup and a weekly series as the
   organizer, generated four real occurrences and confirmed their stored
   UTC timestamps directly, confirmed a plain member is fully blocked
   from the settings page (a real `307`, zero settings content in the
   response body), RSVPed as that plain member through the real form,
   and confirmed the count updated on the staff page.
8. Wrote `docs/session-10-checklist.md` (including an explicit "not done"
   note: meetup times render via `toLocaleString()`, which uses the
   rendering server's own timezone rather than the viewer's or
   organizer's — a display wrinkle, not a data bug, but worth fixing
   before real users rely on it). Pushed both new migrations to
   `trib4l-staging` and `trib4l-production`, committed and pushed.

**Done criteria met:** schema + RLS + the recurrence-generation function
verified against a real local Postgres via the isolation suite (51/51
passing), the escalation-test ritual re-confirmed for the new policies,
the DST-correctness property checked against a real calendar date rather
than assumed, UI built and manually driven through the real dev server,
and the migrations live on staging and production.

---

## Commits pushed this session

| Commit | Message |
|---|---|
| 2591d77 | Session 10: meetups -- events, RSVP, attendance, DST-safe recurrence |

---

## Notes for future reference

- **Recurrence across DST needs local-time reinterpretation per
  occurrence, not a fixed UTC interval** — store the local date/time/zone
  and convert fresh each time via the database's own timezone data
  (`AT TIME ZONE` in Postgres), the same category of fix as Session 8's
  RLS bug: correctness that only shows up when you check a real edge case
  (a real DST date here; a staff member with no stage there) instead of
  the common path.
- **The shared local isolation-test database is now a recurring,
  named gotcha across four sessions running (6, 7, 8, 9, 10)** — always
  run a bare `supabase db reset` immediately before any manual UI
  verification that uses seeded accounts, never rely on
  `npm run test:isolation` alone (it resets once, then leaves
  test-mutated state behind for whatever runs next).

---

**Session ended:** August 24, 2026, 13:27 UTC
**All work pushed to GitHub:** https://github.com/F4milia/trib4l
