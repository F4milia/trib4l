-- Asserts the audit trigger function's contract. pgTAP rather than vitest
-- because the security-critical properties -- SECURITY DEFINER and a pinned
-- search_path -- are facts about the catalog, not about the SQL text, and a
-- source grep would pass on a function that had been altered in place.
--
-- `supabase test db` wraps each file in a transaction and rolls it back, so
-- the extension and the probe table below leave nothing behind.

begin;
create extension if not exists pgtap with schema extensions;

select plan(20);  -- +6: non-uuid keys and malformed JWT claims

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

-- ------------------------------------------------- attachment discipline
-- This asserted "attached to no table" in PR 1/5, which was a claim about that
-- PR's deliberate inertness and stopped being true the moment PR 2/5 attached
-- it. Not deleted: replaced with the permanent, stronger claim, and coverage
-- counting now lives in 020 ("exactly 25 triggers, no more, no fewer").
--
-- Every attachment must follow the <table>_audit naming convention, so an
-- ad-hoc trigger wired to this function under some other name is a finding
-- rather than a silent addition.
select ok(
  (select bool_and(t.tgname = c.relname || '_audit')
     from pg_trigger t
     join pg_proc p on p.oid = t.tgfoid
     join pg_class c on c.oid = t.tgrelid
    where p.proname = 'audit_row_change' and not t.tgisinternal),
  'every trigger using this function is named <table>_audit'
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

-- ===================================================================
-- The write path must never abort the write it exists to describe.
-- Both cases below took down every write on an audited table.
-- ===================================================================

-- CD-1: a table whose primary key is not a uuid. CLAUDE.md now tells wave
-- sessions to attach this trigger to every new table, and a bigserial id is an
-- ordinary choice for a high-volume append table.
create table public._probe_bigserial (id bigserial primary key, org_id uuid);
create trigger _probe_bigserial_audit
  after insert or update or delete on public._probe_bigserial
  for each row execute function public.audit_row_change();

select lives_ok(
  $$ insert into public._probe_bigserial (org_id)
     values ('00000000-0000-0000-0000-00000000000a') $$,
  'a non-uuid primary key does not break every write on the table'
);

select is(
  (select count(*)::int from public.audit_log where target_type = '_probe_bigserial'),
  1,
  'the write is still audited'
);

select is(
  (select target_id from public.audit_log where target_type = '_probe_bigserial'),
  null,
  'target_id is null when the key will not fit a uuid column'
);

select is(
  (select metadata ->> 'target_key' from public.audit_log where target_type = '_probe_bigserial'),
  '1',
  'the real key is preserved in metadata -- an id, not content'
);

-- CD-2: auth.uid() casts request.jwt.claims to json. The missing_ok flag guards
-- an absent setting, not a malformed one, so one bad value aborted writes
-- across every audited table.
create temporary table _claims_probe as select gen_random_uuid() as cohort_id;

set local request.jwt.claims = 'not-json-at-all';

select lives_ok(
  $$ insert into public.cohorts (id, org_id, name)
     select cohort_id, '00000000-0000-0000-0000-00000000000a', 'malformed claims probe'
     from _claims_probe $$,
  'a malformed request.jwt.claims does not abort the write'
);

-- Scoped to this row. audit_log.id is gen_random_uuid() and created_at is
-- transaction time, so audit_log has NO reliable ordering column at all --
-- `order by id desc limit 1` picks an arbitrary row.
select is(
  (select actor_profile_id from public.audit_log
    where target_id = (select cohort_id from _claims_probe)),
  null,
  'the actor is unattributable, not the write unwritable'
);

reset request.jwt.claims;

select * from finish();
rollback;
