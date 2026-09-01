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
| **Companion** | `secrets-and-env.md` — every key James configures, which store it belongs in, and why invariant 2 decides that · `c2-pr-plan.md` — the detail behind tranche 0 |
| **Numbering** | **`PR n`** is this plan's own. **`C2 PR n`** is `c2-pr-plan.md`'s. Two schemes, kept distinct on purpose |

---

## 1. What this buys

| | Before | After tranches A–C + E |
|---|---|---|
| 🔴 HARD blockers | 6 | **2** |
| 🔵 CARRIED defects | 3 | **1**, and it is a decision rather than a fix |
| Sessions that cannot run as written | A5, K1 | **none** |
| Wave 4 (N1) | 5 blockers | **keys only** — C2 tranche 0 lands the table |
| New decisions required | — | **one** (the read mark, §5.1) |

The two 🔴 that survive are both C2's, in the other session: the `notifications`
table nobody scheduled, and the Free-plan project ceiling.

**On Wave 4 specifically.** Tranche E takes N1 from *"cannot start"* to *"waiting
on five values and one C2 table."* Everything that can be built without your keys
is built and lands **inert** — the app boots, the suite passes, and nothing sends
— so the day the keys exist, N1 is configuration rather than construction.

### 1.1 · Constraints that apply to every PR here

Recorded because an earlier draft of this plan omitted all four, and each is the
kind of thing that surfaces as a mysterious failure rather than as a warning.

**A QA document per code PR.** Standing workflow §8: `docs/qa/<SESSION_ID>.md`
from `_TEMPLATE.md`, before the PR opens, capped at 15 steps, using only the named
seed fixtures, with a Regression section naming the behaviours most likely
disturbed. Ten of the thirteen PRs here are code, so **that is ten QA documents** —
real work, not a formality, and it was unbudgeted until now. The docs-only PRs
(8, 6, 7) follow `#92`'s precedent and ship without one.

**Three PRs contend for the shared Supabase stack.** PRs **4, 10 and 13** all need
isolation tests, and isolation needs GoTrue and PostgREST — which
`scripts/schema-sandbox.sh` does not have. Only PR 2 can be verified entirely in
the sandbox. So those three have to be scheduled against Stream B's activity, one
at a time, and a green run proves nothing unless your own migration version is
present in `supabase_migrations.schema_migrations` first.

**Nine PRs add migrations, across both plans, into one lane.** PRs **2, 10, 13**
here and **C2 PRs 1–6** are all Stream A migrations. `version` is the primary key
of `schema_migrations`, so a duplicate makes the merged branch unable to reset at
all — and neither branch shows it alone. C2's plan reserved a range independently
and **it went stale**: its `20260903100801` is free but sits *below* the branch max
`20260903101311`, and its reserved pgTAP `140`+ is fully taken by Stream B's
`140_brick_release_on_departure` through `190_qa_fixtures`.

So the allocation lives **here, once, for both plans** — verified against the tree
at `b28d6c7`, max migration `20260903101311`, max pgTAP `190`:

| Order | PR | Migration | pgTAP |
|---|---|---|---|
| 1 | **PR 2** · definer `search_path` | `20260903101401` ✅ landed | `200` ✅ |
| 2 | C2 PR 1 · Realtime Authorization | `20260903101501` | `210` |
| 3 | C2 PR 2 · Schema (5 tables, threading, enum, `030`) | `20260903101601`–`101605` | `220`–`260` |
| 4 | C2 PR 3 · Storage + project guard | `20260903101701` | `270` |
| 5 | **PR 10** · `push_subscriptions` | `20260903101801` | `280` |
| 6 | **PR 13** · `unread_message_counts(org)` | `20260903101901` | `290` |

**Revised once already, and the reason generalises.** The first version of this
table allocated by the *plan's* suggested order, which put C2 first. Execution
took the unblocking PRs first instead, and a migration must carry a version
ABOVE everything already applied — so numbering by planned order rather than by
landing order would have produced the same out-of-order defect this table was
created to fix, one layer up. **Allocate by the order things actually land.**

C2 PR 4 (data access and UI) adds no migration.

Stream B's `x11` offset at each of those minutes stays free, which is the point of
the offset convention.

**This table is true as of a named commit, not forever.** Stream B overtaking C2's
reservation is exactly what happened once already — so re-check the branch max
immediately before writing each file, not when reading this plan.

**Two PRs touch brand surface.** PRs 3 and 9 (icons, and anything user-visible in
the manifest) require re-reading `f4milia-design-system.md` first, and stating
which sections of the design language the PR actually applies.

## 2. Tranche 0 — C2, which runs before all of it

C2 is Wave 3, next due, and it builds the `notifications` table and the
`'mention'` enum value that **N1 cannot start without and no other session
creates.** That is why it sits ahead of everything below rather than beside it.

**Its plan is `c2-pr-plan.md`, revised on `main` (`1e1c49b`) by another session
into four PRs with every decision closed.** That revision is better than the one
this plan originally assumed, in a way worth recording: it establishes that **the
per-Family quota is measured across *all* attachment buckets, not per feature.**
M1 (Wave 5) reuses the pattern for Table entry photos and Brick attachments
*"same quotas, same caps"* — so a per-feature quota would give each Family a
second 100 MB and blow the 1 GB plan before Wave 6. Nothing in this plan's own
storage reasoning had caught that.

**Sequence: C2 PR 1 → 2 → 3 → 4.**

| C2 PR | What | Migration | pgTAP |
|---|---|---|---|
| 1 | Realtime Authorization — the C1 carried debt | `20260903101401` | `200` |
| 2 | Schema — 5 tables, threading, `'mention'`, `030` recompute | `101501`–`101505` | `210`–`250` |
| 3 | Storage — bucket, RLS, caps, **and the project guard** | `20260903101601` | `260` |
| 4 | Data access and UI | — | — |

**What this plan contributed back to it:** the slot allocation above. C2's own §5
reserved `20260903100801`+ and pgTAP `140`+ and said so having *verified against
`origin/main`, not predicted* — but Stream B landed `table_entries`, `vows`, the
streak and the seed fixtures afterwards, so the migration slot fell **below** the
branch max (`20260903101311`, an out-of-order apply) and pgTAP `140`–`190` became
fully occupied. Corrected in both documents, and the allocation now lives in one
place because two plans allocating the one lane independently is what caused it.

**Still open inside C2:** decision 14 — how the 8-Family cap is enforced — which
lands on PR 3, since nothing in the repo limits how many Families exist and an
`organizations` INSERT can break the storage ceiling with no upload involved.

## 3. Tranche A — do now, no decisions

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

**🟠 The icons are a gap I cannot close myself.** Verified: the only brand asset
in the repo is `app/favicon.ico`, the Next.js default. A PWA manifest needs 192px
and 512px icons to be installable at all, so *something* must exist for the shell
to be testable — but designing an app mark is a brand decision, and CLAUDE.md
rules out inventing placeholders that read as real.

The shape I recommend: ship the shell with a **provisional mark built only from
locked tokens** — the masonry motif on Deep Slate, zero radius, no lettering
invented — labelled provisional in the PR and in the manifest's own comment, and
**tracked as decision 16**. That keeps the shell installable and testable now
without quietly making a brand decision on your behalf. The alternative is you
supply a mark and PR 3 waits.

**Design:** re-read `f4milia-design-system.md` before touching either. Zero
border-radius, Parchment / Deep Slate, no SaaS blues, and state which sections of
the design language the PR actually applies — per the scripted-migration lesson, a
PR that converts surfaces without applying the language has not finished the
session's job.

## 4. Tranche B — make the test signal honest

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

## 5. Tranche C — close the structural gaps, docs only

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

**Flag — and it is bigger than I first wrote it.** Read directly against the run
doc: W2's deliverables include *"PWA: installable, app icon, offline-tolerant
shell"* (line 402), its commit line is `feat: legal page shells, first-run, PWA`,
and its named edge case is *"Complete first-run inside the installed PWA, not a
browser tab."* So amendment 2 does not merely add a note to Wave 4 — **it rewrites
a Stream B session's deliverable list and its acceptance criteria.**

That needs Stream B's awareness, not only your approval. Amendments 1, 3 and 4 are
Stream A's own and can go ahead on your word alone; amendment 2 should not land as
a surprise in the other stream's prompt.

## 6. Tranche E — make Wave 4 runnable

N1's blockers, worked from the outside in. The two that are yours stay yours; what
lands here is the plumbing they drop into, built so that **every unset key is a
clean no-op rather than a crash**.

### PR 8 · ~~The `notifications` interface C2 must build~~ — **folded into C2 PR 3**

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

**Superseded.** C2's own plan already assigns *"`notifications` + `'mention'` enum
value"* to **C2 PR 3**, explicitly so that *"N1 inherits this table"* rather than
finding it buried in a mentions feature. A standalone spec document would have been
a second description of one table, and two specs for one table is how they drift.

The content survives as **`c2-pr-plan.md` §5.5** — what N1 needs from the table,
written before it is built, including the ruling that **C2 owns the `'mention'`
enum value** and N1 adds none. That ambiguity, left alone, is how an enum gets
extended twice.

C2 not having started is what made folding it in possible rather than too late.

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

### 6.1 · The one thing in Wave 4 I cannot decide

The read mark is a **timestamp high-water**, so a message that commits after the
mark but carries an earlier `created_at` is counted as read without ever being
seen. This is the sibling of the `audit_log.created_at` lesson: `now()` is
transaction time, so ordering by it is not ordering by arrival.

The fix is a design choice — a `seq`-style monotonic column on `messages`, or
per-message read receipts — and the two differ in cost and in what they can
answer later. **Raised as decision 15** rather than picked here, because a
notification center built on the wrong one is expensive to move.

## 7. Tranche D — pull-forward, still recommended against

- **F1's `search_vector` migration** (`table_entries`, `bricks`). Decision 3 ruled
  the scope, so it is buildable — but it is F1's entire migration, and building it
  here means F1 spends its session reviewing someone else's schema instead of
  writing its own.

## 8. How the state claims were verified

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

## 9. Suggested order

**Tranche 0 first, whole.** C2 PRs 1–8, in its own order. Nothing below is more
urgent than the `notifications` table, because N1 cannot start without it and no
other session builds it.

Then **PR 1 → PR 2 → PR 3** — the overdue invariant and the two things other
sessions are waiting on. PR 1 leads that group because decision 9 moved invariant
12 ahead of Wave 5 and F2 is now the first code in the repo that calls a model, so
the gap is live rather than scheduled. PR 3 follows because it is cross-stream and
W2 is blocked on it.

Then the Wave 4 chain: **PR 9 → PR 10 → PR 11 → PR 12 → PR 13**, with PR 9 first so
every key the others read is already recorded and guarded.

Then **PR 6**, and **PR 7** once you confirm the run-doc edit and Stream B knows
about amendment 2. PR 4 whenever the shared stack is free. PR 5 when the hold lifts.

**PR 8 is gone** — folded into C2 PR 3.

Nothing in this order waits on decisions 4, 5, 7, 13, 15 or 16. Decision 14 lands
inside C2 PR 6; decision 16 lands inside PR 3, where a provisional token-only mark
keeps it moving.
