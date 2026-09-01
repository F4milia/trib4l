-- Reverse: alter publication supabase_realtime drop table messages; alter
--   publication supabase_realtime drop table conversation_participants; alter
--   table messages replica identity default; alter table
--   conversation_participants replica identity default.
--
-- C1, PR 6 of 7. Live delivery.
--
-- WHY THIS IS SAFE TO PUBLISH. Supabase Realtime's Postgres Changes path
-- evaluates RLS PER SUBSCRIBER before forwarding a row: a client is sent a
-- change only if its own JWT could have SELECTed that row. So publishing
-- `messages` grants nobody anything that PR 2's messages_select did not
-- already grant -- including the block filter, which is why PR 2 put blocks in
-- the policy rather than in the read path. A blocked author's message is not
-- merely hidden from the room; it never leaves the server for the blocker.
--
-- This is also the reason this PR is a migration at all rather than pure
-- client code. Publication membership is a database fact, and a session that
-- wired up a subscription without it would produce a silent no-op: the channel
-- subscribes, reports SUBSCRIBED, and simply never fires.

-- REPLICA IDENTITY FULL on messages, deliberately.
--
-- The default (primary key only) means an UPDATE or DELETE broadcasts only the
-- id in its `old` record. RLS is evaluated against the OLD row for those
-- events, so with the default the server cannot tell whether a subscriber was
-- allowed to see the row that changed -- and Realtime's answer to "I cannot
-- decide" is to drop the event. Soft-deleting a message (C1's delete path is
-- an UPDATE setting deleted_at) would therefore never reach the room, and the
-- message would stay on every open screen until a refresh.
--
-- The cost is real and worth stating: every UPDATE and DELETE writes the whole
-- old row to the WAL. messages rows are capped at 1000 characters of body, so
-- the ceiling is small and known.
alter table messages replica identity full;

-- Participants change when someone joins, leaves, or reads. Read receipts and
-- the unread badge are the reason this one is published at all -- without it,
-- "seen" only updates when the other person's page happens to re-fetch.
alter table conversation_participants replica identity full;

-- supabase_realtime is created by the platform, not by this repo. Adding a
-- table twice raises 42710, and a migration must be replayable against a
-- database where an earlier attempt got this far -- so both are conditional on
-- the table not already being published.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'conversation_participants'
  ) then
    alter publication supabase_realtime add table public.conversation_participants;
  end if;
end;
$$;

-- NOT published: `conversations` itself. A room's own row changes when it is
-- renamed, which nobody needs to see within the second, and publishing it
-- would put every Family's room metadata on the replication stream for the
-- sake of a title. Add it when something needs it.
