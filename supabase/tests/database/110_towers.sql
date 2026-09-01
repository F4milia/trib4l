-- towers -- Ferenz 3.1. The Family's goal.
--
-- Two claims this file exists to hold, both of which are cheap to state and
-- expensive to discover missing:
--
--   1. A Family works on ONE Tower at a time.
--   2. organizations.active_tower_id cannot point at another Family's Tower.
--
-- The second is the interesting one. A plain foreign key to towers(id) would
-- let Family A point at Family B's Tower, and RLS could never catch it --
-- the pointer is a column on organizations, and the row it names is perfectly
-- real. Only a composite key makes it impossible.

begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- PROBE FAMILIES OF THIS FILE'S OWN, rather than the seeded ones.
--
-- This file used to reach for caregiver-circle and founder-collective, which
-- worked only while those Families were empty. The moment the seed gained
-- domain data they each had an active Tower, and the very first insert here hit
-- towers_one_active_per_org_idx -- which ABORTS the transaction, so every
-- assertion after it emitted neither `ok` nor `not ok` and the file silently
-- ran 10 of its 20 and reported green.
--
-- The lesson is CLAUDE.md's, twice over: a test establishes its own
-- preconditions and asserts transitions, never a starting state it did not
-- create; and a new automatic write is a cross-file change to fixtures.
insert into public.organizations (id, slug, name) values
  ('00000000-0000-0000-0000-0000000011a0', 'towers-probe-a', 'Towers Probe A'),
  ('00000000-0000-0000-0000-0000000011b0', 'towers-probe-b', 'Towers Probe B');

-- ------------------------------------------------------------------- shape
select has_table('public', 'towers', 'towers exists');
select col_not_null('public', 'towers', 'org_id', 'a Tower belongs to a Family');
select col_not_null('public', 'towers', 'title', 'a Tower has a title');
select col_is_null('public', 'towers', 'description', 'description is optional (F3.1)');
select has_column('public', 'organizations', 'active_tower_id', 'organizations gains active_tower_id (F3.1)');
select col_is_null('public', 'organizations', 'active_tower_id',
  'active_tower_id is nullable -- a quiet season is a real state, not a missing value');

select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
     from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'tower_status'),
  array['active','stalled','pivoted','complete'],
  'the four statuses from F3.1, and no others'
);

-- -------------------------------------------------------------------- RLS
select ok(
  (select relrowsecurity from pg_class where oid = 'public.towers'::regclass),
  'row level security is enabled'
);

select has_trigger('public', 'towers', 'towers_audit',
  'the audit trigger ships in the same migration as the table');

-- A Tower is never deleted. F3.1's statuses cover its whole life, and the
-- Keepsake exports completed Towers -- deleting one erases the artifact the
-- product exists to produce.
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'towers'
      and privilege_type = 'DELETE' and grantee in ('authenticated', 'service_role')),
  0,
  'nobody can delete a Tower'
);

-- ----------------------------------------------------------------- probes
create temporary table _tw as
  select '00000000-0000-0000-0000-0000000011a0'::uuid as org_a,
         '00000000-0000-0000-0000-0000000011b0'::uuid as org_b,
         '00000000-0000-0000-0000-0000000000e1'::uuid as tower_a,
         '00000000-0000-0000-0000-0000000000e2'::uuid as tower_b;

insert into public.towers (id, org_id, title, description)
select tower_a, org_a, 'Open the community kitchen', 'Somewhere the neighbourhood can eat together.'
  from _tw;

select is(
  (select status::text from public.towers where id = (select tower_a from _tw)),
  'active',
  'a new Tower starts active'
);

select is(
  (select org_id from public.audit_log
    where target_type = 'towers' and target_id = (select tower_a from _tw)),
  (select org_a from _tw),
  'defining a Tower is audited against the Family'
);

-- ------------------------------------------- one active Tower per Family
select throws_ok(
  $$insert into public.towers (org_id, title)
    values ('00000000-0000-0000-0000-0000000011a0', 'A second simultaneous goal')$$,
  '23505',
  null,
  'a Family cannot have two active Towers at once'
);

-- But its history can hold many. Pivoting is a first-class outcome (F3.4),
-- not a failure to be tidied away.
update public.towers set status = 'pivoted' where id = (select tower_a from _tw);

select lives_ok(
  $$insert into public.towers (org_id, title)
    values ('00000000-0000-0000-0000-0000000011a0', 'What we actually meant')$$,
  'once the first is pivoted, a new active Tower is allowed'
);

select is(
  (select count(*)::int from public.towers where org_id = (select org_a from _tw)),
  2,
  'the pivoted Tower stays -- the Family keeps its history'
);

-- ------------------------------------ the pointer cannot cross Families
insert into public.towers (id, org_id, title)
select tower_b, org_b, 'A different Family''s goal' from _tw;

select lives_ok(
  $$update public.organizations
       set active_tower_id = '00000000-0000-0000-0000-0000000000e2'
     where id = '00000000-0000-0000-0000-0000000011b0'$$,
  'a Family can point at its own Tower'
);

-- THE ASSERTION THIS FILE IS FOR. Family A naming Family B's Tower is not a
-- policy question -- both rows are real and legitimately visible to their own
-- Families. Only the composite foreign key can refuse it.
select throws_ok(
  $$update public.organizations
       set active_tower_id = '00000000-0000-0000-0000-0000000000e2'
     where id = '00000000-0000-0000-0000-0000000011a0'$$,
  '23503',
  null,
  'a Family cannot point at another Familys Tower -- the composite key refuses it'
);

-- Deleting the Tower a Family points at clears the pointer rather than
-- blocking the delete or leaving it dangling.
select is(
  (select confdeltype from pg_constraint
    where conname = 'organizations_active_tower_fk'),
  'n',
  'active_tower_id is set null when its Tower goes'
);

-- REGRESSION: a bare `on delete set null` on the composite (active_tower_id,
-- id) key nulls EVERY referencing column, including organizations.id -- so an
-- active Tower could not be deleted at all. Fixed by naming the column.
insert into public.organizations (id, slug, name)
values ('00000000-0000-0000-0000-0000000000b1', 'tower-delete-probe', 'Probe');
insert into public.towers (id, org_id, title)
values ('00000000-0000-0000-0000-0000000000b2',
        '00000000-0000-0000-0000-0000000000b1', 'Probe goal');
update public.organizations
   set active_tower_id = '00000000-0000-0000-0000-0000000000b2'
 where id = '00000000-0000-0000-0000-0000000000b1';

select lives_ok(
  $$delete from public.towers where id = '00000000-0000-0000-0000-0000000000b2'$$,
  'the active Tower can be deleted -- SET NULL must not reach organizations.id'
);

select is(
  (select active_tower_id from public.organizations
    where id = '00000000-0000-0000-0000-0000000000b1'),
  null,
  'and the Family is left Tower-less rather than deleted'
);

select * from finish();
rollback;
