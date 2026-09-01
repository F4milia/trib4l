# D1 — readiness

What D1 needs, what has been built for it, and what is left. Wave 2 · Stream B.

Not a session record — D1 has not run. This is the document that says why, and
what has to be true before it can.

| | |
|---|---|
| **Written** | 2026-09-01 |
| **Session** | `F4milia — Complete Run Doc`, Wave 2, Stream B |
| **D1's status** | **Not started.** No branch, no PR in any state |
| **Blocked by** | Four tables it reads do not exist on `main`, and its acceptance criterion needs seeded rows in all of them |
| **Distance** | 4 of 7 tables built (1 merged, 3 on `schema/bricks` awaiting one PR); 2 unwritten; seed unextended |
| **Last verified** | 2026-09-01 — pgTAP 375 pass / 17 files on `schema/bricks` from a clean reset |

---

## 1. Why this document exists

D1's prompt says:

> Read-only UI over existing tables — **no migrations in this session.**

The tables it means do not exist. And that is not an oversight in D1's prompt —
it is a gap in the run doc, which schedules **no session that creates the
F4milia domain model.**

The evidence is one grep. Across all 731 lines of
`F4milia — Complete Run Doc (Prompts Included).md`, the phrase **`Design and
migrate` appears exactly once** — line 273, C1, for `conversations` and
`messages`. Nothing else in the document creates a table.

Meanwhile eight sessions read tables nobody builds:

| Session | Reads |
|---|---|
| **D1** | Table prompt status, Bricks, Tower progress, Vow holder, streak, Ledger |
| **D2** | *"Pure UI over existing tables"* — Bricks, Vow rotation, Brick due windows |
| **F1** | search *"over posts, comments, Bricks, and Ledger events"* |
| **M1** | photos on Table entries, attachments on Bricks |
| **A2** | drafts a *"Build/Brick breakdown"*; accepted Bricks *"enter the normal lifecycle"* |
| **A5** | *"effort estimates at Brick creation"*, and greps `contribution_ledger` |
| **K1** | *"a completed Build or Tower's full history — Bricks, contributors, Ledger events"* |
| **Q4** | *"Tower defined → AI Brick draft accepted → Brick claimed, worked, peer-verified → slice accrues"* |

So the schema work in Stream B is not a detour. It is the precondition the run
doc never scheduled, and D1 is simply the first session to hit it.

**Two related defects in the same document**, found while resolving this and
recorded here because nothing else records them:

- **`W1` has no prompt.** It is named twice — the wave table (line 103) and
  E1's conditional (line 243) — and defined nowhere. Line 243 says to run "W1
  from Wave 4's Stream B", but Wave 4's Stream B is **W2**. Had V1 shown email
  already present, E1's fallback session would not have existed.
- **`contribution_ledger` is never created either.** A5's acceptance criterion
  greps it. The run doc's standing decisions gate *"any PR touching the equity
  ledger"* on Ivan, and the spec's §10.2 records that nothing before Wave 7 reads
  that table — so the domain model can be built without it and the equity table
  can follow. Noted so it is not discovered in Wave 7.

## 2. What D1 needs, element by element

Its prompt names six things. Status as of this writing:

| # | D1 element | Needs | Where it is |
|---|---|---|---|
| 1 | Recent Ledger highlights | `ledger_events` | ✅ **on `main`** |
| 2 | Their claimed Bricks with due windows | `bricks` | ⚠️ built, verified — **stranded on `schema/builds`** |
| 3 | Tower progress as stacked masonry | `towers`, `builds` | ⚠️ built, verified — same branch |
| 4 | Today's Table prompt status | `organizations.table_prompt_time` + `timezone`, and `table_entries` | ◐ half — the schedule columns are **on `main`** (E1 #18); `table_entries` unwritten |
| 5 | The streak | a definition, then a table or a derived query | ◐ **defined** in the spec, unbuilt |
| 6 | The current Vow holder | `vows` | ❌ unwritten, **and its shape is an open question** |

Plus D1's acceptance criterion, which is a seventh requirement in its own right:

> **every element reflects live seeded data.**

`supabase/seed.sql` is 60 lines and inserts into five tables — `organizations`,
`auth.users`, `memberships`, `org_profiles`, `platform_staff`. **It contains no
domain data at all.** Not one Tower, Brick, Vow, Table entry or Ledger event. So
even with every table merged, all six elements would render their empty state.

## 3. Steps already taken

In order, and each one because D1 could not proceed without it.

**The spec did not exist.** Pre-flight item 4 requires
`f4milia-product-narrative-and-spec.md` to be present in the repo the worktrees
check out, and warns why: *"A prompt whose required reading is missing produces
a session that invents the constraints."* No session produces it — pre-flight is
explicitly *"Not Claude Code sessions."* It was reconstructed from the two prompt
documents with inline citations (**F1.1** = Ferenz, **J4.2** = James), the
narrative half deliberately thin because inventing product to fill it is the
failure mode the document exists to prevent. Merged as **#49** and **#51**.

**The role model was an unresolved question that schema depends on.** Ferenz 0.6
asked for `org_owner` to overlap with `organizer`/`mentor` through a
`membership_roles` join table; the run doc never carried the question forward.
Settled as **one role per membership** — zero-to-many roles breaks the 12-member
cap, which excludes mentors by `role <> 'mentor'`, so a member who also mentors
would stop consuming a seat and a Family could reach 13. Recorded with its
reasoning in the spec's §10.1 and in CLAUDE.md, including the escape route if it
reopens (move ownership to `organizations.owner_profile_id`, not to a join table
— all 48 role-checking policies go through `has_org_role()`).

**Four tables built, as four independently-green PRs.**

| PR | Table | The decision worth knowing |
|---|---|---|
| **#58** | `ledger_events` | Append-only enforced at the **grant** layer — no UPDATE or DELETE for anyone, service_role included. A policy can be widened by a later migration that reads reasonably in isolation; a missing grant refuses the statement outright |
| **#59** | `towers` | `organizations.active_tower_id` uses a **composite FK** `(active_tower_id, id) → towers (id, org_id)`, so Family A cannot point at Family B's Tower. A plain FK would allow it and RLS could not catch it, because the pointer itself is legitimate. Plus a partial unique index enforcing one active Tower per Family |
| **#60** | `builds` | `org_id` denormalised for policy cost, kept honest by `(tower_id, org_id) → towers (id, org_id)` |
| **#61** | `bricks` | Peer verification enforced by CHECK, not by code path — `verified_by <> assignee`, and `done` requires verification. Three composite FKs, because a Brick assigned to somebody in another Family is a real row with valid ids that RLS sees nothing wrong with |

**One open question answered along the way.** §10.7 asked whether
`bricks.due_window` is a range, a deadline, or a duration. It is stored as
**`due_at timestamptz`** — a deadline. F4.5 compares against it ("exceeds its
`due_window`"), which is an instant comparison, and a column called *window*
holding a single instant misleads every future reader. A deliberate departure
from the prompt's wording.

**A test that could not fail was replaced (#62).** `030`'s trigger assertion used
`count(distinct tgname)`, which counts trigger *names* — two tables sharing a
name would collapse and the total would still pass. Worse, a running total is
the wrong shape for invariant 5: it goes stale on every new table and never says
*which* table is missing its trigger. Replaced with a census that names the
offending tables, and proved it can fail by creating an unaudited table and
watching it fail.

## 4. Steps remaining

In dependency order. Steps 1 and 2 need no new design.

**1 — Land the stranded schema work.** `main` holds `ledger_events` only.
Merging the stack base-first left each child in a parent that had already gone
up, so `towers`, `builds` and `bricks` never reached the trunk — see §6.

`schema/bricks` is now rebased on `main` and carries all three plus the fixes in
step 2, so the recovery is **one PR, `schema/bricks` → `main`**, not four.

Two things had to be repaired to get there. Stream A's `20260903100601`
(CD-3/CD-4) collided with `towers`' own `20260903100601` — the same
duplicate-`version` collision as `#55`, and my schema stack was itself in
Stream A's `x01` slot rather than the `x11` slot the convention reserves for
Stream B. Renumbered to `x11`/`x12`. And `CLAUDE.md` needed both streams'
Learned-constraint blocks kept.

**2 — Organization deletion: three defects deep, now fixed.** ✅ *Resolved
2026-09-01.* Worth reading in full, because each fix only revealed the next.

**(a)** A CHECK on `verified_by is not null` aborted the cascade. `on delete set
null` fires an UPDATE, an UPDATE **re-evaluates CHECK constraints**, and CHECKs
cannot be `DEFERRABLE` — so the fix was the data model: constrain `verified_at`,
the *fact*, not `verified_by`, the *pointer*. A verification is a historical
event; the person leaving does not stop it having happened.

**(b)** `audit_row_change()` then aborted it on `audit_log_org_id_fkey`, because
it pre-checked the org's existence only `if tg_op = 'DELETE'` and the membership
cascade fires an UPDATE. **Fixed independently on `main` by Stream A**
(`20260903100601`, CD-3/CD-4), which inserts and catches `foreign_key_violation`
on any `tg_op`. Two streams reached the same defect from opposite ends within an
hour.

**(c)** With both fixed it *still* failed — and the root cause was mine, in two
migrations. **`ON DELETE SET NULL` on a composite foreign key nulls EVERY
referencing column, not the one you meant.** Measured:

| Constraint | What a bare `SET NULL` tried to null | Consequence |
|---|---|---|
| `organizations_active_tower_fk (active_tower_id, id)` | `organizations.id` — the **primary key** | an active Tower could never be deleted |
| `bricks (assignee, org_id)` and `(verified_by, org_id)` | `bricks.org_id` — `NOT NULL`, and this table's **RLS anchor** | a member's row could not be deleted |

Fixed by naming the column — `SET NULL (active_tower_id)`, `SET NULL (assignee)`,
`SET NULL (verified_by)`. Postgres 15+; this project is on 17.

And one more layer: `bricks_build_id_org_id_fkey` is now **`DEFERRABLE INITIALLY
DEFERRED`**, because the org cascade reaches `memberships` *and* — through
`towers` and `builds` — `bricks`, in no promised order. When the membership
cascade's UPDATE lands after the build is gone, an immediate check aborts the
delete; deferred to COMMIT, the brick is already gone and there is nothing to
validate. **A foreign key can be deferred; a CHECK cannot** — which is exactly
why (a) needed a schema redesign and this needed one keyword.

Also dropped the redundant single-column FKs on `build_id`, `assignee` and
`verified_by`. The composites enforce a strict superset, and **the simple ones
fired their own action first, which is how (c) survived a green test run.**

The trade-off, stated: deferral moves a cross-Family rejection from INSERT to
COMMIT. The guarantee is unchanged — the transaction still cannot commit — but
the timing is later, so `130`'s assertion sets the constraint immediate for that
one check and asserts `condeferred` separately.

**Lesson worth carrying:** a passing test proved nothing here, twice. (b) and (c)
were both found by writing a claim into a PR description and then testing it.

**3 — `table_entries`, with Hurt/Repair.** Needs two open questions answered
first: **§10.5** (`mood_tag`'s permitted set is unspecified) and **§10.10**
(Hurt/Repair is *"a `table_entry_flags` table or a nullable column"* — F1.4
offers the choice and nothing decides it). The spec also fixes the visibility
rule: a flag is visible **only to the flagging member and the entry's original
author**, which is an RLS shape, not a UI filter.

**4 — `vows`.** **§10.6 is genuinely open** and D1 reads its answer directly.
The spec records that J4.3 — *"whose turn it is, the rotation order"* — implies
**one rotating Vow per Family**, but does not say so. Also unspecified: what a
Vow's content is, and how rotation order is stored. D1 renders "the current Vow
holder", so this cannot be deferred past it.

**5 — The streak.** The behaviour **is** settled, in the spec's §2.1: the streak
is **Family-level**, and a missed day **holds** it at its current value rather
than resetting to zero. The spec also names the tests owed — a missed day,
several consecutive misses, and broken-then-resumed. What is not settled is the
shape: a stored counter, or a query derived from `table_entries`. Derived is
cheaper to keep correct and harder to make fast; stored is the reverse.

**6 — Extend the seed.** See §5. This is the largest remaining piece and the one
most likely to be underestimated.

**7 — Then D1 runs**, and D2 follows cheaply, because it reads the same tables.

**Also owed, unrelated to D1 but from the same stream:** the two CodeRabbit
findings on already-merged E1/H1 code — `app/actions/support.ts`'s
check-then-insert rate-limit race, and `EMAIL_DELIVERY_MODE` defaulting to
`dry-run` so a production deploy that forgets it silently drops all mail while
the UI reports success. Both are real, both were confirmed against the code, and
neither belonged in a sync PR.

## 5. The seed is not a detail

D1's acceptance is *"every element reflects live seeded data"*, and its second
clause is *"loads correctly for a brand-new Family with no Tower yet — honest
empty states, no invented placeholders."* Those pull in opposite directions on
purpose: the seed must contain a Family with a full history **and** a Family with
nothing.

The current three seeded Families are almost the right shape for that already:

| Family | Members | What it should hold for D1 |
|---|---|---|
| `caregiver-circle` | Alice (member), Bob (organizer) | A populated Family — active Tower, Builds, Bricks in several states, Table entries, a streak, a held Vow |
| `founder-collective` | Alice (**mentor**), Carol (org_owner) | Alice's *other* Family, with **different** content — this is what D1's named edge case tests |
| `wellness-guild` | Dave (member) | Deliberately empty — the no-Tower empty state |

**D1's named edge case is the reason the second row matters.** From the run doc's
edge-case register:

> Dual-Family member switches Families — Tower, streak, Vow holder all switch
> with zero bleed.

Alice is that member. For the check to mean anything she needs a *different*
Tower, streak and Vow holder in each Family — identical seed data in both would
pass the test while proving nothing.

**One wrinkle to settle before seeding.** Alice is a **`mentor`** in
`founder-collective`, not a member. `is_org_member()` does not filter by role, so
RLS admits her and the edge case is testable as written. But whether a mentor
*should* see the same dashboard as a member is unspecified anywhere — and per
§10.1 mentors are excluded from the member cap, so they are already a distinct
kind of participant. D1 will have to answer this or explicitly not.

## 6. The process lesson this cost

Recorded here because it happened **twice**, and the second time cost the work
now sitting in §4 step 1.

A stacked PR merged into its own parent, *after* that parent has already been
merged upward, reaches no trunk — and it reports success. GitHub shows `MERGED`.
The content is simply not anywhere it matters.

- **E1**: `#20` merged into `e1/notification-preferences-schema` and had to be
  re-landed as `#32`.
- **The schema stack**: `#59`, `#60` and `#61` each merged into their stack
  parent minutes after that parent had gone up, leaving `towers`, `builds` and
  `bricks` off `main`, which received only `ledger_events`.

The second one cost more than a re-land. While those three sat off-trunk, `main`
moved: Stream A merged a migration at the same `version` as `towers`, so the
recovery needed renumbering before it could even `db reset`. **Work that has not
landed is work that is still accruing conflicts** — which is the actual argument
for merging a stack promptly rather than a stylistic preference.

> **The rule:** in a stack, merge bottom-up and one at a time, confirming each
> lands on the trunk before opening the next. A green "Merged" badge says the
> base branch accepted the commit — it says nothing about whether that base
> branch still leads anywhere. Verify containment with
> `git merge-base --is-ancestor <branch> origin/main`, never with the badge.

## 7. How to check readiness

Run these before launching D1. Each is a claim, not a vibe.

| # | Check | Command | Ready when |
|---|---|---|---|
| 1 | All four tables are on `main` | `git merge-base --is-ancestor origin/schema/builds origin/main` | exits 0 |
| 2 | They apply from scratch | `npx supabase db reset` | 60 migrations, no duplicate `version` |
| 3 | `table_entries` and `vows` exist | `\dt public.table_entries public.vows` | both present |
| 4 | Organization deletion works | delete a seeded Family holding a verified done Brick | succeeds — asserted in `130`, see §4 step 2 |
| 5 | No skipped tests remain | `npx supabase test db` | PASS with **zero** skips |
| 6 | The seed carries domain data | `select count(*) from towers; … from bricks; … from table_entries` | non-zero in `caregiver-circle` **and** `founder-collective` |
| 7 | The empty Family is empty | same counts for `wellness-guild` | zero — this is what element 6's empty state renders from |
| 8 | RLS holds on the new surface | `npm run test:isolation` | PASS, and the dual-Family fixture covers the new tables |

Check 5 is the one that catches a half-landed state: a skip is how this repo
records a known-unfixed defect, so a skip surviving into D1 means D1 is building
on it.

Check 8 is the one that cannot be skipped. pgTAP runs as `postgres` and bypasses
RLS entirely, so **nothing in the four merged schema PRs proves a policy** —
their isolation coverage is schema PR 9 and is still owed. Until it lands, the
new tables' RLS is written but unproven.
