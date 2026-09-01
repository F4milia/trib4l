-- C2 PR 1. What pgTAP can and cannot say about this fix.
--
-- CAN: the policies exist, on the right table, for the right commands, for the
-- right role, and RLS is on. Those are catalog facts and they are exactly the
-- things a later migration could silently undo.
--
-- CANNOT: whether the policy admits the right subscribers. pgTAP connects as
-- `postgres` and bypasses RLS entirely, and neither the sandbox nor this file
-- has a Realtime service to set `realtime.topic` -- so the interesting
-- assertion is unreachable here by construction. It lives in
-- tests/isolation/conversations-broadcast-authorization.test.ts, which joins
-- real channels as real users and is the only place the claim can be proven.
--
-- Worth stating rather than leaving implicit: a green run of this file means
-- "the grant of authority is still shaped correctly", never "the channel is
-- gated".

begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

select ok(
  (select relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'realtime' and c.relname = 'messages'),
  'RLS is enabled on realtime.messages'
);

select is(
  (select count(*)::int from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'realtime' and c.relname = 'messages'),
  2,
  'exactly two policies -- a join and a send, and nothing else that could '
  'widen the channel by accident'
);

-- SELECT is the join. Without it a private channel admits nobody.
select is(
  (select p.polcmd::text from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'realtime' and c.relname = 'messages'
      and p.polname = 'conversation_channel_join'),
  'r',
  'conversation_channel_join governs SELECT -- the join itself'
);

-- INSERT is the send. Its absence is not a security hole but a broken typing
-- indicator, which is why it is easy to forget and worth pinning.
select is(
  (select p.polcmd::text from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'realtime' and c.relname = 'messages'
      and p.polname = 'conversation_channel_send'),
  'a',
  'conversation_channel_send governs INSERT -- announcing your own typing'
);

select is(
  (select array_agg(distinct r.rolname::text order by r.rolname::text)
     from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
     cross join lateral unnest(p.polroles) as pr(oid)
     join pg_roles r on r.oid = pr.oid
    where n.nspname = 'realtime' and c.relname = 'messages'),
  array['authenticated'],
  'both policies are scoped to authenticated -- anon is never admitted to a '
  'Family channel, whatever topic it asks for'
);

-- The CASE is load-bearing, not style. Postgres does not guarantee
-- left-to-right evaluation of AND, so `topic ~ pattern AND participant(cast)`
-- could reach the ::uuid cast on a non-uuid topic and raise 22P02 inside a
-- policy -- which presents as a channel that will not join for a reason no log
-- explains.
select matches(
  (select pg_get_expr(p.polqual, p.polrelid) from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'realtime' and c.relname = 'messages'
      and p.polname = 'conversation_channel_join'),
  'CASE',
  'the join policy orders its checks with CASE, so a non-uuid topic can never '
  'reach the uuid cast'
);

select * from finish();
rollback;
