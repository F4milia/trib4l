# Stream B — master plan

How to unblock every Stream B session, in order. D1 is done; this is what comes
after it and what has to be true first.

| | |
|---|---|
| **Written** | 2026-09-02, after D1 |
| **Reads from** | `stream-b-blockers.md` (#98) for what is blocked · `d1-readiness.md` §8 for what nobody builds · the run doc for session scope |
| **Verified against** | `origin/main` @ `590ccd7`. Commands in §6 |
| **Shape** | §2 is yours to decide. §3 is thirteen PRs, slotted by wave |

`stream-b-blockers.md` says what is blocked. This says what to build, in what
order, and which parts need you first. Where the two disagree, §5 says so.

---

## 1. The shape of the problem

Every remaining Stream B session is blocked by one of four things, and only the
first needs you:

| | Count | Who clears it |
|---|---|---|
| **A decision nobody has made** | 9 | You (§2) |
| **A table or write path nobody builds** | 13 | Me (§3) |
| **Another stream, or an account** | 5 | Coordination (§4) |

The thirteen PRs are the bulk of the work. Three need a decision first; the
other ten do not, and none is blocked by the others. **Four of the thirteen
were missed on the first pass** — all four are write paths rather than tables,
which is why looking at the schema did not find them.

---

## 2. Decisions — nine, and four are urgent

Ordered by which unblocks the most. **The first four gate PRs in §3.**

### 2.1 🟠 URGENT — what does the daily Table prompt come from? (§10.4)

Open since D1. `table_prompts` exists with a nullable `org_id`, so
platform-authored and Family-authored both fit — but nothing assigns one per
day, and D1's dashboard says *"No prompt is set for today"* because inventing a
selection rule would invent product.

**Blocks:** PR 6, the Table prompt cron — which N1 needs in Wave 4. D1's element 4 stays honest-but-empty until it lands.
**Pick one:** platform-authored rotating pool · Family-authored · seasonal set · one fixed prompt.

### 2.2 🟠 URGENT — is the convener a rotating position or the organizer?

`stream-b-blockers.md` §6 calls this undefined. **The spec answers it** —
§2.2 (F2.2): *"Convener rotates round-robin, stored so nobody is picked twice
before everyone has had a turn."* That is a rotating position, not `organizer`.

**I will build it as a rotating position unless you say otherwise.** Flagged
because #98 and the spec disagree, not because it is genuinely open.
**Blocks:** PRs 3 and 9 (Family Night), and A3's *"renders only to the convener"*.

### 2.3 🟠 URGENT — what is a Member Card?

No table, no UI, no reference in `supabase/` or `app/`, and **nothing in the
spec** — `grep "Member Card"` on `f4milia-product-narrative-and-spec.md` returns
zero. A4's whole job is to suggest a line for it.

This is the only item on this list where I cannot even propose a shape.
**Blocks:** A4 entirely. **Needed by:** Wave 6.

### 2.4 🟠 URGENT — does search cover `table_entries`?

Stream A's question too. F1 lists *"posts, comments, Bricks, and Ledger events"*
and omits the Table — the product's main written surface. #82 decided a Table
entry is its own row, not a `post`, so this is now a real fork.

**Blocks:** F1, and F3 behind it.

### 2.5 🟠 Signup consent — auditable, or a client-side gate?

W2's acceptance is *"signup blocks without consent checkboxes."* No consent
column exists. If it must be provable later, it is a column and a migration.

### 2.6 🟠 K2 — is publishing itself the approval?

*"Published pages show what the Family approved."* No approval step exists
anywhere. Either publishing **is** the approval, or a second step needs
designing. **Blocks:** PR 11's scope, not its schema.

### 2.7 🟠 `mood_tag`'s permitted set (§10.5)

`mood_tags` ships empty on purpose. The column works; the vocabulary is yours.
Filling it is an INSERT, not a migration — so this blocks nothing, but the
Table renders no mood picker until it is answered.

### 2.8 🟠 W2's service worker — who writes it, W2 or N1?

Same wave, other stream, neither exists. Two sessions writing one in parallel is
the collision. **Coordination, not code.**

### 2.9 🟠 Ivan — the slice formula, and `contribution_ledger`

Unspecified anywhere, Ivan-gated, and Q4's *"slice accrues"* runs through it.
Not Stream B's to build, but Stream B's Q4 fails without it.

---

## 3. The thirteen PRs, slotted by wave

**Ordered by the run doc, not by my judgement of value.** V1's rule governs
placement: *"an item a later wave assumes must slot upstream of that wave."*

**This list grew from nine to thirteen on a second pass**, and the four
additions are the important part of this document. The first pass looked for
missing TABLES. These four are missing **write paths** — surfaces a later
session acts through, where the table already exists and nothing can reach it.
That is the same class of gap `d1-readiness.md` §1 found, and it is easy to miss
precisely because `grep` on the schema finds nothing wrong.

| PR | What | Slot | Consumed by | Needs |
|---|---|---|---|---|
| **1** | `care_actions` | before W3 | D2, N1 | — |
| **2** | Per-item reminders | before W3 | D2 | — |
| **3** | Family Night — schedule + convener rotation | before W3 | D2, N1 | 2.2 |
| **4** | Table entry composer | before W4 | W2, Q1, M1 | — |
| **5** | **Member-facing Family creation** | before W4 | W2 | — |
| **6** | Table prompt assignment (cron) | before W4 | N1, D1 | **2.1** |
| **7** | Tower definition form | before W6 | A2, O1, K2 | — |
| **8** | **Brick lifecycle write path** | before W6 | A2, A5, K1, Q4 | — |
| **9** | **Family Night rollup storage** | before W6 | A3 | 2.2 |
| **10** | **Suggestion + dismissal state** | before W6 | A2, A4 | shared with Stream A |
| **11** | `towers` publish state | before W8 | K2 | 2.6 for scope |
| **12** | Memorial-lock executor | unslotted | invariant 8 | — |
| **13** | The "I'm not aligned" flag | **backlog** | nothing | — |

### The four additions, and how they were found

Each was found by asking *"what writes this?"* rather than *"does this table
exist?"* — the check in §6 is one `grep` per row.

**PR 5 — a member cannot create a Family.** `createOrganization` calls
`requirePlatformAdmin()`, and the only route is `app/admin/organizations/new`.
W2's first-run is *"create or join a Family → first Table entry → invite
members"* and the first step is **platform-staff only**. Joining works —
`invitations` is complete — so this is the create half.

**PR 8 — nothing claims, works or verifies a Brick.** `bricks` has the full
F4.2 lifecycle in its enum and its CHECK constraints, and **no application code
writes to it** — the only reference in `app/` or `lib/` is D1's dashboard,
reading. So there is no Brick creation, no self-claim (F4.4), no "need help"
(F4.6), and no peer verification (F4.7).

> This is the largest single gap in the product and the plan missed it on the
> first pass. A2's accepted Bricks *"enter the normal lifecycle"* — there is no
> lifecycle to enter. A5 attaches effort estimates *"at Brick creation"* —
> nothing creates one. Q4's script runs *"Brick claimed, worked,
> peer-verified → slice accrues"* end to end. K1 exports contributors.

**PR 9 — the Family Night rollup has nowhere to live.** PR 3 gives Family Night
a schedule and a convener; §2.2 (F2.1) also specifies a **weekly rollup job**
aggregating the week's entries and Brick progress. A3 drafts that rollup and
*"the published rollup carries the marker"* — so it is a stored, publishable
record, and no table holds one.

**PR 10 — invariant 2 needs a dismissal to be remembered.** *"A dismissed
suggestion writes nothing and does not re-prompt."* Not re-prompting requires
remembering, which is a row. A2's edge case (*"dismiss the draft, re-invoke —
nothing persisted"*) and A4's (*"dismissed suggestions do not reappear for the
same entry"*) both depend on it. **Stream A's A2 needs it in the same wave**, so
it needs an owner before Wave 6 rather than two implementations.

### Before Wave 3 — D2's whole blocker set

**PR 1 — `care_actions`.** §2.5 (F5.1) gives the fields and the three types:
`cover_task` · `offer_bandwidth` · `reminder`. F4.6 is the coupling: *"need
help" converts the Brick to an open, claimable task **and creates a linked Care
Action***.

**PR 2 — per-item reminders.** `notification_preferences` is keyed
`(org_id, profile_id, notification_type, channel)` and cannot express "remind me
about *this* Brick". A new table keyed on `(membership_id, target_type,
target_id)`. **Nothing specifies this**; the shape is my assumption.

**PR 3 — Family Night schedule and convener.** Day and time on `organizations`
reusing `timezone`, and a convener rotation derived the way `next_vow_holder()`
already is. No new column on `memberships` — the history is the source.

> After PRs 1–3, **D2 is genuinely "pure UI over existing tables."** Its named
> edge case is already built (`20260903100911`) and Vow rotation already exists
> — see §5.

### Before Wave 4 — W2 and N1

**PR 4 — the Table entry composer.** The product's daily habit has no input:
D1 is read-only by its own prompt. `table_entries` and `retire_table_entry()`
are in place; this is UI over them. M1 later attaches photos to it, and Q1's
edge case is keyboard-only through a full entry.

**PR 5 — member-facing Family creation.** Above.

**PR 6 — Table prompt assignment.** An Inngest cron, one opportunity per day per
Family in its own timezone (F1.2). **Blocked by 2.1.**

### Before Wave 6 — A2, A3, A4, and O1 behind them

**PR 7 — the Tower definition form.** `towers` exists and nothing writes it. A2
is handed *"the Family's Tower description"*; O1 *"prefills the definition form
the member submits"*; K2 publishes something nobody can create.

**PRs 8, 9, 10** — above.

### Before Wave 8 — K2

**PR 11 — `towers` publish state.** `published_at`, a public slug, and RLS
allowing anonymous read of published Towers only. Invariant 9 wants explicit,
confirmable, reversible and audited; the audit comes free from the trigger.

### Unslotted

**PR 12 — memorial-lock executor.** `executor_membership_id`, and the
`table_entries` UPDATE policy gains an OR branch. #82 shipped the lock as
**total** on purpose; this is the half knowingly deferred. Invariant 8 is only
half-met until it lands.

**PR 13 — the alignment flag.** Fully specified in §2.7 (F7.1/F7.2) and in **no
session in either stream**. By V1's rule — *"an item nothing depends on is
backlog"* — it stays backlog. Recorded so it is not lost.

---

## 4. Coordination and accounts — not code

| | What | Who |
|---|---|---|
| 🔴 | **`contribution_ledger` has no owner.** No session in either stream creates it. A5 consumes it, Q4's *"slice accrues"* runs through it, and the slice formula is unspecified anywhere. Ivan-gated when it lands | You + Ivan |
| 🔴 | **PR 8 (Brick lifecycle) and PR 10 (dismissal state) are consumed by Stream A too** — A2 and A5. Agree an owner before Wave 6 rather than building either twice | You + Stream A |
| 🔑 | **ZeroStep token.** `@zerostep/playwright` is installed, no spec calls `ai()`, no token anywhere. Q4's whole premise | Account owner |
| 🔴 | **No staging project.** Q4 needs *"green in staging twice"*. Free caps at 2 projects — staging plus production is the entire allowance | You |
| 🟠 | **Service worker ownership** (2.8) | You + Stream A |
| 🔴 | **A1 must merge** before A3, A4 and O1 start | Stream A |
| 🟢 | **M1 inherits C2's per-Family quota** — settled in #98. A second 100 MB per Family takes 8 Families to 1600 MB against a 1 GB ceiling | Settled |

---

## 5. Corrections to `stream-b-blockers.md`

Recorded so the two documents do not disagree silently.

**Vow rotation order is no longer missing.** #98 §3 says *"`vows` has
`holder_id`, but nothing says who is next."* `public.next_vow_holder(org_id)`
shipped in #86 and answers exactly that — never-held first, then held-longest-ago,
then join order, mentors excluded. Verified present on `main`. D2 can read it
today.

**The convener is specified.** #98 §6 calls it undefined; spec §2.2 defines it as
a round-robin rotating position. See 2.2.

**D1's element 4 is built but empty by design.** Not a defect. `family_table_day()`
reports the member's status against the Family's own timezone; the card says
*"No prompt is set for today"* because 2.1 is unanswered.

**Still true and still open:** the Member Card, the Tower write path,
`contribution_ledger`, the ZeroStep token, no staging. #98 called all five, and
this plan does not close any of them.

---

## 6. How this was verified

Every claim in §3 and §5, as a command. The four additions in §3 were all found
by the same question — **what writes this?** — so they are grouped together.

```
# WRITE PATHS -- the four gaps the first pass missed.
grep -rln 'from("bricks")'  app lib     # -> D1's dashboard only. Nothing CLAIMS a Brick
grep -rln 'from("towers")'  app lib     # -> D1's dashboard only. Nothing CREATES a Tower
grep -n  requirePlatformAdmin app/actions/organizations.ts
                                        # -> a member cannot create a Family
psql -c "select table_name from information_schema.tables
         where table_schema='public'
           and (table_name like '%rollup%' or table_name like '%suggest%'
             or table_name like '%dismiss%' or table_name like '%card%'
             or table_name like '%contribution%')"
                                        # -> zero rows. Rollup, dismissal,
                                        #    Member Card, contribution_ledger

# Already shipped, contra #98
psql -c "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and proname='next_vow_holder'"

# H1 already built; its rate-limit race still open
ls app/help/page.tsx app/admin/support/page.tsx app/actions/support.ts
grep -c consume_rate_limit lib/support.ts        # -> 0

# The alignment flag is in no session
grep -c aligned "F4milia — Complete Run Doc (Prompts Included).md"   # -> 0

# Where the two early slots come from
grep -n "first Table entry" "F4milia — Complete Run Doc (Prompts Included).md"   # -> 398, W2
grep -n "Tower description" "F4milia — Complete Run Doc (Prompts Included).md"   # -> 499, A2
```

## 7. Carried defects, still owed

Neither belongs to a session; both are real and confirmed against the code.

- **`app/actions/support.ts` check-then-insert rate-limit race.**
  `public.consume_rate_limit(text,int,int)` already exists and is atomic — the
  only obstacle is that it is granted to `service_role` while the action uses
  the RLS user client. A grant decision, not new machinery.
- **`EMAIL_DELIVERY_MODE` defaults to `dry-run`**, so a production deploy that
  forgets it drops all mail while the UI reports success. The default is
  deliberate; what is missing is a startup assertion for production.

---

## 8. What this changes about the wave table

Nothing is reordered. Every session stays in its wave; the thirteen PRs slot in
front of the wave that consumes them.

| Wave | Stream B session | Runs after |
|---|---|---|
| 3 | **D2** | PRs 1–3 |
| 4 | **W2** | PRs 4, 5 · decisions 2.5, 2.8 |
| 5 | **F3**, then **M1** | F1 merges (Stream A) · decision 2.4 · C2's storage · PR 4 for M1's photos |
| 6 | **A3**, then **A4** | A1 merges (Stream A) · PRs 9, 10 · **decision 2.3 for A4** |
| 7 | **O1**, then **H1** | A1 merges · PR 7 · H1 may be a no-op, verify first |
| 8 | **K2**, then **Q1** | PR 11 · decision 2.6 · Q1 needs M1 and PR 4 |
| 9 | **Q4** | Everything, plus PR 8, a ZeroStep token, a staging project, and `contribution_ledger` |

PRs 6, 12 and 13 have no session gating them: PR 6 waits on decision 2.1, PR 12
is owed to invariant 8, PR 13 is backlog.

**Three PRs are Stream A's problem too.** PR 8 (Brick lifecycle) is consumed by
A2 and A5; PR 10 (dismissal state) by A2; `contribution_ledger` by A5. Building
any of them twice is worse than agreeing an owner at the 09:30 window.

**The immediate work is PRs 1–3**, D2's entire blocker set, needing nothing from
you beyond confirming 2.2 — which the spec already answers.

## 9. Related

- `stream-b-blockers.md` — what stops each session
- `d1-readiness.md` §8 — how the domain-model gap was found
- `production-constraints.md` — the Free-plan ceilings
