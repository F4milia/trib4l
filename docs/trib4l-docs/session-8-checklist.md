# Session 8 — Stages and Content Gating

Tracks progress against the Session 8 scope in
[`trib4l-build-from-zero.md`](../trib4l-build-from-zero.md#phase-1--community-core-sessions-3-10):
an ordered progression (stages), distinct from cohorts (a point-in-time
grouping); transitions logged for HQ/org dashboards; content optionally
gated behind a stage. No explicit "done means" line for this session — same
bar as prior sessions applied here.

## Done and verified

- [x] **`stages` table** (`org_id, name, sort_order`) — unique per org on
  both name and `sort_order` among non-deleted rows. `sort_order` is what
  makes gating meaningful ("reached at least this far" only makes sense
  because stages are ordered, unlike cohorts).
- [x] **`member_stages`** — same "one active row per org per person" shape
  as `cohort_members` (Session 5), enforced by a partial unique index.
- [x] **`stage_transitions`** — append-only, like `audit_log`: a transition
  is never edited once logged. `from_stage_id` is nullable (first
  assignment has nothing to transition from). This is the durable record
  the plan calls out ("the log feeds the HQ and org dashboards"), not
  something reconstructed later from soft-delete timestamps.
- [x] **`transition_member_stage(target_org_id, target_profile_id,
  target_stage_id)`** — moves someone and logs the transition atomically.
  Not `SECURITY DEFINER`, same reasoning as Session 5's
  `assign_member_to_cohort` and Session 6's `moderate_post`: every inner
  statement runs under the caller's own already-permitted RLS: this
  function buys one round trip, not extra privilege.
- [x] **`required_stage_id`** added to `posts`, and inherited by
  `comments`/`reactions` from their parent via the same
  `set_comment_org_and_cohort`/`set_reaction_org_and_cohort` triggers that
  already copy `org_id`/`cohort_id` (Session 6) — a comment can't end up
  gated more loosely than the post it's replying to.
- [x] **RLS + grants shipped together**, same discipline as every prior
  session. 4 new isolation tests
  (`tests/isolation/stages.test.ts`): an organizer can create stages, a
  plain member cannot; `transition_member_stage` moves someone atomically
  and logs it; content gated behind a stage is invisible below it, visible
  at or past it, and always visible to staff; a comment on a gated post
  inherits the same gate. 38 total isolation tests now pass.
- [x] **A real design bug found and fixed before it shipped**: the first
  version of the six gated `select`/`insert` policies ANDed
  `is_at_or_past_stage(...)` directly onto `can_see_org_cohort_content(...)`
  (Session 6's cohort-scoping helper). That helper's staff bypass
  (`organizer`/`org_owner`/`platform_admin` see everything) only covers
  cohort scoping — ANDing the stage check on top, unconditionally,
  re-imposed the gate on staff too, exactly the people the bypass exists to
  exempt. Concretely: an organizer with no stage of their own got a
  `42501` RLS error inserting *their own* gated post, because Postgres
  checks `RETURNING` against the table's `select` policy, and that policy
  demanded the organizer satisfy a stage requirement they had no stage
  against. Root-caused by evaluating each disjunct of the policy
  independently via RPC (`has_org_role` true, `is_at_or_past_stage` false)
  and reasoning through Postgres's `INSERT ... RETURNING` behavior, not by
  guessing. Fixed by introducing one combined function,
  `can_see_gated_content(org_id, cohort_id, required_stage_id)`, with the
  staff bypass applied once, covering cohort and stage together — used by
  all six policies instead of layering two separately-bypassed checks with
  a raw `AND`.
- [x] **The escalation test genuinely fails loudly when loosened** —
  checked directly: temporarily replaced `posts_select`'s policy with
  `using (true)`, watched the stage-gating test fail with the actual
  visible row printed (a newbie's `null` expectation received the real
  post `id` instead), restored via `supabase db reset`, confirmed all 38
  pass again.
- [x] **UI**, same plain styling as prior sessions, manually driven through
  the real dev server (curl simulating real form submissions, extracting
  the real `$ACTION_ID` fields), on a freshly reset database so seed roles
  weren't polluted by an earlier isolation-test run sharing the same DB:
  - A stages management page for organizers
    (`/o/[slug]/settings/stages`) — create a stage with a name and sort
    order, see all stages in order, and move any member to any stage.
    Confirmed creating two stages and moving a member between them both
    worked as real form submissions.
  - A "Stages" link in the org nav, next to Cohorts, staff-only.
  - The post-creation form on the org home page gained a second,
    staff-only selector: "No stage gate" or "Requires: `<stage name>`" —
    mirroring how the existing cohort selector works. Gated posts show a
    🔒 badge with the stage name next to the author.
  - Confirmed the full gating behavior end-to-end with real sessions, not
    just the isolation suite: a plain member with no stage cannot see a
    post gated behind "Advanced"; after an organizer moves that member to
    "Advanced" via the real form, the same post appears in their feed; the
    organizer sees their own gated post throughout, despite having no
    stage themselves — the exact case the bug above was about.

## A methodology note, not a new bug

Mid-verification, a check against a *different* plain member appeared to
show the gate failing — a stage-demoted user still saw a gated post. The
actual cause: I ran the full isolation suite (`npm run test:isolation`,
which resets the DB once and then runs every test file against the shared
result) immediately before starting manual verification, without
resetting again afterward. One of that run's other test files durably
promotes seeded Alice to `organizer` — the same cross-file pollution
pattern noted in Sessions 6 and 7 — so by the time I tested with her she
was staff, not the plain member the seed data describes. Re-ran
`supabase db reset` alone (no tests) to get back to clean seed state before
redoing the manual pass, which confirmed the gating logic itself was
correct all along.

## Pushed to hosted Supabase

All three new migrations pushed to `trib4l-staging` and
`trib4l-production`. CLI left linked to staging afterward, same safety
practice as prior sessions.

## Not done in Session 8 — explicitly out of scope here

- **A UI for a member to see their own stage** outside of what an
  organizer sees on the stages management page — not asked for, and the
  plan frames stage visibility as staff-run progression tracking, not a
  member-facing profile feature.
- **Automatic stage transitions** (e.g., time-based, or triggered by some
  activity threshold) — every transition in this session is a deliberate
  action by an organizer through `transition_member_stage`.
