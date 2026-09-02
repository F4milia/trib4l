-- item_reminders -- D2's per-item reminder toggles.
--
-- Two claims worth the file. First, the enum and the id columns cannot
-- disagree: a reminder must not claim to be about a Brick while pointing at a
-- Vow. Second, one toggle per item per member -- and the family_night case is
-- the one a single unique index would have got wrong, because NULLs are
-- distinct in a unique index.
--
-- pgTAP runs as `postgres` and bypasses RLS, so nothing here proves a policy.

begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

-- ------------------------------------------------------------------ fixture
insert into public.organizations (id, slug, name) values
  ('00000000-0000-0000-0000-0000000013a0', 'remind-probe-a', 'Remind Probe A'),
  ('00000000-0000-0000-0000-0000000013b0', 'remind-probe-b', 'Remind Probe B');

insert into public.memberships (id, org_id, profile_id, role) values
  ('00000000-0000-0000-0000-0000000013a1', '00000000-0000-0000-0000-0000000013a0', '00000000-0000-0000-0000-0000000000a1', 'org_owner'),
  ('00000000-0000-0000-0000-0000000013b1', '00000000-0000-0000-0000-0000000013b0', '00000000-0000-0000-0000-0000000000a2', 'org_owner');

insert into public.towers (id, org_id, title) values
  ('00000000-0000-0000-0000-0000000013a2', '00000000-0000-0000-0000-0000000013a0', 'Probe goal'),
  ('00000000-0000-0000-0000-0000000013b2', '00000000-0000-0000-0000-0000000013b0', 'Other goal');

insert into public.builds (id, tower_id, org_id, type, title) values
  ('00000000-0000-0000-0000-0000000013a3', '00000000-0000-0000-0000-0000000013a2', '00000000-0000-0000-0000-0000000013a0', 'custom', 'Probe build'),
  ('00000000-0000-0000-0000-0000000013b3', '00000000-0000-0000-0000-0000000013b2', '00000000-0000-0000-0000-0000000013b0', 'custom', 'Other build');

insert into public.bricks (id, build_id, org_id, description) values
  ('00000000-0000-0000-0000-0000000013a4', '00000000-0000-0000-0000-0000000013a3', '00000000-0000-0000-0000-0000000013a0', 'Probe brick'),
  ('00000000-0000-0000-0000-0000000013b4', '00000000-0000-0000-0000-0000000013b3', '00000000-0000-0000-0000-0000000013b0', 'Other brick');

insert into public.vows (id, org_id, holder_id, commitment) values
  ('00000000-0000-0000-0000-0000000013a5', '00000000-0000-0000-0000-0000000013a0', '00000000-0000-0000-0000-0000000013a1', 'Probe vow');

-- ------------------------------------------------------------------- shape
select has_table('public', 'item_reminders', 'item_reminders exists');

select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
     from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'reminder_target'),
  array['brick', 'vow', 'family_night'],
  'the three targets are D2 calendar three rows: Bricks, Vow turns, Family Night');

-- No `enabled`, unlike notification_preferences. A per-item toggle has two
-- states, not three -- the row exists or it does not -- and a second way to
-- mean "off" is a fourth state nobody has defined.
select hasnt_column('public', 'item_reminders', 'enabled',
  'there is no enabled column: row present means remind me');

-- ------------------------------------------------------------- the happy path
select lives_ok(
  $$insert into public.item_reminders (org_id, membership_id, target, target_brick_id)
    values ('00000000-0000-0000-0000-0000000013a0', '00000000-0000-0000-0000-0000000013a1',
            'brick', '00000000-0000-0000-0000-0000000013a4')$$,
  'a Brick reminder is accepted');

select lives_ok(
  $$insert into public.item_reminders (org_id, membership_id, target, target_vow_id)
    values ('00000000-0000-0000-0000-0000000013a0', '00000000-0000-0000-0000-0000000013a1',
            'vow', '00000000-0000-0000-0000-0000000013a5')$$,
  'a Vow reminder is accepted');

select lives_ok(
  $$insert into public.item_reminders (org_id, membership_id, target)
    values ('00000000-0000-0000-0000-0000000013a0', '00000000-0000-0000-0000-0000000013a1',
            'family_night')$$,
  'a Family Night reminder is accepted with no id -- it is a schedule, not a row');

-- ================================= the enum and the columns cannot disagree
select throws_like(
  $$insert into public.item_reminders (org_id, membership_id, target, target_vow_id)
    values ('00000000-0000-0000-0000-0000000013a0', '00000000-0000-0000-0000-0000000013a1',
            'brick', '00000000-0000-0000-0000-0000000013a5')$$,
  '%item_reminders_target_matches_kind%',
  'a reminder cannot claim to be about a Brick while pointing at a Vow');

select throws_like(
  $$insert into public.item_reminders (org_id, membership_id, target)
    values ('00000000-0000-0000-0000-0000000013a0', '00000000-0000-0000-0000-0000000013a1',
            'brick')$$,
  '%item_reminders_target_matches_kind%',
  'a Brick reminder with no Brick is refused');

select throws_like(
  $$insert into public.item_reminders (org_id, membership_id, target, target_brick_id)
    values ('00000000-0000-0000-0000-0000000013a0', '00000000-0000-0000-0000-0000000013a1',
            'family_night', '00000000-0000-0000-0000-0000000013a4')$$,
  '%item_reminders_target_matches_kind%',
  'a Family Night reminder cannot carry a Brick');

-- ============================================= one toggle per item per member
select throws_like(
  $$insert into public.item_reminders (org_id, membership_id, target, target_brick_id)
    values ('00000000-0000-0000-0000-0000000013a0', '00000000-0000-0000-0000-0000000013a1',
            'brick', '00000000-0000-0000-0000-0000000013a4')$$,
  '%item_reminders_one_per_brick_idx%',
  'the same member cannot subscribe to one Brick twice');

-- THE CASE A SINGLE UNIQUE INDEX WOULD HAVE MISSED. Both id columns are null
-- for family_night, and NULLs are DISTINCT in a unique index -- so an index
-- over (membership_id, target, target_brick_id, target_vow_id) would have let
-- a member subscribe to Family Night unboundedly many times. Hence the third
-- partial index.
select throws_like(
  $$insert into public.item_reminders (org_id, membership_id, target)
    values ('00000000-0000-0000-0000-0000000013a0', '00000000-0000-0000-0000-0000000013a1',
            'family_night')$$,
  '%item_reminders_one_family_night_idx%',
  'nor to Family Night twice, even though both id columns are null');

-- A DIFFERENT member may of course subscribe to the same thing.
insert into public.memberships (id, org_id, profile_id, role) values
  ('00000000-0000-0000-0000-0000000013a6', '00000000-0000-0000-0000-0000000013a0', '00000000-0000-0000-0000-0000000000a3', 'member');
select lives_ok(
  $$insert into public.item_reminders (org_id, membership_id, target, target_brick_id)
    values ('00000000-0000-0000-0000-0000000013a0', '00000000-0000-0000-0000-0000000013a6',
            'brick', '00000000-0000-0000-0000-0000000013a4')$$,
  'a different member can subscribe to the same Brick');

-- ============================================== no cross-Family subscription
select throws_like(
  $$insert into public.item_reminders (org_id, membership_id, target, target_vow_id)
    values ('00000000-0000-0000-0000-0000000013a0', '00000000-0000-0000-0000-0000000013b1',
            'vow', '00000000-0000-0000-0000-0000000013a5')$$,
  '%violates foreign key constraint%',
  'a member of another Family cannot set a reminder here');

set constraints public.item_reminders_target_brick_id_org_id_fkey immediate;
select throws_like(
  $$insert into public.item_reminders (org_id, membership_id, target, target_brick_id)
    values ('00000000-0000-0000-0000-0000000013a0', '00000000-0000-0000-0000-0000000013a1',
            'brick', '00000000-0000-0000-0000-0000000013b4')$$,
  '%item_reminders_target_brick_id_org_id_fkey%',
  'and cannot point at another Family Brick');
set constraints public.item_reminders_target_brick_id_org_id_fkey deferred;

-- --------------------------------------------------------- toggling off, and cascades
select lives_ok(
  $$delete from public.item_reminders
     where membership_id = '00000000-0000-0000-0000-0000000013a6'$$,
  'a toggle can be turned off -- this table DOES allow delete, unlike care_actions');

delete from public.bricks where id = '00000000-0000-0000-0000-0000000013a4';
select is(
  (select count(*)::int from public.item_reminders
    where target_brick_id = '00000000-0000-0000-0000-0000000013a4'),
  0,
  'deleting the Brick removes the reminders about it -- there is nothing left to be reminded of');

-- ------------------------------------------------------------ audit and RLS
select has_trigger('public', 'item_reminders', 'item_reminders_audit',
  'item_reminders carries its audit trigger, in the migration that created it');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.item_reminders'::regclass),
  'RLS is enabled');

select policies_are('public', 'item_reminders',
  array['item_reminders_select', 'item_reminders_insert', 'item_reminders_delete'],
  'select, insert and delete -- and no UPDATE');

-- No UPDATE grant, and the reason is C1 PR4's lesson: RLS cannot restrict
-- WHICH columns an UPDATE touches, and every column here is part of the
-- subscription identity. Off then on is delete then insert.
select ok(
  not has_table_privilege('authenticated', 'public.item_reminders', 'UPDATE'),
  'no UPDATE grant: changing membership_id would move somebody else reminder');

-- service_role reads to decide what N1 sends, and writes nothing: a reminder
-- is asked for, never set on somebody behalf.
select ok(
  has_table_privilege('service_role', 'public.item_reminders', 'SELECT')
  and not has_table_privilege('service_role', 'public.item_reminders', 'INSERT'),
  'service_role reads reminders but cannot create them');

-- ---------------------------------------------------------------- the cascade
select lives_ok(
  $$delete from public.organizations
     where id = '00000000-0000-0000-0000-0000000013a0'$$,
  'a Family holding reminders can be deleted');

select is(
  (select count(*)::int from public.item_reminders
    where org_id = '00000000-0000-0000-0000-0000000013a0'),
  0,
  'and its reminders go with it');

select * from finish();
rollback;
