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

---

## 1. What this buys

| | Before | After tranches A–C |
|---|---|---|
| 🔴 HARD blockers | 6 | **2** |
| 🔵 CARRIED defects | 3 | **0** |
| Sessions that cannot run as written | A5, K1 | **none** |
| New decisions required | — | **zero** |

The two 🔴 that survive are both C2's, in the other session: the `notifications`
table nobody scheduled, and the Free-plan project ceiling.

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

## 5. Tranche D — pull-forward, only if you want it

Both are another session's surface, so CLAUDE.md §4 says stop and ask rather than
proceed. Listed for completeness; recommended **against** for now.

- **F1's `search_vector` migration** (`table_entries`, `bricks`). Decision 3 ruled
  the scope, so it is buildable — but it is F1's entire migration, and building it
  here means F1 spends its session reviewing someone else's schema instead of
  writing its own.
- **N1's two carried C1 defects.** Verified: `unread_message_counts()` **takes no
  argument**, so one call spans both of a dual-Family member's Families and any
  surface summing it produces a cross-Family number — invariant 6 defeated by
  arithmetic rather than by content. The org-argument fix is mechanical; the
  read-mark fix (timestamp high-water → seq-based) is a **design choice needing a
  decision**, so the pair cannot ship as one clean PR and should not be started
  as one.

## 6. How the state claims were verified

```bash
grep -n "dsn\|dataCollection" sentry.*.config.ts instrumentation-client.ts
grep -rn "set search_path = public\b" supabase/migrations/*.sql | wc -l   # 16
grep -rn "function public.unread_message_counts" supabase/migrations/*.sql
ls public/                                    # five default SVGs, no manifest
find .claude/worktrees -name '*.test.ts*' | wc -l                        # 146
npx vitest run --exclude '.claude/**'         # 37 files, 1015 tests, green
```

## 7. Suggested order

**PR 1 → PR 2 → PR 3**, then **PR 6**, then **PR 7** once you confirm the run-doc
edit. PR 4 whenever the shared stack is free. PR 5 when the hold lifts.

PR 1 leads because decision 9 moved invariant 12 ahead of Wave 5, and F2 is now
the first code in the repo that calls a model — the gap is live, not scheduled.
PR 3 is third because it is cross-stream and W2 is waiting on it.
