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
only — see invariant 4) · Sentry (errors only — see invariant 12) ·
pgTAP + ZeroStep/Playwright in CI.
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
12. Sentry receives errors ONLY — no Family content, no AI prompt or
    suggestion text, no auth cookie. Its dataCollection defaults are
    permissive (userInfo, httpBodies, and genAI inputs/outputs all ON),
    so every Sentry.init sets them explicitly rather than inheriting
    them. The DSN comes from the environment, never hardcoded, so CI
    and staging never report into the production project. This is
    settled BEFORE the first AI session (Wave 6 / A1), not after.

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
- 2026-08-30 · audit PR3/5 · the entry above is superseded: audit_log now
  carries `seq`, a GENERATED ALWAYS identity column, and an index on it ·
  order audit rows by seq. Never by id (random uuid) or created_at
  (transaction time). seq orders by assignment, not commit, so two concurrent
  transactions can still commit out of seq order.
- 2026-08-30 · readiness check · Sentry ships in three configs with a
  hardcoded production DSN and `dataCollection` left at its permissive
  defaults, and CLAUDE.md named it nowhere · a dependency that transmits
  offsite is a stack entry and an invariant, not just a config file. A
  Wave 6 session reading only this document would have sent AI prompts to
  a third party and passed every gate. See invariant 12.
- 2026-08-30 · readiness check · `docs/session-notes/` is gitignored by
  decision, so no worktree can open it — including BEFORE-WAVE-2.md, which
  NEXT-STEPS.md marks as a ⛔ gate · anything a future session must know
  goes in CLAUDE.md or in that session's own prompt. A note the worktree
  cannot read is a note that does not exist. Same lesson as the 2026-08-27
  untracked-docs entry, in a form committing the file does not fix.
- 2026-08-30 · readiness check · both stream worktrees point at the one
  local Supabase stack (`supabase_db_Trib4l`) and both default to port
  3000, and `npm run test:isolation` begins with `supabase db reset` · the
  two streams cannot run dev servers, isolation, or Playwright
  concurrently. One stream's RLS gate destroys the other's database
  mid-run, and it presents as flaky tests rather than as a collision.
- 2026-08-30 · audit PR3/5 (deferred) · the DELETE branch of
  audit_row_change() SELECTs the organization before inserting, which under
  READ COMMITTED goes stale if the org is deleted between check and insert;
  separately audit_log.actor_profile_id can reference a missing profiles
  row · do not check-then-insert. Insert and catch foreign_key_violation,
  re-inserting with null actor/org. CD-3 and CD-4 share that one fix, owed
  in PR 4/5.
- 2026-08-30 · audit PR3/5 (deferred) · `to_jsonb(new)` copies the entire
  row to read two scalar fields — measured +50% write cost on a 4 KB body,
  scaling with row width · build the row image only for UPDATE; read
  NEW.org_id and NEW.id directly on INSERT and DELETE. PERF-1, and
  `messages` is its worst case, so it is owed before Wave 2 creates it.
- 2026-08-30 · audit PR3/5 (deferred) · audit_log is indexed on
  (org_id, created_at) and (actor_profile_id) but not target_id, so "this
  record's history" full-scans a table now fed by 30 tables — and the table
  is append-only with no retention policy · add (target_type, target_id)
  while it is still small. PERF-2.
- 2026-09-01 · S2 · a `"use server"` file may export ONLY async functions;
  exporting the initial-state object beside a server action broke every page
  importing it at module evaluation, in the browser, while `tsc --noEmit` and
  eslint both passed · constants and types that travel with an action live in
  their own module (lib/auth/totp-state.ts). Neither static check sees this.
- 2026-09-01 · S2 · app/page.tsx cannot call requireUser() -- it renders a
  signed-out view too -- so it silently missed BOTH gates added there, twice: the
  two-factor check in one PR and the deleted-account check in the next · a gate
  that pages opt into is a gate some page will not have. Combine related
  refusals into one function that cannot be half-called (accountGate), and keep
  tests/assurance-gate.test.ts's whole-tree census, which is what caught it.
- 2026-09-01 · S2 · a Turnstile token is single-use, and Cloudflare's
  always-passes TEST secret verifies the same string repeatedly -- so a spent
  token being resubmitted after a failed sign-in is invisible locally and in CI,
  and exists only where a real secret is configured · a test key that always
  passes hides every ordering bug. Re-check the retry path by hand once staging
  holds real keys.
- 2026-09-01 · S2 · PostgREST validates a JWT's signature and expiry but NOT
  whether the session still exists, so a revoked access token keeps reading the
  Data API until jwt_expiry (3600s); supabase-js masks this by dropping its
  session when GoTrue answers session_not_found · "signed out everywhere" is
  true for the app and for the SDK, not for something holding the raw token.
  Never promise instant total revocation in copy, and test that claim with a
  bare fetch -- through the SDK it asserts the opposite of the truth.
- 2026-09-01 · S2 · GoTrue refuses both MFA enrol and unenrol from an aal1
  session once a verified factor exists, and listFactors().totp excludes
  unverified factors entirely (`all` is the only place they appear) · check
  assurance level before offering either action, or the page offers a button
  whose only possible answer is "try again", forever.
- 2026-09-01 · S2 · fifteen SECURITY DEFINER functions in public pin
  `search_path = public`, which leaves pg_temp implicitly FIRST for relation
  lookups -- measured as the `authenticated` role, a temp table named
  platform_staff makes is_platform_admin() return true for a plain member ·
  every definer function names pg_temp explicitly and last. Not reachable
  through PostgREST today (no client path runs DDL), so it is latent, not live --
  and it includes every RLS gate in the app. Owed as its own migration.
- 2026-09-01 · S2 · service_role has no SELECT on profiles and no privilege at
  all on platform_staff, so an isolation test cannot inspect an anonymisation or
  seed a staff row · extends the 2026-08-29 grant lesson: check the grant before
  writing the test, not after reading a null as a product bug.
- 2026-09-01 · S2 · S2's auth rate limiter took the whole browser suite red --
  17 specs signing in as the same seeded users cross five-per-fifteen-minutes
  immediately · a correct limit meets test workloads no human produces. The
  escape lives in exactly one committed place (playwright.config.ts) and is
  ignored unless NODE_ENV is not "production", which `next build` pins.
- 2026-09-01 · S2 · the isolation suite leaves VERIFIED MFA factors on erin,
  frank and bob (elevateToAal2), which made three browser specs test a starting
  state they did not describe and report product bugs that were not there · a
  spec establishes its preconditions (clearMfaFactors, disposable accounts) and
  asserts transitions, never the starting state. Same lesson as the residue
  entries above, now on shared auth state rather than rows.
- 2026-09-01 · S2 · the shared local stack collided four times in one session in
  three shapes: the database reset mid-run (migrations gone, then PGRST202 from
  a stale PostgREST schema cache), the auth container recreated with the other
  worktree's config (GOTRUE_SECURITY_CAPTCHA_ENABLED=false), and seeded auth
  state left behind · the 2026-08-30 entry covers only the first. Verify the
  environment before believing a failure: `to_regprocedure(...)` for your own
  migrations and the container's actual env VALUES -- `grep -c` counting three
  matching lines says nothing about what they are set to.
- 2026-09-01 · S2 · surface-migration.test.ts extracts "string literals" by
  pairing quote characters across the whole file, so an apostrophe in a COMMENT
  flips the parity and can make an unrelated word ("shadow") read as a class
  string, failing a rule on a file the change barely touched · avoid apostrophes
  in comments in app/ and components/, or fix the extractor.
- 2026-09-01 · spec reconstruction · Ferenz 0.6 asked for `org_owner` to overlap
  with `organizer`/`mentor` via a `membership_roles` join table, and the run doc
  never carried that open question forward · DECLINED for now, one role per
  membership. Zero-to-many roles would break the 12-member cap, which excludes
  mentors by `role <> 'mentor'` — a member who also mentors would stop consuming
  a seat and a Family could reach 13. And 19 historical migrations hardcode
  `array['org_owner']::membership_role[]`, so the value cannot be dropped from
  the enum anyway. If it reopens (co-owners, ownership transfer, a real
  owner-and-organizer need), move ownership OFF the role axis —
  `organizations.owner_profile_id` — not to a join table: all 48 role-checking
  policies go through `has_org_role()` and none read `memberships.role`, so only
  that one function changes. Ferenz 0.8's test cannot be written as specified;
  that is knowingly unmet, not forgotten. Full reasoning:
  f4milia-product-narrative-and-spec.md §10.1.
- 2026-09-01 · demo→main sync · both streams numbered migrations upward from the
  same date in the same stride, so `20260903100101`, `100201` and `100301` each
  existed twice · `version` is the PRIMARY KEY of
  supabase_migrations.schema_migrations and IS the timestamp prefix, so the
  merged branch could not `db reset` at all. Neither branch showed it alone.
  Streams pick distinct minute offsets (Stream A `x01`, Stream B `x11`), and a
  cross-branch merge checks `ls supabase/migrations | sed 's/_.*//' | uniq -d`
  before anything else.
- 2026-09-01 · demo→main sync · enabling `[auth.captcha]` on main broke all nine
  cases in the other stream's tests/isolation/support-requests.test.ts, which
  predated it and signed in with no token · a config.toml change is a
  cross-stream API change. Text-merging cleanly proves nothing; the RLS gate on
  the MERGED tree is the only thing that finds this class, so run it before
  opening a sync PR, not after.
- 2026-09-01 · Wave 2 gate · PERF-1 does not reproduce and was NOT built. It was
  recorded as "`to_jsonb(new)` copies the entire row to read two scalar fields —
  measured +50% write cost on a 4 KB body, scaling with row width". Re-measured
  three ways: extraction in isolation (no audit INSERT), 3000 rows carrying an
  INCOMPRESSIBLE 4 KB body — no trigger 166–206 ms, `to_jsonb` 191–231 ms, the
  proposed dynamic-`EXECUTE` narrow read 192–599 ms; at 64 KB all three are
  indistinguishable (280–351 ms) · the +50% was the audit INSERT itself, which is
  the cost of auditing, not a defect. The original 4 KB body was almost certainly
  `repeat('x', 4096)`, which pglz crushes to nothing — a filler that compresses
  cannot measure a row-width effect. Verify a filler is incompressible
  (`pg_column_size`) before quoting a number from it, and re-measure a deferred
  perf defect before building its fix; this one would have added a per-row
  dynamic query for no gain.
- 2026-09-01 · Wave 2 gate · CD-3/CD-4 fixed (20260903100601): insert into
  audit_log and catch `foreign_key_violation`, discriminating on
  `GET STACKED DIAGNOSTICS CONSTRAINT_NAME` · nulling both columns on any
  violation passes every obvious assertion and silently drops the actor on every
  organization deletion, which is a routine path, not an edge case. The
  EXCEPTION block costs nothing measurable here (180–200 ms vs 170–208 ms
  without) — the earlier warning against it was about wrapping a whole function
  body per row, not one INSERT.
- 2026-09-01 · Wave 2 gate · adding a metadata key means editing the key
  allowlist in tests/database/050, twice, plus its prose census · that file is a
  closed-set guard by design, so a new key is a two-file change. Not a weakening
  of the test — but a fix that forgets it fails 050 with a message about content
  leaks, which points at the wrong problem.
