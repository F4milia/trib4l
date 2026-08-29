# CLAUDE.md — F4milia

F4milia is a platform for fixed groups of 8–12 people (Families) who
build shared goals together: a Tower (the goal), Bricks (the work),
Vows (rotating commitments), the Table (daily entries), the Ledger
(the record), the Keepsake (the artifact). For venture-oriented
Families, a Slicing-Pie-style Contribution & Equity Engine computes
slices from the Ledger. The Ledger is a system of record for eventual
ownership — treat every write to it accordingly.

## Stack — locked, do not re-litigate
Supabase (Postgres, Auth, RLS, Realtime, Storage) · Inngest (jobs) ·
Resend (email) · pgvector (semantic search) · Edge Functions for all
AI calls · @react-pdf/renderer (Keepsake) · PostHog (names and counts
only — see invariant 4) · pgTAP + ZeroStep/Playwright in CI.
Commerce is dormant-per-Tower; nothing touches Stripe until unparked.

## Hard invariants — violating any of these is a failed session
1. THE SLICE FORMULA IS DETERMINISTIC. No model output ever modifies
   hours, multipliers, or slices — no AI code path writes to
   contribution_ledger numeric columns, provable by grep. AI assists
   inputs and review; the math is untouchable. If a task seems to
   require crossing this line, STOP and raise it — never build around it.
2. AI is server-side only (Edge Functions); no model call or API key
   ever reaches the client bundle. Context assembles strictly from the
   invoking member's CURRENT Family — Family-of-invocation, not the
   caller's total access. Every AI output is a suggestion requiring
   explicit acceptance before any write; every AI-assisted record
   carries the ai_assisted marker; a dismissed suggestion writes
   nothing and does not re-prompt.
3. NO Family content in any outbound message. Emails and pushes name
   the event, never the content — no Table entry text, no message
   bodies. Assume the inbox may be shared. Notification preferences
   are per-Family, never one global mute.
4. PostHog receives event names and anonymous counts ONLY — no Table
   entry text, no message content, no AI prompt or suggestion text, no
   member-identifying payloads. The scrubbing test ships before the
   first event.
5. Every mutation writes to audit_log — enforced by database trigger, not
   by convention. public.audit_row_change() is attached to every table in
   public except audit_log, idempotency_keys and webhook_events. A NEW TABLE
   GETS ITS TRIGGER IN THE SAME MIGRATION THAT CREATES IT; do not add
   app-layer audit calls, they cannot see a service-role write and are not
   in the mutation's transaction. Pass a resolution mode when the table has
   no org_id of its own: 'self' (the row is the org), 'order' (through the
   parent order). metadata carries changed column NAMES only, never values.
   Role resolves server-side from the database, never from a client claim. RLS is the security model;
   every new read path (search, embeddings, AI context, exports) goes
   THROUGH policy — never a service-role shortcut with filtering on top.
   Embedding tables carry the same RLS as their source rows.
6. member_blocks applies from day one on every new social surface:
   a blocked member's content is hidden from the blocker specifically,
   not deleted for the room. Check blocks × any new feature (mentions,
   reactions, notifications) explicitly.
7. 2FA is ENFORCED for platform_staff at sign-in — an invariant, not a
   setting. Rate limits on every endpoint that costs money or sends
   anything: auth, AI, email, push, storage.
8. Account deletion follows the anonymize-vs-purge policy;
   memorial-lock content persists. Deletion never silently purges what
   the policy preserves.
9. Nothing is public by default. Publishing (Keepsake share page) is
   explicit, confirmable, reversible, audited. Unpublished = public 404.
10. PARKED and untouchable: Mitosis, Kindred, bank-linking. Profit-share
    billing exists but is not-for-production until legal sign-off — no
    session activates it.
11. No invented legal language anywhere — placeholder text is visibly
    "[PENDING LEGAL REVIEW]", never plausible-sounding terms.

## Standing workflow — applies to every session, no paste required
1. FIRST OUTPUT, before any code: a PR plan — ordered PRs, each under
   200 lines, each independently mergeable and green on its own. Then
   execute PR by PR. If the plan changes mid-session, restate the rest.
2. Per PR: tests first against the acceptance criteria → implement →
   run → self-correct until green → open the PR.
3. Migrations ship as the smallest possible standalone PR.
4. Touch only files in this session's scope. Needing a file outside it
   — especially migrations, auth, RLS, **/contribution/**, **/ai/**,
   or another session's surface — means STOP and report which file and
   why. Do not proceed.
5. Every PR description lists: (a) every file modified, (b) any
   acceptance criterion not satisfied and why, (c) every assumption the
   prompt didn't specify.
6. Never delete or weaken an existing test to make a change pass.
7. On merge, the PR is tagged `clean` or `rework` — nothing else. A `rework`
   tag adds one line to Learned constraints below before the next session
   launches. This is the only measurement in the process: an untagged merge
   is a data point lost, and every estimate stays a guess.

## Design constraints — Hearth & Material, every screen
Zero border-radius, everywhere, no exceptions · no SaaS blues ·
Parchment / Deep Slate palette · Terracotta for primary actions ONLY ·
Tower progress renders as stacked masonry blocks, never a smooth bar ·
Ledger metadata in monospace · honest empty states, no invented
placeholders · plain-text "Loading…", no skeleton shimmer · keyboard
operable, WCAG AA verified at rendered size. New UI strings go in the
copy deck, never inline. Re-read f4milia-design-system.md before any
UI session — these tokens are the brand.

## Testing rules
RLS tests authenticate as real users with their own JWTs — NEVER the
service role key. Every isolation test must demonstrably fail with its
policy removed (write → delete policy → watch fail → restore). The
dual-Family user is the canonical fixture: a member of Families A and B
sees exactly their own scope in each, on every surface — conversations,
search, embeddings, AI context, exports. Failing isolation tests block
merge, no override.

## Companion docs
f4milia-design-system.md ·
f4milia-testing-workflow.md · "F4milia — Complete Run Doc (Prompts
Included).md" (waves, session prompts, edge-case register).

## Learned constraints — append-only; never edit or remove entries
Format: `YYYY-MM-DD · session · what happened · the rule now`.
Every PR tagged `rework` adds a line here before the next session
launches. Every discovered hidden coupling or non-obvious constraint
adds a line, rework or not. This section is why week four is smarter
than week one.

- 2026-08-26 · (seed) · auto-updating Member Cards was rejected as too
  presumptuous · the safe pattern is suggestion-only with explicit
  accept/edit/dismiss (A4); apply the same pattern to any future
  AI-writes-about-a-person feature.
- 2026-08-26 · (seed) · Terracotta-on-Parchment primary button is a
  known contrast flag · resolve by adjusting the token to a verified-
  passing value (Q1), never by exempting the button.
- 2026-08-27 · pre-flight · every governing doc was untracked or
  unstaged, so `git worktree add` would have checked out none of them ·
  commit the companion docs before creating any worktree; "the file
  exists" and "the worktree sees it" are different claims.
- 2026-08-27 · pre-flight · greptile.json declared `scope.include` with
  18 globs; `lib/auth/**` matched nothing here, and the key does not
  exist in Greptile's schema at all, so the file was inert for ~20
  commits while being reported as corrected · verify a third-party
  config's format against the vendor's own docs before writing it, and
  verify every path glob against real repo paths; an ignored config is
  indistinguishable from a working one.
- 2026-08-27 · design migration · Input and Select spread `{...props}`
  after their own className, so any caller passing className silently
  lost all base styling — four call sites had been rendering as bare
  native controls · every primitive merges classes through cn(); never
  spread props after className.
- 2026-08-27 · design migration · the destructive button passed every
  token-level contrast guard while measuring 4.11:1, because the guards
  check tokens and the failure was a composed pair (`bg-terracotta/10`
  under `text-terracotta`) · measure the rendered
  foreground-on-background combination, including alpha over alpha,
  before shipping any tinted fill; a token-layer guard cannot see it.
- 2026-08-28 · design migration · `danger` and `ghost` drew their colour
  from the page ground, so inside a `treatment="dark"` Card they
  measured 3.38:1 and 1.00:1 — invisible · a dark surface is not the
  dark theme; semantic tokens do not flip inside a light page, so every
  variant needs measuring against both grounds.
- 2026-08-27 · design migration · a class-remap script converted 34
  surfaces faithfully and left the design language unapplied — 0
  asymmetric grids, 2 section rules, 5 primitives built and never used ·
  a scripted migration finishes the script's job, not the session's;
  state which sections of the design system a UI PR actually applies,
  and count them.
- 2026-08-27 · E2E setup · pinning Playwright's testDir immediately
  broke `npm test`, because vitest's default include collects
  `*.spec.ts` and @playwright/test throws under another runner · test
  runner exclusions are mutual; fixing one direction creates the other.
- 2026-08-28 · audit PR1/5 · three review rounds each found the previous
  fix one level too shallow: `search_path = ''` left pg_temp implicitly
  first, `@v4` named a version but not a commit, and setup-cli was
  SHA-pinned while `version: latest` left the CLI mutable · when you pin
  something, check what it pins in turn.
- 2026-08-28 · alignment · reported "8/8 E2E" when the run said 7, and
  "re-validated as YAML" when the validator had thrown before the commit
  ran; separately asserted in a code comment that two pages rendered a
  live page for a non-member, then disproved it · never state a
  verification that was not executed. Say per claim what was verified and
  against what authority; if a check fails or is unavailable, say so
  instead of describing the check intended.
- 2026-08-29 · audit PR2/5 · test assertions counted audit rows globally by
  action, so `count(*) = 1` passed alone and failed once the isolation suite
  or the seed had written rows of the same kind — hit three times in one
  session · in a suite that shares a database, scope every count to the row
  the test itself created; a global count is an order-dependent assertion
  wearing a precise-looking number.
- 2026-08-29 · audit PR3/5 · `service_role` has SELECT on memberships but
  not on organizations, so an embedded join failed with "permission denied"
  · grants here are least-privilege per migration, each granting only what
  its own code path needs. "The service role reads everything" is false in
  this repo — check the grant before relying on it.
- 2026-08-29 · audit PR3/5 · audit_log.created_at defaults to now(), which
  is TRANSACTION time, so every row written inside one transaction shares a
  timestamp · never `order by created_at desc limit 1` to get "the latest"
  audit row; within a transaction the ordering is arbitrary. Count or filter
  on content instead.
