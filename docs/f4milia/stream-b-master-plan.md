# Stream B — master plan

How to unblock every Stream B session, in order. D1 is done; this is what comes
after it and what has to be true first.

| | |
|---|---|
| **Written** | 2026-09-02, after D1 |
| **Reads from** | `stream-b-blockers.md` (#98) for what is blocked · `d1-readiness.md` §8 for what nobody builds · the run doc for session scope |
| **Verified against** | `origin/main` @ `590ccd7`. Commands in §7 |
| **Shape** | §2 is yours to decide. §3–§5 are PRs I can start without you |

`stream-b-blockers.md` says what is blocked. This says what to build, in what
order, and which parts need you first. Where the two disagree, §6 says so.

---

## 1. The shape of the problem

Every remaining Stream B session is blocked by one of four things, and only the
first needs you:

| | Count | Who clears it |
|---|---|---|
| **A decision nobody has made** | 9 | You (§2) |
| **A table nobody builds** | 7 | Me (§3) |
| **A write path nobody builds** | 2 | Me (§4) |
| **Another stream, or an account** | 5 | Coordination (§5) |

The middle two are 9 PRs and are the bulk of the work. None of them needs you,
and none is blocked by the others except where stated.

---

## 2. Decisions — nine, and four are urgent

Ordered by which unblocks the most. **The first four gate PRs in §3.**

### 2.1 🟠 URGENT — what does the daily Table prompt come from? (§10.4)

Open since D1. `table_prompts` exists with a nullable `org_id`, so
platform-authored and Family-authored both fit — but nothing assigns one per
day, and D1's dashboard says *"No prompt is set for today"* because inventing a
selection rule would invent product.

**Blocks:** the Table prompt cron (PR 6), and D1's element 4 stays honest-but-empty until it lands.
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
designing. **Blocks:** PR 8's scope, not its schema.

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

## 3. Tables nobody builds — 7 PRs, no decisions needed

Ordered so each unblocks the next session in wave order. Every one is a
migration plus RLS plus pgTAP, following the pattern `towers`/`bricks` set: a
composite key to its Family, an audit trigger in the same migration, and
isolation coverage owed to PR 10.

| PR | What | Unblocks | Spec |
|---|---|---|---|
| **1** | `care_actions` | D2, N1 | §2.5 (F5.1) — fields and the three types are given |
| **2** | Per-item reminders | D2 | Not specified; shape stated as an assumption |
| **3** | Family Night — convener rotation + schedule | D2, A3, N1 | §2.2 (F2.1/F2.2) |
| **4** | `towers` publish state | K2 | Invariant 9 |
| **5** | Memorial-lock executor | Invariant 8 | §2.9 (F8.1/F8.2) |
| **6** | Table prompt assignment | D1 element 4 | §2.1 (F1.2) — **needs 2.1** |
| **7** | The "I'm not aligned" flag | Nothing yet | §2.7 (F7.1/F7.2) |

**PR 1 — `care_actions`.** `id`, `type`, `from_membership_id`, `target` (a
membership **or** a brick); `type` ∈ `cover_task` · `offer_bandwidth` ·
`reminder`. F4.6 is the coupling that makes it urgent: *"need help" converts the
Brick to an open, claimable task **and creates a linked Care Action*** — so D2's
board shows them in Wave 3.

**PR 2 — per-item reminders.** `notification_preferences` is keyed
`(org_id, profile_id, notification_type, channel)` and cannot hold "remind me
about *this* Brick". A new table keyed on `(membership_id, target_type,
target_id)`. Nothing specifies this; the shape is my assumption and will be
stated as one.

**PR 3 — Family Night.** A schedule on `organizations` (day + time, reusing
`timezone`) and a convener rotation derived the way `next_vow_holder()` already
is — never-held first, then longest-ago, then join order. **No new column on
`memberships`**: the history is the source, as with Vows.

**PR 4 — Tower publish state.** `published_at`, a public slug, and RLS allowing
anonymous read of published Towers only. Invariant 9 wants explicit,
confirmable, reversible and audited; the audit comes free from the trigger.
Scope depends on 2.6, the schema does not.

**PR 5 — memorial-lock executor.** `executor_membership_id`, and the
`table_entries` UPDATE policy gains an OR branch. #82 shipped the lock as
**total** on purpose and said so; this is the half that was knowingly deferred.

**PR 6 — Table prompt assignment.** An Inngest cron creating one prompt
opportunity per day per Family in its own timezone (F1.2). **Blocked by 2.1.**

**PR 7 — the alignment flag.** Attachable to a Tower, Vow or Build decision,
visible only to the organizer and the flag's creator, notifying the organizer.
Fully specified and in **no session in either stream** — `grep -c "aligned"` on
the run doc returns 0.

---

## 4. Write paths nobody builds — 2 PRs

`stream-b-blockers.md` found the first; the second follows from it.

**PR 8 — the Tower definition form.** `towers` exists and **nothing writes it**
— the only reference in `app/` or `lib/` is D1's dashboard, reading. O1's
acceptance is *"the guide cannot write a Tower directly — it prefills the
definition form the member submits"*, and that form does not exist. A2 assumes a
description is already there. K2 publishes something nobody can create.

Create and edit a Tower, organizer-scoped, with the Build breakdown left to A2.
**This is the highest-value item in the whole plan** — three later sessions
consume it and it is two days of nobody's schedule.

**PR 9 — the Table entry composer.** D1 is read-only by its own prompt, so a
member currently cannot write a Table entry at all. `table_entries` and
`retire_table_entry()` are both in place; this is UI over them. Q1's named edge
case (*keyboard-only through a full Table entry*) needs it, and so does the
graduation of D1's QA steps into ZeroStep tests.

---

## 5. Coordination and accounts — not code

| | What | Who |
|---|---|---|
| 🔑 | **ZeroStep token.** `@zerostep/playwright` is installed, no spec calls `ai()`, no token anywhere. Q4's whole premise | Account owner |
| 🔴 | **No staging project.** Q4 needs *"green in staging twice"*. Free caps at 2 projects — staging plus production is the entire allowance | You |
| 🟠 | **Service worker ownership** (2.8) | You + Stream A |
| 🔴 | **A1 must merge** before A3, A4 and O1 start | Stream A |
| 🟢 | **M1 inherits C2's per-Family quota** — settled in #98. A second 100 MB per Family takes 8 Families to 1600 MB against a 1 GB ceiling | Settled |

---

## 6. Corrections to `stream-b-blockers.md`

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

## 7. How this was verified

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

## 8. Carried defects, still owed

Neither belongs to a session; both are real and confirmed against the code.

- **`app/actions/support.ts` check-then-insert rate-limit race.**
  `public.consume_rate_limit(text,int,int)` already exists and is atomic — the
  only obstacle is that it is granted to `service_role` while the action uses
  the RLS user client. A grant decision, not new machinery.
- **`EMAIL_DELIVERY_MODE` defaults to `dry-run`**, so a production deploy that
  forgets it drops all mail while the UI reports success. The default is
  deliberate; what is missing is a startup assertion for production.

---

## 9. Suggested order

Assuming decisions 2.1–2.4 land soon:

1. **PR 8** — the Tower definition form. Highest value, three sessions waiting, no decision needed.
2. **PRs 1–3** — `care_actions`, per-item reminders, Family Night. This is D2's whole blocker set; D2 runs after.
3. **D2** — now genuinely "UI over existing tables".
4. **PR 9** — the Table entry composer. Unblocks Q1's edge case and the QA graduation.
5. **PRs 4, 5, 7** — publish state, executor, alignment flag. Independent; slot wherever.
6. **PR 6** — the prompt cron, once 2.1 is answered.

W2, F3, M1, A3, A4, O1 and Q4 stay blocked on §2 and §5 regardless of the above.

## 10. Related

- `stream-b-blockers.md` — what stops each session
- `d1-readiness.md` §8 — how the domain-model gap was found
- `production-constraints.md` — the Free-plan ceilings
