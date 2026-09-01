-- PERF-2. An index is a fact about the catalog, so pgTAP rather than vitest --
-- and asserting the PLAN as well as the existence, because an index that
-- exists and is never chosen is indistinguishable from one that was never
-- added. That is the same failure shape as the inert greptile.json in the
-- learned constraints: a config present and unused reads exactly like a
-- config that works.

begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

select has_index('public', 'audit_log', 'audit_log_target_idx',
  'audit_log is indexed on the target');

select is(
  (select array_to_string(array_agg(a.attname order by k.ord), ',')
     from pg_class c
     join pg_index i on i.indexrelid = c.oid
     join lateral unnest(i.indkey) with ordinality as k(attnum, ord) on true
     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
    where c.relname = 'audit_log_target_idx'),
  'target_type,target_id',
  'on (target_type, target_id) in that order -- the low-cardinality column '
  'leads, so the index also serves "everything that happened to this table"'
);

-- The plan. Enough rows that a sequential scan is genuinely the cheaper
-- option if the index cannot be used, so this asserts a choice rather than a
-- coincidence of an empty table.
insert into public.audit_log (actor_profile_id, org_id, action, target_type, target_id, metadata)
select null, null, 'probe.insert', 'probe_' || (i % 30), gen_random_uuid(), '{}'::jsonb
  from generate_series(1, 20000) i;

insert into public.audit_log (actor_profile_id, org_id, action, target_type, target_id, metadata)
values (null, null, 'probe.insert', '_probe_target',
        '00000000-0000-0000-0000-0000000000d1', '{}'::jsonb);

analyze public.audit_log;

-- explain output as text is the portable form; scan it for the access method.
create or replace function pg_temp._explain_uses_index() returns boolean
language plpgsql as $$
declare v_line text; v_found boolean := false;
begin
  for v_line in
    execute $q$
      explain (costs off)
      select * from public.audit_log
       where target_type = '_probe_target'
         and target_id = '00000000-0000-0000-0000-0000000000d1'
    $q$
  loop
    if v_line like '%audit_log_target_idx%' then v_found := true; end if;
  end loop;
  return v_found;
end; $$;

select ok(pg_temp._explain_uses_index(),
  'and the planner actually chooses it over a sequential scan at 20k rows');

select is(
  (select count(*)::int from public.audit_log
    where target_type = '_probe_target'
      and target_id = '00000000-0000-0000-0000-0000000000d1'),
  1,
  'and the indexed lookup returns the row it should');

select * from finish();
rollback;
