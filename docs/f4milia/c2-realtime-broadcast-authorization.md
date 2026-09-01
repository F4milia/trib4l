# C2 — Realtime broadcast is not access-controlled

Carried forward from C1. **Read before starting C2.**

| | |
|---|---|
| **Found** | 2026-09-02, verifying C1's named edge case |
| **Origin** | C1 (Wave 2, Stream A), PR `#72` — merged |
| **Owner** | C2 (Wave 3, Stream A) — the next session on this surface |
| **Severity** | Low impact, real. No message content leaks. Metadata does |
| **Status** | **Open.** Decided 2026-09-02 (James) to fold into C2 rather than patch separately |

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

**1. Correct a false comment first — it is on `main` today.**

`lib/conversations-realtime.ts` currently claims, of broadcast:

> "...and only to people already subscribed to a channel the database let them
> join."

The database lets **anyone** join. That sentence is wrong, it shipped in `#72`,
and it is the kind of confident-and-false comment CLAUDE.md's 2026-08-28
alignment entry exists to prevent. Fix it whether or not the rest of this lands
in the same PR.

**2. Gate the channel.** Supabase Realtime Authorization puts RLS on
`realtime.messages`, so a `join` is evaluated by policy like any other read. The
policy C1 already has is the one to reuse:

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

**3. Verify it the way C1's other claims were verified.** The probe in §7
reproduces the leak in about fifteen seconds; it should go from "carol received
1" to "carol received 0" with the participant control still receiving. A test
that only shows carol getting nothing proves nothing — realtime being broken in
the environment looks identical.

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
  fail *(currently on `feat/conversations-ui`, unmerged)*
- `supabase/tests/database/114_conversations_realtime.sql` — the publication and
  replica-identity assertions
- CLAUDE.md, 2026-09-01 C1 PR6 entries — realtime readiness levels, and why
  `REPLICA IDENTITY FULL` is required
