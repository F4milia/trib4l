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

---

## Session 11: Video Foundation and Member Uploads

**Date:** August 24, 2026 (UTC)
**Model:** Claude Sonnet 5
**Status:** Complete and pushed to GitHub and to hosted Supabase (staging + production). The user created a Mux account within this same session and provided real credentials, which were wired into Vercel and verified end-to-end against the live API -- see item 12 below.

---

## What was completed

1. **Every Mux API surface used was verified against `@mux/mux-node`'s
   own installed type definitions before writing any code** -- the
   Direct Upload request/response shape, the webhook signature header
   format, every relevant webhook event type and its exact payload
   fields, and the JWT-signing helper's signature. This was a deliberate
   choice given this is the first session with a real third-party API
   dependency: verify the actual contract, don't build against a
   remembered shape.
2. **`video_assets`**, `posts.video_asset_id`, and the full RLS/trigger
   layer -- a Mux Direct Upload modeled from creation through
   webhook-driven processing to an optional attachment on a post.
   `status` (Mux's own processing state) is kept distinct from
   `moderation_state` (the human decision), and `policy`/`status` are
   `CHECK`-constrained (a genuinely fixed, Mux-defined set of values,
   unlike meetups' deliberately free-text `meeting_provider`).
3. **Moderation policy decided explicitly, not assumed**: the build plan
   flags member video moderation as an open, consequential question
   ("pre-approval or post-report? changes your exposure"). Asked
   directly -- answer: post-report, matching every other content type
   already in this app.
4. **Two real gaps an isolation test caught before anything shipped**:
   (1) the first version of the visibility function didn't let an
   uploader see their own not-yet-approved video, which would have
   broken the "My videos" page's ability to show upload/processing
   status for anything pending; (2) the insert policy let a member
   pre-declare their own upload `ready`/`approved` with a fabricated
   `playback_id`, skipping Mux and moderation entirely. Both fixed --
   the second by extending the same privileged-columns guard trigger
   (Session 9's `mentor_pairings` pattern) to INSERT, not just UPDATE.
5. **The first `service_role` Supabase client this codebase has
   needed** (`lib/supabase/service.ts`) -- every prior session's writes
   went through a user's own RLS-scoped session or a `SECURITY DEFINER`
   function; the Mux webhook is the first genuinely anonymous request
   with no user session to scope to at all.
6. 7 new isolation tests, taking the suite to 58 total, all run using a
   service-role test client that simulates exactly what the real Mux
   webhook handler would write, so the schema/RLS layer is fully proven
   without needing a live Mux account. Includes the literal "done means"
   bar from the plan: a member in one org cannot see or query by another
   org's video, including by its `playback_id` directly. Escalation
   ritual run and confirmed: a loosened select policy made that test (and
   the pending-visibility test) fail loudly with the actual leaked data
   printed; restoring brought all 58 back.
7. **The Mux client is constructed lazily**, not as a module-level
   singleton -- confirmed directly from the SDK's source that its
   constructor throws immediately with no credentials configured, which
   would otherwise crash the whole app's build and dev server on import,
   not just the video feature, for as long as no real Mux account
   exists. Confirmed `npm run build` succeeds with every `MUX_*` env var
   empty, and that actually attempting to start an upload fails
   gracefully (a clean error redirect, no crash, no orphaned database
   row) rather than breaking anything.
8. Hard caps (10-minute duration, enforced post-hoc once Mux reports the
   real value, with immediate Mux-side deletion to reclaim storage; 500
   MB file size, client-side only -- Mux's API has no server-side
   max-file-size parameter, confirmed rather than assumed) and rate
   limiting (5 uploads/hour/uploader, checked before ever calling Mux).
9. Extended `docs/data-retention-policy.md` with a new category for
   storage-cost-driven retention, and fixed two stale "Future: Session N"
   annotations left over from Session 1 for sessions that have since
   actually happened.
10. UI: an upload flow (the first client-side JS this app has needed,
    since a browser can't PUT a file to an external signed URL through a
    plain form), a "My videos" list, a watch page, a video selector on
    the existing post form, and a staff moderation page. Manually
    verified on the real dev server -- and hit the same
    shared-local-DB-state symptom flagged in Sessions 8, 9, and 10's
    checklists yet again, caught and reset the same way as every time
    before.
11. Wrote `docs/session-11-checklist.md`, drawing an explicit line
    between what's verified (schema/RLS/authorization) and what's built
    but blocked on a real Mux account (upload creation, webhook receipt,
    signed playback). Pushed both new migrations to `trib4l-staging` and
    `trib4l-production`, committed and pushed.
12. **The user created a Mux account and provided real credentials
    within this same session** -- wired all five (`MUX_TOKEN_ID`,
    `MUX_TOKEN_SECRET`, `MUX_SIGNING_KEY`, `MUX_PRIVATE_KEY`,
    `MUX_WEBHOOK_SECRET`) into `.env.local` and Vercel (Production and
    Preview), redeployed production, and ran a real end-to-end
    verification against the live API rather than stopping at "the keys
    are configured": created a real Direct Upload; created a real Mux
    asset from Mux's own official demo video and watched its real
    `video.asset.ready` webhook arrive at the actual deployed route,
    verify its signature for real, and correctly update a real
    `video_assets` row (status, moderation_state, playback_id, and
    duration all matched); generated a real signed playback JWT and
    confirmed it actually authorizes playback (`200` with a valid HLS
    manifest), while confirming the negative case too (no token `403`,
    garbage token `400`) so the signed policy is provably doing
    something, not just present. All test data was deleted immediately
    after. Registering the webhook endpoint itself needed the user in
    the Mux dashboard directly -- Mux has no API for creating webhook
    endpoints, by design, confirmed by checking the SDK for one rather
    than assuming it existed.

**Done criteria met, with no carve-out**: the plan's literal "done means"
bar (cross-org playback isolation, proven by a test) was met and verified
locally first, before any Mux account existed. The live Mux integration
itself -- upload creation, real webhook delivery/verification/processing,
and signed playback enforcement -- was then also verified end-to-end
against the account the user created, within the same session.

13. **The user then tested the real upload flow through the actual
    website UI and found the one thing item 12's `curl`-based
    verification couldn't have caught**: upload worked, the video saved
    to Mux, but the watch page loaded and never actually played.
    Root cause: a plain `<video src="....m3u8">` only plays HLS natively
    in Safari -- every other browser needs a real HLS-capable player, or
    nothing plays regardless of how valid the underlying manifest and
    signed token are (both of which item 12 had already proven were
    fine). Fixed by switching the watch page to `@mux/mux-player-react`
    (confirmed against its actual installed type definitions), which
    uses `hls.js` under the hood -- the second piece of client-side JS
    this app has needed, after the upload file-picker. `curl` proving a
    URL is reachable is not the same claim as a browser proving it can
    render what's behind it; the checklist and this log were both
    updated to say so plainly rather than leave the earlier "verified
    live" claim standing uncorrected.

---

## Commits pushed this session

| Commit | Message |
|---|---|
| 240e5d2 | Session 11: video foundation and member uploads via Mux |
| 97794f1 | Verify Session 11's live Mux integration end-to-end |
| d62e33e | Fix video playback: a plain \<video src="....m3u8"\> only plays HLS natively in Safari |

---

## Notes for future reference

- **When integrating a fast-moving third-party API, read the installed
  SDK's actual type definitions before writing code against it** -- doc
  pages can be incomplete or stale; `.d.ts` files installed by `npm
  install` are the real, current contract. This is what caught that
  Mux's Direct Upload API has no server-side max-file-size parameter,
  among several other details, before any code was written against a
  guessed shape.
- **A module-level side-effecting client construction
  (`new ThirdPartySdk()` at import time) can crash an entire app on
  import if that SDK validates credentials eagerly and the credentials
  don't exist yet** -- lazy construction behind a getter avoids this
  without any behavior change once real credentials are added.
- **The shared local isolation-test database gotcha is now a five-session
  streak (6 through 11)** -- still always reset immediately before manual
  verification, never rely on `test:isolation` alone for that.
- **RLS policy design keeps surfacing the same category of bug across
  sessions**: a helper's staff/owner bypass doesn't automatically extend
  to a *different* legitimate self-access case (Session 8: staff seeing
  their own gated post; Session 11: an uploader seeing their own pending
  video). Each specific case has to be reasoned through and added
  explicitly -- there's no shortcut that covers all of them at once.
- **Proving a URL is reachable (`curl`, a valid HTTP response) is not the
  same claim as proving a browser can actually render what's behind
  it.** The signed-playback verification in this session's item 12
  genuinely proved the JWT and manifest were valid; it did not, and
  could not, prove a `<video>` element could play HLS in a non-Safari
  browser, because `curl` doesn't render anything. The user's own manual
  test through the real UI is what actually caught this. Say what a
  verification step did and didn't prove, rather than letting "verified
  live" imply more than it does.

---

**Session ended:** August 24, 2026, 14:25 UTC
**All work pushed to GitHub:** https://github.com/F4milia/trib4l

---

## Session 12: Live Events and VOD Library

**Date:** August 24, 2026 (UTC)
**Model:** Claude Sonnet 5
**Status:** Complete and pushed to GitHub and to hosted Supabase (staging + production). Live streaming itself cannot be exercised against the real Mux account -- see item 6 below; this is a Mux plan limitation, not something left unbuilt.

---

## What was completed

1. **The plan's "entitlement resolution shares one code path with
   Session 11" instruction, made concrete**: `video_assets` gained a
   `required_stage_id` column and its `can_see_video_asset` function was
   extended to call `is_at_or_past_stage` (Session 8) directly; the new
   `live_streams` table reuses `can_see_gated_content` (also Session 8)
   completely unchanged for its own select policy. An archived live
   stream becomes a plain `video_assets` row, so watching a past
   broadcast and a member-uploaded clip go through the exact same
   entitlement check and the exact same player component, not two
   parallel implementations.
2. Every Mux Live Streaming API detail (`liveStreams.create`'s params,
   the response shape, and -- the key discovery --
   `WebhookAsset.live_stream_id`, which links an auto-archived
   recording back to its stream) verified against the installed SDK's
   type definitions first, continuing Session 11's practice.
   `video.asset.live_stream_completed` was chosen as the archival
   trigger over `video.asset.ready`, since the latter can fire
   mid-broadcast for near-live viewing and isn't the "recording is
   finalized" signal.
3. **A real security gap, more severe than Session 11's analogous
   one, reasoned through and closed before it shipped**: without a
   privileged-columns guard on `live_streams`, an organizer could
   insert a stream in their own org whose `playback_id` was copied from
   somewhere else entirely -- RLS scopes rows by org, not the
   truthfulness of a row's own column values, so every eligible member
   would receive a validly signed token for content that org never
   owned. Worse than Session 11's version because there's no
   moderation_state layer softening it here. Closed the same way:
   Mux-verified columns can only be set through the service-role path.
4. **A second, unrelated gap surfaced by an isolation test actually
   failing**: the new table's validating triggers query
   `stages`/`cohorts`, and `service_role` bypasses RLS but *not*
   ordinary Postgres `GRANT` privileges -- a separate layer neither
   table had ever been granted to `service_role`, since both tables
   predate Session 11 introducing that role to this codebase at all.
   The failure was the actual Postgres error, "permission denied for
   table stages," not a guess.
5. **A third gap, found by reasoning about consistency rather than a
   failing test**: `video_assets.required_stage_id` had no org-matching
   validation trigger, unlike every other stage-gated column in this
   app. Added one to match the existing pattern.
6. **A real Mux product constraint discovered, not a bug**: creating a
   live stream against the real Mux account from Session 11 returned
   "Live streams are unavailable on the free plan." Confirmed this is
   genuinely Mux's own limitation (called the API directly, read the
   response) rather than assuming it away, and verified the app's own
   error handling surfaces that exact message gracefully -- clean
   redirect, no crash, no orphaned Mux resource. Upgrading the plan is a
   billing decision only the user can make; the on-demand upload/
   playback path from Session 11 is on a different Mux product and
   entirely unaffected.
7. 6 new isolation tests, taking the suite to 64 total, including the
   cross-org "done means" bar extended to live streams and a direct
   proof of the "shares one code path" claim -- the same stage that
   blocks a live stream also blocks its archived VOD, checked against
   the same `is_at_or_past_stage` call on both. Escalation ritual run
   and confirmed: a loosened select policy made the isolation and
   cohort/stage tests fail loudly with the real leaked rows printed;
   restoring brought all 64 back.
8. UI: a staff settings page, a member-facing library page, and one
   watch page that resolves to whichever is actually available (live if
   currently broadcasting, the archived recording once it isn't) rather
   than two separate pages. The video player component was promoted out
   of Session 11's video-specific route folder into a shared location
   and given a `live` prop, since both watch pages now genuinely share
   it. Manually verified end-to-end on a freshly reset database --
   caught and reset past leftover isolation-test state yet again before
   concluding anything, a pattern now unbroken across seven sessions.
   Since a real broadcast couldn't be exercised (item 6), the full
   active → idle → archived lifecycle and both watch-page branches were
   verified by writing the same row states a real webhook sequence
   would produce directly, the same technique Session 11 used before a
   real webhook existed to test against.
9. Wrote `docs/session-12-checklist.md`. Pushed all three new
   migrations to `trib4l-staging` and `trib4l-production`, redeployed
   production, committed and pushed.

**Done criteria met, with one disclosed, external gap**: the plan's own
entitlement-sharing requirement was met and directly proven by a test,
not just asserted. Actually broadcasting through a real encoder and
receiving a real `video.live_stream.active` webhook remains unverified,
but that gap is Mux's plan limitation, not this app's -- everything this
app controls (schema, RLS, the webhook handler's logic for every live
event type, the UI) is built and, short of the literal RTMP feed, verified.

---

## Commits pushed this session

| Commit | Message |
|---|---|
| 81d7f3d | Session 12: live events and VOD library |

---

## Notes for future reference

- **`service_role` bypasses Row Level Security but not ordinary Postgres
  `GRANT` privileges -- they're separate layers.** Any table a
  service-role-driven trigger or query touches, even indirectly (here:
  a validating trigger reading `stages`/`cohorts` while inserting into
  `live_streams`), needs its own explicit grant to `service_role`, and
  that's easy to miss for tables that predate `service_role` existing
  in the codebase at all, since nothing about their own definition ever
  needed to mention it.
- **A "does this leak across orgs" review needs to ask about a row's
  own column *values*, not just which rows RLS lets a role see.**
  Session 11 and 12 both found the identical bug shape on two different
  tables: RLS correctly scoped *which rows* a user could touch, but
  nothing stopped a legitimately-scoped insert from carrying a
  *value* (a `playback_id`) that didn't actually belong to that row's
  own org. The fix pattern is now established (a privileged-columns
  guard trigger that only service_role can bypass) -- worth checking
  for on every future table that stores a third-party-verified
  identifier a client could otherwise fabricate.
- **When a real third-party API call fails for a genuine account/plan
  reason (not a bug), verify that specifically** -- calling
  `liveStreams.create` directly and reading Mux's own "unavailable on
  the free plan" response turned an assumption into a confirmed,
  disclosed constraint, and separately confirmed the app's own error
  handling deals with that real failure gracefully rather than assuming
  it would.

---

**Session ended:** August 24, 2026, 16:37 UTC

---

## Section 0 (F4milia Retroactive Fixes) + Session 13 + Session 14: Commerce Foundation
**Date:** August 25–27, 2026
**Model:** Claude Sonnet 5
**Status:** Complete and pushed to GitHub and to hosted Supabase (staging + production). The user paused the F4milia project after this session for other, unrelated work ("new orders from the boss") -- this entry closes it out for now, not because the roadmap is finished. Sessions 1-19+ (Family layer, commerce Sessions 15-16, dashboards 17-19) remain unbuilt.

---

## What was completed

### Section 0: F4milia's retroactive role-model fix

The boss's "F4milia — Developer Handoff" doc asked for this before anything else -- it touches Session 1's schema and Session 2's RLS, both already built and tested.

1. **12-member Family cap** (`lib/family-cap.ts`, `app/actions/invitations.ts`) -- app-layer, not a DB trigger. A hard trigger version was tried first and reverted: the isolation suite's shared seeded orgs had already accumulated far past 12 disposable members across many sessions, and a hard cap broke ~27 unrelated tests the moment it was turned on. Mentors are explicitly excluded from the count; pending invitations count toward it so an org can't be invited past the limit before anyone accepts. User explicitly chose "app-layer only" over the DB-trigger alternative after a plain-language tradeoff explanation.
2. **`tests/isolation/family-member-cap.test.ts`** -- required real design work beyond the obvious: `fillToCap`/`freeOneCapSlot` treat the current count as unknown and probe it via the real cap function as an oracle, rather than assuming a starting count, since the shared seeded org's state is never safe to assume. Also found and fixed: the `memberships` grant to `service_role` was missing `delete` (not just insert/update), and `designate_mentor` requires an `org_owner` caller specifically -- organizer isn't authorized, a real, disclosed gap between F4milia's "organizer handles Family admin" framing and what's actually enforced.
3. **`docs/trib4l-build-from-zero.md`** role table updated to match F4milia's framing (organizer surfaces conflict/handles admin; mentor is a guide role via the pairing lifecycle), with an explicit caveat paragraph noting the `designate_mentor`/organizer gap above rather than overstating what's enforced.
4. **`member_blocks`/`member_reports`** -- a narrower, per-community complement to Session 7's global `blocks`/`reports`, per the boss's explicit instruction to keep both rather than replace one with the other. The interesting part: `memberships` is always soft-deleted in this app (`deleted_at` set, row kept, per the data-retention policy), so "delete the member_block/report when the membership is deleted" couldn't be a plain `ON DELETE CASCADE` -- it's a `SECURITY DEFINER` trigger reacting to the soft-delete transition instead, since the org staff or member who triggers that soft-delete has no RLS grant to remove someone else's rows directly.
5. New UI: a member-facing "Members" directory (block/report actions, open to any member) and an organizer-only "Member reports" review page.
6. **A real bug found only by manual click-through, not by any test**: blocking someone through the new per-community UI inserted a row, but the org home feed's content-filtering logic only ever checked the *global* `blocks` table -- a "blocked" person's posts kept showing up regardless. Fixed by folding `member_blocks` (translated from membership id back to profile id) into the same filter set the feed already used.

### Session 13: Stripe Connect onboarding

1. **`connected_accounts`** (one per org, org_owner-scoped RLS) plus `startStripeOnboarding` (creates the Stripe account, generates the hosted onboarding link) and an `account.updated` webhook keeping `charges_enabled`/`payouts_enabled`/`requirements_due` in sync.
2. **A real, live-API discovery, not assumed from training data**: the plan's "Standard account creation" is a Stripe Accounts v1 concept. The actual API rejected it outright -- this Stripe account defaulted to v2-only for new Connect integrations. Resolved by having the user enable "Accounts v1 support" in the Stripe Dashboard rather than rebuilding against v2 (a materially different account model), since the plan explicitly assumes v1. Also: the `type` create param itself is deprecated in the installed SDK version in favor of `controller`, mapped to the documented Standard-account equivalent.
3. **Found and fixed a pre-existing infrastructure gap, unrelated to Stripe**: `SUPABASE_SERVICE_ROLE_KEY` had never actually been set for Vercel's Production scope at all (a stale "5 days ago" listing had implied otherwise) -- would have silently broken every service-role-dependent webhook (including Mux's) the moment one fired against production. Fixed by sourcing the correct current key directly from Supabase for both Preview and Production.
4. Verified against the real Stripe test API on local, staging, and production: real accounts + hosted onboarding links created; a genuinely signature-verified `account.updated` event (via `stripe.webhooks.generateTestHeaderString`) confirmed to flip the UI from "Onboarding incomplete" to "Active."
5. **Disclosed gap at the time**: nobody had personally clicked through onboarding as a real user yet -- flagged to revisit during Session 14. (Closed out for real during Session 14 below.)

### Session 14: Catalog and checkout

1. **`products`/`orders`/`order_items`**, a checkout flow built as one form covering the whole catalog (the entire "cart" -- no separate cart table), a real Stripe Checkout Session as a direct charge on the org's connected account with `application_fee_amount`, idempotency keys (finally wiring up `lib/idempotency.ts`, built in Session 0/1 but never used until now), and app-layer rate limiting on checkout attempts (5 per buyer per 60 seconds, checked after the payments-readiness gate since an unready org never reaches the expensive path anyway).
2. **Two real bugs found only by testing against the live API, not caught by types or isolation tests**:
   - Standard Connect accounts cannot be completed via API by the platform at all -- `stripe.accounts.update()` for `business_profile` was rejected outright ("does not have the required permissions"); a Standard account's own holder controls that data, by design. There is no API-only path to a fully verified Standard test account -- a human has to click through Stripe's real hosted onboarding UI, including a simulated identity-document upload.
   - `orders`' RLS deliberately granted authenticated callers zero `UPDATE`, reasoning `status` should only move via the webhook -- too broad in practice: the checkout action itself needs to write `stripe_checkout_session_id` back onto the order it just created. Fixed with a column-scoped grant instead of a blanket one, with a regression test proving `status` still can't be smuggled through the same call.
3. **Also fixed a real gap from Session 13, found while building this one**: the production webhook endpoint was registered without `connect: true`. Per Stripe's own Connect webhooks documentation, both direct-charge events and `account.updated` itself for connected accounts fall under the "Connected accounts" scope, which requires a Connect-scoped endpoint -- Session 13's manual signature test never caught this because hand-signing and POSTing a fake event proves the endpoint's code verifies signatures correctly, but proves nothing about whether Stripe would have actually routed a real event there. Recreated the endpoint connect-scoped; the old, non-functional one is still sitting in the Stripe dashboard (deleting it was blocked as a destructive action -- manual cleanup item).
4. Full local verification with a genuinely completed test account (the first time a Standard account was carried all the way through onboarding in this project): real product, real Checkout Session, correct order/order_items totals, a genuinely signed `checkout.session.completed` event flipping the order to paid, idempotent replay (same order/session on retry, no duplicate), and rate limiting correctly blocking attempts 6-7 after 5 real successes.
5. **Fully closed the loop on production, for real, with the user's own account** -- not simulated. The user completed real (test-mode) Stripe onboarding for their actual "Demo Community" org, added a real product, and completed an actual Stripe-hosted checkout with Stripe's test card (`4242 4242 4242 4242`). The resulting `account.updated` and order-paid state changes were picked up via Stripe's own real webhook delivery to the connect-scoped production endpoint -- the one thing no amount of self-signed test payloads could prove, finally verified end to end with no simulation anywhere in the chain.

**Done criteria met**: every schema/RLS change isolation-tested (84 tests, 16 files, passing repeatedly for flakiness). Both new commerce sessions verified against the real Stripe API, not stubbed, on all three environments, culminating in a real human completing a real (test-mode) payment through the real production deployment with a real webhook delivering the result -- the strongest verification bar this project has hit yet.

---

## Commits pushed this session

| Commit | Message |
|---|---|
| 5cf6089 | Enforce a 12-member Family cap at the app layer (F4milia item 0.2) |
| 7d8f672 | Update organizer/mentor role descriptions to match F4milia's framing (item 0.3) |
| 1228145 | Add member_blocks/member_reports as a per-community complement to global blocks/reports |
| 1a13a60 | Add UI for per-community member_blocks/member_reports |
| 08bcce5 | Fix: member_blocks had no actual effect on the feed |
| f085e13 | Session 13: Stripe Connect onboarding |
| 61e246e | Document Session 13 (Connect onboarding) |
| 43fe0ad | Session 14: Catalog and checkout |

---

## Notes for future reference

- **A Vercel-stored secret can silently be wrong or entirely missing, even when `vercel env ls` looks reassuring.** The Production `SUPABASE_SERVICE_ROLE_KEY` had never been set at all, despite a listing that implied otherwise. When a service-role-dependent code path fails in a hosted environment with an auth-flavored error, verify the actual stored value (or just re-source and overwrite it from the provider) before assuming the code is wrong.
- **A third-party SDK's types can be current while the account's actual API behavior has moved past what the plan assumed.** Stripe's "Standard account creation" is a v1 concept; the live account defaulted to v2-only. Neither reading the SDK's `.d.ts` files nor trusting the build plan caught this -- only an actual API call did. When a live call fails with a message that reads like a policy change ("no longer recommends X"), treat it as a real, current fact to resolve deliberately, not a bug to route around.
- **Self-signing a webhook payload proves the endpoint's code is correct; it proves nothing about whether the provider would ever actually route a real event there.** Both this session's Stripe gaps (the missing `connect: true` scope, discovered days after Session 13's own "successful" webhook test) trace back to this exact distinction. When a provider has event *scopes* (platform-level vs. connected-account-level, in Stripe's case), verify the registration/routing configuration against the provider's own docs, not just the signature-verification code path.
- **Some verification genuinely cannot be automated, and that's worth stating plainly rather than working around.** Stripe Standard accounts can only be completed by their own holder through Stripe's real hosted UI -- there is no API shortcut, even in test mode. The honest move was surfacing that limitation directly and asking the user to spend a few minutes in a real browser, not faking local state to make a test pass.
- **Faking local state to skip a slow verification step doesn't just risk missing bugs -- it can actively produce a *misleading* pass.** Manually flipping `connected_accounts.charges_enabled` to `true` locally let the app's own gate pass, but Stripe's real Checkout API still correctly rejected the session, since the underlying account genuinely wasn't ready. The bypass was reverted once this was understood, and the eventual test used a genuinely completed account instead.
- **Next.js 16 Server Actions reject a POST that's missing an `Origin` header** (logged as a warning, not an error, but the session cookie silently never gets set) -- curl-driven manual testing needs an explicit `-H "Origin: <the same host>"` on every action POST, not just on the initial page GET.
- **Docker Desktop not running silently breaks everything downstream** (local Supabase, then every DB-backed request) with error messages that look unrelated (a Server Action origin warning, a stray redirect to `/login`) unless you check `docker info`/`supabase status` directly rather than debugging the symptom first.
- **A Postgres `GRANT` is table-level by default but can be scoped to specific columns** (`grant update (col) on table to role`) -- the right fix when a table legitimately needs one narrow authenticated write (here: `orders.stripe_checkout_session_id`) without reopening a column that must stay off-limits (`status`). RLS policies alone can't express this distinction; the grant layer can.

---

**Session ended:** August 27, 2026
**All work pushed to GitHub:** https://github.com/F4milia/trib4l
