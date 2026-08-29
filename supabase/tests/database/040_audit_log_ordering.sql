-- audit_log needs a reliable order. It had none:
--   id         gen_random_uuid()  -- random, so ordering by it is meaningless
--   created_at now()              -- TRANSACTION time, so every row written in
--                                    one transaction ties exactly
--
-- "What happened, in what order" is the question an audit trail exists to
-- answer, and within a transaction it could not answer it. Nothing read the
-- table with ordering yet, which is why this was cheap to fix now rather than
-- after a moderation view or the Ledger depends on it.

begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

select has_column('public', 'audit_log', 'seq', 'audit_log has a seq column');
select col_not_null('public', 'audit_log', 'seq', 'seq is never null');

select is(
  (select is_identity from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_log' and column_name = 'seq'),
  'YES',
  'seq is an identity column -- the database assigns it, not the caller'
);

select is(
  (select identity_generation from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_log' and column_name = 'seq'),
  'ALWAYS',
  'GENERATED ALWAYS -- a client cannot supply or overwrite it'
);

-- The behaviour that matters: two writes inside ONE transaction.
create temporary table _o as
  select gen_random_uuid() as first_id, gen_random_uuid() as second_id;

insert into public.cohorts (id, org_id, name)
select first_id, '00000000-0000-0000-0000-00000000000a', 'ordering probe one' from _o;
insert into public.cohorts (id, org_id, name)
select second_id, '00000000-0000-0000-0000-00000000000a', 'ordering probe two' from _o;

select is(
  (select count(distinct created_at)::int from public.audit_log
    where target_id in (select first_id from _o union select second_id from _o)),
  1,
  'created_at still ties inside a transaction -- that is transaction time, working as designed'
);

select ok(
  (select a.seq < b.seq
     from public.audit_log a, public.audit_log b
    where a.target_id = (select first_id from _o)
      and b.target_id = (select second_id from _o)),
  'seq orders them correctly where created_at cannot'
);

select ok(
  (select count(distinct seq)::int from public.audit_log) =
  (select count(*)::int from public.audit_log),
  'seq is unique across every row'
);

select * from finish();
rollback;
