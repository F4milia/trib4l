-- builds -- Ferenz 4.1. A workstream under a Tower.
--
-- The claim worth defending here is the denormalised org_id. Carrying the
-- Family on the row keeps every RLS policy and the audit trigger from having
-- to join through tower_id on the hot path -- but a denormalised column is
-- only safe if it cannot disagree with its source. The composite key is what
-- makes that true, and the last two assertions are what prove it.

begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

-- ------------------------------------------------------------------- shape
select has_table('public', 'builds', 'builds exists');
select col_not_null('public', 'builds', 'tower_id', 'a Build belongs to a Tower');
select col_not_null('public', 'builds', 'org_id', 'a Build carries its Family');
select col_not_null('public', 'builds', 'type', 'a Build is typed (F4.1)');

select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
     from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'build_type'),
  array['commerce','permanence','propagation','custom'],
  'the four Build types from F4.1, and no others'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.builds'::regclass),
  'row level security is enabled'
);

select has_trigger('public', 'builds', 'builds_audit',
  'the audit trigger ships in the same migration as the table');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'builds'
      and privilege_type = 'DELETE' and grantee in ('authenticated','service_role')),
  0,
  'nobody can delete a Build -- complete is the honest record'
);

-- ----------------------------------------------------------------- probes
create temporary table _bd as
  select '00000000-0000-0000-0000-00000000000a'::uuid as org_a,
         '00000000-0000-0000-0000-00000000000b'::uuid as org_b,
         '00000000-0000-0000-0000-0000000000e1'::uuid as tower_a,
         '00000000-0000-0000-0000-0000000000e2'::uuid as tower_b,
         '00000000-0000-0000-0000-0000000000f1'::uuid as build_1;

insert into public.towers (id, org_id, title)
select tower_a, org_a, 'Open the community kitchen' from _bd;

insert into public.towers (id, org_id, title)
select tower_b, org_b, 'A different Family''s goal' from _bd;

insert into public.builds (id, tower_id, org_id, type, title)
select build_1, tower_a, org_a, 'permanence', 'Find and fit out the room' from _bd;

select is(
  (select status::text from public.builds where id = (select build_1 from _bd)),
  'open',
  'a new Build starts open'
);

select is(
  (select org_id from public.audit_log
    where target_type = 'builds' and target_id = (select build_1 from _bd)),
  (select org_a from _bd),
  'the audit trigger resolves the Family straight off the row'
);

select lives_ok(
  $$insert into public.builds (tower_id, org_id, type, title)
    values ('00000000-0000-0000-0000-0000000000e1',
            '00000000-0000-0000-0000-00000000000a', 'commerce', 'Sell the first meals')$$,
  'a Tower can carry several Builds at once'
);

-- ------------------------------------ the denormalised column cannot lie
-- THE ASSERTION THIS FILE IS FOR. Carrying org_id on the row is a performance
-- decision; it is only a safe one if a caller cannot set it to a Family the
-- Tower does not belong to. Both ids below are real, and both rows are
-- legitimately visible to their own Families -- so RLS cannot catch this.
select throws_ok(
  $$insert into public.builds (tower_id, org_id, type, title)
    values ('00000000-0000-0000-0000-0000000000e2',
            '00000000-0000-0000-0000-00000000000a', 'custom', 'Claiming the wrong Family')$$,
  '23503',
  null,
  'a Build cannot claim a Family its Tower is not in'
);

select throws_ok(
  $$update public.builds set org_id = '00000000-0000-0000-0000-00000000000b'
     where id = '00000000-0000-0000-0000-0000000000f1'$$,
  '23503',
  null,
  'nor can it be moved to one afterwards'
);

-- ------------------------------------------------------------ constraints
select throws_ok(
  $$insert into public.builds (tower_id, org_id, type, title)
    values ('00000000-0000-0000-0000-0000000000e1',
            '00000000-0000-0000-0000-00000000000a', 'marketing', 'Not a real type')$$,
  '22P02',
  null,
  'a Build type outside F4.1s four is rejected'
);

-- Deleting a Tower takes its Builds. They have no meaning without it, and the
-- Tower itself can only be deleted by removing the whole Family.
select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.builds'::regclass and contype = 'f' and confdeltype = 'c'),
  2,
  'both foreign keys to towers cascade on delete'
);

select * from finish();
rollback;
