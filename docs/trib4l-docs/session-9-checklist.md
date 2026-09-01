# Session 9 — Mentorship

Tracks progress against the Session 9 scope in
[`trib4l-build-from-zero.md`](../trib4l-build-from-zero.md#phase-1--community-core-sessions-3-10):
"Mentor designation, pairing model, lifecycle (proposed → active →
completed). Build the member → mentor transition as an explicit,
first-class action with its own record and UI moment. In the caregiver
vertical this is the engine, not a feature." No explicit "done means" line
for this session — same bar as prior sessions applied here.

## Done and verified

- [x] **`mentor` was already a `membership_role`** (since the original
  Session 1 schema), but nothing had ever checked it — no `has_org_role`
  call anywhere passed `'mentor'` into its allowlist, so a mentor behaved
  exactly like a plain member for access control. This session is what
  gives the role meaning.
- [x] **`designate_mentor(target_org_id, target_profile_id)`** — the
  member → mentor transition, built as the plan asks: an explicit action
  with its own record, not a bare role edit. Restricted to promoting a
  plain `'member'` (an organizer/org_owner isn't a valid input — demoting
  staff into `'mentor'` isn't what this action means). Writes an
  `audit_log` entry (`action = 'designate_mentor'`) in the same
  transaction as the role change. Not `SECURITY DEFINER`: both the
  `UPDATE` and the `audit_log` insert run under the caller's own
  already-permitted RLS — `memberships_update` has required `org_owner`
  specifically since Session 2, so this reuses an existing permission
  rather than granting a new one. A mere organizer cannot call this, by
  design, matching that existing policy.
- [x] **`mentor_pairings`** — `org_id, mentor_profile_id,
  mentee_profile_id, status, proposed_by_profile_id`, plus
  `activated_at`/`completed_at`/`declined_at` timestamps set by the
  transition trigger below. `mentor_profile_id`/`mentee_profile_id`/
  `proposed_by_profile_id` are nullable with `on delete set null`,
  deliberately not `member_stages`' not-null/`on delete cascade` shape —
  this table *is* the historical record of a mentorship (the data
  retention policy calls this out by name: "a completed pairing belongs to
  the mentorship program's track record ... survives either party's
  deletion request"), so it follows `stage_transitions`' convention for
  history rows, not `member_stages`' convention for current-state rows.
- [x] **At most one live (`proposed` or `active`) pairing per mentee per
  org** — a partial unique index, the same "one active row per org per
  person" shape as `cohort_members`/`member_stages`, extended to also
  cover `proposed` so an organizer can't leave a mentee's fate ambiguous
  between two simultaneous candidates. Nothing constrains the mentor
  side — one mentor can have many mentees.
- [x] **The lifecycle state machine lives in a trigger, not an RPC** — a
  deliberate departure from Session 5/8's pattern. Those needed RPCs
  because they required two atomic writes (soft-delete + insert, or update
  + log insert); a pairing's status change is a single `UPDATE`, so a
  plain `.update({ status })` suffices once a `BEFORE UPDATE` trigger
  (`check_mentor_pairing_transition`) enforces the rules an RLS boolean
  expression can't express cleanly — a state machine with a *different*
  allowed caller per edge:
  - `proposed → active`: only the mentor (accepting).
  - `proposed → declined`: the mentor, the mentee, or staff.
  - `active → completed`: the mentor, the mentee, or staff.
  - anything else: rejected outright.

  RLS's `mentor_pairings_update` policy is deliberately only a coarse
  gate ("you're a party to this pairing, or you're staff") — the trigger
  does the fine-grained enforcement, and also guards `org_id`,
  `mentor_profile_id`, `mentee_profile_id`, and `proposed_by_profile_id`
  against being changed after creation, closing a gap RLS's `WITH CHECK`
  alone wouldn't have caught (a party to the pairing legitimately passes
  that check, but rewriting who the pairing is *between* is never
  legitimate).
- [x] **RLS + grants shipped together**, same discipline as every prior
  session. 7 isolation tests
  (`tests/isolation/mentorship.test.ts`): org_owner can designate a mentor
  and a mere organizer cannot; staff can propose a pairing and a plain
  member cannot; a mentee can have at most one live pairing; only the
  mentor can accept a proposed pairing (the mentee, staff, and an outsider
  each rejected for a different reason — the mentee and staff by the
  trigger's explicit exception, the outsider by RLS silently excluding the
  row before the trigger ever runs); the mentee can decline, and either
  party can complete an active pairing; a completed or declined pairing is
  terminal; a pairing is visible to its mentor, its mentee, and staff, but
  not an unrelated member. 45 total isolation tests now pass.
- [x] **A test-writing mistake caught while first running the suite, not
  after**: the "only the mentor can accept" test originally assumed the
  mentee's and staff's blocked attempts would come back as an empty result
  (RLS silently excluding the row), the same shape as Session 8's
  gating tests. Running it showed the real behavior: the mentee and staff
  both pass `mentor_pairings_update`'s coarse `USING` clause (they're a
  party / they're staff), so the row *is* matched and the trigger's
  explicit exception is what blocks them — a real Postgres error, not a
  silent zero-row result. Only the outsider, who fails the coarse gate
  entirely, gets the silent-exclusion treatment. Fixed the assertions to
  match the actual, correct behavior rather than the assumed one.
- [x] **The escalation test genuinely fails loudly when loosened** —
  checked directly: temporarily replaced `check_mentor_pairing_transition`
  with a version that sets the timestamp columns but performs none of the
  caller/transition checks, watched both the "only the mentor can accept"
  and "terminal state" tests fail with the real (missing) errors shown,
  restored via `supabase db reset`, confirmed all 45 pass again.
- [x] **UI**, same plain styling as prior sessions, manually driven
  through the real dev server (curl simulating real form submissions,
  extracting the real `$ACTION_ID` fields), on a freshly reset database:
  - A staff settings page (`/o/[slug]/settings/mentorship`): current
    mentors, a "Designate a mentor" form (rendered only for `org_owner`,
    since `organizer` would always fail the underlying policy), a
    "Propose a pairing" form, and a pairings table with staff
    Decline/Complete controls.
  - A member-facing page (`/o/[slug]/mentorship`, linked from the main
    nav for everyone, not staff-gated): shows your own pairings — as
    mentor or as mentee — with whichever actions your role and the
    pairing's status actually permit (Accept/Decline if you're the
    mentor and it's proposed; Decline if you're the mentee and it's
    proposed; Mark complete either way if it's active).
  - One `transitionMentorPairing` action shared by both pages — the
    trigger, not the action, decides who's allowed to make which
    transition, so there was no need for separate staff/member action
    functions.
  - Confirmed the full lifecycle end-to-end with real accounts, not just
    the isolation suite: invited two fresh members through the real
    invite flow, designated one as a mentor through the real form
    (confirmed the resulting `audit_log` row directly), proposed a
    pairing between a mentor and the other new member, had the mentor
    accept it from her own "My mentorship" page, had the mentee mark it
    complete from his, and confirmed a third, uninvolved member's own
    mentorship page stayed empty throughout.

## Pushed to hosted Supabase

Both new migrations pushed to `trib4l-staging` and `trib4l-production`.
CLI left linked to staging afterward, same safety practice as prior
sessions.

## Not done in Session 9 — explicitly out of scope here

- **A mentor being limited to N concurrent mentees, or any mentor-side
  capacity constraint** — the one-live-pairing constraint only protects
  the mentee side; nothing stops a mentor from having many mentees at
  once, which wasn't asked for and isn't obviously desirable to restrict.
- **Un-designating a mentor** (reverting `'mentor'` back to `'member'`) —
  not required by the plan, and not built.
- **Any UI for a member to see or manage another org's mentor
  pairings** — everything here is scoped to the single org the page is
  already under, matching every prior session's org-scoping.
