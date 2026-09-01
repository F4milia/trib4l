-- Reverse: drop policy conversation_channel_join on realtime.messages;
--          drop policy conversation_channel_send on realtime.messages;
--          and set `private: false` in lib/conversations-realtime.ts.
--          Reverting BOTH together is required: policies without the client
--          flag gate nothing, and the client flag without policies denies
--          everyone, because RLS is already enabled on realtime.messages with
--          no policies at all.

-- C2 PR 1. The finding C1 carried forward:
-- docs/f4milia/c2-realtime-broadcast-authorization.md
--
-- THE HOLE. Supabase Realtime has two delivery paths and C1 uses both.
-- postgres_changes evaluates RLS per subscriber before forwarding a row, and
-- that holds. Broadcast has no row to evaluate a policy against, so a channel
-- is just a string and ANY authenticated client may join ANY channel by name.
--
-- Measured 2026-09-02: a member of Family B joined `conversation:<a Family A
-- uuid>` and received Family A's typing events, while a postgres_changes
-- subscription on the same channel for the same user delivered nothing. The
-- control is the important half -- the leak is specific to broadcast, not a
-- general failure of C1's scoping.
--
-- What leaks is metadata, not content: that someone is active in a room, and a
-- membership uuid. The shape that matters is not a stranger guessing an id. It
-- is a member REMOVED from a Family who keeps the conversation id in their
-- browser history and can watch the room stay alive indefinitely.
-- is_conversation_participant() checks the membership is active, so that member
-- now fails the join.
--
-- WHY THIS IS THE WHOLE FIX AND NOT HALF OF IT. RLS is ALREADY enabled on
-- realtime.messages (relrowsecurity = t) and there are ZERO policies. Realtime
-- consults them only for channels the client opens with `private: true`, which
-- is why an ungated channel works today and why adding policies alone changes
-- nothing. The client flag and these policies are one change.
--
-- WHY `case` AND NOT `and`. Postgres does not guarantee left-to-right
-- evaluation of AND, so a topic that is not a uuid could reach the ::uuid cast
-- and raise 22P02 inside a policy -- which surfaces as a channel that will not
-- join, for a reason no log explains. CASE fixes the order by definition.

create policy conversation_channel_join on realtime.messages
  for select to authenticated
  using (
    case
      when realtime.topic() ~ '^conversation:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then public.is_conversation_participant(substring(realtime.topic() from 14)::uuid)
      else false
    end
  );

-- Sending is a separate privilege from receiving. Without an INSERT policy a
-- participant joins and hears everyone but cannot announce their own typing --
-- which reads as a broken indicator rather than as a missing policy.
create policy conversation_channel_send on realtime.messages
  for insert to authenticated
  with check (
    case
      when realtime.topic() ~ '^conversation:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then public.is_conversation_participant(substring(realtime.topic() from 14)::uuid)
      else false
    end
  );

comment on policy conversation_channel_join on realtime.messages is
  'C2 PR 1. Gates the JOIN to a private conversation channel, which is what '
  'broadcast has instead of per-row RLS. Any topic that is not '
  'conversation:<uuid> is denied outright rather than falling through.';
