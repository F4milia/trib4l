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
5. Every mutation writes to audit_log. Role resolves server-side from
   the database, never from a client claim. RLS is the security model;
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
