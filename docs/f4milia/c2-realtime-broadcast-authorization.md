# C2 — Realtime broadcast is not access-controlled

Carried forward from C1. **Read before starting C2.**

| | |
|---|---|
| **Found** | 2026-09-02, verifying C1's named edge case |
| **Origin** | C1 (Wave 2, Stream A), PR `#72` — merged |
| **Owner** | C2 (Wave 3, Stream A) — the next session on this surface |
| **Severity** | Low impact, real. No message content leaks. Metadata does |
| **Status** | **CLOSED 2026-09-02 by C2 PR 1** — migration `20260903101501` plus `private: true` in `lib/conversations-realtime.ts`. §5.1 was already closed; §5.2 and §5.3 are done; §5.4 stands as a standing rule rather than a task |

---

## 1. The finding

Supabase Realtime has two delivery paths, and C1 uses both:

| Path | Used for | Access control |
|---|---|---|
| `postgres_changes` | messages, participants, read receipts | **RLS, per subscriber.** Holds |
| `broadcast` | the typing indicator | **None.** Any authenticated client may join any channel by name |

A channel is just a string — C1 names them `conversation:<uuid>`. The server
does not check whether the subscriber may see that conversation, because a
broadcast has no row to evaluate a policy against.

## 2. What was measured

Signed in as Carol (a member of **Founder Collective only**), subscribed her to
Caregiver Circle's channel by id, and had Alice send a typing event:

```
carol received postgres_changes rows: 0   ← RLS holds; no message content
carol received typing events:         1   ← reached a non-participant
```

The control in the same run is the important half: the `postgres_changes`
subscription on the same channel, for the same user, delivered **nothing**. So
this is specific to broadcast, not a general failure of C1's scoping.

## 3. What actually leaks

The payload is `{ membershipId }`. An observer learns:

- that **someone is active** in a room, and roughly when
- a **membership id** (a uuid, not a name — resolving it needs a `memberships`
  read, which RLS refuses)

No message content, no display names, no room membership list.

**The shape that matters is not a stranger guessing a uuid.** It is someone who
already had the id and lost the right to it:

> A member removed from a Family keeps the conversation id in their browser
> history and can keep watching typing activity in a room they were removed
> from, indefinitely.

That is the case to fix, and it is the one D2's departure work and E1's
"re-invite later, defaults are fresh" edge case are both circling.

## 4. Why it is C2's

C2 owns the next changes to this surface — reactions and threading both want
live delivery, and any new broadcast event inherits the same hole. Adding
authorization once, before there are three event types on it, is cheaper than
retrofitting.

Checked against every session in the run doc: no other one owns it. C2 is not
merely convenient, it is the only fit.

## 5. What C2 should do

**1. Correct a false comment first. ✅ Done — `8052613`, on `main`.**

`lib/conversations-realtime.ts` claimed, of broadcast:

> "...and only to people already subscribed to a channel the database let them
> join."

The database lets **anyone** join. That sentence was wrong, it shipped in `#72`,
and it is the kind of confident-and-false comment CLAUDE.md's 2026-08-28
alignment entry exists to prevent. It was corrected ahead of this session and
now states the measured behaviour, names the probe, and points back here.
**C2 does not need to redo this** — the numbering is kept so §5.2 and §5.3 keep
their references.

**2. Gate the channel. ✅ Done — migration `20260903101501`.** Supabase Realtime
Authorization puts RLS on `realtime.messages`, so a `join` is evaluated by policy
like any other read. The sketch below is what shipped, with three changes found
while building it:

- **Two policies, not one.** SELECT gates the join; INSERT gates *sending* a
  broadcast. Without the second a participant joins, hears everyone, and cannot
  announce their own typing — which reads as a broken indicator rather than a
  missing policy.
- **`case`, not `and`.** Postgres does not guarantee left-to-right evaluation of
  AND, so a topic that is not a uuid could reach the `::uuid` cast and raise
  22P02 inside a policy — a channel that will not join, for a reason no log
  explains.
- **RLS was already enabled on `realtime.messages` with zero policies.** Realtime
  consults them only for `private: true` channels, which is why the hole existed
  and why the client flag and the policies are one change: policies alone gate
  nothing, the flag alone admits nobody.

The policy C1 already has is the one to reuse:

```sql
-- Sketch, not tested. The real version belongs in C2's migration.
create policy conversation_broadcast_join on realtime.messages
  for select to authenticated
  using (
    realtime.topic() like 'conversation:%'
    and public.is_conversation_participant(
      substring(realtime.topic() from 'conversation:(.*)')::uuid
    )
  );
```

`is_conversation_participant()` already checks the membership is active, so a
departed member fails it — which is precisely the case in §3.

**3. Verify it the way C1's other claims were verified. ✅ Done —
`tests/isolation/conversations-broadcast-authorization.test.ts`.** The outcome is
better than "carol received 0": her join is now **refused** outright, so the
assertion is a rejection rather than an absence. The participant control runs
first and must actually receive a typing event, exactly as this section asks.

**The question the blockers doc flagged as reasoned-but-unmeasured is now
measured:** `private: true` gates the JOIN and does **not** break
`postgres_changes`. A participant on the now-private channel still receives row
events. The policy needed one clause, not two.

Two controls were run rather than assumed. Reverting `private: true` (policies
left in place) fails only the refusal test, with the other two still passing —
so the refusal is carried by the fix, not by broken realtime. Dropping the
policies (flag left in place) fails even the participant warm-up, which is the
evidence for "one change, both halves".

**4. Do not put content in a broadcast payload.** Reactions and threading will
be tempting to deliver this way. Until §5.2 lands, broadcast is an unauthenticated
channel; after it lands, it is still weaker than a policy on a real row.

## 6. What C1 did NOT get wrong

Worth stating so C2 does not re-audit settled ground:

- `messages` and `conversation_participants` are RLS-enforced on the realtime
  path — measured above, and again in
  `tests/isolation/conversations-realtime.test.ts`, where Carol subscribes to a
  DM and receives nothing while Bob receives everything.
- The block filter holds live, because it lives in the SELECT policy rather than
  the read path (`#68`).
- Unread counts inherit RLS via `SECURITY INVOKER` (`#70`).

## 7. Reproducing it

Requires the local stack and a seeded database. Stream B must be idle.

```js
// Carol is in Founder Collective only; the room is Caregiver Circle's channel.
const carolCh = carol.channel(`conversation:${roomId}`);
carolCh.on("broadcast", { event: "typing" }, ({ payload }) => got.push(payload));
await subscribed(carolCh);

const aliceCh = alice.channel(`conversation:${roomId}`);
await subscribed(aliceCh);
await aliceCh.send({ type: "broadcast", event: "typing", payload: { membershipId: "X" } });

// got.length === 1 today. It must be 0.
```

Pair it with a `postgres_changes` subscription on the same channel as the
control, as §5.3 says.

## 8. Related

- `docs/manual-checks/README.md` — C1's named edge case, and how to prove it can
  fail — on `main` since `#76`
- `supabase/tests/database/114_conversations_realtime.sql` — the publication and
  replica-identity assertions
- CLAUDE.md, 2026-09-01 C1 PR6 entries — realtime readiness levels, and why
  `REPLICA IDENTITY FULL` is required
