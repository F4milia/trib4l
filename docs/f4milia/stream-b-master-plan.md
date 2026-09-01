# Stream B — master plan

How to unblock every Stream B session, in order. D1 is done; this is what comes
after it and what has to be true first.

| | |
|---|---|
| **Written** | 2026-09-02, after D1 |
| **Reads from** | `stream-b-blockers.md` (#98) for what is blocked · `d1-readiness.md` §8 for what nobody builds · the run doc for session scope |
| **Verified against** | `origin/main` @ `590ccd7`. Commands in §6 |
| **Shape** | §2 is yours to decide. §3 is nine PRs, slotted by wave |

`stream-b-blockers.md` says what is blocked. This says what to build, in what
order, and which parts need you first. Where the two disagree, §5 says so.

---

## 1. The shape of the problem

Every remaining Stream B session is blocked by one of four things, and only the
first needs you:

| | Count | Who clears it |
|---|---|---|
| **A decision nobody has made** | 9 | You (§2) |
| **A table or write path nobody builds** | 9 | Me (§3) |
| **Another stream, or an account** | 5 | Coordination (§4) |

The nine PRs are the bulk of the work. Two of them need a decision first; the
other seven do not, and none is blocked by the others.

---

## 2. Decisions — nine, and four are urgent

Ordered by which unblocks the most. **The first four gate PRs in §3.**

### 2.1 🟠 URGENT — what does the daily Table prompt come from? (§10.4)

Open since D1. `table_prompts` exists with a nullable `org_id`, so
platform-authored and Family-authored both fit — but nothing assigns one per
day, and D1's dashboard says *"No prompt is set for today"* because inventing a
selection rule would invent product.

**Blocks:** PR 5, the Table prompt cron — which N1 needs in Wave 4. D1's element 4 stays honest-but-empty until it lands.
**Pick one:** platform-authored rotating pool · Family-authored · seasonal set · one fixed prompt.

### 2.2 🟠 URGENT — is the convener a rotating position or the organizer?

`stream-b-blockers.md` §6 calls this undefined. **The spec answers it** —
§2.2 (F2.2): *"Convener rotates round-robin, stored so nobody is picked twice
before everyone has had a turn."* That is a rotating position, not `organizer`.

**I will build it as a rotating position unless you say otherwise.** Flagged
because #98 and the spec disagree, not because it is genuinely open.
**Blocks:** PR 3 (Family Night), and A3's *"renders only to the convener"*.

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
designing. **Blocks:** PR 7's scope, not its schema.

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

## 3. The nine PRs, slotted by wave

**Ordered by the run doc, not by my judgement of value.** The run doc is the
execution sequence, and V1's own rule governs where a gap goes: *"an item a
later wave assumes must slot upstream of that wave."* So each PR sits
immediately before the wave that consumes it.

Two of these are earlier than they look, and both were checked against the
prompt text rather than assumed:

- **W2's first-run needs a Table entry composer** — *"create or join a Family
  → first Table entry → invite members"* (run doc line 398). That is **Wave 4**,
  not Wave 8. D1 is read-only by its own prompt, so no member can write an
  entry today.
- **A2 needs a Tower description to exist** — *"given the Family's Tower
  description"* (line 499). That is **Wave 6**, not O1's Wave 7.

| PR | What | Slot | Consumed by | Needs |
|---|---|---|---|---|
| **1** | `care_actions` | before W3 | D2, N1 | — |
| **2** | Per-item reminders | before W3 | D2 | — |
| **3** | Family Night — schedule + convener rotation | before W3 | D2, A3, N1 | 2.2 |
| **4** | Table entry composer | before W4 | W2, Q1 | — |
| **5** | Table prompt assignment (cron) | before W4 | N1, D1 | **2.1** |
| **6** | Tower definition form | before W6 | A2, O1, K2 | — |
| **7** | `towers` publish state | before W8 | K2 | 2.6 for scope |
| **8** | Memorial-lock executor | unslotted | invariant 8 | — |
| **9** | The "I'm not aligned" flag | **backlog** | nothing | — |

### Before Wave 3 — D2's whole blocker set

**PR 1 — `care_actions`.** §2.5 (F5.1) gives the fields and the three types:
`cover_task` · `offer_bandwidth` · `reminder`. F4.6 is the coupling — *"need
help" converts the Brick to an open, claimable task **and creates a linked Care
Action*** — so D2's board shows them, and N1's inbox lists them a wave later.

**PR 2 — per-item reminders.** `notification_preferences` is keyed
`(org_id, profile_id, notification_type, channel)` and cannot express "remind me
about *this* Brick". A new table keyed on `(membership_id, target_type,
target_id)`. **Nothing specifies this**; the shape is my assumption and the PR
will say so.

**PR 3 — Family Night.** A schedule on `organizations` (day + time, reusing
`timezone`) and a convener rotation derived the way `next_vow_holder()` already
is. No new column on `memberships` — the history is the source, as with Vows.

> After PRs 1–3, **D2 is genuinely "pure UI over existing tables"**, which is
> what its prompt claims to be. Its named edge case is already built
> (`20260903100911`), and Vow rotation already exists — see §5.

### Before Wave 4 — W2 and N1

**PR 4 — the Table entry composer.** The Table is the product's daily habit and
**no member can write to it.** `table_entries` and `retire_table_entry()` are
both in place; this is UI over them. W2's first-run walks a new member through
their first entry, so it cannot land without this.

**PR 5 — Table prompt assignment.** An Inngest cron creating one prompt
opportunity per day per Family in its own timezone (F1.2). N1's acceptance is
*"the daily Table prompt push fires at the Family's chosen time"*, and D1's
element 4 stays honest-but-empty until it exists. **Blocked by 2.1.**

### Before Wave 6 — A2, and O1 behind it

**PR 6 — the Tower definition form.** `towers` exists and **nothing writes it**
— the only reference in `app/` or `lib/` is D1's dashboard, reading. A2 is given
*"the Family's Tower description"* as an input; O1's acceptance is that the
guide *"prefills the definition form the member submits"*; K2 publishes
something nobody can create. Create and edit a Tower, organizer-scoped, with the
Build breakdown left to A2 where it belongs.

### Before Wave 8 — K2

**PR 7 — `towers` publish state.** `published_at`, a public slug, and RLS
allowing anonymous read of published Towers only. Invariant 9 wants explicit,
confirmable, reversible and audited; the audit comes free from the trigger.
2.6 decides the scope, not the schema.

### Unslotted

**PR 8 — memorial-lock executor.** `executor_membership_id`, and the
`table_entries` UPDATE policy gains an OR branch. #82 shipped the lock as
**total** on purpose and said so; this is the half knowingly deferred. No
session waits on it, but invariant 8 is only half-met until it lands.

**PR 9 — the alignment flag.** Fully specified in §2.7 (F7.1/F7.2) and in **no
session in either stream**. By V1's rule — *"an item nothing depends on is
backlog"* — it stays backlog rather than being slotted. Recorded so it is not
lost.

---

## 4. Coordination and accounts — not code

| | What | Who |
|---|---|---|
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

```
# Vow rotation shipped
psql -c "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and proname='next_vow_holder'"

# No Tower write path — only D1's dashboard reads it
grep -rln 'from("towers")' app lib          # -> app/o/[slug]/page.tsx only

# H1 already built
ls app/help/page.tsx app/admin/support/page.tsx app/actions/support.ts

# The support race is still open
grep -c consume_rate_limit lib/support.ts   # -> 0

# The alignment flag is in no session
grep -c aligned "F4milia — Complete Run Doc (Prompts Included).md"   # -> 0
```

---

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

Nothing is reordered. Every session stays in its wave; the nine PRs above slot
in front of the wave that consumes them, which is what V1's rule prescribes.

| Wave | Stream B session | Runs after |
|---|---|---|
| 3 | **D2** | PRs 1–3 |
| 4 | **W2** | PR 4 · decisions 2.5, 2.8 |
| 5 | **F3**, then **M1** | F1 merges (Stream A) · decision 2.4 · C2's storage |
| 6 | **A3**, then **A4** | A1 merges (Stream A) · PR 3 for the convener · **decision 2.3 for A4** |
| 7 | **O1**, then **H1** | A1 merges · PR 6 · H1 may be a no-op, verify first |
| 8 | **K2**, then **Q1** | PR 7 · decision 2.6 · Q1 needs M1 for its edge case |
| 9 | **Q4** | Everything, plus a ZeroStep token and a staging project |

PRs 5, 8 and 9 have no session gating them: PR 5 waits on decision 2.1, PR 8 is
owed to invariant 8, PR 9 is backlog.

**The immediate work is PRs 1–3**, which is D2's entire blocker set and needs
nothing from you beyond confirming 2.2 — and the spec already answers that one.

## 9. Related

- `stream-b-blockers.md` — what stops each session
- `d1-readiness.md` §8 — how the domain-model gap was found
- `production-constraints.md` — the Free-plan ceilings
