# F4milia — Product Narrative and Spec

Pre-flight item 4 of *F4milia — Complete Run Doc* lists this file as required
reading for every session, alongside CLAUDE.md, f4milia-design-system.md and
f4milia-testing-workflow.md, with the reason stated plainly: *"A prompt whose
required reading is missing produces a session that invents the constraints."*

It was missing. This is the reconstruction.

---

## Provenance — read this before trusting anything below

| | |
|---|---|
| **Written** | 2026-09-01, during Wave 1 / Stream B |
| **Derived from** | `docs/F4milia — Ferenz's Prompts.md` and `docs/F4milia — James's Prompts.md` |
| **Status** | **Derived, not original.** If the authored narrative-and-spec surfaces, it supersedes this file entirely. |

Every entity, field, state and rule below is traceable to a numbered item in one
of those two prompt documents, cited inline as **F1.1** (Ferenz) or **J4.2**
(James). Nothing here is inferred from the shape of the existing schema, and
nothing is invented to fill a gap.

**The narrative half is deliberately thin.** Those two documents are
implementation prompt lists; they carry occasional statements of intent, and
those are collected in §1. They do not contain a product narrative, and writing
one would be exactly the invention this file exists to prevent. §1 is what is
sourced. The rest is absent, not summarised.

**§10 is the important section.** It lists what remains genuinely undecided
after both prompt docs — the questions a schema session must answer before it
can write a migration. Several are load-bearing for equity.

---

## 1. Intent, where it is stated

The only product-intent claims in the source documents:

- **The Tower completion ceremony is "the emotional peak of the whole product"**
  — three choices at the end of a Tower: define a new one, take a quiet season,
  or archive. *"Don't treat it as a generic modal — it deserves its own
  deliberate pass."* (J4.2, flagged Priority)
- **The Table is "one of the most-used screens in the app"** and its submission
  UI *"deserves real attention on feel"* — one-tap primary response, optional
  expandable text, mobile-first. (J2.1)
- **Care Actions must feel "low-friction and warm, not a formal request
  form."** (J6.1)
- **The slice display must not be a black box** — *"each member's running slice
  count, always visible… this needs to make an abstract calculation feel
  transparent and fair at a glance."* (J10.2, flagged Priority)
- **Raising a conflict flag should "feel private and low-stakes."** (J8.1)
- **A missed day at the Table holds the streak rather than resetting it.**
  (F1.3) A design choice about forgiveness, not an implementation detail.
- **Reporting/blocking is "a safety feature, not somewhere to add unnecessary
  steps."** (J11.1)

Everything else about why F4milia exists, who it is for, or what a Family feels
like is **not in the source material.**

---

## 2. The domain model

### 2.1 The Table — F§1

| Entity | Fields | Source |
|---|---|---|
| `table_entries` | `id`, `member_id` → `memberships`, `org_id` → `organizations`, `date`, `prompt_id`, `response_text`, `mood_tag` (optional) | F1.1 |
| Hurt/Repair flag | *Either* a `table_entry_flags` table *or* a nullable column on `table_entries` — the source leaves this open | F1.4 |

- A daily prompt opportunity is created **once per day per Family**, by an
  Inngest cron, **respecting each Family's IANA timezone**, for every active
  member. (F1.2)
- **Streak is Family-level**, and a missed day **holds** the streak at its
  current value rather than resetting to zero. Tests must cover a missed day,
  several consecutive misses, and broken-then-resumed. (F1.3)
- A Hurt/Repair flag is visible **only to the flagging member and the entry's
  original author**. (F1.4)

### 2.2 Family Night — F§2

- A weekly rollup job (Inngest cron) aggregates that week's `table_entries` and
  Build/Brick progress per Family. (F2.1)
- **Convener rotates round-robin**, stored so nobody is picked twice before
  everyone has had a turn. (F2.2)

### 2.3 Tower and Vow — F§3

| Entity | Fields | Source |
|---|---|---|
| `towers` | `id`, `org_id`, `title`, `description`, `status`, `created_at` | F3.1 |
| `organizations.active_tower_id` | nullable | F3.1 |
| `vows` | **fields not specified** — only the state machine | F3.2 |

- `towers.status` ∈ `active` · `stalled` · `pivoted` · `complete` (F3.1)
- **Vow rotation is an XState machine**: `assigned` → `active` →
  `renegotiation_requested` → `complete`. Session 9's mentorship lifecycle is
  the reference for *transition shape*, not for the table. (F3.2)
- **Vow renegotiation** is a transition triggerable by the current Vow-holder
  **or** the organizer, and is **visible to the whole Family**. (F3.3)
- **Tower pivot/stall writes to `ledger_events`, not `audit_log`**, describing
  what happened **in plain language**. (F3.4)
- **Tower completion**: when a Tower's linked Builds are all complete, three
  end-states become available — *new Tower defined* / *quiet season* /
  *archived* — plus a **cool-down delay**. (F3.5)

### 2.4 Build and Brick — F§4

| Entity | Fields | Source |
|---|---|---|
| `builds` | `id`, `tower_id`, `type`, `status` | F4.1 |
| `bricks` | `id`, `build_id`, `assignee` → `membership_id` (nullable until claimed), `description`, `due_window`, `status` | F4.2 |

- `builds.type` ∈ `commerce` · `permanence` · `propagation` · `custom` (F4.1)
- **Brick lifecycle is an XState machine**: `open` · `in_progress` ·
  `needs_help` · `pending_verification` · `done` (F4.2)
- **Bricks auto-generate** from a per-Build-type template. (F4.3)
- **Self-claim**: any member may claim an open Brick; concurrent claim attempts
  must be handled correctly. (F4.4)
- **Escalation**: when a Brick enters `needs_help` or exceeds its `due_window`,
  a **private nudge** fires first, then a **soft, group-visible flag** after a
  further delay. (F4.5)
- **"Need help"** converts the Brick to an open, claimable task **and creates a
  linked Care Action**. (F4.6)
- **Peer verification**: any member **other than the assignee** can confirm,
  transitioning to `done`. (F4.7)
- **Completion cascade** (a durable Inngest function): all Bricks `done` closes
  the Build; all Builds closed moves the Tower toward its completion path.
  (F4.8)

### 2.5 Care Actions — F§5

| Entity | Fields | Source |
|---|---|---|
| `care_actions` | `id`, `type`, `from_membership_id`, `target` (a `membership_id` **or** a `brick_id`) | F5.1 |

`type` ∈ `cover_task` · `offer_bandwidth` · `reminder` (F5.1). In-app delivery
first; the email channel follows transactional email. (F5.2)

### 2.6 The Ledger — F§6

| Entity | Fields | Source |
|---|---|---|
| `ledger_events` | `id`, `org_id`, `event_type`, `payload` (jsonb), `created_at` | F6.1 |

`event_type` ∈ `table_entry` · `brick_complete` · `build_complete` ·
`tower_event` · `care_action` · `vow_event` (F6.1)

**`ledger_events` is explicitly separate from `audit_log`.** (F6.1) They answer
different questions: `audit_log` is the compliance record of every mutation,
enforced by trigger; `ledger_events` is the Family's own narrative history, and
its entries are written in plain language (F3.4). A session that conflates them
has misread the model.

Rendered as a chronological timeline with monospaced metadata; **Terracotta is
reserved for Hurt/Repair entries only.** (J7.1)

### 2.7 Conflict and Repair — F§7

An **"I'm not aligned" flag**, attachable to any Tower, Vow, or Build decision,
**visible only to the Family's organizer and the flag's creator**. Raising one
notifies the organizer. (F7.1, F7.2)

### 2.8 Contribution and Equity — F§9

| Entity | Fields | Source |
|---|---|---|
| `contribution_ledger` | `id`, `membership_id`, `brick_id`, `hours`, `multiplier`, `slices` (computed) | F9.1 |

- **Slices are calculated by a Supabase Database Webhook + Edge Function**, firing
  when a Brick transitions to `done`, updating that member's running slice
  count. (F9.2)
- A **manual "lock the vesting event" endpoint**, triggerable only by explicit
  action. (F9.3)
- A **Contribution Report generator** producing an exportable document of the
  full accrual history and resulting split. (F9.4)
- A **buyout calculation** scaffolded with a fair-value placeholder formula,
  *"explicitly commented as needing legal customization before real use."*
  (F9.5)
- **Multiplier tiers are defined by the Family**, before a venture Build
  starts. (J10.1)

> **The slice formula itself is not specified anywhere in the source
> documents.** See §10.

### 2.9 Memorial lock — F§8

A way to mark a member **deceased**, which **locks their `table_entries` and
Ledger contributions from editing by anyone except a designated executor**. Adds
an `executor_membership_id` reference — on the membership record or a small
dedicated table. (F8.1)

The executor's edit access is **scoped to that one member's content only, not
the whole Family**, and a locked member's entries **remain visible to the
Family**. (F8.2)

Full pattern-based crisis detection is **explicitly deferred pending
clinical/policy review**; only a static, always-visible support-resource link
is in scope. (F8 note, J9.1)

---

## 3. Roles

| Role | Function | Source |
|---|---|---|
| `member` | The implicit default when no special role applies | F0.6 |
| `organizer` | Surfaces conflict; handles Family admin | F0.3 |
| `mentor` | A guide role, modelled on the Session 9 pairing lifecycle | F0.3 |
| `org_owner` | Family-level settings (Table prompt time, notification preferences, general configuration) and the billing point of contact | F0.7 |

`platform_staff` **exclusively** controls *which* billing model a Family is on
(`free` / `subscription` / `profit_share`). `org_owner` manages the relationship
once set, and does not choose it. (F0.7, F12.15)

**The 12-member cap excludes mentors.** A 13th `member`-role invite is rejected;
a mentor invite at the same count is not. (F0.2) *Built —
`lib/family-cap.ts`, and the cap counts pending invitations alongside active
memberships.*

> **The role model is an unresolved decision.** See §10.1.

---

## 4. What is already built

Cross-referenced against the repository as of 2026-09-01, so a session knows
what exists before proposing it.

| Area | State |
|---|---|
| Organizations, memberships, profiles, org_profiles, platform_staff | built |
| `audit_log` + trigger on every table in `public` | built — invariant 5 |
| RLS + isolation suite, dual-Family fixture | built |
| Invitations (14-day expiry, `accept_invitation()`) | built |
| 12-member cap excluding mentors (F0.2) | built |
| `member_reports` / `member_blocks` (F10.1) | built |
| `notification_preferences`, per-Family (F12.3) | built — E1 |
| `organizations.table_prompt_time` + `.timezone` (F0.7, F1.2) | built — E1 |
| Transactional email: Resend, four templates, per-Family preferences (F12.1–12.4) | built — E1 |
| `support_requests` + staff inbox | built — H1 |
| Keyword search over posts/comments | built |
| Commerce: `products`, `orders`, checkout, Connect (F12.5–12.6) | built, **Tower gate absent** |

**Not built — the entire domain model above.** No `table_entries`, `towers`,
`builds`, `bricks`, `vows`, `care_actions`, `ledger_events`,
`contribution_ledger`, conflict flags, or memorial lock. That is why the run
doc's D1, D2, M1, K2 and Q4, and its A2, A5 and K1, cannot run as written.

---

## 5. Ownership split

Ferenz's document is **backend/schema/logic only**. James's is **UI**. Where
Ferenz's prompts mention a UI, it is *"context for what his schema needs to
support"* — the build belongs to James. This applies to Family Night, the
Tower/Build progress components, the Ledger, Care Actions, the conflict flag,
and Contribution setup. (James's *Ownership note*)

Relevant when reading the run doc: its sessions are cut differently again, so a
session may own both halves of one feature.

---

## 6. Invariants this model implies

Restated from CLAUDE.md, with the source-document lines that motivate them:

- **The slice formula is deterministic.** No model output ever modifies hours,
  multipliers or slices. The Ledger is a system of record for eventual
  ownership.
- **`ledger_events` ≠ `audit_log`.** (F6.1)
- **Per-Family preferences, never one global mute.** (F12.3: *"so a member in
  multiple Families isn't muted by default across all of them"*)
- **Visibility rules are narrow and specific**: Hurt/Repair to two people
  (F1.4); conflict flags to organizer plus creator (F7.1); memorial-lock edits
  to one executor, scoped to one member (F8.2); a block hides content **from
  the blocker specifically**, not from the room (F10.3).
- **The profit-share path stays not-for-production until legal sign-off.**
  (F12.17)
- **The buyout formula needs legal customization before real use.** (F9.5)

---

## 7. State machines, collected

```
towers.status      active → stalled | pivoted | complete
                   complete → { new Tower | quiet season | archived }  (+ cool-down)

bricks.status      open → in_progress → pending_verification → done
                   any → needs_help → open   (creates a Care Action)

vows               assigned → active → renegotiation_requested → complete
```

Ferenz specifies XState for Brick (F4.2) and Vow (F3.2), and a state machine
for the Tower completion path (F3.5).

---

## 8. Cascade

```
Brick → done   (peer-verified by a non-assignee)
        ├─ writes ledger_events (brick_complete)
        └─ fires the slice webhook → contribution_ledger

all Bricks done → Build closes        → ledger_events (build_complete)
all Builds closed → Tower completion  → ledger_events (tower_event)
```
(F4.7, F4.8, F6.1, F9.2)

---

## 9. Terms

| Term | Meaning |
|---|---|
| **Family** | A fixed group of 8–12 people. One `organizations` row. |
| **Tower** | The Family's goal. One active per Family at a time (`active_tower_id`). |
| **Build** | A workstream under a Tower, typed `commerce`/`permanence`/`propagation`/`custom`. |
| **Brick** | A unit of work under a Build. Claimed by a member, verified by another. |
| **Vow** | A rotating commitment. Renegotiable by its holder or the organizer. |
| **The Table** | The daily check-in. One prompt per Family per day, in the Family's timezone. |
| **Family Night** | The weekly gathering, with a rotating convener and an auto-generated rollup. |
| **The Ledger** | `ledger_events` — the Family's own narrative history, in plain language. |
| **Care Action** | An offer of help: cover a task, offer bandwidth, or send a reminder. |
| **Keepsake** | The exported artifact of a completed Tower. |
| **Slice** | A member's accrued share, computed from hours × multiplier per Brick. |

---

## 10. Open questions — a schema session must answer these first

Each of these is genuinely absent from both prompt documents. Guessing any of
them produces schema that D1, D2, M1, K2, Q4, A2, A5 and K1 all inherit.

**10.1 is settled** (2026-09-01) and kept here with its reasoning rather than
deleted, so the decision travels with the question. **10.2 does not block the
schema session** — nothing before Wave 7 reads `contribution_ledger`, so the
domain model can be built without it and the equity table can follow. The
remaining eight are live.

### 10.1 The role model — SETTLED 2026-09-01: F0.6 declined for now

**Decision: keep the single `membership_role` enum. Do not build
`membership_roles`.** Recorded so a future session reading F0.6 sees a decision
rather than an oversight.

**What F0.6 asked for.** That `org_owner` **must be able to overlap** with
`organizer` or `mentor`; that a single mutually-exclusive enum *"won't support
that"*; and a `membership_roles` join table as the fix — *"confirm the approach
before implementing, since it's a real schema change, not a config tweak."*
F0.8 then asks for a test proving one membership holds `organizer` and
`org_owner` simultaneously, which the current schema cannot express.

**Why declined.** Three findings, each measured against the repository rather
than estimated:

1. **The 12-member cap depends on `mentor` being exclusive.**
   `lib/family-cap.ts` counts members with `.neq("role", "mentor")`, because a
   mentor is an outside guide and does not consume one of the Family's twelve
   seats. Under zero-to-many roles, "is a mentor" becomes "has a mentor row" —
   so a genuine Family member who *also* mentors would be excluded from the
   cap, letting a Family reach thirteen real people. `founder-collective`
   already has a member who is a mentor, so this is not hypothetical. F0.6 does
   not mention it, and it is the kind of breakage that appears as a product bug
   months later rather than as a failing test.

2. **`org_owner` cannot be removed from the enum anyway.** Nineteen historical
   migrations hardcode `array['org_owner']::membership_role[]`, and `db reset`
   replays them from scratch. Removing the value breaks that replay, so it
   would have to stay as a dead enum member — which removes most of the
   modelling benefit the change was for.

3. **Nothing is blocked by it today.** Two of the three seeded Families have
   *zero* owners and the app works. Overlap is a convenience, not a missing
   capability. Against that: 24 references across 16 app files, most of the
   isolation suite's role setup, and `lib/org-nav.ts`, which uses
   `role === "org_owner"` to decide whether Commerce appears in the nav.

**What is therefore true, and should not be re-litigated casually:** a
membership holds exactly one of `member` · `mentor` · `organizer` ·
`org_owner`. The founder of a Family cannot be both its owner and its
organizer. F0.7's settings/billing scope and F0.3's admin scope are held by
different people, or one person holds `org_owner` and forgoes the organizer
surfaces.

**What would reopen it.** Any of:

- Co-owners become a requirement (two founders sharing a Family).
- Ownership transfer becomes a feature.
- A real user need arrives for one person to be owner *and* organizer.

**How to do it when that happens.** Not the full join table. Move ownership off
the role axis instead — `organizations.owner_profile_id`, or a small
`org_owners` table if co-owners are the trigger — and leave `organizer` and
`mentor` in the enum. That satisfies both of F0.8's combinations, keeps the
cap's meaning intact, and touches one function body: all 48 role-checking
policies go through `has_org_role()` and none read `memberships.role`
directly, so the policies themselves stay untouched. Best done inside a session
already writing migrations.

**Not settled by this:** F0.8's test cannot be written as specified. Record that
as a knowingly-unmet item rather than writing a test that asserts something
else.

### 10.2 The slice formula

`contribution_ledger` has `hours`, `multiplier` and `slices` (computed), and the
webhook fires on Brick completion. **The formula is stated nowhere.** CLAUDE.md
says "Slicing-Pie-style", which names a family of approaches rather than one.
The invariant is that it must be deterministic and auditable — so it must be
written down before it is written in code.

### 10.3 Multiplier tiers

A Family defines its multiplier tiers before a venture Build starts (J10.1). No
schema, no tier count, no permitted values, and no rule about whether tiers can
change mid-Build — which would retroactively alter accrued slices.

### 10.4 Where Table prompts come from

`table_entries.prompt_id` implies a prompts table. Nothing specifies whether
prompts are platform-authored, Family-authored, seasonal, or rotating.

### 10.5 `mood_tag` values

Named as optional on `table_entries`; the permitted set is unspecified.

### 10.6 The `vows` table's fields

Only the state machine is given. Unclear whether a Family has one rotating Vow
or many concurrent ones, what a Vow's content is, who holds it, and how the
rotation order is stored. J4.3 — *"whose turn it is, the rotation order"* —
implies one rotating Vow per Family, but does not say so.

### 10.7 `bricks.due_window`

A range, a deadline, or a duration? The escalation logic in F4.5 depends on
"exceeds its `due_window`", so the type determines the comparison.

### 10.8 Durations

Three delays are specified as existing but never given a value: the Tower
completion **cool-down** (F3.5), and the Brick **private nudge** and subsequent
**group-visible flag** (F4.5).

### 10.9 Brick templates

F4.3 auto-generates a starter set of Bricks per Build type. The templates'
contents are not specified — and inventing starter Bricks would be inventing
product.

### 10.10 Hurt/Repair shape

F1.4 offers a choice — a `table_entry_flags` table *or* a nullable column — and
does not decide. A table supports several flaggers per entry; a column supports
one.

---

## 11. If you are the schema session

Read §2 for what is specified, §10 for what is not, and treat §10 as blocking
rather than as detail to resolve while typing.

**10.1 is decided** — one role per membership. Build the domain model's RLS
against `has_org_role()` as it stands.

**10.2 is not, and does not need to be yet.** Leave `contribution_ledger` out
of the first schema session entirely: nothing before Wave 7 reads it, and the
formula must be written down with worked examples, by a human, before it is
written in code. It is the number a member's eventual ownership is computed
from, and CLAUDE.md gates any PR touching the equity ledger to Ivan.

The eight remaining questions in §10 are the ones to bring to the 09:30 window
before writing the migration.
