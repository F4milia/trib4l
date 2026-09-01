# C1 — Conversations schema and realtime chat

Session record. Wave 2 · Stream A.

| | |
|---|---|
| **Ran** | 2026-09-01 – 2026-09-02 |
| **Scope** | `F4milia — Complete Run Doc`, Wave 2, Stream A |
| **Gate cleared first** | The four deferred audit-trigger defects — see §1 |
| **Delivered** | 7 PRs merged (`#67`–`#73`), 3 follow-ups (`#74`, `#76`, and `#75` which did not land — §9) |
| **C1's own assertions** | 69 pgTAP across 5 files · 14 isolation · 7 unit · 5 browser |
| **Suites on `main` at close** | 385 pgTAP across 20 files · 149 isolation across 25 · **1015 unit across 37** |
| **Review tier** | Greptile — new RLS surface throughout |
| **Status** | **Complete and merged** — schema, policies, channel creation, read state, data access, realtime and the UI. One finding carried to C2 |

---

## 1. The gate that ran first

C1 could not start until four defects deferred from audit PR 3/5 cleared, because
C1 creates the highest-write tables in the product and all of them fire the audit
trigger. Verified against the migration head rather than against the note:

| | Outcome |
|---|---|
| **CD-3** — DELETE check-then-insert race | Fixed, `#64` |
| **CD-4** — actor uuid with no `profiles` row aborts the write | Fixed, `#64` (one fix with CD-3) |
| **PERF-2** — no index on `audit_log(target_type, target_id)` | Fixed, `#65` |
| **PERF-1** — `to_jsonb(new)` copying the whole row | **Not a defect. Not built** |

PERF-1 is the one worth remembering. It was recorded as a measured "+50% write
cost on a 4 KB body, scaling with row width", with `messages` named as its worst
case. Re-measured three ways with extraction isolated from the audit INSERT:

| body | no trigger | `to_jsonb` (current) | proposed narrow read |
|---|---|---|---|
| 4 KB incompressible | 166–206 ms | 191–231 ms | 192–599 ms |
| 64 KB incompressible | 280–313 ms | 279–351 ms | 276–337 ms |

The +50% was the audit INSERT itself — the cost of auditing, not a defect. The
original measurement almost certainly used `repeat('x', 4096)`, which pglz
crushes to nothing, so it could not have measured a row-width effect at all.
Building the prescribed fix would have added a per-row dynamic `EXECUTE` for no
gain and a worse tail.

## 2. What shipped

| PR | What | State |
|---|---|---|
| **#67** | `conversations`, `conversation_participants`, `messages`; audit triggers in the creating migration; the child-matches-parent integrity trigger; RLS enabled with no policies | merged `clean` |
| **#68** | Participant-scoped policies, the three `SECURITY DEFINER` helpers, `member_blocks` in the SELECT policy, the dual-Family pgTAP | merged `clean` |
| **#69** | Automatic Family channel per Family, membership join trigger, backfill | merged `clean` |
| **#70** | `last_read_at`, `unread_message_counts()`, `mark_conversation_read()` | merged `clean` |
| **#71** | `lib/conversations.ts`, `create_direct_conversation()`, SDK isolation tests | merged `clean` |
| **#72** | Realtime publication, `REPLICA IDENTITY FULL`, client subscription, typing broadcast | merged `clean` |
| **#73** | The channel and DM surface, copy deck, nav entry | merged — see the note below |
| **#74** | The C2 broadcast finding, and the comment it disproved | merged |
| **#76** | Re-land of C1's hand-check and seven learned constraints | merged |

**`#73` was decided against, then merged anyway — recorded because the reversal
is the fact, not the first decision.** This record was drafted while `#73` was
open by decision; it merged at 17:48:37 UTC on 2026-09-01, nine minutes after
`#76`. Everything downstream of that call changed with it: `/o/[slug]/messages`
exists on `main` and the browser half of the named edge case has a home again.
Two notes in `c2-realtime-broadcast-authorization.md` went stale with it and are
corrected in the same change: its §8 still called `docs/manual-checks/`
unmerged, which `#76` had already fixed, and its §5.1 still asked C2 to correct
a comment `8052613` had already corrected.

## 3. The decisions worth remembering

**Participation is keyed on `membership_id`, not `profile_id`.** This is the
whole isolation design:

> a profile is a person, and a person can be in Families A and B
> a membership IS a person in ONE Family

So a participant row cannot address the wrong Family — there is no value it could
hold that would let it. The named edge case becomes structural rather than
remembered, and it joins `member_blocks` directly, which is already keyed this
way. A `profile_id` key would have made every read path responsible for
re-checking which Family it is in, which is exactly what gets forgotten.

**Scoped to participants, never to the Family.** Being in Family A does not
entitle you to read a DM between two other members of Family A. Every policy asks
"are you in this conversation", never "are you in this Family". The plausible
wrong version — `using (is_org_member(org_id))` — passes every cross-Family test
in the suite and fails only *inside* a Family. That is why the hand-check exists.

**Blocks live in the SELECT policy, not the read path.** Supabase Realtime
evaluates RLS per subscriber, so a block enforced in policy holds on the live path
too. One enforced in `lib/` would have been bypassed by the first realtime
subscription in `#72` and would have looked correct in every server-side test.

**`unread_message_counts()` is `SECURITY INVOKER`.** A derived count is a read
path and needs the same policy as the rows it counts. A `DEFINER` version counts
messages the viewer cannot see, so a blocker's badge reads "3 new" in a room
showing two — invariant 6 defeated by a number rather than by content.

**`mark_conversation_read()` is `SECURITY DEFINER`, and that is a hole avoided
rather than a convenience.** RLS cannot restrict *which columns* an UPDATE
touches. `grant update on conversation_participants` plus "only your own row"
would let a member change their own row's `conversation_id` and walk into any DM
in their Family, where the integrity trigger sees nothing wrong because the org
still matches. The policy would read as "edit your own row" and mean "join any
room". No UPDATE grant is issued at all.

**`messages_update` is author-only**, deliberately departing from `posts_update`,
which extends to organizers. An organizer cannot read a DM under
`messages_select`; granting update on rows they cannot see would let staff edit
private conversations. Family-channel moderation, if wanted, belongs in C2 scoped
to that kind.

**`org_id` is denormalized onto the child tables and held true by a trigger.**
`audit_row_change()` resolves an org through `row` / `self` / `order`, and a
message's org is reachable only through its conversation — a fourth mode would
have meant editing a shared file outside this session's scope.

**Typing is broadcast, not a table.** It is true for three seconds; storing it
would mean a write per keystroke-burst, an audit row for each, and a row in the
Ledger's own database recording that someone began typing and thought better of
it. See §7 for what that costs.

## 4. Things that were measured, and what each one changed

**`REPLICA IDENTITY FULL` is not optional.** RLS on an UPDATE is evaluated against
the OLD row; with the default identity that row is only the primary key, so
Realtime cannot decide whether a subscriber may see what changed and drops the
event. C1 soft-deletes via UPDATE, so without this a deleted message stays on
every open screen until a refresh.

**Realtime readiness has three levels and only the third is real:**
`channel.state === "joined"` (socket up), the `SUBSCRIBED` ack (bindings created),
and messages actually streaming. After `supabase db reset` the service
re-establishes its replication slot and for a few seconds acks subscriptions while
streaming nothing. The delivery test failed on the run straight after a reset and
passed on every warm run — both before and after switching from state to the ack.
It now warms up by waiting for a probe message to arrive. **CI resets immediately
before the suite**, so without that it would have been a coin toss there and green
locally.

**`(target_type, target_id)` on `audit_log`**, on 200k rows: 2869 buffers /
7.123 ms parallel seq scan becomes 4 buffers / 0.033 ms index scan, for 9.2 MB.
Not speculative — the isolation suite already filters on `target_id` in three
files because the 2026-08-29 constraint requires it.

## 5. How it was verified

Five independent paths, because each proves a different claim:

| | Proves |
|---|---|
| `111_conversations_rls.sql` | the policies, with dana in both Families |
| `tests/isolation/conversations.test.ts` | `lib/conversations.ts` inherits them |
| `tests/isolation/conversations-realtime.test.ts` | the socket honours them |
| `docs/manual-checks/c1-dual-family-check.sh` | raw PostgREST, no SDK in the path |
| `tests/e2e/dual-family-conversations.spec.ts` | the screen |

**Every policy has a drop-and-count control**, per CLAUDE.md's rule that an
isolation test must demonstrably fail with its policy removed:

| removed | assertions that fail |
|---|---|
| `messages_select` | 7 |
| `conversations_select` | 4 |
| `messages_insert` | 2 |
| blocks check neutered | 2 |
| count switched to `SECURITY DEFINER` | 1 — the badge leak |
| channel-creation trigger | 5 |
| membership-join trigger | 4 |
| `old.deleted_at is null` guard | 1 |
| both integrity triggers | 4 |

**Provenance of the header's suite counts.** The unit figure (**1015 across 37**)
was re-measured on this branch when the record was finalised, after `#73` merged
— `npm test`, 2026-09-02. The pgTAP and isolation figures are **carried forward
from the session's own last green run, not re-measured here**: `#73` touched no
file in `supabase/tests/` or `tests/isolation/`, and the shared local stack was
held by Stream B, so re-running them would have destroyed its database mid-run.
Stated this way because CLAUDE.md's 2026-08-28 alignment entry rules out
describing a check that was not executed.

## 6. Four times a suite was green while proving less than it claimed

The recurring theme of this session, and the reason the controls above exist.

**Refusal-only assertions.** Dropping `messages_insert` failed *nothing* — the
file only asserted refusals, and with no INSERT policy at all every "cannot post"
assertion goes green for the worst possible reason. Fixed by adding positive
assertions.

**A control that silently did nothing.** The blocks stub reported "0 fail", which
reads identically to "not covered". `create or replace function` cannot rename an
input parameter, so the stub errored and left the real function in place. **A
control that fails nothing is a broken control until proven otherwise.**

**A refusal attributed to the wrong mechanism.** An assertion claimed "refused by
policy" when a `BEFORE` trigger had refused the write before RLS was consulted.
It would have kept passing with the policy deleted.

**A negative control that failed at sign-in.** Five browser tests went red under
deliberately-wrong policies and were nearly reported as proof. All five had failed
at `signIn` on a 20-second timeout because the auth limiter had tripped — nothing
to do with the leak. Caught only by reading the failure text rather than the
pass/fail count.

## 7. Carried forward

**To C2 — Realtime broadcast is not access-controlled.**
`docs/f4milia/c2-realtime-broadcast-authorization.md`. A channel is a string and
any authenticated client may join any name; a member of Family B received Family
A's typing events while `postgres_changes` on the same channel for the same user
delivered nothing. No content leaks — the payload is a membership id — but a
member removed from a Family keeps the conversation id in their browser history
and can keep watching that room. Filed against C2 because it owns the next changes
to this surface and no other session in the run doc owns channel authorization.

**To N1 — two things.** `unread_message_counts()` takes no org argument, so one
call spans both of a dual-Family member's Families; any surface that sums it
produces a cross-Family number. And the read mark is a timestamp high-water, so a
message committing after the mark with an earlier `created_at` counts as read
unseen — small window, needs two concurrent writers. **Revisit before unread
counts drive notifications.**

**Still open across the codebase:** 16 `SECURITY DEFINER` functions pin
`search_path = public`, which leaves `pg_temp` implicitly first — including
`is_org_member()` and `has_org_role()`, which every C1 policy calls. C1 added no
new ones; all of its functions pin `pg_catalog, pg_temp`. Owed as its own
migration.

## 8. What is not satisfied

**No rate limit on sending.** Invariant 7 covers endpoints that cost money or send
anything; a message does neither today. It will once N1 turns messages into pushes
and emails. That is Q2's sweep, named here so it is a decision rather than an
omission.

**No editing or deleting UI.** The policies and the realtime update path support
both; the surface belongs with C2's threading.

**`#72` merged without a CodeRabbit review.** Its five CI checks passed and the
bot never reported. Named because "six checks" was the norm on the other five.

## 9. Operational lessons

**A stacked PR must merge before its base, or be retargeted afterwards.** `#74`
merged to `main` at 17:25:22 and `#75` merged into that same base branch 45
seconds later — onto a branch `main` had already absorbed. Both PRs show MERGED,
both were green, and `main` silently does not have `#75`'s files. Nothing failed.
`#76` re-lands them.

**Five worktrees share port 3000.** An entire debugging session — captcha errors,
a missing Turnstile widget, a raw GoTrue message on the login page — resolved to a
dev server running from `/Users/james/Downloads/brandLamb/stream-a`, a checkout
predating S2 and all of C1, against a database carrying this tree's migrations and
`[auth.captcha] enabled = true`. Old app code plus current GoTrue config. Check
`ps ax | grep "next dev"` before debugging a browser symptom.

**The shared stack collided three times.** Stream B reset the database to its own
branch mid-session, twice invalidating a green pgTAP run. Local runs are now
guarded by asserting this branch's migration version is present before trusting a
result — a green run on another branch's schema is indistinguishable from a green
run on yours.

**`supabase test db` globs every `.sql` under `supabase/tests/`.** A fixture with
no `plan()` placed there failed the whole suite with "No plan found in TAP
output". Caught in CI rather than locally because the files were added without
re-running the suite — **adding a file can break a runner that discovers by
glob, even when no test was edited.**

## 10. Related

- `docs/f4milia/c2-realtime-broadcast-authorization.md` — the finding C2 inherits
- `docs/manual-checks/README.md` — the hand-check, and how to prove it can fail
- CLAUDE.md Learned constraints — **26 entries** added by this session: 19 on
  `main`, and 7 more re-landed by `#76` (they were stranded twice — first
  on the then-unmerged UI branch, then by the stacked-merge in §9)
