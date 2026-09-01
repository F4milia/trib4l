-- C1 PR 6: the database half of live delivery.
--
-- Publication membership and replica identity are catalog facts, and both are
-- silent when wrong: a subscription to an unpublished table reports SUBSCRIBED
-- and then never fires, and REPLICA IDENTITY DEFAULT drops update events
-- rather than erroring. The greptile.json lesson in the learned constraints is
-- the same shape -- a config that is present and inert reads exactly like one
-- that works, so it gets asserted rather than assumed.

begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'messages'),
  1,
  'messages is published to supabase_realtime -- without this a subscription '
  'reports SUBSCRIBED and silently never fires'
);

select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'conversation_participants'),
  1,
  'and so is conversation_participants, which carries read receipts'
);

-- 'f' = FULL. RLS on an UPDATE is evaluated against the OLD row, and with the
-- default identity the old record holds only the primary key -- so Realtime
-- cannot decide whether a subscriber was allowed to see what changed, and
-- drops the event. Soft-deleting a message would never reach the room.
select is(
  (select relreplident::text from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'messages'),
  'f',
  'messages has REPLICA IDENTITY FULL, so update and delete events carry '
  'enough of the old row for RLS to be evaluated against it'
);

select is(
  (select relreplident::text from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'conversation_participants'),
  'f',
  'and so does conversation_participants'
);

-- Deliberately absent, asserted so that adding it is a decision rather than a
-- drift: a room's own row changes when it is renamed, which nobody needs
-- within the second, and publishing it would put every Family's room metadata
-- on the replication stream for the sake of a title.
select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'conversations'),
  0,
  'conversations is NOT published -- nothing needs a room rename in real time yet'
);

select * from finish();
rollback;
