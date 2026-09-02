-- care_actions -- Ferenz 5.1.
--
-- The claim this file mostly exists to hold: a Care Action cannot point across
-- Families, in EITHER of its two target shapes. That is the whole reason the
-- target is two typed columns rather than a (target_type, target_id) pair --
-- a polymorphic id is just a uuid and can name anything.
--
-- As with 150 and 160: pgTAP runs as `postgres` and BYPASSES RLS, so nothing
-- here proves a policy. It asserts the schema, the constraints, and that the
-- policies exist with the shape they claim. Behaviour is owed in
-- tests/isolation/**.

begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- ------------------------------------------------------------------ fixture
-- Probe Families of this file's own. The seeded Families carry domain data and
-- a test that builds on them asserts a starting state it did not create --
-- the lesson 110/120/130 learned when the seed gained a Tower.
insert into public.organizations (id, slug, name) values
  ('00000000-0000-0000-0000-0000000012a0', 'care-probe-a', 'Care Probe A'),
  ('00000000-0000-0000-0000-0000000012b0', 'care-probe-b', 'Care Probe B');

insert into public.memberships (id, org_id, profile_id, role) values
  ('00000000-0000-0000-0000-0000000012a1', '00000000-0000-0000-0000-0000000012a0', '00000000-0000-0000-0000-0000000000a1', 'org_owner'),
  ('00000000-0000-0000-0000-0000000012a2', '00000000-0000-0000-0000-0000000012a0', '00000000-0000-0000-0000-0000000000a2', 'member'),
  ('00000000-0000-0000-0000-0000000012b1', '00000000-0000-0000-0000-0000000012b0', '00000000-0000-0000-0000-0000000000a3', 'org_owner');

insert into public.towers (id, org_id, title) values
  ('00000000-0000-0000-0000-0000000012a3', '00000000-0000-0000-0000-0000000012a0', 'Probe goal'),
  ('00000000-0000-0000-0000-0000000012b3', '00000000-0000-0000-0000-0000000012b0', 'Other goal');

insert into public.builds (id, tower_id, org_id, type, title) values
  ('00000000-0000-0000-0000-0000000012a4', '00000000-0000-0000-0000-0000000012a3', '00000000-0000-0000-0000-0000000012a0', 'custom', 'Probe build'),
  ('00000000-0000-0000-0000-0000000012b4', '00000000-0000-0000-0000-0000000012b3', '00000000-0000-0000-0000-0000000012b0', 'custom', 'Other build');

insert into public.bricks (id, build_id, org_id, description, status) values
  ('00000000-0000-0000-0000-0000000012a5', '00000000-0000-0000-0000-0000000012a4', '00000000-0000-0000-0000-0000000012a0', 'Needs a hand', 'needs_help'),
  ('00000000-0000-0000-0000-0000000012b5', '00000000-0000-0000-0000-0000000012b4', '00000000-0000-0000-0000-0000000012b0', 'Another Familys work', 'open');

-- ------------------------------------------------------------------- shape
select has_table('public', 'care_actions', 'care_actions exists');
select has_column('public', 'care_actions', 'type', 'it records which of F5.1 three kinds it is');
select col_is_unique('public', 'care_actions', array['id', 'org_id'],
  '(id, org_id) is unique, for the composite keys a later table will need');

-- F5.1 gives three types and no more.
select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
     from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'care_action_type'),
  array['cover_task', 'offer_bandwidth', 'reminder'],
  'the three types are F5.1 list exactly, in order');

-- NO LIFECYCLE. Deliberate: F5.1 specifies none, and a status column here
-- would be invented product in the hardest place to remove it. Asserted so a
-- future session adds one on purpose rather than by habit.
select hasnt_column('public', 'care_actions', 'status',
  'there is no status column -- F5.1 specifies no lifecycle');

-- ------------------------------------------------------ the two target shapes
select lives_ok(
  $$insert into public.care_actions (org_id, type, from_membership_id, target_membership_id)
    values ('00000000-0000-0000-0000-0000000012a0', 'offer_bandwidth',
            '00000000-0000-0000-0000-0000000012a1', '00000000-0000-0000-0000-0000000012a2')$$,
  'an offer aimed at a member is accepted');

select lives_ok(
  $$insert into public.care_actions (org_id, type, from_membership_id, target_brick_id)
    values ('00000000-0000-0000-0000-0000000012a0', 'cover_task',
            '00000000-0000-0000-0000-0000000012a1', '00000000-0000-0000-0000-0000000012a5')$$,
  'an offer aimed at a Brick is accepted -- F4.6 path');

select throws_like(
  $$insert into public.care_actions (org_id, type, from_membership_id)
    values ('00000000-0000-0000-0000-0000000012a0', 'reminder',
            '00000000-0000-0000-0000-0000000012a1')$$,
  '%care_actions_exactly_one_target%',
  'an offer aimed at nothing is refused');

select throws_like(
  $$insert into public.care_actions (org_id, type, from_membership_id, target_membership_id, target_brick_id)
    values ('00000000-0000-0000-0000-0000000012a0', 'reminder',
            '00000000-0000-0000-0000-0000000012a1',
            '00000000-0000-0000-0000-0000000012a2', '00000000-0000-0000-0000-0000000012a5')$$,
  '%care_actions_exactly_one_target%',
  'an offer aimed at both is refused -- that is two offers in one row');

select throws_like(
  $$insert into public.care_actions (org_id, type, from_membership_id, target_membership_id)
    values ('00000000-0000-0000-0000-0000000012a0', 'cover_task',
            '00000000-0000-0000-0000-0000000012a1', '00000000-0000-0000-0000-0000000012a1')$$,
  '%care_actions_not_self_addressed%',
  'nobody offers to cover their own task');

-- =============================== THE POINT OF THIS FILE: no cross-Family aim
-- Both shapes, both directions. Real rows, valid uuids, and invisible to RLS,
-- which sees nothing wrong with either side on its own -- only the composite
-- keys refuse them.
select throws_like(
  $$insert into public.care_actions (org_id, type, from_membership_id, target_membership_id)
    values ('00000000-0000-0000-0000-0000000012a0', 'offer_bandwidth',
            '00000000-0000-0000-0000-0000000012a1', '00000000-0000-0000-0000-0000000012b1')$$,
  '%violates foreign key constraint%',
  'an offer cannot be aimed at a member of another Family');

-- The Brick key is DEFERRABLE INITIALLY DEFERRED, so the violation lands at
-- COMMIT and an INSERT throws nothing -- the trade-off 20260903100811 records
-- for the same reason. Set it immediate for this one assertion, exactly as
-- 130_bricks does, and assert the deferral separately below. A bare
-- throws_like here would have reported "no exception thrown" and looked like a
-- missing constraint.
set constraints public.care_actions_target_brick_id_org_id_fkey immediate;

select throws_like(
  $$insert into public.care_actions (org_id, type, from_membership_id, target_brick_id)
    values ('00000000-0000-0000-0000-0000000012a0', 'cover_task',
            '00000000-0000-0000-0000-0000000012a1', '00000000-0000-0000-0000-0000000012b5')$$,
  '%care_actions_target_brick_id_org_id_fkey%',
  'and cannot be aimed at another Family Brick');

set constraints public.care_actions_target_brick_id_org_id_fkey deferred;

select is(
  (select condeferred from pg_constraint
    where conname = 'care_actions_target_brick_id_org_id_fkey'),
  true,
  'the Brick key stays DEFERRED by default, so the organizations cascade can tear down in any order');

select throws_like(
  $$insert into public.care_actions (org_id, type, from_membership_id, target_membership_id)
    values ('00000000-0000-0000-0000-0000000012a0', 'offer_bandwidth',
            '00000000-0000-0000-0000-0000000012b1', '00000000-0000-0000-0000-0000000012a2')$$,
  '%violates foreign key constraint%',
  'and cannot come FROM a member of another Family');

-- --------------------------------------------------------- departure and delete
-- A member leaving does not erase the fact that somebody offered to help them.
update public.memberships set deleted_at = now()
 where id = '00000000-0000-0000-0000-0000000012a2';

select is(
  (select count(*)::int from public.care_actions
    where target_membership_id = '00000000-0000-0000-0000-0000000012a2'),
  1,
  'a soft-deleted member keeps the offers that were aimed at them');

update public.memberships set deleted_at = null
 where id = '00000000-0000-0000-0000-0000000012a2';

-- The Brick going takes its offers with it: an offer to cover work that no
-- longer exists is not a record of anything.
delete from public.bricks where id = '00000000-0000-0000-0000-0000000012a5';
select is(
  (select count(*)::int from public.care_actions
    where target_brick_id = '00000000-0000-0000-0000-0000000012a5'),
  0,
  'deleting a Brick removes the offers aimed at it');

-- ------------------------------------------------------------ audit and RLS
select has_trigger('public', 'care_actions', 'care_actions_audit',
  'care_actions carries its audit trigger, in the migration that created it');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.care_actions'::regclass),
  'RLS is enabled');

select policies_are('public', 'care_actions',
  array['care_actions_select', 'care_actions_insert'],
  'select and insert policies only -- no UPDATE, no DELETE');

select ok(
  not has_table_privilege('authenticated', 'public.care_actions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.care_actions', 'DELETE'),
  'and no UPDATE or DELETE grant: an offer has no lifecycle to advance');

-- INVARIANT 6, asserted structurally. Whether it BEHAVES correctly is owed to
-- tests/isolation/**, with two real users.
select ok(
  (select qual like '%viewer_blocks_membership%' from pg_policies
    where schemaname = 'public' and tablename = 'care_actions'
      and policyname = 'care_actions_select'),
  'the SELECT policy consults member_blocks (invariant 6)');

select ok(
  has_table_privilege('service_role', 'public.care_actions', 'INSERT'),
  'service_role can insert -- F4.6 writes one server-side when a Brick needs help');

-- ------------------------------------------------------------------ indexes
select has_index('public', 'care_actions', 'care_actions_org_created_idx',
  'the Family feed of offers is indexed');
select has_index('public', 'care_actions', 'care_actions_target_brick_idx',
  'and so is "what help was offered on this Brick"');

-- ---------------------------------------------------------------- the cascade
-- care_actions sits inside the organizations cascade twice over -- through
-- memberships and, via towers and builds, through bricks. 20260903100811 took
-- three defects to get this shape green; this asserts it stayed green.
select lives_ok(
  $$delete from public.organizations
     where id = '00000000-0000-0000-0000-0000000012a0'$$,
  'a Family holding Care Actions can be deleted');

select is(
  (select count(*)::int from public.care_actions
    where org_id = '00000000-0000-0000-0000-0000000012a0'),
  0,
  'and its Care Actions go with it');

select * from finish();
rollback;
