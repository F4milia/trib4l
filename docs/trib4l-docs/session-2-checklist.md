# Session 2 — RLS, Isolation Suite, and Platform Access Control

Tracks progress against the Session 2 acceptance criteria in
[`trib4l-build-from-zero.md`](../trib4l-build-from-zero.md#session-2--rls-isolation-suite-and-platform-access-control):

> *Done means:* isolation tests pass in CI and the escalation test fails
> loudly if the bypass policy is loosened.

## Done and verified

- [x] **RLS enabled on all 8 Session 1 tables**, with `GRANT` statements
  landing in the same migration as the policies (Session 1 found new
  tables get zero DML grants by default here — granting without RLS, or
  enabling RLS without policies, are both unsafe half-measures; this ships
  as one migration, `20260821131945_enable_rls_and_policies.sql`).
- [x] **Org-scoped, not yet cohort-scoped.** The plan's Session 2 section
  says "cohort-scoped RLS," but `cohorts` doesn't exist until Session 5 —
  this session's policies are org-scoped, and Session 5 layers cohort
  scoping underneath once that table exists.
- [x] **Helper functions** (`20260821131845_access_helper_functions.sql`),
  all `SECURITY DEFINER` to avoid RLS-checking-itself recursion on
  `memberships`/`platform_staff`: `is_org_member`, `has_org_role`,
  `shares_org_with` (scopes `profiles` reads to people who actually share
  an org with the caller), `is_platform_staff`, `is_platform_admin`.
- [x] **`platform_admin` bypass is a plain RLS policy clause** referencing
  `platform_staff` — never a service-role key in the app, per the plan.
- [x] **MFA-gated.** `is_platform_admin()` requires both `platform_staff`
  membership *and* `aal2` (`auth.jwt()->>'aal' = 'aal2'`) — a platform_staff
  account signed in with just a password (aal1) does not get the bypass.
  Enabled `[auth.mfa.totp]` in `supabase/config.toml` (off by default in a
  fresh `supabase init`). **Checked against both hosted projects:** the
  config file's own comment warns MFA is a Supabase Pro-plan feature, but
  both `trib4l-staging` and `trib4l-production`'s dashboards (Authentication
  → Multi-Factor) show TOTP already "Enabled" with no upgrade prompt —
  confirmed directly in each project's UI, not assumed.
- [x] **Audit logging for `platform_admin` reads is app-level, not
  DB-level** — this was a deliberate choice, confirmed with you rather than
  assumed: Postgres RLS has no hook to log a SELECT as it happens, so
  `lib/audit.ts`'s `withAdminAudit()` wraps admin code paths to write the
  audit row *before* running the query (Invariant 4's ordering). This means
  "every platform_admin read is logged" holds by convention (every admin
  code path must use the helper), not as a database-enforced guarantee.
- [x] **Isolation test suite** (`tests/isolation/*.test.ts`, 11 tests) signs
  in as the real seeded users via `@supabase/supabase-js` and exercises RLS
  for real — no mocking:
  - `org-isolation.test.ts`: a member/organizer cannot read another org's
    `organizations`/`memberships` rows; Alice (member of Caregiver Circle,
    mentor of Founder Collective) sees exactly those two orgs' rows in both
    `organizations` and `org_profiles`, and nothing from Wellness Guild.
  - `role-escalation.test.ts`: an org_owner (Carol) cannot write to
    `platform_staff`; an organizer (Bob) cannot grant himself
    `platform_staff`; a plain member (Dave) cannot rewrite his own
    membership row to `org_owner`.
  - `platform-admin.test.ts`: `platform_staff` membership alone (aal1)
    grants nothing; enrolling and verifying TOTP MFA via the API (no UI
    needed — `tests/isolation/helpers.ts`'s `elevateToAal2`, using the
    `otpauth` library to compute a valid code from the enrollment secret)
    elevates to aal2 and unlocks reading all three orgs; a non-staff org
    role getting aal2 still doesn't get the bypass; `withAdminAudit`
    genuinely writes the audit row.
- [x] **The escalation test actually fails loudly when the policy is
  loosened** — not just asserted. Manually dropped and replaced
  `platform_staff_insert` with `with check (true)`, reran
  `role-escalation.test.ts`, watched both escalation tests fail with clear
  assertion errors, then restored the correct policy via `supabase db
  reset` and confirmed all 11 tests pass again. This is the plan's stated
  "done" bar, checked directly rather than trusted.
- [x] **CI.** New `isolation` job in `.github/workflows/ci.yml`: `npm ci`,
  `supabase start`, `npm run test:isolation` (which itself runs
  `supabase db reset` before the suite, so it's correct on a cold CI runner
  and repeatable locally without manually remembering to reset).

## A real bug found and fixed along the way

Seeding `auth.users` directly (Session 1's `seed.sql`) left
`email_change`/`email_change_token_new`/`email_change_token_current`/
`phone_change`/`phone_change_token`/`reauthentication_token` as `NULL`.
GoTrue's Go driver can't scan `NULL` into the string fields it expects for
those columns, so every `signInWithPassword` call failed with "Database
error querying schema" — a genuinely unhelpful error message for what
turned out to be a seed-data gap. Found via the auth container's logs
(`docker logs supabase_auth_Trib4l`), not guessed. Fixed by seeding those
columns as `''` alongside `confirmation_token`/`recovery_token`, which were
already correctly empty-stringed.

## Also found: MFA enroll isn't idempotent across re-runs without a reset

`auth.mfa.enroll()` with no `friendlyName` defaults to `""`, and a second
enroll attempt for the same user with the same default name collides
("factor already exists") — worse, once a user has *any* verified factor,
GoTrue requires aal2 just to enroll another one, so a second suite run
without resetting the DB in between fails differently depending on how far
the first run got. Fixed two ways: `elevateToAal2` now passes a random
`friendlyName` per call, and `npm run test:isolation` runs `supabase db
reset` itself before invoking vitest, so the suite is self-contained and
safe to re-run on demand rather than depending on the caller to remember a
reset step.

## Not done in Session 2 — explicitly out of scope here

- **Cohort-scoped RLS.** Cohorts don't exist until Session 5; today's
  policies are org-scoped only. Session 5 needs to layer cohort visibility
  under the org scoping these policies already provide, not replace it.

## Pushed to hosted Supabase

Schema (all 6 migrations) plus seed data pushed to `trib4l-staging`;
schema only (deliberately no seed) pushed to `trib4l-production`. One real
bug found in the process: `crypt()`/`gen_salt()` in `seed.sql` resolved
locally via `search_path` but not through the connection `supabase db push
--include-seed` uses remotely, even though `pgcrypto` lives in the same
`extensions` schema in both places — fixed by schema-qualifying both calls
(`extensions.crypt(...)`, `extensions.gen_salt(...)`) so it no longer
depends on search_path at all.

Verified rather than assumed: ran the full 11-test isolation suite directly
against the hosted `trib4l-staging` project (not just local) — all pass.
Confirmed `trib4l-production` has zero rows in `organizations` (no leaked
test data) and RLS enabled on its tables. CLI left linked to
`trib4l-staging` afterward, not production, so a future plain `supabase db
push` doesn't accidentally target production without an explicit re-link.
