# Session prompt — the Contribution & Equity Engine schema

The session the run doc never scheduled. It removes three 🔴 blockers at once:
`contribution_ledger` does not exist, `bricks` has nowhere to hold an estimate,
and K1 (Wave 8) reports on both.

| | |
|---|---|
| **Written** | 2026-09-02 |
| **Runs** | Upstream of Wave 7, before **A5**. Decision 11 |
| **Stream** | A |
| **Gate** | Merges at 09:30 with Ivan present, like A5 and A1 |
| **Formula** | Fixed by decision 6. This session implements it and decides nothing about it |
| **Verify with** | `scripts/schema-sandbox.sh`, never the shared stack |

---

## 1. Why this session exists

CLAUDE.md's opening paragraph describes the Contribution & Equity Engine as
core, and invariant 1 is entirely about it. **No session in the run doc builds
it.** A5 (Wave 7) *assists* it with AI-suggested estimates and K1 (Wave 8)
reports on it, so both assume a table that has never been created.

A5's acceptance criterion is:

> *"grep proves no AI code path writes to `contribution_ledger` numeric columns"*

**That grep passes today, vacuously, because the table does not exist.** A green
criterion that proves nothing is the exact failure mode CLAUDE.md's §6 lessons
are about, and it is why this session has to land before A5 rather than beside
it.

## 2. The formula — settled, not open

Decision 6, ruled 2026-09-02. **Standard Slicing Pie, unmodified.**

| Contribution | Multiplier | Value |
|---|---|---|
| Time | **× 2** | `hours × rate × 2` |
| Cash and expenses | **× 4** | `amount × 4` |

**The engineering rule matters more than the multipliers:** `rate_cents` and
`multiplier` **freeze onto the row at insert**, and `value_cents` derives from
that frozen pair. A later rate change applies **forward only** and can never
rewrite history. Slice percentages are computed at read time from the row values
and **never stored** — a stored percentage is a number that silently goes stale
the moment anyone else contributes.

This session implements that. It does not reopen it.

## 3. What to build

### 3.1 `contribution_ledger`

The system of record for eventual ownership. CLAUDE.md: *"treat every write to
it accordingly."*

- `org_id`, `membership_id` — keyed on membership, per C1's convention.
- `kind` — an enum: `time`, `cash`, `expense`. Not free text.
- `hours numeric` and `rate_cents integer`, both null for a cash row;
  `amount_cents integer`, null for a time row. A CHECK enforces the pairing.
- `multiplier numeric not null` — **frozen at insert**, not looked up at read.
- `value_cents bigint` — **generated**, so it cannot disagree with its inputs.
- `source_type` / `source_id` — what the contribution was for (a Brick, a Vow).
  Ids only.
- `entered_by_membership_id`, `verified_at`, `verified_by_membership_id`.
- `ai_assisted boolean not null default false` — invariant 2's marker.

**Model the fact separately from the pointer.** `verified_at` is the fact;
`verified_by_membership_id` is the pointer. **Never write a CHECK over a column
another table's FK action can null** — an `on delete set null` fires an UPDATE,
an UPDATE re-evaluates CHECK constraints, and the failure aborts the parent
delete. That exact bug made a Family undeletable once already (2026-09-01,
schema session). CHECK constraints cannot be DEFERRABLE, so there is no way out
of it after the fact.

### 3.2 The `bricks` estimate columns

Verified: `bricks` today has `description`, `due_at`, `status`, `assignee`,
`verified_by`, `verified_at` — and **nowhere to put an estimate**.

A5's first deliverable is *"suggested effort estimates at Brick creation — the
Family confirms or edits; only the confirmed number enters the ledger."* So two
columns, not one:

- `suggested_hours numeric` — what A5's model proposed. Never read by the
  formula.
- `confirmed_hours numeric` — what the Family agreed. **Only this one may
  become a ledger row.**

Separate columns, not one column with a flag. **Invariant 1 says no AI code path
writes hours that count**, and two columns make that provable by grep, which is
what A5's acceptance criterion actually asks for. One column plus a boolean
makes it a matter of reading the code correctly.

### 3.3 The deterministic slice function

`family_slices(org_id)` returning each membership's `value_cents` total and its
percentage of the Family's total.

- `SECURITY INVOKER`. **A slice is a read path**, and a definer version would
  compute over rows the caller cannot see. C1 PR4's lesson, and it matters more
  here than anywhere else in the product.
- Percentages at read time. Never stored.
- Deterministic: same rows in, same numbers out, no `now()` and no randomness.

### 3.4 The audit trigger, in the same migration

Invariant 5: `audit_row_change('row')` attached **in the migration that creates
the table**. Not afterwards. `030`'s census must be raised in the same PR, and
re-derived from the catalog rather than incremented by hand — its own comment
explains why.

### 3.5 RLS from the first migration

- A member reads their own Family's ledger.
- **No UPDATE grant on numeric columns.** RLS cannot restrict which columns an
  UPDATE writes (C1 PR4), so a member with `grant update` on their own row could
  rewrite their own hours. Corrections are a new row, not an edit — which is
  also what a system of record for ownership requires.
- The dual-Family fixture on every read path, including the aggregate.

## 4. Making the grep criterion non-vacuous

**This is the part that is easy to skip and is the whole point.**

A5's criterion currently passes because the table does not exist. After this
session it must pass *because it is true*, and it must **fail** if an AI path
ever writes those columns. Leave behind:

1. A test that greps `supabase/functions/**` and `app/**` for writes to
   `contribution_ledger`'s numeric columns and fails on a hit — a closed-set
   guard, like `tests/env-manifest.test.ts`'s invariant 2 assertion.
2. **Its negative control, run and recorded**: add a write in a scratch file,
   watch the test fail, remove it. A guard nobody has seen fail is a guard
   nobody knows works — measured twice in this repo already.
3. A pgTAP assertion that `value_cents` is generated, so it cannot be set
   directly by anyone, AI or otherwise.

## 5. Slots

Take the next free slots at the time you run, not the ones written here — the
allocation in `stream-a-unblock-plan.md` §1.1 is true as of a named commit, and
Stream B does not stop. Re-check with:

```bash
ls supabase/migrations | sed 's/_.*//' | sort | tail -1
ls supabase/tests/database | sort | tail -1
```

Migrations ship standalone (CLAUDE.md §3), so the ledger, the `bricks` columns
and the slice function are three PRs, not one.

## 6. Acceptance

- [ ] `contribution_ledger` exists, with `value_cents` generated from frozen
      `rate_cents` and `multiplier`.
- [ ] A rate change on a membership does **not** alter any existing row's
      `value_cents`. Asserted, because this is the property the whole design
      exists for.
- [ ] `bricks.suggested_hours` and `bricks.confirmed_hours` both exist, and only
      the confirmed one is read by anything that computes value.
- [ ] `family_slices()` is `SECURITY INVOKER` and returns percentages that sum
      to 100 for a Family with contributions.
- [ ] Deleting a Family that has ledger rows succeeds — the constraint shape
      does not make it undeletable.
- [ ] The audit trigger is attached in the creating migration, and `030`'s
      census is re-derived.
- [ ] The AI-write guard exists **and has been seen to fail** with a deliberate
      violation present.

## 7. What this session must not do

- **Not touch `ledger_events`.** It exists (`id, org_id, event_type, payload,
  created_at`), nothing writes to it, and no session in the run doc does. It is
  not the contribution ledger and conflating the two would give the engine a
  table with no writer.
- **Not implement the AI suggestion path.** That is A5's, and it arrives after
  A1 establishes Edge Function isolation.
- **Not decide the formula.** Decision 6 settled it.
- **Not resolve decision 13** (Ledger durability on Supabase Free, which has no
  point-in-time recovery). Flag it in the PR: this session creates the table
  that decision is about, so it is the right moment to ask, and the wrong moment
  to guess.
