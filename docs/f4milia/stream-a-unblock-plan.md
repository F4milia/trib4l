# Stream A — the unblock plan

What can be built **now**, before the next session, to remove blockers from
`stream-a-blockers.md`.

| | |
|---|---|
| **Written** | 2026-09-02 |
| **Against** | `stream-a-blockers.md` as of `f2e6d72` (PR `#95`) |
| **Selection rule** | Every PR in tranches A–C needs **no decision from James**. The four open decisions block none of it |
| **PR sizing** | By natural cohesion, not by a line cap — CLAUDE.md's 200-line rule is waived here at James's instruction. **§3 still stands: migrations ship standalone**, so PR 2 stays on its own |
| **Verified** | Every state claim below was re-checked against the working tree rather than read off the blockers doc. Commands in §6 |
| **Companion** | `secrets-and-env.md` — every key James configures, which store it belongs in, and why invariant 2 decides that |

---

## 1. What this buys

| | Before | After tranches A–C + E |
|---|---|---|
| 🔴 HARD blockers | 6 | **2** |
| 🔵 CARRIED defects | 3 | **1**, and it is a decision rather than a fix |
| Sessions that cannot run as written | A5, K1 | **none** |
| Wave 4 (N1) | 5 blockers | **keys and one C2 table** |
| New decisions required | — | **one** (the read mark, §5.1) |

The two 🔴 that survive are both C2's, in the other session: the `notifications`
table nobody scheduled, and the Free-plan project ceiling.

**On Wave 4 specifically.** Tranche E takes N1 from *"cannot start"* to *"waiting
on five values and one C2 table."* Everything that can be built without your keys
is built and lands **inert** — the app boots, the suite passes, and nothing sends
— so the day the keys exist, N1 is configuration rather than construction.

## 2. Tranche A — do now, no decisions

### PR 1 · Invariant 12 — Sentry DSN to the environment, `dataCollection` explicitly off

**Removes:** §6's 🔴. CLAUDE.md dates this *before* the first AI session, and
decision 9 moved that forward to **before Wave 5**, so it is the most overdue
item on the list.

**Verified state:** the same production DSN is hardcoded in all three configs
(`sentry.server.config.ts:8`, `instrumentation-client.ts:8`,
`sentry.edge.config.ts:9`), and `dataCollection` is present in all three with
**every option commented out** — so all three inherit the permissive defaults,
genAI inputs and outputs included.

**Shape:** one PR covering all three configs plus its guard test. Cohesive
because the three files must not diverge — a fix applied to two of three is the
bug.

- DSN from `process.env`. Unset means Sentry no-ops, which is the correct CI and
  staging behaviour and the reason the env var beats a committed constant.
- Every `dataCollection` option written explicitly `false` — not commented, not
  omitted. Invariant 12 names `userInfo`, `httpBodies`, and genAI input/output.
- Guard test: no string matching `ingest.*sentry\.io` anywhere in the configs,
  and every `dataCollection` key present and explicitly false. The test is the
  durable part — a future session re-adding a DSN has to delete an assertion.

**Needs from James:** `SENTRY_DSN` in the Vercel environment, or leave it unset
and Sentry stays dark until you set it.

### PR 2 · Migration — `search_path` / `pg_temp` on the definer functions

**Removes:** §6's 🔵 carried defect. **Verified: 16 functions** pin
`set search_path = public`, leaving `pg_temp` implicitly **first** for relation
lookups — and they include `is_org_member()` and `has_org_role()`, which every
C1 policy and all 48 role-checking policies call.

**Shape:** standalone, per CLAUDE.md §3 — this is the one place the waiver does
not apply, because a migration that has to be reverted should not drag TypeScript
with it.

- One migration of `alter function ... set search_path = public, pg_temp` — **not**
  16 `create or replace` statements. ALTER changes the setting without touching a
  single function body, so the diff is 16 near-identical lines instead of 16
  function definitions re-pasted, and a body cannot be altered by accident.
- pgTAP test asserting every `SECURITY DEFINER` function in `public` names
  `pg_temp`, and names it **last**. A closed-set guard, so a new definer function
  missing it fails the suite.
- Verify through `scripts/schema-sandbox.sh`, never by resetting the shared local
  stack — that database belongs to whoever is mid-session, and the collision
  presents as flaky tests rather than as a collision.
- Migration version takes Stream A's `x01` minute offset, per the
  duplicate-version lesson.

**Latent, not live** — no client path runs DDL today — so this is hardening, not
an incident. It is on the list because A1's entire gate is that its context
assembler cannot reach another Family, and it reaches through these functions.

### PR 3 · The PWA shell

**Removes:** §4's 🔴 — N1's only hard blocker. Decision 10 already ruled that this
ships as its own PR **before** Wave 4, so this is decided work waiting to be done.
**Verified:** `public/` holds five Next.js default SVGs and nothing else — no
manifest, no icons, no service worker.

**Shape:** one PR for manifest, icons, worker, registration and tests. With the
line cap gone this can carry the full icon set and the accessibility pass rather
than landing as a stub that a later PR finishes.

- `public/manifest.webmanifest`, the icon set, and a **registered but empty**
  service worker. No push logic whatsoever: N1 adds only a `push` handler to a
  file that already exists.
- Registration wired through `app/layout.tsx` metadata.
- Test: the manifest parses, the worker registers, and the worker contains no
  push or notification code — so N1's addition shows up as a reviewable diff
  rather than as an edit to something already half-built.

**Cross-stream:** W2 (Stream B, Wave 4) builds its PWA UI on this. Coordinate
before merging; this is the file both sessions were otherwise going to create,
which is the collision decision 10 exists to prevent.

**Design:** icons are brand surface, so re-read `f4milia-design-system.md` first.
Zero border-radius, Parchment / Deep Slate, no SaaS blues, and state which
sections of the design system the PR actually applies — per the scripted-migration
lesson, a PR that converts surfaces without applying the language has not finished
the session's job.

## 3. Tranche B — make the test signal honest

Neither PR here fixes a product blocker. Both fix the instruments, and every PR
after them inherits the benefit. They are **split despite both being test
infrastructure** — not for size, but because one of them is on hold and the other
should not wait behind it.

### PR 4 · Unenrol MFA factors in the two specs that leave them

`tests/isolation/invitations.test.ts` and `platform-admin.test.ts` **fail on a
second consecutive run with no reset** — pre-existing and already recorded in
CLAUDE.md. Both leave verified MFA factors behind, and GoTrue then refuses enrol
from aal1. Q4's edge case (*"run the suite twice; run 2 passes on run 1's
residue"*) is therefore **already red, four waves before Q4**.

Fix: unenrol while the spec still holds aal2 — the only window in which it can.
**Needs the shared stack**, so coordinate with Stream B before starting.

### PR 5 · vitest exclude globs — **ON HOLD at James's instruction**

`vitest.config.mts` excludes `tests/isolation/**` and `tests/e2e/**` as
**root-anchored** globs while `.claude/worktrees/` lives inside the repo, so
`npm test` collects **146** test files from the two worktrees — isolation suites
included — and runs Stream B's `video_assets` suite against main's database.
73 test files in this tree; 146 in the worktrees.

Fix: prefix each exclude with `**/`, add `.claude/**`, plus a test asserting
nothing outside the repo's own test roots is collected.

Until this lands, the Stop hook and `npm test` both report failures that are not
this tree's, and the only honest command is
`npx vitest run --exclude '.claude/**'`.

## 4. Tranche C — close the structural gaps, docs only

### PR 6 · Write the equity-engine schema session

**Removes three 🔴 at once:** §7's missing `contribution_ledger`, §7's missing
`bricks` estimate column, and §8's K1 dependency on both. Decision 11 slotted the
session upstream of Wave 7 and decision 6 fixed the formula, so **the only thing
missing is the prompt** — and writing it needs no new decision.

**Shape:** one document, written as a full session prompt rather than an outline.
With the cap gone it can carry the DDL sketch, the test list and the acceptance
criteria in one place, which is what makes it runnable by a session that has not
had this conversation.

It must specify:

- `contribution_ledger` with `hours`, `rate_cents`, `multiplier` and a derived
  `value_cents`, the rate and multiplier **frozen at insert** per decision 6.
  Slice percentages computed at read time, never stored.
- `bricks` estimate columns modelled as **fact separate from pointer** — the
  `verified_at` / `verified_by` lesson: never a CHECK over a column that another
  table's FK action can null, because an UPDATE re-evaluates CHECKs and CHECKs
  cannot be deferred.
- `audit_row_change()` attached **in the same migration that creates the table**
  (invariant 5), with the resolution mode named.
- RLS from the first migration, and the dual-Family fixture exercised on every
  read path — including any derived COUNT, per the `unread_message_counts()`
  lesson that an aggregate is a read path too.
- **The grep acceptance criterion made non-vacuous.** *"grep proves no AI code
  path writes to `contribution_ledger` numeric columns"* passes today only because
  the table does not exist. The session must leave behind a test that would
  **fail** if an AI path wrote those columns. Otherwise Wave 7 inherits a green
  criterion that proves nothing — the exact failure mode CLAUDE.md's §6 lessons
  are about.

### PR 7 · Run-doc amendments the decisions already imply

Four edits, each already ruled, none yet written where the session that needs it
will read it. Kept separate from PR 6 **because it needs your confirmation** and
PR 6 does not — folding them would make the session prompt wait on a gate it
does not need.

1. **A1's gate widens to all of `supabase/functions/`**, F2's embedding function
   included. This is condition 3 of decision 9, and CLAUDE.md's own lesson is
   that a note the session cannot read is a note that does not exist.
2. **Wave 4:** the PWA shell precedes N1; W2 adopts rather than creates.
3. **Wave 5:** F2 owns the first Edge Function, under decision 9's four
   conditions.
4. **Wave 7:** the equity schema session sits upstream.

**Flag:** this edits `F4milia — Complete Run Doc (Prompts Included).md`, a
governing doc. Confirm before I touch it.

## 5. Tranche E — make Wave 4 runnable

N1's blockers, worked from the outside in. The two that are yours stay yours; what
lands here is the plumbing they drop into, built so that **every unset key is a
clean no-op rather than a crash**.

### PR 8 · The `notifications` interface C2 must build

**Docs only, and first in this tranche because C2 is the next session to run.**
Verified: there is no `notifications` table anywhere in the migrations, and
`notification_type` has exactly two values — `family_night_digest` and
`vow_notification`.

C2's acceptance is *"a mention writes a notification row"*, so C2 builds the
table. N1 then reads it, adds delivery, and needs it to have been built the right
way the first time. This document states what N1 requires: columns, the
`'mention'` enum value, RLS shape, the audit trigger in the creating migration,
and **who owns the enum extension** — E1's migration comment reserves it for N1,
but C2 needs it a wave earlier, and that ambiguity is how a table gets built
twice.

No table is built here. This exists so N1 does not discover a mismatch in Wave 4.

### PR 9 · Environment manifest

`.env.example` carrying every key from `secrets-and-env.md`, grouped by wave and
by store, with the public/private split explicit.

The guard test is the reason this is a PR and not a file:

- every `process.env.X` referenced in `app/` or `lib/` appears in `.env.example`,
  so a key cannot be introduced without being recorded;
- **no key on the private list carries a `NEXT_PUBLIC_` prefix.** That single
  assertion is invariant 2 enforced at the environment layer, one build step
  earlier than A1's grep of the bundle.

### PR 10 · Migration — `push_subscriptions`

Standalone, per §3. Keyed on **`membership_id`**, not `profile_id` — the C1
convention, and the same reasoning that put `message_reactions` on its own table.

- Unique on the endpoint; a stale endpoint is deleted rather than retried forever.
- RLS: a member reads and writes only their own subscriptions. No `grant update`
  on the table — one `SECURITY DEFINER` function writes the mutable column, per
  the C1 PR4 lesson that RLS cannot restrict *which columns* an UPDATE touches.
- `audit_row_change()` attached in the same migration (invariant 5).
- pgTAP plus the dual-Family fixture.

### PR 11 · Web push plumbing, VAPID-ready and inert

- `lib/push/` reads `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
  `VAPID_SUBJECT` from the environment and reports **"not configured"** when they
  are unset. Import must never throw: an unset key is a disabled feature, not a
  boot failure, or every test in CI needs your secrets.
- The subscribe call, and a send helper wrapping `web-push`.
- **The payload builder is the invariant 3 guard, and the test is the deliverable:**
  a push body may name the event and never the content. Assert that a Table entry's
  text, a message body, and a member name cannot reach a payload — with a fixture
  that would fail if someone later interpolated one in. Invariant 3 assumes the
  device may be someone else's, so this is the one test in the PR that matters most.
- Keygen command and rotation warning are in `secrets-and-env.md` §3.

### PR 12 · Inngest scaffolding, inert without keys

Install, `lib/inngest/client.ts`, the `app/api/inngest/` route, and one trivial
function that proves the wiring.

Test: the route mounts and the app boots with `INNGEST_EVENT_KEY` and
`INNGEST_SIGNING_KEY` unset, and **nothing is sent** in that state. Same principle
as PR 11 — unconfigured is a no-op, never an exception.

**This pulls N1's install forward**, which CLAUDE.md §4 would normally stop for.
Authorised by your instruction to prepare the template code.

### PR 13 · `unread_message_counts(check_org_id uuid)`

Removes a 🔵. Verified: the function **takes no argument**, so one call spans both
of a dual-Family member's Families, and any surface summing it reports a
cross-Family number — invariant 6 defeated by arithmetic rather than by content,
which is exactly why a notification badge is the wrong place to discover it.

- Add the org argument. **Keep `SECURITY INVOKER`** — the C1 PR4 lesson is that an
  aggregate over RLS-protected rows is itself a read path, so a definer version
  would count messages the viewer cannot see and leak a blocked member's volume
  through a number.
- Isolation test asserting per-Family counts for the dual-Family fixture, and
  asserting the count against the **visible-row count** rather than a constant.

### 5.1 · The one thing in Wave 4 I cannot decide

The read mark is a **timestamp high-water**, so a message that commits after the
mark but carries an earlier `created_at` is counted as read without ever being
seen. This is the sibling of the `audit_log.created_at` lesson: `now()` is
transaction time, so ordering by it is not ordering by arrival.

The fix is a design choice — a `seq`-style monotonic column on `messages`, or
per-message read receipts — and the two differ in cost and in what they can
answer later. **Raised as decision 15** rather than picked here, because a
notification center built on the wrong one is expensive to move.

## 6. Tranche D — pull-forward, still recommended against

- **F1's `search_vector` migration** (`table_entries`, `bricks`). Decision 3 ruled
  the scope, so it is buildable — but it is F1's entire migration, and building it
  here means F1 spends its session reviewing someone else's schema instead of
  writing its own.

## 7. How the state claims were verified

```bash
grep -n "dsn\|dataCollection" sentry.*.config.ts instrumentation-client.ts
grep -rn "set search_path = public\b" supabase/migrations/*.sql | wc -l   # 16
grep -rn "function public.unread_message_counts" supabase/migrations/*.sql  # no args
grep -ril "inngest" app lib package.json          # empty
grep -ril "vapid\|web-push" app lib package.json  # empty
grep -rn "create table.*notifications" supabase/migrations/*.sql          # empty
grep -rn -A4 "create type.*notification_type" supabase/migrations/*.sql   # two values
ls public/                                    # five default SVGs, no manifest
find .claude/worktrees -name '*.test.ts*' | wc -l                        # 146
npx vitest run --exclude '.claude/**'         # 37 files, 1015 tests, green
```

## 8. Suggested order

**PR 8 first of everything** — it is docs, and C2 is the next session to run, so
the `notifications` spec has to exist before C2 builds the table rather than after.

Then **PR 1 → PR 2 → PR 3**, the overdue invariant and the two things other
sessions are waiting on. PR 1 leads because decision 9 moved invariant 12 ahead of
Wave 5 and F2 is now the first code in the repo that calls a model — that gap is
live, not scheduled. PR 3 is third because it is cross-stream and W2 is blocked
on it.

Then the Wave 4 chain: **PR 9 → PR 10 → PR 11 → PR 12 → PR 13.** PR 9 before the
rest so that every key those PRs read is already recorded and guarded.

Then **PR 6**, and **PR 7** once you confirm the run-doc edit. PR 4 whenever the
shared stack is free. PR 5 when the hold lifts.

Nothing in this order waits on decision 15 — PR 13 fixes the org argument, and the
read mark stays as it is until you rule.
