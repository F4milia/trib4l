# Session 6 — Posts and Feed

Tracks progress against the Session 6 scope in
[`trib4l-build-from-zero.md`](./trib4l-build-from-zero.md#phase-1--community-core-sessions-3-10):
"Threads, comments, reactions. Organizer moderation with `audit_log`
writes. Index `(org_id, cohort_id, created_at)` now — this is where the
first performance wall appears." No explicit "done means" line for this
session either — same bar as prior sessions applied here.

## Done and verified

- [x] **`posts`, `comments`, `reactions` tables** (migration
  `20260823191444_posts_comments_reactions.sql`) — the exact index the
  plan calls out by name, `(org_id, cohort_id, created_at desc)`, exists
  on `posts` for the feed query's shape.
- [x] **Cohort-scoping from Session 5 finally has content to apply to.**
  `posts.cohort_id` nullable = org-wide; set = visible only to that
  cohort. This is literally the "a member sees org-wide content plus
  their own cohort's, nothing from a sibling cohort's" line from the
  Session 5 plan text, which had nothing to apply to until now.
- [x] **`comments`/`reactions`' `org_id`/`cohort_id` are trigger-derived,
  not client-supplied** — a step beyond Session 5's cohort_members
  mismatch-trigger pattern (which *rejects* a mismatch the client could
  still get wrong): here, the client only ever supplies `post_id` (or
  `post_id`/`comment_id` for a reaction), and a `BEFORE INSERT` trigger
  fills in the rest from the parent, so there's no mismatch to even be
  possible. Cost: Supabase's generated `Insert` types don't know about
  triggers and mark those columns required anyway — worked around with an
  explicit, commented `as unknown as ...Insert` cast at each call site
  (both in `app/actions/posts.ts` and the isolation tests) rather than
  silently loosening a type or padding in a fake value.
- [x] **Reactions are the one exception to "soft delete everything"** —
  a like/unlike toggle isn't user-generated content with a retention
  story (checked against `docs/data-retention-policy.md`'s categories;
  none fit), so `reactions` has no `deleted_at` and supports real `DELETE`.
- [x] **RLS + grants shipped together**, same discipline as Sessions 2/5.
  A shared `can_see_org_cohort_content()` helper (org staff and
  `platform_admin` see everything, for moderation; everyone else gets the
  org-wide-plus-own-cohort rule) backs the select/insert policies on all
  three tables.
- [x] **`moderate_post()`/`moderate_comment()` RPCs** — the "organizer
  moderation with `audit_log` writes" the plan calls out by name. Not
  `SECURITY DEFINER`: both the soft-delete and the `audit_log` insert run
  under the caller's own RLS (already permitted for organizer/org_owner/
  platform_admin) — atomicity, not privilege, same pattern as Session 5's
  `assign_member_to_cohort()`.
- [x] **6 isolation tests** (`tests/isolation/posts.test.ts`): org-wide
  post visible to any org member, not to an outsider; a cohort post
  visible only to that cohort's members (plus org staff regardless);
  a comment's `org_id`/`cohort_id` genuinely come from the trigger, not
  the client; double-liking is rejected by the unique index and unliking
  actually removes the row; `moderate_post` soft-deletes and writes the
  audit entry; a plain member can't moderate someone else's post.
- [x] **A real methodology bug caught mid-session, in the escalation test
  itself** — the first version of "a plain member cannot moderate" used
  an outsider (Dave, not even in the org) as the test subject. Loosening
  `posts_update` to `using (true)` still left that test passing, because
  `audit_log`'s own `is_org_member` check independently blocked the
  outsider — meaning the test wasn't actually exercising `posts_update` at
  all, just a different, unrelated policy. Fixed by using an actual
  in-org, non-staff member instead, which isolates the right policy;
  re-confirmed the loosened-policy check then genuinely failed, restored,
  confirmed all 27 pass again. Worth remembering: an escalation test using
  an "outsider" can pass for the wrong reason if any other independent
  check also happens to block them — the test subject needs to be someone
  blocked by *only* the one policy under test.
- [x] **Feed UI** at `/o/[slug]` (replacing the earlier placeholder home
  page): new-post form (with a cohort-or-org-wide selector — staff see
  every cohort, a regular member only their own if they have one), each
  post showing author/timestamp/body, a like toggle with count, inline
  comments with a reply form, and (staff only) a Remove control on posts
  and comments. Manually driven through the real dev server exactly like
  Sessions 3/5/design-pass (curl simulating real form submissions,
  extracting the real `$ACTION_ID` fields): posted org-wide as an
  organizer, liked and unliked (count went 0→1→0), commented, moderated
  the post (disappeared from the feed, confirmed the `audit_log` row
  directly), confirmed a plain member sees no Remove control and can
  still post normally.

## Not done in Session 6 — explicitly out of scope here

- **Post detail pages / pagination.** Everything renders inline on one
  feed page; a community with hundreds of posts will need pagination
  eventually, but the plan's own framing ("this is where the first
  performance wall appears") is about the index existing, not about
  building pagination pre-emptively before there's real volume to justify
  it.
- **Multiple reaction types.** `reaction_type` exists as a column
  (defaulting to `'like'`) for future extensibility, but the UI only
  offers one.
- **Pushing this schema to `trib4l-staging`/`trib4l-production`.** Not yet
  done as of writing this file.
