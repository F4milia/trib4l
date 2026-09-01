# Session 7 — Search and Member Safety

Tracks progress against the Session 7 scope in
[`trib4l-build-from-zero.md`](../trib4l-build-from-zero.md#phase-1--community-core-sessions-3-10):
"Postgres full-text over posts and comments, org- and cohort-scoped ...
Member-to-member reporting and blocking — distinct from organizer content
moderation ... Reports route to organizers with an escalation path to
platform_admin." No explicit "done means" line for this session — same
bar as prior sessions applied here.

## Done and verified

- [x] **Full-text search** (`search.sql`): a `GENERATED ALWAYS AS
  (to_tsvector('english', body)) STORED` column on `posts` and `comments`,
  each with a GIN index — Postgres maintains it automatically, no trigger
  needed. Search reuses Session 6's exact RLS policies (`.textSearch()` is
  just another `WHERE` clause), so org/cohort scoping is inherited for
  free rather than needing its own separate rule. Verified by test:
  an organizer's search returns both an org-wide and a cohort-only post; a
  fresh member with no cohort searching the same term gets only the
  org-wide one.
- [x] **`reports` table** — deliberately distinct from Session 6's
  `moderate_post`/`moderate_comment`: a report is a signal routed to
  organizers (and, once escalated, `platform_admin`), not a removal action
  by itself. `target_type` covers a post, a comment, or a member directly
  (`target_id` has no foreign key — it's polymorphic, same shape as
  `audit_log`'s `target_type`/`target_id`, since a FK can't be conditional
  on another column). Only org staff/`platform_admin` can change status;
  the reporter can see their own report but never resolve it themselves.
- [x] **`blocks` table, deliberately global, not per-org** — identity
  itself is global (Session 1), and "I don't want to see this person" is
  a personal boundary that should hold in every community the two people
  might ever share, not just the one where the block happened. Narrower
  visibility than almost anything else in this codebase: not even
  `platform_admin` gets a blanket read — who someone has chosen to block
  is exactly the kind of information this feature exists to protect, not
  administrative data.
- [x] **Blocking is enforced at the app layer, not RLS** — a deliberate
  choice, not an oversight: RLS stays focused on "is this row visible at
  all" (tenant/cohort isolation, a security boundary), while a personal
  content preference like blocking is filtered in the feed query itself.
  Baking it into RLS would also have hidden a blocked person's content
  from an organizer's own *moderation* queries, which is the wrong
  behavior — organizers still need to see reported content regardless of
  their personal block list.
- [x] **RLS + grants shipped together**, same discipline as every prior
  session. 7 isolation tests (`tests/isolation/search-and-safety.test.ts`):
  search scoping (above); a member can file a report visible to staff; a
  report is invisible to other members; only staff can resolve a report,
  not the reporter; blocking/unblocking works and is visible only to the
  blocker; can't block yourself; can't insert a block on someone else's
  behalf.
- [x] **The escalation test genuinely fails loudly when loosened** —
  checked directly, same as every prior session: temporarily replaced
  `reports_update`'s policy with `using (true)`, watched the
  "reporter can't self-resolve" test fail with the actual resolved row
  printed, restored via `supabase db reset`, confirmed all 34 pass again.
- [x] **A methodology risk caught before it became a real bug**: the
  first draft of the self-resolve test used seeded Alice as the reporter.
  Alice's role gets durably promoted to organizer by a *different* test
  file (Session 3's) within the same run, which would have made this
  test pass or fail depending on file execution order rather than on the
  policy actually being correct. Fixed by using a fresh, disposable
  sign-up instead, before ever running the test — the same class of issue
  Session 6 found the hard way, caught proactively here instead.
- [x] **UI**, same plain styling as prior sessions, manually driven
  through the real dev server exactly like Sessions 3/5/6 (curl simulating
  real form submissions, extracting the real `$ACTION_ID` fields):
  - A search page per community (`/o/[slug]/search`) — confirmed a search
    term finds the matching post.
  - A "Report" link on every post and comment, going to a small form
    (`/o/[slug]/report`) — confirmed a real submission lands in the
    organizer's reports queue.
  - A reports page for organizers (`/o/[slug]/settings/reports`) with
    resolve/escalate controls — confirmed resolving actually updates the
    status.
  - A "Block \<name\>" link on every post not authored by the viewer
    (never shown on your own posts) — confirmed blocking someone hides
    their posts from your feed specifically, while their own view of their
    own posts, and everyone else's view of them, stays unaffected.
  - A global "Blocked people" page (`/settings/blocked`, not org-scoped,
    matching blocking's global design) — confirmed unblocking makes the
    person's posts reappear.

## Pushed to hosted Supabase

All three new migrations pushed to `trib4l-staging` and
`trib4l-production`. CLI left linked to staging afterward, same safety
practice as prior sessions.

## Not done in Session 7 — explicitly out of scope here

- **Blocking a person doesn't hide their reactions or prevent them from
  seeing/interacting with the blocker's content.** The plan's framing
  ("I don't want to see this person") is about the blocker's own view, not
  a mutual/bidirectional restriction — a fuller "they can't see me either"
  or "they can't comment on my posts" model wasn't asked for and would be
  a materially bigger feature.
- **Pushing this schema to `trib4l-staging`/`trib4l-production`.** Not yet
  done as of writing this file.
