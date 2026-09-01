# The F4milia domain model — readiness

What the domain model needs, what has been built, and what is left.
Stream B, opened at Wave 2 by D1.

Not a session record — D1 has not run. This is the document that says why, and
what has to be true before it can.

**Retitled 2026-09-02.** This began as "D1 — readiness", and that framing was
too small. D1 is the first session to hit the missing domain model, not the only
one: §8 traces the same gap through **D2, A3, A4, K2 and Q4**, and the run doc
schedules no session that closes it. Sections 1–7 are unchanged in substance and
still read from D1's point of view, which is the right way in — §8 is where the
scope is stated honestly.

| | |
|---|---|
| **Written** | 2026-09-01 · **§8 and corrections added** 2026-09-02 |
| **Session** | `F4milia — Complete Run Doc`, Wave 2, Stream B |
| **D1's status** | **Not started.** No branch, no PR in any state |
| **Blocked by** | Four tables it reads do not exist on `main`, and its acceptance criterion needs seeded rows in all of them |
| **Distance** | D1: 4 of 7 tables built (1 merged, 3 on `schema/bricks` awaiting one PR); 2 unwritten; seed unextended. Stream B overall: **7 further entities unscheduled** — §8 |
| **Last verified** | 2026-09-01 — pgTAP 375 pass / 17 files on `schema/bricks` from a clean reset. **Not re-run 2026-09-02**: the shared stack was holding Stream A's C1 migrations, see §8.5 |

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

*Added 2026-09-02:* the table above lists the sessions that read tables nobody
builds. **§8 works the other direction** — it takes each remaining Stream B
session and asks what its prompt actually needs, which surfaces seven entities
that are not in the list above because they are not tables D1 reads.

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
| 2 | Their claimed Bricks with due windows | `bricks` | ⚠️ built, verified — **stranded on `schema/bricks`** |
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

**3 — `table_entries`, with Hurt/Repair.** Needs **three** open questions
answered first: **§10.5** (`mood_tag`'s permitted set is unspecified), **§10.10**
(Hurt/Repair is *"a `table_entry_flags` table or a nullable column"* — F1.4
offers the choice and nothing decides it), and **§10.4** (`prompt_id` implies a
prompts table, and nothing says whether prompts are platform-authored,
Family-authored, seasonal or rotating). The spec also fixes the visibility
rule: a flag is visible **only to the flagging member and the entry's original
author**, which is an RLS shape, not a UI filter.

*§10.4 was omitted from this step until 2026-09-02.* It is not deferrable past
D1: element 4 is "today's Table prompt status", which is a claim about a prompt,
not just about whether an entry exists.

Two further things land in this migration, neither of them optional and neither
previously recorded here:

- **The memorial-lock RLS.** `20260903100401` adds `profiles.memorialized_at`
  and `memorialize_profile()` and stops there. Spec §2.9 (F8.1/F8.2) also
  requires a memorialized member's `table_entries` and Ledger contributions to
  be locked against editing *except by a designated executor*, scoped to that
  member's content only. There is no `executor_membership_id` anywhere in the
  schema. So invariant 8 is today enforceable on the profile row and nowhere
  else, and the missing half arrives with this table — see §8.4.
- **The `posts` question.** `posts` already exists (inherited, see §8.3) and
  carries a `search_vector`. Whether a Table entry IS a post or a separate row
  has to be decided here rather than discovered by F1/F3 in Wave 5.

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

**7 — Then D1 runs.** ~~And D2 follows cheaply, because it reads the same
tables.~~ **Corrected 2026-09-02:** D2 does *not* follow cheaply. It reads the
same tables plus three things nothing builds — the Family Night schedule,
per-item reminder rows, and a Brick-status reset its named edge case requires.
See §8.2 and §8.4.

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
| 1 | All four tables are on `main` | `git merge-base --is-ancestor origin/schema/bricks origin/main` | exits 0 |
| 2 | They apply from scratch | `npx supabase db reset` | 62 migrations, no duplicate `version` |
| 3 | `table_entries` and `vows` exist | `\dt public.table_entries public.vows` | both present |
| 4 | Organization deletion works | delete a seeded Family holding a verified done Brick | succeeds — asserted in `130`, see §4 step 2 |
| 5 | No skipped tests remain | `npx supabase test db` | PASS with **zero** skips |
| 6 | The seed carries domain data | `select count(*) from towers; … from bricks; … from table_entries` | non-zero in `caregiver-circle` **and** `founder-collective` |
| 7 | The empty Family is empty | same counts for `wellness-guild` | zero — this is what element 6's empty state renders from |
| 8 | RLS holds on the new surface | `npm run test:isolation` | PASS, and the dual-Family fixture covers the new tables |

**Checks 1 and 2 were both wrong as first written, corrected 2026-09-02.**
Worth recording rather than silently fixing, because the first one is this
document's own §6 lesson failing inside its own readiness table:

- Check 1 named `origin/schema/builds`. `builds` is an **ancestor** of
  `schema/bricks`, so that command can exit 0 while `bricks` — the branch that
  actually carries all three tables — is still off-trunk. A containment check
  that names the wrong branch is worse than no check: it reports the exact
  state it was written to catch as safe.
- Check 2 said "60 migrations". `main` carries 56 and `schema/bricks` adds six,
  so the merged tree is **62**; `schema/bricks` alone is 61, because it predates
  `20260903100602` (PERF-2, #65). Neither number was 60.

Check 5 is the one that catches a half-landed state: a skip is how this repo
records a known-unfixed defect, so a skip surviving into D1 means D1 is building
on it.

Check 8 is the one that cannot be skipped. pgTAP runs as `postgres` and bypasses
RLS entirely, so **nothing in the four merged schema PRs proves a policy** —
their isolation coverage is schema PR 9 and is still owed. Until it lands, the
new tables' RLS is written but unproven.

---

## 8. The same gap, in five more sessions

Added 2026-09-02, in answer to a direct question: *does the schema work being
done for D1 also build the schema the rest of Stream B needs?*

### 8.1 The answer

**No.** It covers D1 completely and D2 partially, then stops. Seven further
entities are read by later Stream B sessions and the run doc schedules no
session that creates any of them — the same failure §1 describes, one wave at a
time, rediscovered by whoever runs into it.

This is not an argument for building everything now. It is an argument for
naming the work correctly: the sessions in §4 steps 3–5 are not "D1's
prerequisites", they are the first three-sevenths of **the domain-model session
the run doc never scheduled**. Framed as D1's prerequisites, the remainder gets
found again by D2 in Wave 3, by A3 and A4 in Wave 6, and by K2 in Wave 8.

### 8.2 Stream B, session by session

Each row's "needs" comes from that session's own prompt text; each verdict from
the live schema. `✅` = present or already planned in §4. `❌` = nothing builds it.

| Session | Wave | What its prompt reads | Verdict |
|---|---|---|---|
| E1 | 1 | `notification_preferences` | ✅ merged |
| **D1** | 2 | `ledger_events`, `towers`, `builds`, `bricks`, `table_entries`, `vows`, streak, org schedule columns | ✅ **all seven** — four built, three in §4 steps 3–5 |
| **D2** | 3 | Bricks grouped by member ✅ · Brick due windows ✅ · Vow rotation turns ✅ · Family's timezone ✅ | ⚠️ **three gaps** — Family Night schedule ❌, per-item reminder rows ❌, and its named edge case is not satisfied by `bricks` as built (§8.4) |
| W2 | 4 | first Table entry ✅ · invite members | ✅ `invitations` already exists and is fully shaped — `token`, `expires_at`, `role`, `status`, `accepted_at`. Only signup-consent storage is missing |
| F3 | 5 | search results grouped by posts, Bricks, Ledger, members | ✅ all four exist — but see the `posts` question in §8.3 |
| M1 | 5 | photos on Table entries ✅, attachments on Bricks ✅ | ✅ plus storage, which Stream A owns from Wave 3 |
| **A3** | 6 | the week's Table entries ✅ · Brick progress ✅ · *"the draft renders only to the convener"* | ❌ **convener rotation and the weekly rollup do not exist** |
| **A4** | 6 | *"an updated Member Card line"* | ❌ **Member Card exists in neither the schema nor the spec** |
| O1 | 7 | articulating a Tower ✅ · setting the Table time ✅ · understanding Vows ✅ | ✅ |
| H1 | 7 | `support_requests` | ✅ already ran, out of wave order |
| **K2** | 8 | publish / unpublish a completed Tower | ❌ **`towers` has no publication state at all** |
| Q1 | 8 | — | ✅ no schema |
| **Q4** | 9 | the full life, including *"slice accrues"* | ❌ `contribution_ledger`, `care_actions` |

### 8.3 What is already there: the inherited Trib4l schema

A finding that cuts the other way, and that §1–§7 did not account for. The
database carries **39 tables in `public`** (36 on `main`; three more are C1's,
in flight) and most of them are inherited from Trib4l, not built by any session
in this doc: `posts`, `comments`, `reactions`, `invitations`, `cohorts`,
`cohort_members`, `stages`, `member_stages`, `stage_transitions`,
`mentor_pairings`, `meetups` and its four companions, `live_streams`, `orders`,
`products`, `video_assets`, `member_reports`.

So two later sessions are **further along than assumed**:

- **W2's invite step** needs no new table. `invitations` is complete.
- **F1/F3's search** has its targets already, and `posts` even carries a
  `search_vector` generated column with a GIN index (`posts_search_vector_idx`).

But it forces a decision that belongs in §4 step 3, not in Wave 5:

> **Is a Table entry a `post`, or its own row?**

`posts` is Trib4l-shaped — `cohort_id`, `required_stage_id`, `video_asset_id`,
and RLS gated by `can_see_gated_content(org_id, cohort_id, required_stage_id)` —
and it has no `prompt_id`, no `date`, no `mood_tag`. Building `table_entries`
beside it gives F1 two content tables for one concept and F3 two result groups
for one idea. Building Table entries *into* `posts` inherits three foreign keys
to a product F4milia is not. Neither is obviously right; what is wrong is
deciding it by accident.

The rest of the inherited set is unreferenced by any session in the run doc and
should be treated as noise, not as model — but it is noise that a future session
can mistake for precedent.

### 8.4 The seven unscheduled entities

In the order a Stream B session hits them.

**1 — `care_actions`** · spec §2.5 (F5.1): `id`, `type`, `from_membership_id`,
`target` (a `membership_id` **or** a `brick_id`); `type` ∈ `cover_task` ·
`offer_bandwidth` · `reminder`. F4.6 is the coupling: *"need help" converts the
Brick to an open, claimable task **and creates a linked Care Action***. So
**D2** renders them in Wave 3 and N1 (Stream A) puts them in the inbox in Wave
4. `grep "Care Action"` on the run doc returns **one hit — N1's consumer list at
line 369.** Nothing builds it.

**2 — Family Night: convener rotation and the weekly rollup** · spec §2.2:
the convener rotates round-robin, *"stored so nobody is picked twice before
everyone has had a turn"* (F2.2), and an Inngest cron aggregates the week's
`table_entries` and Brick progress (F2.1). Read by **D2** (*"Calendar view:
Family Night schedule"*), by **A3** (*"the draft renders only to the convener"* —
which has no way to resolve who that is), and by N1's Family Night reminders.
`grep "convener"` hits only A3, which reads it. Note this is **not**
`organizations.table_prompt_time`: that is the daily Table prompt, and Family
Night is weekly.

**3 — Member Card** · read by **A4**, which suggests *"an updated Member Card
line the member can accept, edit, or dismiss."* `org_profiles` carries
`display_name` and `avatar_url` and nothing else. **`grep "Member Card"` on
`f4milia-product-narrative-and-spec.md` returns zero hits** — the concept is in
the run doc's wave table and A4's prompt, and in no specification anywhere. This
is a product gap before it is a schema gap, and A4 is the session most likely to
invent its way out of one: see the seed entry in CLAUDE.md's Learned constraints
about auto-updating Member Cards being rejected as too presumptuous.

**4 — Suggestion-dismissal state** · A2's *"dismissing the draft writes
nothing"* and A4's *"dismissed suggestions do not reappear for the same entry"*
are both invariant 2 (*"a dismissed suggestion writes nothing and does not
re-prompt"*). "Does not re-prompt" requires remembering the dismissal, which is
a row. Nothing defines where it lives.

**5 — Tower publication state** · `towers` is `id`, `org_id`, `title`,
`description`, `status`, `created_at`, `updated_at`. **K2** needs published /
unpublished, a public slug, and a snapshot of *approved* content — its named
edge case is *"publish, change approved content, unpublish, republish — the page
reflects current approved state, never a stale snapshot."* Invariant 9 rides
entirely on columns that do not exist.

**6 — Memorial-lock executor** · spec §2.9 (F8.1/F8.2) requires an
`executor_membership_id`, *"on the membership record or a small dedicated
table"*, and the lock applied to that member's `table_entries` and Ledger
contributions. `20260903100401` built the `profiles` flag and stopped. See §4
step 3 — the lock lands with `table_entries`; the executor reference is still
unowned.

**7 — `contribution_ledger`** · already noted in §1 and confirmed absent.
Q4's *"slice accrues"* and all of A5.

**And one that is in no session in either stream:** the **"I'm not aligned"
flag** — spec §2.7 (F7.1/F7.2), attachable to any Tower, Vow or Build decision,
visible only to the organizer and the flag's creator, and notifying the
organizer when raised. `grep -c "aligned"` on the run doc returns **0**. This is
not a scheduling gap like the seven above; it is a feature of the model that the
run doc dropped. Recorded here because nothing else records it.

**And one defect in a table already built.** D2's named edge case is:

> A member with claimed Bricks leaves the Family — their Bricks revert to open,
> not attributed to a ghost.

`bricks` has `on delete set null (assignee)`, which nulls the pointer and leaves
`status` untouched. The row lands as `assignee = null, status = 'in_progress'` —
a Brick nobody holds that is not open, which is precisely the ghost the edge
case names. `bricks` carries only two triggers, `bricks_set_updated_at` and
`bricks_audit`; nothing resets the status. This belongs in the schema work, not
in D2's UI session, and it is the second time a `SET NULL` on this table has
behaved differently from how it read (§4 step 2c was the first).

### 8.5 What was verified on 2026-09-02, and what could not be

Per the alignment rule — per claim, against what authority.

**Verified by execution:** branch containment for all four schema branches
(`ledger-events` exits 0; `towers`, `builds`, `bricks` exit 1) · the file and
migration inventory of `schema/bricks` · migration counts (56 / 61 / 62) · no
duplicate `version` in the merged set · every column, index, policy and trigger
quoted in §8.2–§8.4, read from the running database with `\d` · every `grep`
count quoted, run against the two documents named · `git merge-tree` for both
merge directions in §8.6.

**Not verified, and not claimed:** the 2026-09-01 "375 pass / 17 files" line.
§7's checks 2, 4, 5, 6 and 8 were **not run.** The shared local stack was
holding 62 applied migrations ending at `20260903100706` — Stream A's complete
C1 stack — with `towers`, `builds` and `bricks` absent, and the `db`, `auth`,
`realtime` and `storage` containers had all restarted seconds earlier. Running
`supabase db reset` would have destroyed a live Stream A run mid-flight. That is
the 2026-08-30 Learned constraint about the single shared stack, occurring rather
than being anticipated.

### 8.6 A merge window that closes on its own

Verified 2026-09-02 and time-sensitive, so acted on before anything in §8.4.

Stream A has **seven open PRs**, #67–#73, the C1 conversations stack, all based
on `main`. Right now `schema/bricks` → `main` is a **clean auto-merge**
(`git merge-tree` returns a tree and no conflict). Once any C1 PR lands it
becomes **three conflicts**: `CLAUDE.md`, `lib/supabase/database.types.ts`, and
`supabase/tests/database/030_audit_triggers_special_cases.sql`.

The third is the one that matters, because it is semantic rather than textual.
Both branches change the *same line* of `030` from `33` to `36` — Stream B for
`towers`, `builds`, `bricks`; Stream A for `conversations`,
`conversation_participants`, `messages`. **The correct merged value is 39.**
Either side's `36`, accepted as-is, fails `030` with a message about audit
coverage, which points at the wrong problem — the same shape as the
metadata-allowlist entry in CLAUDE.md's Learned constraints.

Migration versions do **not** collide: Stream A took `20260903100701`–`100706`,
Stream B took `100711`/`100712`, so the `x01`/`x11` convention held on both
sides this time. Test-file numbering overlaps cosmetically only —
`110_towers.sql` beside `110_conversations_schema.sql`.

**Still owed on the merge PR:** two Learned-constraint lines that §4 step 2
documents here but that `CLAUDE.md` on `schema/bricks` does not carry — that a
bare `ON DELETE SET NULL` on a composite foreign key nulls **every** referencing
column, and that a foreign key can be `DEFERRABLE` where a CHECK cannot. Both
are exactly what that section's append rule exists for, and (c) was the deepest
of the three defects.
