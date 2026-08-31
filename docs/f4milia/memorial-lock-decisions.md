# Memorial-lock: six decisions we need from Ivan

| | |
|---|---|
| **For** | Ivan Rattliff |
| **From** | S2 (auth hardening), 2026-09-01 |
| **Needed by** | Before anyone builds memorial-lock. Not blocking S2's ten open PRs |
| **How to answer** | Reply with the numbers. "1a, 2 yes, 3a…" is enough |

---

## Why you are reading this

Memorial-lock is named in three places that govern how we build — CLAUDE.md's
invariant 8, and twice in the run doc, including as the check a human performs
by hand before merging S2. It is defined in none of them, and the document where
it probably *is* defined, `f4milia-product-narrative-and-spec.md`, has never
been in this repository.

So the S2 session built account deletion against the written retention policy
and stopped at memorial-lock rather than guessing. This asks the six questions
that have to be answered before it can be built.

## What we already know

James supplied the concept on 2026-09-01:

> Memorial-lock is an account state that preserves a person's identity and
> contributions after they die, rather than erasing them. It freezes the account
> and **keeps their real name** on everything they wrote.

That is the opposite of ordinary deletion, which replaces a person's name with
"Deleted user". Memorial-lock keeps the name on purpose, because a Family's
record of someone who has died is the thing worth protecting.

## Why we stopped instead of guessing

Because the mistake would be invisible.

Ordinary deletion and memorial-lock touch the same three fields. Deletion
replaces the name, clears the picture, and does the same for each Family. If a
developer — or an AI — treats a deceased member as an ordinary deletion, that
code **looks right, reads right in review, and passes every test we have**,
because every test asserts the name *was* replaced.

The result would be a Family opening their record and finding the person they
lost listed as "Deleted user". There is no undo.

That is why the six questions below are worth five minutes now.

---

## The six decisions

Each one has our suggestion. Say yes, or say something else.

### 1. Who can memorial-lock an account?

| Option | What it means |
|---|---|
| **a. Platform staff only, after a Family asks** | A person outside the Family makes the change, on a request from inside it |
| b. The Family's organizer, on their own | Faster, no waiting on us |
| c. Either | — |

**Our suggestion: (a).** Getting this wrong on a living member locks them out of
their own account, and a grieving Family is not the right place for a button
with that consequence.

### 2. Can it be undone?

| Option | What it means |
|---|---|
| **a. Yes, by platform staff, and we record who did it** | A mistake is fixable |
| b. No, ever | Stronger promise, but a wrong click is permanent |

**Our suggestion: (a).** If it cannot be undone, then the first time it is
applied to the wrong person, a living member is permanently frozen out with no
route back.

### 3. A relative or executor asks us to delete the account. Who wins?

| Option | What it means |
|---|---|
| **a. Memorial-lock wins. We explain and do not delete** | The Family's record survives |
| b. The request wins. We delete as normal | The name is replaced everywhere |
| c. Staff decide case by case | No rule; slower; inconsistent |

**Our suggestion: (a)** — it is the whole point of the feature. But see the
legal note below: whether we *may* refuse depends on where the person lived, and
that is a question for counsel, not for us.

### 4. They deleted their own account, and later died. Does their name come back?

| Option | What it means |
|---|---|
| **a. No. Their choice while alive stands** | The record stays anonymous |
| b. Yes, memorial-lock restores it | We would be overriding something they asked for |

**Our suggestion: (a).** We think a decision someone made about their own name
should outlast them.

### 5. What exactly does "frozen" cover?

Four smaller yes/no answers:

| | Question | Our suggestion |
|---|---|---|
| 5a | Can anyone sign in to the account? | **No.** Never again |
| 5b | Can other members still comment on and react to their posts? | **Yes.** A Family talking about someone they lost is the point |
| 5c | Can they be removed from the Family roster? | **No.** They stay listed as a member |
| 5d | Can their Member Card still be edited by others? | **No.** Their own words about themselves stop where they stopped |

### 6. Their share of the work — the Ledger

This is the one we will not decide without you, because the run doc says
anything touching the equity ledger waits for you.

A person who dies mid-Tower has recorded hours, multipliers and slices. Those
are a record of ownership.

| Option | What it means |
|---|---|
| **a. Everything stays exactly as recorded, in their name** | The Ledger keeps telling the truth about who did the work |
| b. Their slices are removed or reassigned | The remaining Family's shares change |

**Our suggestion: (a).** Who those slices legally *belong* to afterwards is an
estate question, and we do not think code should decide it — but the record
itself should not move.

---

## The legal note

We have not written any legal wording, and will not. Whether a family, an
executor, or the person themselves has a say after death **varies by country**,
and in some places rights that would normally apply to personal data do not
survive the person. Counsel needs to confirm decisions 3 and 4 before any of
this reaches real Families.

Until they do, any wording a member sees about memorial-lock ships as visibly
unfinished — marked `[PENDING LEGAL REVIEW]` — per our rule against inventing
plausible-sounding terms.

## What happens once you answer

1. One line is added to the retention policy
   (`docs/trib4l-docs/data-retention-policy.md`), which today has three
   categories and no exceptions. Memorial-lock is its first exception, and until
   it is written there the policy and the feature disagree.
2. The deletion path gains a check: if an account is memorial-locked, the name
   is left alone.
3. Whoever can set the state (decision 1) gets a way to do it.
4. Tests are added that fail if a memorial-locked name is ever replaced —
   the mistake described above stops being possible.

## What we are doing in the meantime

We propose adding **only the guard**, now, before the feature exists: a marker
on an account, and a rule that deletion refuses to touch the name of an account
carrying it. It needs none of the six answers — only "this state exists, and
deletion must not erase it".

That way, if the feature is built months from now by someone who never reads
this document, the catastrophic version of the mistake fails a test instead of
reaching a Family.

Nothing a member sees changes until decisions 1–6 are made.

---

## Appendix, for whoever builds it

The three fields that must not be touched for a memorial-locked account are all
in `supabase/migrations/20260903100301_delete_my_account.sql`: step 1 sets
`profiles.display_name` to `'Deleted user'` and clears `profiles.avatar_url`;
step 2 clears `org_profiles.display_name`. Every existing assertion about that
function checks the replacement *happened*, so a memorial-locked account needs
its own assertions checking that it did not.
