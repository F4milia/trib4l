# Session 3 — Org Provisioning, Onboarding, Multi-Org Shell

Tracks progress against the Session 3 scope in
[`trib4l-build-from-zero.md`](./trib4l-build-from-zero.md#phase-1--community-core-sessions-3-10)
(this session has no explicit "done means" line in the plan — the bar
applied here matches Sessions 0–2's rigor: build it, verify it against a
real Supabase instance and, where feasible, a real browser session, don't
just assert it).

## Scope decisions made before building (confirmed with you)

- **Renamed Trib4l → F4milia now**, since this is the first session
  touching real user-facing copy: `package.json` name, all new UI text,
  `supabase/seed.sql` email domain (`@f4milia.test`). Hosted infra names
  (GitHub repo, Vercel project, `Trib4l-staging`/`Trib4l-production`
  Supabase projects) are untouched — a separate, more disruptive step.
- **Minimal internal admin page** for org creation
  (`/admin/organizations/new`), gated to `platform_admin`, rather than a
  script — gets folded into the real Session 18 HQ dashboard later.
- **No styling.** Plain HTML forms and lists throughout. A real design
  pass happens once actual branding exists.

## Done and verified

- [x] **`invitations` table** (migration `20260821144850_invitations.sql`):
  `org_id`, `email`, `role`, `invited_by_profile_id`, `token` (random,
  generated via `extensions.gen_random_bytes`), `status` (pending/accepted/
  revoked), `expires_at` (14 days). RLS: visible to the org's
  organizer/org_owner, to whoever it's addressed to (via a new
  `current_user_email()` helper — `profiles` has no email column on
  purpose, so this reads `auth.users` narrowly, only the caller's own row),
  and to `platform_admin`.
- [x] **The invitation flow's specifically-called-out edge case is real,
  not theoretical** — verified by test, not assumed: `accept_invitation()`
  (`SECURITY DEFINER`, the only path that can redeem a token) uses
  `on conflict (org_id, profile_id) do update` so re-inviting someone who
  already has a membership updates their role instead of erroring. Same
  mechanism handles both "brand-new email" and "already has an account" —
  there's no special-casing between them, because the invite side never
  tries to detect or create an account at all; whoever eventually signs in
  under that email sees the pending invite waiting for them.
- [x] **`am_i_platform_admin()` RPC** (migration
  `20260821145459_am_i_platform_admin_rpc.sql`) so the app layer can gate
  `/admin` routes without querying `platform_staff` rows directly for that
  purpose.
- [x] **5 new isolation tests** (`tests/isolation/invitations.test.ts`),
  run against real Postgres via real sign-ins, no mocking: a non-staff
  member can't create an invitation; an organizer can invite a brand-new
  email and that person can accept after signing up; re-inviting an
  existing member updates their role (not a duplicate row, not an error);
  a different signed-in person can't accept someone else's invitation;
  a revoked invitation can't be accepted.
- [x] **Auth pages**: `/login`, `/signup` (with Invariant 5's consent
  copy — plain-language notice that platform staff may access content for
  support, behind a required checkbox), wired to real Server Actions
  (`app/actions/auth.ts`) using the Session 1 Supabase client factories.
- [x] **Multi-org shell**: `/o/[slug]` layout verifies membership,
  renders an org switcher (`OrgSwitcher`, a small Client Component — the
  switcher needs `onChange`, which a Server Component can't have) and
  role-conditional nav (Members link only for organizer/org_owner).
- [x] **Member management page** (`/o/[slug]/settings/members`): roster,
  pending invitations with revoke, and the invite form — gated server-side
  (redirects non-organizer/org_owner) in addition to RLS enforcing the
  same thing at the database layer.
- [x] **Admin org creation** (`/admin/organizations/new`): name/slug/
  optional-initial-owner-email form, gated by `requirePlatformAdmin()`
  (app-level UX) with the real enforcement still at the RLS layer
  (`organizations_insert` policy) underneath. Creating an org can
  optionally fire off the first `org_owner` invitation in the same action,
  reusing the exact same invitation mechanism everyone else goes through —
  no separate "bootstrap the first owner" code path.

## Manually exercised through a real browser session (not just described)

No browser tool is available in this environment, so verification here
means driving the actual rendered forms with `curl` the way a no-JS browser
would (Next.js Server Actions support this natively via progressive
enhancement — confirmed by extracting the real `$ACTION_ID_...` hidden
field from each rendered form and posting `multipart/form-data`, not by
guessing at Next's internal wire format). Exercised against the local dev
server with real `.env.local` credentials (see below):

- Signup → session cookie set → home page reflects "Signed in as \<email\>."
- Login as a seeded user → home page lists their orgs.
- Org shell renders, switcher shows the right orgs, Members link only
  shows for organizer/org_owner.
- Full invite lifecycle end to end: organizer sends invite through the real
  form → shows up in the pending list → invitee signs up fresh → sees the
  pending invitation on their home page with a real token → submits the
  real accept form → lands on the new org's page → invitation no longer
  shows as pending.
- `platform_admin`-only admin page correctly redirects away a non-staff
  user, *and* a real `platform_staff` account without an MFA-elevated
  session (aal1) — confirming the app-level guard actually calls the same
  aal2-gated check as the isolation suite, not a weaker stand-in.
- **What wasn't verified this way:** the admin page's *success* path
  (`platform_admin` actually creating an org) needs an aal2-elevated
  session, which needs a completed MFA challenge, which needs UI that
  doesn't exist yet (no TOTP enrollment/verification screens were built —
  out of scope for this session). That path is covered by the automated
  isolation suite instead, which completes a real MFA challenge via the
  API. Said explicitly here rather than implying full click-through
  coverage.

## A real bug found by actually clicking through, not by reasoning about the code

`lib/session.ts`'s `getUserOrgs()` queried `memberships` and trusted RLS to
scope it to "the caller's own orgs." It doesn't: the `memberships` SELECT
policy (Session 2) is *org*-scoped — any member of an org can see that
org's full roster, by design, so a page like the members list can show
everyone. `getUserOrgs()` is a different question ("which orgs do *I*
belong to"), and needed its own `.eq('profile_id', ...)` filter that wasn't
there. Bob, an organizer of a two-member org, was seeing Alice's membership
row on his own "your communities" list — same org listed twice, with two
different roles. The isolation test suite never caught this because it
queries tables directly, not through this helper; it took an actual
end-to-end click-through (well, curl-through) to surface it. Fixed by
passing the caller's `profile_id` explicitly rather than relying on RLS to
answer a question RLS was never scoping for in the first place.

## Also needed for any of this to be testable at all

`.env.local` never existed (a Session 0 item left open — "still open,
lower priority" at the time). Created it, pointed at the local Supabase
instance's URL/anon/service-role keys. Still gitignored, never committed.

## Pushed to hosted Supabase

Both new migrations (`invitations`, `am_i_platform_admin`) pushed to
`trib4l-staging` and `trib4l-production`. Seed data was **not** re-pushed
to staging — it already held Session 2's seed rows, and `seed.sql`'s plain
`INSERT`s (no `ON CONFLICT`) would have collided on the existing primary
keys. Instead, renamed staging's six seeded emails from `@trib4l.test` to
`@f4milia.test` with a direct, targeted `UPDATE` — confirmed before and
after, not assumed.

Ran the isolation suite directly against hosted `trib4l-staging` once,
immediately after the schema push: 14 of 16 passed, the only failures
being pre-existing leftover MFA factors from Session 2's own staging
verification (an aal2-requires-aal2-to-add-another-factor situation, not a
new bug — same shape as the local-repeat-run issue documented in Session
2). Re-running the suite a second time against staging surfaced two
*different*, environment-specific effects worth naming so a future session
doesn't mistake them for regressions: hosted Supabase enforces a real
signup email rate limit that local dev doesn't (no custom SMTP configured
yet — that's Session 4), and one of the invitation tests had, on its first
run, durably changed Alice's role in `caregiver-circle` from `member` to
`organizer` on staging (it's supposed to — that's the test), which made a
*different* test's "non-staff member" assumption about Alice false on the
second run. Both are artifacts of re-running a suite designed for a
resettable database against a persistent one, not code defects — no fix
applied, suite not re-run against staging again after this was understood.

`trib4l-production`: schema only, confirmed 0 rows in both `organizations`
and `auth.users` afterward. CLI left linked to staging, not production,
same safety practice as Session 2.

## Not done in Session 3 — explicitly out of scope here

- **MFA enrollment/verification UI.** `platform_admin` access is fully
  enforced (RLS + app guard), but there's no screen for a real
  `platform_staff` account to actually complete that challenge through the
  app yet. Whoever needs to use `/admin/organizations/new` for real today
  would need to drive the MFA challenge via the Supabase client API
  directly, not through this app's UI.
- **Org settings/branding beyond name+slug.** `organizations.settings`
  (jsonb, from Session 1) exists but nothing writes to it yet.
- **Actual email delivery for invitations.** The invite mechanism is fully
  built and works, but "how does the invitee find out" is still "someone
  tells them" or "they check their pending invitations after signing in" —
  Session 4 adds the transactional email that would send the invite link
  automatically.
- **Pushing this schema to `trib4l-staging`/`trib4l-production`.** Not yet
  done as of writing this file — see the top-level session summary for
  whether that happened.
