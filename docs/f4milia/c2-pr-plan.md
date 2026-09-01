# C2 — build plan

Wave 3 · Stream A. Mentions, reactions, threading, media in messages, and the
broadcast-authorization debt C1 carried forward.

Written before any code, per CLAUDE.md's standing workflow item 1.

| | |
|---|---|
| **Written** | 2026-09-02 |
| **Session** | `F4milia — Complete Run Doc`, Wave 3, Stream A |
| **Status** | **Not started.** Plan only |
| **Shape** | **Four PRs**, decided 2026-09-02 (James) — see §3 |
| **Required reading** | `docs/f4milia/c2-realtime-broadcast-authorization.md` (the carried finding), `docs/f4milia/c1-conversations-and-realtime.md` §3 and §6 (the decisions C2 inherits, and the four ways a suite lied) |
| **Named edge case** | B @mentions A after A blocked B — no notification reaches A; the room is unaffected |
| **Open decisions** | **None.** Both closed 2026-09-02 (James) — see §6.1 and §6.4 |

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
| `message_reactions` | ❌ — see §6.1, a legacy `reactions` table exists and is not this | C2 |
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

So the realtime work must prove three things in one run, not one:

| | Must be true after |
|---|---|
| the leak is closed | Carol (Founder Collective only) receives **0** typing events on a Caregiver Circle channel |
| the control still works | Alice, a participant, still receives typing events |
| **C1 did not regress** | Alice still receives `postgres_changes` message rows on the same private channel |

The third is the one a careless run skips, and it is the expensive one. Per C1's
§6 lesson — a test showing Carol getting nothing proves nothing, because realtime
being broken in the environment looks identical.

## 3. Shape: four PRs

**Decided 2026-09-02 by James.** This replaces an earlier single-PR decision
made the same day; the reversal is recorded rather than erased, because the
reasoning that changed is worth keeping.

**The single-PR case rested on one argument, and it was weaker than it looked.**
It was that `lib/supabase/database.types.ts` and `tests/database/030` are
cross-stream conflict surfaces, so one landing means one conflict resolution
rather than five. Two things undercut it:

- **Stream B has finished.** `#80`, `#85`, `#86` and `#88` are all merged, so the
  trunk churn that made conflicts expensive is over.
- **Both conflict surfaces live entirely in the schema work.** Splitting the
  realtime fix and the UI away from them costs nothing on that axis. The single
  PR was paying a real price for a benefit it could have had anyway.

**The 200-line rule stays overridden.** PR 2 is roughly 900 lines and cannot be
otherwise for five tables at this repo's comment density. That is still a
deliberate departure from standing workflow item 1, not a rule being
reinterpreted back into shape.

### 3.1 The four, and why each boundary is where it is

| # | PR | ~Size | Why it is its own PR |
|---|---|---|---|
| **1** | **Realtime Authorization** | ~200 | The only change in C2 that can **break something already merged and working**. If live chat goes dark, the fix is one revert, not a C2-shaped one. It is also debt rather than feature, so it can land while the rest is still being written |
| **2** | **Schema** — five tables, the threading column, the `'mention'` enum value, the `030` recompute | ~900 | All migrations. The **only** PR touching `database.types.ts` and `030`, which preserves the conflict argument in full. This is the Greptile-tier RLS review and should be readable without 400 lines of React in the diff |
| **3** | **Storage** — bucket, `storage.objects` RLS, quota, size cap | ~350 | The repo has **zero storage policies today**, so there is no proven pattern to copy — which is precisely why this one cannot ride along unexamined. Its acceptance (*"unreachable from a Family B session — proven, not assumed"*) deserves its own review, not page four of a schema PR |
| **4** | **Data access + UI** | ~800 | The only PR touching `app/` and `components/`, which keeps the ZeroStep path filter meaningful for 1–3. Carries no migration, so it can iterate without the run doc's *"migrations merge same-day"* pressure |

**Why not eight or nine.** The earlier breakdown was dependency ordering, not
merge boundaries. `message_mentions` without its write path is dead schema; most
of those units cannot stand alone as something worth reviewing. Nine landings
also means nine rounds of type regeneration, census edit, CI and review.

**Why not one.** Beyond the collapsed conflict argument: PRs 2 and 4 have
genuinely different merge cadences. The run doc forces any PR with a migration
to merge same-day; the UI wants to iterate. Bundled, one holds the other hostage.

### 3.2 Rules that still apply

1. **PR 1 lands and is proven before PR 3 is written.** Storage is the other
   place a policy mistake is expensive, and doing them at once means debugging
   two new policy surfaces against one another.
2. **PR 1 is self-contained** — its own migration, its own test file, no
   dependency on any new table — so `git revert` restores C1's behaviour exactly.
3. **Commits within each PR stay in the dependency order of §4** and each is
   green on its own. Reviewing PR 2 commit by commit is how a 900-line schema
   diff stays readable.
4. **Open PR 1 as a draft early and let CI run.** The realtime non-regression is
   the assertion most worth knowing first, and it cannot be measured in the
   schema sandbox.

## 4. The PRs, in order

Dependency-ordered. PR 1 is independent and goes first because it is debt
already on `main` and the only regression risk in the session.

### PR 1 — Realtime Authorization

Measure §2.1 first, before writing the policy. Then RLS on `realtime.messages`
keyed on `is_conversation_participant()`, plus `private: true` on the channel.

Proves all three assertions from §2: the leak is closed (Carol receives 0), the
control still works (Alice receives typing), and **C1 did not regress** (Alice
still receives `postgres_changes`). Plus a drop-and-count control.

### PR 2 — Schema

| Commit | |
|---|---|
| 1 | **Threading.** `messages.parent_message_id`, self-referencing, with a trigger asserting the parent is in the same conversation. Reuses C1's child-matches-parent shape |
| 2 | **`notifications` + the `'mention'` enum value.** Table, audit trigger in the same migration (invariant 5), RLS. N1 inherits this table |
| 3 | **`message_mentions` + the write path.** Mention → notification row, with `member_blocks` applied. **Carries the named edge case** |
| 4 | **`message_reactions`.** Table, RLS, count as `SECURITY INVOKER` — see §6.2 |
| 5 | **`message_attachments`.** Metadata only; the bucket arrives in PR 3. Ships with RLS enabled and no policies, which denies everything — the same shape C1 `#67` used deliberately |
| 6 | **The `030` census.** Recompute the audit-trigger total from the tables that actually landed — see §5 |

Five new public tables, so this is where `database.types.ts` is regenerated and
where `030` moves. Nothing else in C2 touches either.

### PR 3 — Storage

Bucket created by `insert into storage.buckets` inside the migration, **never**
via `config.toml` (§5). `storage.objects` RLS matching the conversation's
participant scoping. Quota and per-file cap per §6.4.

Carries the acceptance criterion the prompt words most strongly — *"an
attachment uploaded to Family A's channel is unreachable by URL from a Family B
session — proven, not assumed"* — and its drop-and-count control.

### PR 4 — Data access and UI

`lib/` functions for mentions, reactions, threads and attachments, with a
dual-Family isolation file proving the policies hold through the SDK rather than
only in pgTAP (mirrors C1 `#71`). Then mention autocomplete, reaction picker,
thread view and attachment upload, with the copy deck.

## 5. Numbering, and where Stream B is standing

**Stream B's `schema/bricks` merged as `#80`** — towers, builds and bricks are on
`main`. Stream B will follow with `table_entries`, `vows` and a seed extension,
so the streams still share the trunk. Collisions are avoidable if C2 takes the
slots below and no others.

| | Stream A (C2) takes | Already on `main` |
|---|---|---|
| **Migrations** | `20260903100801`+ — the `x01` slot | Stream B's `x11`/`x12` through `20260903100812_bricks_rls` |
| **pgTAP files** | **`140`+** | `110_conversations_schema`–`114` (C1), `110_towers`, `120_builds`, `130_bricks` (Stream B) |

Verified against `origin/main` after `#80`, not predicted: `120` and `130` are
taken, the highest migration is `20260903100812`, and the highest `x01` slot used
is `20260903100706`. So `20260903100801`+ and pgTAP `140`+ are both clear.

### The `030` census — resolved on `main`, and the base C2 computes from

`supabase/tests/database/030_audit_triggers_special_cases.sql` hardcodes a total
audit-trigger count. This was written as a conflict to expect; **`#80` landed
`schema/bricks` on `main` first and it is now resolved.** The resolution is
correct — **39** — and it is worth reading, because the trap was sharper than
predicted:

| Branch | Reasoning | Value |
|---|---|---|
| `main` | 33 + C1's `conversations`, `conversation_participants`, `messages` | 36 |
| `schema/bricks` | 33 + `towers`, `builds`, `bricks` | 36 |

Both streams wrote **the same number on the same line** for different reasons, so
git **auto-merged the count to 36 without a conflict** and raised one only on the
descriptive message beside it. Resolving the visible conflict would therefore
have left a silently wrong total, three too low — and `030` then fails with a
message about audit coverage, pointing at the wrong problem. The merged file now
carries a comment saying exactly this.

**What this means for C2:** the base is **39**, on `main`, today. C2 adds four
tables (`notifications`, `message_mentions`, `message_reactions`,
`message_attachments`), so C2's value is **43**. Re-derive it from the tables that
landed; do not increment the number in the file and do not assume a merge got it
right. PR 2's last commit exists to make this one deliberate act.

Same closed-set shape as `tests/database/050`'s metadata key allowlist
(CLAUDE.md, 2026-09-01): a closed-set guard two streams edit independently needs
its total re-derived, never merged.

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
  way (PR `#78`). §3.2 item 4's draft PR on PR 1 is how the database suites get
  exercised early rather than at the end.

## 6. Decisions — all closed

**Confirmed by James, 2026-09-02.** Nothing here is outstanding; C2 can start.

### 6.1 Reactions: a new table, not the legacy one ✅ CONFIRMED

A `reactions` table already exists from the pre-F4milia schema
(`20260823191444_posts_comments_reactions.sql`). It is **not** reusable as-is:

```sql
constraint reactions_exactly_one_target check ((post_id is null) <> (comment_id is null))
```

Adding `message_id` means widening that CHECK to a three-way exclusive-or and
teaching `set_reaction_org_and_cohort()` a third branch. **Recommendation: a
separate `message_reactions`.** The legacy table is keyed on `profile_id`;
everything in C1 is keyed on `membership_id`, deliberately — C1 `#67`'s comment
is explicit that a `profile_id` key makes every read path responsible for
re-checking which Family it is in. Mixing the two keying schemes in one table is
how that check gets forgotten.

**What settled it was the blast radius, measured rather than argued.** The legacy
table also carries `cohort_id` and `required_stage_id`, and its policies are
created in `20260823191544_posts_rls.sql` and then **dropped and recreated** in
`20260825203301_content_gating.sql`, gated by
`can_see_gated_content(org_id, cohort_id, required_stage_id)`. Extending it would
mean rewriting stage-gating policies across three migrations so a Family chat
reaction is not silently gated by a Trib4l stage — a bug that would look like it
works. A new table is one migration reusing `is_conversation_participant()`.

### 6.2 Reaction counts are a read path ✅ CONFIRMED

`unread_message_counts()` was C1 `#70`'s worst near-miss: as `SECURITY DEFINER`
it counted messages the viewer could not see, so a blocker's badge reported how
much the blocked member was posting — **invariant 6 defeated by a number rather
than by content.** A reaction count is the identical shape.

Any aggregate over RLS-protected rows is `SECURITY INVOKER`, and its test
asserts the count **against the visible-row count, not against a constant.**

### 6.3 A notification row must not carry message text ✅ CONFIRMED

Invariant 3: no Family content in any outbound message. N1 turns these rows into
emails and pushes. A `notifications` row therefore stores a **reference**
(`message_id`, `conversation_id`, actor membership) and never the body — if the
text is in the row, N1 inherits a schema that makes violating invariant 3 the
path of least resistance.

### 6.4 Storage quota and caps ✅ CONFIRMED

The acceptance criterion is *"quota exceeded fails with a plain message, not a
broken upload."* That needs the quota checked **before** the object is written,
which means summing `storage.objects.metadata->>'size'` for the Family's path
prefix.

| | Value | Reasoning |
|---|---|---|
| Per-file cap | **10 MB** | A phone photo is 2–5 MB, a document under 10. Deliberately excludes video, which is correct — Mux is already the video path (`@mux/mux-node`, `video_assets`, `live_streams`). `config.toml`'s 50 MiB is the bucket ceiling, not a product decision |
| Per-Family quota | **1 GB** | ~15 months of moderate use for a 12-person Family. Chosen tight on C1's own precedent: *"raising a CHECK is a one-line migration that rewrites nothing; lowering one after real messages exist means deciding what to do with the rows that no longer fit. Start tight."* Hitting the quota is a **visible, recoverable** failure this session already builds the plain-message UX for; an over-generous quota is an invisible cost problem |
| Deleting a message | **Deletes the blob** | Rather than deciding whether soft-deleted attachments count, make them not exist. Soft-delete the message *row* — C1 needs that so replies do not dangle — and hard-delete the object. Nothing dangles: the row keeps a reference that no longer resolves, which is exactly what M1's edge case asks for (*"the storage object is unreachable afterward"*). The quota then never lies, and there is no reclaim job to schedule |

> **Wire the blob delete to MESSAGE deletion only, never to account deletion.**
> Invariant 8's anonymize-vs-purge policy governs that path and memorial-locked
> content persists. Different path, different rule.

**The 1 GB is the number to revisit** — the only value here with real
uncertainty, because no hosted Supabase project is linked yet and it could not
be calibrated against a real storage plan. One-line change once staging exists.

## 7. Invariants this session touches, and where each is proven

Named here so none is discovered late.

| Invariant | Where C2 satisfies it |
|---|---|
| **3** — no Family content outbound | §6.3; asserted in PR 2's pgTAP on the `notifications` column set |
| **5** — audit trigger in the creating migration | Every table in PR 2; the `030` census, PR 2's last commit, is what catches an omission |
| **6** — `member_blocks` on every new social surface | PR 2 — mentions (the named edge case) and reactions, **including their counts** (§6.2) |
| **7** — rate limits on anything that costs money or sends | Uploads cost storage. C1 recorded "no rate limit on sending" as Q2's sweep; **an upload endpoint is a new argument for doing it here** — raise it rather than inheriting the deferral silently |
| **9** — nothing public by default | The bucket is private. A public bucket makes the "unreachable from a Family B session" criterion unprovable |

## 8. What acceptance looks like

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

## 9. Related

- `docs/f4milia/c2-realtime-broadcast-authorization.md` — the finding, the probe,
  and the policy sketch §2 above completes
- `docs/f4milia/c1-conversations-and-realtime.md` — §3 the decisions C2 inherits,
  §6 the four ways a green suite proved less than it claimed
- `docs/f4milia/d1-readiness.md` — Stream B's state, and §6's stacked-merge rule
- `docs/manual-checks/README.md` — the hand-check pattern, and how to prove it can
  fail
