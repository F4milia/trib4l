# Session 1 — Schema, Auth, Identity, and the Role Model

Tracks progress against the Session 1 acceptance criteria in
[`trib4l-build-from-zero.md`](./trib4l-build-from-zero.md#phase-0--foundation-sessions-12):

> *Done means:* three orgs seeded with an overlapping user, two
> `platform_staff` rows, migrations clean forward and back.

## Done and verified locally

- [x] **Core tables**, every one carrying the columns the plan calls for:
  `organizations`, `profiles` (global identity), `org_profiles` (per-org
  display overrides), `memberships` (role enum: `member` / `mentor` /
  `organizer` / `org_owner`, unique on `(org_id, profile_id)`),
  `platform_staff` (its own table, outside the tenant model — not a
  `memberships` role), `audit_log`, `webhook_events`, `idempotency_keys`.
  Four migrations in `supabase/migrations/`.
- [x] **Soft delete.** `deleted_at` on `organizations`, `profiles`,
  `org_profiles`, `memberships`. Anonymize-vs-purge policy written down in
  `docs/data-retention-policy.md`, covering what exists today and what the
  plan for `orders` / posts / mentor pairings will be once those tables
  exist.
- [x] **Timezones.** `profiles.timezone`, IANA-only — enforced by a
  `is_valid_iana_timezone()` check constraint backed by `pg_timezone_names`
  (not `AT TIME ZONE`, which would also accept a raw UTC offset like
  `+02:00` — confirmed by testing both against the local DB: IANA name
  passes, offset and garbage both fail).
- [x] **Idempotency keys.** Table plus `lib/idempotency.ts`
  (`withIdempotencyKey`), implementing insert-before-process: fresh key
  runs the handler; a replay with the same fingerprint returns the stored
  response without re-running the handler; a reused key with a different
  fingerprint throws `IdempotencyKeyReused`; a key whose original request
  hasn't finished throws `IdempotencyRequestInFlight`. Verified twice — once
  against the real local Postgres (all four branches behaved correctly),
  once as a permanent Vitest suite (`lib/idempotency.test.ts`, 4 tests, runs
  in CI with no DB needed).
- [x] **Auth wiring.** `@supabase/ssr` client factories: `lib/supabase/client.ts`
  (browser), `lib/supabase/server.ts` (Server Components / Route Handlers),
  `lib/supabase/proxy.ts` + root `proxy.ts` (session-refresh proxy — Next.js
  16 renamed `middleware.ts` to `proxy.ts`; the codebase uses the current
  name, not the deprecated one). `handle_new_user()` trigger auto-creates a
  `profiles` row the moment someone signs up.
- [x] **Generated types.** `lib/supabase/database.types.ts` via
  `supabase gen types typescript --local`, regenerate after any schema
  change.
- [x] **Migrations clean forward and back** — genuinely tested, not just
  asserted:
  - Forward: `supabase db reset` (fresh Postgres, all 4 migrations +
    `seed.sql`) run repeatedly with no errors.
  - Back: every `create table`/`create type`/`create trigger`/`create
    function` in all four migrations has a corresponding `drop` — the
    header comment of each migration file states the exact reverse.
    Actually ran all 13 drop statements in reverse order against the local
    DB, confirmed `information_schema.tables` for `public` came back empty,
    then `supabase db reset` to restore. This is a real teardown test, not
    a documentation-only claim.
- [x] **Seed data** (`supabase/seed.sql`) — three orgs (Caregiver Circle,
  Founder Collective, Wellness Guild), an overlapping user (Alice: `member`
  in Caregiver Circle, `mentor` in Founder Collective, with different
  `org_profiles.display_name` in each — proves the global-identity/per-org-
  display split), one organizer, one org_owner, one member in the third org,
  and two `platform_staff` rows (Erin, Frank — satisfies Invariant 3's "at
  least two"). Verified by querying the seeded local DB directly.
- [x] **CI migrations gate.** `.github/workflows/ci.yml`'s `migrations` job
  runs `supabase start` + `supabase db reset` in GitHub Actions on every PR.

## Deliberately not done in Session 1 — belongs to Session 2

**RLS is off, on purpose.** Right now all 8 tables have Row Level Security
disabled — and separately, `anon`/`authenticated`/`service_role` don't even
have `SELECT`/`INSERT`/`UPDATE`/`DELETE` grants on them yet (only structural
privileges like `REFERENCES`/`TRIGGER` come from Postgres's default ACLs for
tables owned by `postgres`). That second fact was a genuine surprise while
building this — confirmed by querying `pg_default_acl` directly, not assumed.

The two gaps compound in a specific way: enabling RLS without policies would
block *all* access (including legitimate access), while granting DML without
RLS would fully open every table to any authenticated caller. Neither half
is safe alone. So both — the `GRANT` statements and the RLS policies — ship
together in Session 2, as one deliverable, verified by that session's
isolation test suite before anything is considered done. This is also why
no actual signup/login UI was built in Session 1: there's nothing yet
protecting the data those flows would create.

**Local Supabase CLI's own security advisory tool flagged the disabled RLS**
and explicitly said not to auto-apply its suggested fix without policies —
that guidance is followed here.

## Not yet pushed to hosted Supabase

Everything above was verified against a local Supabase instance
(`supabase start`, Docker). `trib4l-staging` and `trib4l-production` don't
have this schema yet. To push it: `supabase link --project-ref <ref>`, then
`supabase db push`. Do this for staging once you're ready to use it for the
Session 0 backup/restore drill — restoring an empty database proves nothing,
so that drill and this schema push are meant to happen close together.
