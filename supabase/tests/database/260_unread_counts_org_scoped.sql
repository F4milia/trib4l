-- Stream A unblocking, PR 13.
--
-- pgTAP cannot prove the counts are right -- it runs as postgres and bypasses
-- RLS, and SECURITY INVOKER means the answer depends entirely on who is asking.
-- The isolation suite owns that claim
-- (tests/isolation/unread-counts-org-scoped.test.ts).
--
-- What this file pins is the SHAPE, and the two properties a future refactor
-- could quietly undo: that the org argument is required, and that the function
-- is still INVOKER.

begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

select has_function('public', 'unread_message_counts', array['uuid'],
  'unread_message_counts takes an org argument');

-- The no-argument version must be GONE, not merely superseded. An overload
-- would let every existing caller keep the cross-Family behaviour by simply
-- not passing the new argument -- which is the defect, still shipping, behind
-- a function that looks fixed.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'unread_message_counts'
      and p.pronargs = 0),
  0,
  'the no-argument overload is dropped -- a default or an overload would let '
  'callers keep the old behaviour silently'
);

select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'unread_message_counts'),
  false,
  'still SECURITY INVOKER -- a count is a read path, and a definer version '
  'would report how much a blocked member is posting, as a number'
);

select is(
  (select count(*)::int from information_schema.role_routine_grants
    where routine_schema = 'public' and routine_name = 'unread_message_counts'
      and grantee = 'public'),
  0,
  'and PUBLIC holds no execute grant -- revoked from public, then granted to '
  'authenticated explicitly, because authenticated inherits from PUBLIC'
);

select * from finish();
rollback;
