# Session 5 — Cohorts

Tracks progress against the Session 5 scope in
[`trib4l-build-from-zero.md`](../trib4l-build-from-zero.md#phase-1--community-core-sessions-3-10):
"Cohorts. `cohorts`, `cohort_members`. Cohort-scoped visibility layered
under org scoping. A member sees org-wide content plus their own cohort's,
nothing from sibling cohorts." No explicit "done means" line for this
session in the plan — the bar applied here matches prior sessions: build
it, verify it against real Postgres and a real browser session, don't just
assert it.

## Decisions made before building (confirmed with you, in plain language)

- **One active cohort per org, per person, at a time.** Not multiple
  concurrent cohorts within the same org — matches a "class" or "batch"
  model. Historical assignments are kept (soft-deleted, not overwritten),
  so moving someone between cohorts doesn't erase the fact they were in the
  first one.
- **Organizers and org_owner manage cohorts** — same two roles that already
  manage the member list and invitations.

## Done and verified

- [x] **`cohorts` table** (migration `20260822182444_cohorts.sql`):
  org-scoped, unique `(org_id, name)` while active.
- [x] **`cohort_members` table**: carries its own `org_id` (not just
  `cohort_id`) both because Session 1's "every tenant table carries org_id"
  rule applies, and because it's what makes the "one active cohort per org"
  constraint expressible as a plain partial unique index
  (`(org_id, profile_id) where deleted_at is null`) rather than something
  that needs a cross-table lookup.
- [x] **A trigger enforces `cohort_members.org_id` actually matches the
  referenced cohort's org** — a plain `CHECK` constraint can't express this
  (it's a foreign-key hop away), so this needed a `BEFORE INSERT OR UPDATE`
  trigger. Verified by test: an org_owner of *Founder Collective* tries to
  insert a `cohort_members` row claiming `org_id = founder-collective` but
  pointing at a *Caregiver Circle* cohort — RLS alone would actually allow
  this (she genuinely has `org_owner` in the org_id she claimed), so this
  specifically tests that the trigger, not just RLS, catches the mismatch.
- [x] **RLS + grants shipped together** (migration
  `20260822182544_cohorts_rls.sql`), same discipline as Session 2: a new
  `is_in_cohort()` helper (`SECURITY DEFINER`, same recursion-avoidance
  reason as Session 2's helpers), policies scoping `cohorts` to org members
  generally and `cohort_members` to "your own row, your cohort-mates, or
  org staff" — the "nothing from sibling cohorts" line from the plan,
  enforced here rather than deferred to Session 6's content queries.
- [x] **`assign_member_to_cohort()` RPC** — moves someone into a cohort
  atomically (soft-delete the old row, insert the new one, one
  transaction). Deliberately *not* `SECURITY DEFINER`: both inner
  statements still run under the caller's own RLS, so this function adds
  atomicity, not privilege — an organizer with legitimate access could do
  the same two statements by hand, just not atomically.
- [x] **5 isolation tests** (`tests/isolation/cohorts.test.ts`): organizer
  can create a cohort; a plain member cannot; a member sees their own
  cohort's roster but not a sibling cohort's; a member can hold only one
  active cohort per org (moving them updates the row rather than adding a
  second); the org-id-mismatch trigger case above.
- [x] **The escalation test fails loudly when the policy is loosened** —
  checked directly, same as Sessions 2 and 3: temporarily replaced
  `cohorts_insert`'s policy with `with check (true)`, watched the
  "plain member cannot create a cohort" test fail, restored it via
  `supabase db reset`, watched it pass again.
- [x] **Minimal UI** (`/o/[slug]/settings/cohorts`, organizer/org_owner
  only, same plain styling as Session 3): create a cohort, see the org
  roster with each person's current cohort, assign/move someone via a
  dropdown. Manually driven through the real dev server with `curl`
  simulating a real form submission (same method as Session 3, extracting
  the actual `$ACTION_ID` hidden fields) — created a cohort, assigned
  Alice to it, confirmed the roster table updated to show it, confirmed a
  plain member (Dave) is redirected away from the page.

## A test-design issue found and fixed along the way (not a product bug)

Two new cohort tests initially failed against seeded users (`alice`), not
because of a bug in the cohort feature, but because an *earlier* test file
(Session 3's `invitations.test.ts`) durably promotes Alice from `member` to
`organizer` as part of testing that exact feature — and all isolation test
files share one database within a single `db reset`, so that mutation
leaked into later files' assumptions about her role. Fixed by using fresh,
disposable sign-ups (a shared `signUpNewUser()` helper, now deduplicated
out of `invitations.test.ts` into `helpers.ts`) for tests that need a
person guaranteed untouched by another file's side effects, rather than
relying on a seeded user's role staying whatever the seed script set it
to.

## Pushed to hosted Supabase

Both new migrations pushed to `trib4l-staging` and `trib4l-production`
(schema only, no seed changes this session). CLI left linked to staging
afterward, same safety practice as prior sessions.

## Not done in Session 5 — explicitly out of scope here

- **Anything that actually uses cohort-scoping for content.** There's no
  content yet — Session 6 (posts/feed) is where "a member sees org-wide
  content plus their own cohort's" first has something to apply to. This
  session only builds the underlying table + RLS layer Session 6 will
  index and query against.
