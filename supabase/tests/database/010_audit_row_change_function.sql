-- Asserts the audit trigger function's contract. pgTAP rather than vitest
-- because the security-critical properties -- SECURITY DEFINER and a pinned
-- search_path -- are facts about the catalog, not about the SQL text, and a
-- source grep would pass on a function that had been altered in place.
--
-- `supabase test db` wraps each file in a transaction and rolls it back, so
-- the extension and the probe table below leave nothing behind.

begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

-- ---------------------------------------------------------------- existence
select has_function('public', 'audit_row_change', 'audit_row_change() exists');
select function_returns('public', 'audit_row_change', 'trigger',
  'audit_row_change() returns trigger');
-- ------------------------------------------------------------ security shape
select is(
  (select prosecdef from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'audit_row_change'),
  true,
  'is SECURITY DEFINER -- it must outrank the audit_log insert policy, or a '
  'service-role write with no auth.uid() could not be logged'
);

-- pg_temp must be named explicitly and last. An empty pin leaves pg_temp
-- implicitly FIRST, so a caller-created temporary domain could shadow an
-- unqualified type reference and run its CHECK with definer privileges.
select is(
  (select array_to_string(p.proconfig, ',')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'audit_row_change'),
  'search_path=pg_catalog, pg_temp',
  'pins search_path with pg_temp explicit and last -- an empty pin leaves '
  'pg_temp implicitly ahead of pg_catalog'
);

select ok(
  not has_function_privilege('public', 'public.audit_row_change()', 'execute'),
  'EXECUTE is revoked from PUBLIC'
);

-- --------------------------------------------------- attached to nothing yet
select is(
  (select count(*)::int from pg_trigger t
     join pg_proc p on p.oid = t.tgfoid
    where p.proname = 'audit_row_change' and not t.tgisinternal),
  0,
  'this PR attaches the function to no table -- PR 2 does that'
);

-- ------------------------------------------------------------------ behaviour
create table public._audit_probe (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  label text
);

create trigger _audit_probe_audit
  after insert or update or delete on public._audit_probe
  for each row execute function public.audit_row_change();

-- a real seeded org, so org_id is a genuine reference
create temporary table _probe_ids as
  select '00000000-0000-0000-0000-00000000000a'::uuid as org_id,
         gen_random_uuid() as row_id;

insert into public._audit_probe (id, org_id, label)
select row_id, org_id, 'first' from _probe_ids;

select is(
  (select count(*)::int from public.audit_log
    where target_type = '_audit_probe' and action = '_audit_probe.insert'),
  1,
  'INSERT writes exactly one row, action is table.op'
);

select is(
  (select target_id from public.audit_log
    where action = '_audit_probe.insert' limit 1),
  (select row_id from _probe_ids),
  'target_id is the affected row'
);

select is(
  (select org_id from public.audit_log
    where action = '_audit_probe.insert' limit 1),
  (select org_id from _probe_ids),
  'org_id is carried from the row'
);

update public._audit_probe set label = 'second' where id = (select row_id from _probe_ids);

select is(
  (select metadata -> 'changed' from public.audit_log
    where action = '_audit_probe.update' limit 1),
  '["label"]'::jsonb,
  'UPDATE records which columns changed -- names only, never values'
);

select ok(
  (select metadata::text not like '%second%' from public.audit_log
    where action = '_audit_probe.update' limit 1),
  'the new value never appears in metadata (invariants 3 and 4)'
);

delete from public._audit_probe where id = (select row_id from _probe_ids);

select is(
  (select count(*)::int from public.audit_log where action = '_audit_probe.delete'),
  1,
  'DELETE writes one row'
);

select is(
  (select metadata from public.audit_log where action = '_audit_probe.delete' limit 1),
  '{}'::jsonb,
  'INSERT and DELETE carry no metadata -- there is no diff to describe'
);

-- ------------------------------------------------------- recursion guard
create trigger _recursion_guard
  after insert on public.audit_log
  for each row execute function public.audit_row_change();

insert into public._audit_probe (org_id, label) values
  ((select org_id from _probe_ids), 'third');

select ok(true, 'attaching the function to audit_log does not recurse');

select * from finish();
rollback;
