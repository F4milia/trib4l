# C2 — PR plan

Wave 3 · Stream A. Mentions, reactions, threading, media in messages, and the
broadcast-authorization debt C1 carried forward.

Written before any code, per CLAUDE.md's standing workflow item 1. Each PR below
is independently mergeable and green on its own. **The 200-line cap is waived** at
James's instruction — PRs are sized by cohesion — but migrations still ship
standalone per §3 of the workflow.

| | |
|---|---|
| **Written** | 2026-09-02 |
| **Revised** | 2026-09-02 — six rulings folded in (§5.1 and §5.4 are now closed), and **both reserved slot ranges reallocated: they had gone stale.** See §4 |
| **Session** | `F4milia — Complete Run Doc`, Wave 3, Stream A |
| **Status** | **Not started**, confirmed 2026-09-02. Plan only |
| **Sequenced in** | `stream-a-unblock-plan.md` — C2 runs first of everything, ahead of the Stream A unblocking work |
| **Required reading** | `docs/f4milia/c2-realtime-broadcast-authorization.md` (the carried finding), `docs/f4milia/c1-conversations-and-realtime.md` §3 and §6 (the decisions C2 inherits, and the four ways a suite lied) |
| **Named edge case** | B @mentions A after A blocked B — no notification reaches A; the room is unaffected |

---

## 1. What does not exist yet

C2's acceptance criterion is *"a mention writes a notification row."* **There is
no notifications table**, and the run doc schedules no session that creates one.
This is the same gap D1 hit from the other side — `docs/f4milia/d1-readiness.md`
§1 shows `Design and migrate` appears exactly once in all 731 lines of the run
doc. C2 is the second session to hit it, and unlike D1 its prompt does not
forbid migrations, so C2 builds what it needs.

| Needed | Exists? | Owner |
|---|---|---|
| `notifications` | ❌ | **C2 builds it.** N1 (Wave 4) consumes it |
| `notification_type` value `'mention'` | ❌ — enum has `family_night_digest`, `vow_notification` | **C2 adds it.** E1's migration reserves the extension for N1; C2 needs it first |
| `message_mentions` | ❌ | C2 |
| `message_reactions` | ❌ — see §5.1, a legacy `reactions` table exists and is not this | C2 |
| `message_attachments` | ❌ | C2 |
| `messages.parent_message_id` | ❌ — C1 chose soft-delete specifically so replies would not dangle | C2 |
| Any storage bucket or storage policy | ❌ — **zero of either exist today** | C2 owns storage this wave |

## 2. The one thing the carried-forward doc gets incomplete

`c2-realtime-broadcast-authorization.md` §5.2 sketches an RLS policy on
`realtime.messages` and stops there. **A policy alone changes nothing.**

`lib/conversations-realtime.ts:74` opens the channel as:

```ts
const channel = supabase.channel(`conversation:${conversationId}`);
```

That is a **public** channel. Verified against the installed SDK's own type
definition — `node_modules/@supabase/realtime-js/.../RealtimeChannel.d.ts:51-54`:

> `private?: boolean` — *"defines if the channel is private or not and if RLS
> policies will be used to check data"*

The option is optional and C1 does not pass it, so **RLS on `realtime.messages`
is not consulted for this channel at all**. The migration can land, be perfectly
correct, and the leak reproduces unchanged. **The client change is half the fix,
and it is the half the sketch omits.**

**And it is probably not a safe one-liner.** Flipping a channel to private is
expected to route *both* delivery paths through `realtime.messages` RLS —
`postgres_changes` as well as `broadcast` — and C1's working message stream
currently rides the public channel. If the new policy is written for broadcast
only, live messages would stop arriving for everyone: a regression in the feature
C1 shipped, not a hardening of it.

**That expectation is reasoned, not measured** — it comes from reading the type
above, not from a run. **Measure it first**, before writing the policy, by
flipping `private: true` with no policy in place and watching whether
`postgres_changes` still delivers. The answer determines whether the policy needs
one clause or two, and getting it wrong in either direction is expensive: too
narrow breaks C1, too wide re-opens the leak.

So PR 1 must prove three things in one run, not one:

| | Must be true after |
|---|---|
| the leak is closed | Carol (Founder Collective only) receives **0** typing events on a Caregiver Circle channel |
| the control still works | Alice, a participant, still receives typing events |
| **C1 did not regress** | Alice still receives `postgres_changes` message rows on the same private channel |

The third is the one a careless run skips, and it is the expensive one. Per C1's
§6 lesson — a test showing Carol getting nothing proves nothing, because realtime
being broken in the environment looks identical.

## 3. The PRs

Ordered by dependency. PR 1 is independent and goes first because it is debt
already on `main`.

| # | PR | Why it is separate |
|---|---|---|
| **1** | **Realtime Authorization.** RLS on `realtime.messages` keyed on `is_conversation_participant()`, plus `private: true` on the channel. pgTAP for the policy; the §7 probe as an isolation test with all three assertions from §2 | The carried C1 finding. Touches no new table, and a regression here breaks a merged feature — it must not be entangled with new schema |
| **2** | **Threading.** `messages.parent_message_id`, self-referencing, with a trigger asserting the parent is in the same conversation | Reuses C1's child-matches-parent shape. One column, one trigger, one test file |
| **3** | **`notifications` + `'mention'` enum value.** Table, audit trigger in the same migration (invariant 5), RLS, and the enum extension. **Also carries N1's requirements** — see §5.5 | N1 inherits this table. Landing it alone means N1 reviews a schema, not a schema buried in a mentions feature |
| **4** | **`message_mentions` + the write path.** The trigger or function that turns a mention into a notification row, with `member_blocks` applied. **This PR carries the named edge case** | Depends on 3. The blocks × mentions decision is the reviewable unit |
| **5** | **`message_reactions`.** Table, RLS, aggregate | Depends on nothing but `messages`. See §5.1 and §5.2 before writing it |
| **6** | **Storage: bucket, RLS, quota, size cap, and the project-level ceiling.** Migration only, no UI | The largest single risk surface and the acceptance criterion most likely to be assumed rather than proven. The Free plan added the ceiling check to it — §5.4. Reviewed alone |
| **7** | **Data access layer.** `lib/` functions for mentions, reactions, threads and attachments, with isolation tests through the SDK | Mirrors C1 `#71`. Proves the policies hold through the client, not only in pgTAP |
| **8** | **UI.** Mention autocomplete, reaction picker, thread view, attachment upload; copy deck; unit tests | The only PR touching `app/` and `components/`. Keeps the ZeroStep path filter meaningful for 1–7 |

## 4. Numbering, and where Stream B is standing

Stream B holds `schema/bricks` (towers, builds, bricks) and will follow with
`table_entries`, `vows` and a seed extension. Collisions are avoidable if C2
takes the slots below and no others.

**🔴 Both ranges this section originally reserved have gone stale.** They were
correct when written; Stream B kept adding migrations and pgTAP files afterwards
and overtook them. Verified against the tree on 2026-09-02:

| Originally reserved | Why it no longer works |
|---|---|
| Migrations from `20260903100801` | The slot is still *free*, but the highest version on the branch is now **`20260903101311`** — so taking it would create an **out-of-order migration**, applied below versions already present |
| pgTAP from `140` | **Taken.** `140_brick_release_on_departure`, `150_table_entries`, `160_vows`, `170_family_streak`, `180_seed_domain_data`, `190_qa_fixtures` all exist |

**The allocation now lives in one place for both plans** —
`stream-a-unblock-plan.md` §1.1 — because C2 and the unblocking PRs are Stream A
migrations competing for the same lane, and two documents allocating
independently is how the original collision happened. C2's slots:

| | Stream A (C2) takes | Stream B's lane |
|---|---|---|
| **Migrations** | `20260903101701` … `20260903102201`, one per migration PR, `x01` offset | `x11` at each minute |
| **pgTAP files** | **`230`+** | unchanged |

Two standing rules that produced the mess above, both still in force: `version` is
the primary key of `schema_migrations`, so a duplicate makes the merged branch
unable to reset at all and neither branch shows it alone; and **a slot reservation
is only true as of a named commit** — re-check the max before writing the file,
not when writing the plan.

### The conflict to expect, and its wrong resolution

`supabase/tests/database/030_audit_triggers_special_cases.sql` hardcodes a total
audit-trigger count. Both branches independently changed `33` → **`36`**, for
different reasons:

| Branch | Reasoning | Value |
|---|---|---|
| `main` | 33 + C1's `conversations`, `conversation_participants`, `messages` | 36 |
| `schema/bricks` | 33 + `towers`, `builds`, `bricks` | 36 |

Git will conflict on the prose, and **the correct merged value is 39, not 36.**
Taking either side's line lands a wrong number. C2 adds four more tables
(`notifications`, `message_mentions`, `message_reactions`,
`message_attachments`), so C2's own value is **43** — computed from 39, not from
whatever the merge left behind. Recompute it; do not increment the number
already in the file.

Same closed-set shape as `tests/database/050`'s metadata key allowlist
(CLAUDE.md, 2026-09-01): a fix that forgets it fails with a message about
content leaks, pointing at the wrong problem.

### Two things not to do

- **Do not add `[storage.buckets.*]` to `supabase/config.toml`.** A config.toml
  change restarts shared containers and is a cross-stream API change — the
  captcha incident (CLAUDE.md, 2026-09-01) took out nine of the other stream's
  tests that way. Create the bucket with `insert into storage.buckets` inside
  the migration.
- **Do not run `npm run test:isolation`, `supabase test db`, Playwright, or a
  dev server while Stream B is active.** `test:isolation` begins with
  `supabase db reset`. CI provisions its own Postgres and is the only safe
  authority while the streams overlap — it verified C1's record's figures that
  way (PR `#78`).

## 5. Decisions C2 must make before writing

### 5.1 Reactions: extend the legacy table, or a new one

A `reactions` table already exists from the pre-F4milia schema
(`20260823191444_posts_comments_reactions.sql`). It is **not** reusable as-is:

```sql
constraint reactions_exactly_one_target check ((post_id is null) <> (comment_id is null))
```

Adding `message_id` means widening that CHECK to a three-way exclusive-or and
teaching `set_reaction_org_and_cohort()` a third branch.

> **✅ RULED (2026-09-02, decision 2): a separate `message_reactions`, keyed on
> `membership_id`.** The CHECK is the decisive part — as written, a message-keyed
> row **cannot satisfy it at all** and is rejected outright, so "extend the legacy
> table" was never a small change. Full reasoning in `stream-a-blockers.md` §3.

**Recommendation, now the ruling: a separate `message_reactions`.** The legacy table is keyed on `profile_id`;
everything in C1 is keyed on `membership_id`, deliberately — C1 `#67`'s comment
is explicit that a `profile_id` key makes every read path responsible for
re-checking which Family it is in. Mixing the two keying schemes in one table is
how that check gets forgotten.

### 5.2 Reaction counts are a read path

`unread_message_counts()` was C1 `#70`'s worst near-miss: as `SECURITY DEFINER`
it counted messages the viewer could not see, so a blocker's badge reported how
much the blocked member was posting — **invariant 6 defeated by a number rather
than by content.** A reaction count is the identical shape.

Any aggregate over RLS-protected rows is `SECURITY INVOKER`, and its test
asserts the count **against the visible-row count, not against a constant.**

### 5.3 A notification row must not carry message text

Invariant 3: no Family content in any outbound message. N1 turns these rows into
emails and pushes. A `notifications` row therefore stores a **reference**
(`message_id`, `conversation_id`, actor membership) and never the body — if the
text is in the row, N1 inherits a schema that makes violating invariant 3 the
path of least resistance.

### 5.4 Per-Family storage quota — where the number comes from

The acceptance criterion is *"quota exceeded fails with a plain message, not a
broken upload."* That needs the quota checked **before** the object is written,
which means summing `storage.objects.metadata->>'size'` for the Family's path
prefix.

> **✅ RULED (2026-09-02, decision 1) — on the Supabase FREE plan**, which gives
> **1 GB across the whole project, not per Family:**
>
> | | Value |
> |---|---|
> | Per-file cap | **5 MB** — set on the **bucket row** as well as in the app, so the platform enforces it too |
> | Per-Family quota | **100 MB** |
> | Deleting a message | **deletes the blob** |
>
> 5 MB because on a 1 GB project a 10 MB attachment is 1% of everything; 5 MB still
> covers a phone photo or a document. 100 MB budgets ~800 MB usable with headroom,
> because M1 (Wave 5, Stream B) adds photos on Table entries and attachments on
> Bricks *"same quotas, same caps"*, and K1 generates PDFs.

**🔴 NEW SCOPE the Free plan creates — a per-Family quota does not bound the
project total.** Decision 12 fixed the Family count at **8**, and
`8 × 100 MB = 800 MB` is the usable budget **exactly** — the ceiling invariant
holds with equality and carries no slack.

So the failure this PR must handle is not only "a Family exceeds 100 MB". It is
**a Family comfortably under its own quota whose upload fails anyway**, because the
project is full — and that surfaces as a raw Supabase error, not as this PR's plain
message, which breaks the acceptance criterion in a way the per-Family check
structurally cannot catch.

PR 6 therefore needs **either a project-level check alongside the per-Family one,
or the invariant `max_families × per_family_quota ≤ usable budget` enforced
somewhere real** — not merely true by arithmetic today. Related and still open:
**decision 14**, how the 8-Family cap itself is enforced, since nothing in the
repo limits how many Families exist and an `organizations` INSERT can therefore
break the storage ceiling without any upload occurring.

### 5.5 What N1 needs from `notifications`, stated before it is built

N1 (Wave 4) inherits this table and adds delivery. Written here rather than in a
separate document because C2's PR 3 already owns the table, and two specs for one
table is how they drift.

- **`'mention'` must land in `notification_type` in PR 3.** E1's migration comment
  reserves the extension for N1, but C2 needs the value a wave earlier. **C2 owns
  it**; N1 adds no enum values. That ambiguity, left alone, is how the enum gets
  extended twice.
- **Keyed on `membership_id`**, per C1's convention, so no read path has to
  re-derive which Family a notification belongs to.
- **A row carries no content** — a type, a target, and the ids needed to build a
  link, never message text. §5.3 already argues this for the row; the point here
  is that it is also what makes invariant 3 achievable **downstream**: N1 renders
  pushes and emails from this row, so a row that carries text makes leaking it the
  path of least resistance.
- **Read state on the row** (`read_at`), not inferred from a separate high-water
  mark — see decision 15, which is the same class of bug in C1's message read mark.
- **`member_blocks` applied at write time in PR 4**, so a blocked member's mention
  never becomes a row rather than being filtered at read. N1 must not have to
  re-check blocks to be correct.

## 6. Invariants this session touches, and where each is proven

Named here so none is discovered late.

| Invariant | Where C2 satisfies it |
|---|---|
| **3** — no Family content outbound | §5.3; asserted in PR 3's pgTAP on the `notifications` column set |
| **5** — audit trigger in the creating migration | PRs 3, 4, 5, 6; the `030` census (§4) is what catches an omission |
| **6** — `member_blocks` on every new social surface | PR 4 (mentions, the named edge case), PR 5 (reactions **and** their counts, §5.2) |
| **7** — rate limits on anything that costs money or sends | Uploads cost storage. C1 recorded "no rate limit on sending" as Q2's sweep; **an upload endpoint is a new argument for doing it here** — raise it rather than inheriting the deferral silently |
| **9** — nothing public by default | The bucket is private. A public bucket makes the "unreachable from a Family B session" criterion unprovable |

## 7. What acceptance looks like

From the prompt, restated as things that must be measured rather than assumed:

1. **A mention writes a notification row** — and writes **none** when the
   mentioned member has blocked the author, while the message itself still
   posts. The room is unaffected; only the notification is suppressed.
2. **An attachment uploaded to Family A's channel is unreachable by URL from a
   Family B session** — *"proven, not assumed"*, in the prompt's own words. The
   proof is a real signed request from a Family B JWT, not a policy reading.
3. **Quota exceeded fails with a plain message** — the copy deck string, not a
   stack trace and not a silently truncated upload.
4. Plus §2's three realtime assertions, including the C1 non-regression.

Every one of these needs a **drop-and-count control** — the policy removed, the
assertions counted. C1 measured that a file asserting only refusals passes with
its INSERT policy deleted entirely (CLAUDE.md, 2026-09-01 C1 PR2). Storage
policies are the same shape and there are none in the repo to copy from.

## 8. Related

- `docs/f4milia/c2-realtime-broadcast-authorization.md` — the finding, the probe,
  and the policy sketch §2 above completes
- `docs/f4milia/c1-conversations-and-realtime.md` — §3 the decisions C2 inherits,
  §6 the four ways a green suite proved less than it claimed
- `docs/f4milia/d1-readiness.md` — Stream B's state, and §6's stacked-merge rule
- `docs/manual-checks/README.md` — the hand-check pattern, and how to prove it can
  fail
