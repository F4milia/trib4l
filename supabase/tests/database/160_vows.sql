-- vows -- Ferenz 3.2/3.3, James 4.3. Settles spec 10.6 as ONE ROTATING VOW PER
-- FAMILY, and asserts the rotation rule that decision only means something with.
--
-- As with 150: pgTAP runs as `postgres` and bypasses RLS, so nothing here proves
-- a policy. Policy proof is schema PR 9, in tests/isolation/**.

begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- ------------------------------------------------------------------ fixture
-- Three members with DISTINCT created_at, because join order is the rotation
-- tiebreak and equal timestamps would make the "brand-new Family" assertions
-- non-deterministic -- an order-dependent assertion wearing a precise number.
create temporary table _f as
select '00000000-0000-0000-0000-000000000101'::uuid as org_id,
       '00000000-0000-0000-0000-000000000102'::uuid as first_joiner,
       '00000000-0000-0000-0000-000000000103'::uuid as second_joiner,
       '00000000-0000-0000-0000-000000000104'::uuid as third_joiner,
       '00000000-0000-0000-0000-000000000105'::uuid as the_mentor;

insert into public.organizations (id, slug, name)
select org_id, 'vow-probe', 'Vow Probe' from _f;

insert into public.memberships (id, org_id, profile_id, role, created_at)
select first_joiner,  org_id, '00000000-0000-0000-0000-0000000000a1'::uuid, 'org_owner'::membership_role, now() - interval '3 days' from _f
union all
select second_joiner, org_id, '00000000-0000-0000-0000-0000000000a2'::uuid, 'member'::membership_role,    now() - interval '2 days' from _f
union all
select third_joiner,  org_id, '00000000-0000-0000-0000-0000000000a3'::uuid, 'member'::membership_role,    now() - interval '1 day'  from _f
union all
select the_mentor,    org_id, '00000000-0000-0000-0000-0000000000a4'::uuid, 'mentor'::membership_role,    now() - interval '4 days' from _f;

-- ================================================= rotation, before any Vow
-- Earliest joiner first. The mentor joined EARLIEST of all and must still not
-- be chosen: spec 10.1 excludes mentors from the twelve-member cap, so they are
-- a distinct kind of participant and a Vow is between members.
select is(
  public.next_vow_holder((select org_id from _f)),
  (select first_joiner from _f),
  'a Family with no Vow history picks its earliest joiner');

select isnt(
  public.next_vow_holder((select org_id from _f)),
  (select the_mentor from _f),
  'and never the mentor, who joined earliest of all');

select is(
  public.next_vow_holder('00000000-0000-0000-0000-0000000000ff'),
  null,
  'a Family that does not exist has no next holder, rather than an error');

-- ============================================================ the state machine
insert into public.vows (id, org_id, holder_id, commitment)
select '00000000-0000-0000-0000-000000000201', org_id, first_joiner,
       'I will call my mother every Sunday' from _f;

select is(
  (select status::text from public.vows where id = '00000000-0000-0000-0000-000000000201'),
  'assigned',
  'a new Vow starts assigned');

-- ONE OPEN VOW PER FAMILY: spec 10.6's answer, enforced rather than documented.
-- Without it, "the current Vow holder" is a list and D1's element 6 has no
-- single answer.
select throws_like(
  $$insert into public.vows (org_id, holder_id, commitment)
    select '00000000-0000-0000-0000-000000000101',
           '00000000-0000-0000-0000-000000000103', 'a second open vow'$$,
  '%vows_one_open_per_org_idx%',
  'a Family cannot hold two open Vows at once');

update public.vows set status = 'active'
 where id = '00000000-0000-0000-0000-000000000201';
select is(
  (select status::text from public.vows where id = '00000000-0000-0000-0000-000000000201'),
  'active',
  'assigned -> active');

-- F3.3: renegotiation is visible to the whole Family, and carries its reason.
update public.vows
   set status = 'renegotiation_requested', renegotiation_reason = 'work travel'
 where id = '00000000-0000-0000-0000-000000000201';

select is(
  (select renegotiation_reason from public.vows
    where id = '00000000-0000-0000-0000-000000000201'),
  'work travel',
  'a renegotiation records why, so the Family can read it and not only see it');

-- --------------------------------------------- complete iff completed_at, both ways
select throws_like(
  $$update public.vows set status = 'complete'
     where id = '00000000-0000-0000-0000-000000000201'$$,
  '%vows_complete_iff_completed_at%',
  'a Vow cannot be complete without a completion time -- the rotation query reads it');

select throws_like(
  $$update public.vows set completed_at = now()
     where id = '00000000-0000-0000-0000-000000000201'$$,
  '%vows_complete_iff_completed_at%',
  'and cannot carry a completion time without being complete');

select lives_ok(
  $$update public.vows set status = 'complete', completed_at = now()
     where id = '00000000-0000-0000-0000-000000000201'$$,
  'both together is the only legal completion');

-- ==================================================== rotation, after one turn
select is(
  (select count(*)::int from public.vows
    where org_id = (select org_id from _f) and status <> 'complete'),
  0,
  'a completed Vow leaves the Family with no open Vow');

select is(
  public.next_vow_holder((select org_id from _f)),
  (select second_joiner from _f),
  'the member who has held it is not picked again while others have not held it');

-- ...and the completed Vow stays as history, which is what makes that true.
select is(
  (select count(*)::int from public.vows where org_id = (select org_id from _f)),
  1,
  'the completed Vow remains as rotation history');

-- Second turn, completed, so the third member is next.
insert into public.vows (id, org_id, holder_id, commitment, status, completed_at)
select '00000000-0000-0000-0000-000000000202', org_id, second_joiner,
       'I will cook on Thursdays', 'complete'::vow_status, now() from _f;

select is(
  public.next_vow_holder((select org_id from _f)),
  (select third_joiner from _f),
  'nobody is picked twice before everyone has had a turn (F2.2)');

-- A member who left is not picked, even having never held a turn.
update public.memberships set deleted_at = now()
 where id = (select third_joiner from _f);
select is(
  public.next_vow_holder((select org_id from _f)),
  (select first_joiner from _f),
  'a departed member is skipped, and the rotation wraps to whoever held longest ago');
update public.memberships set deleted_at = null
 where id = (select third_joiner from _f);

-- ---------------------------------------------------------------- constraints
select throws_like(
  $$insert into public.vows (org_id, holder_id, commitment, renegotiation_reason)
    select '00000000-0000-0000-0000-000000000101',
           '00000000-0000-0000-0000-000000000104', 'x', 'why'$$,
  '%vows_reason_requires_renegotiation%',
  'a brand-new assigned Vow cannot arrive already carrying a renegotiation reason');

select throws_like(
  $$insert into public.vows (org_id, holder_id, commitment)
    select '00000000-0000-0000-0000-000000000101',
           '00000000-0000-0000-0000-000000000104', '   '$$,
  '%commitment%',
  'a blank commitment is not a Vow');

-- The composite FK: a Vow cannot be held by somebody in another Family. Real
-- ids on both sides, and invisible to RLS, which sees nothing wrong with either.
select throws_like(
  $$insert into public.vows (org_id, holder_id, commitment)
    select '00000000-0000-0000-0000-000000000101',
           '00000000-0000-0000-0000-0000000000f4', 'not in this family'$$,
  '%violates foreign key constraint%',
  'a Vow cannot be held by a member of another Family');

-- ------------------------------------------------------- policies and grants
select policies_are('public', 'vows',
  array['vows_select', 'vows_insert', 'vows_update'],
  'vows has select, insert and update policies -- and no DELETE policy');

select ok(
  not has_table_privilege('authenticated', 'public.vows', 'DELETE'),
  'no DELETE grant either: deleting a completed Vow would give somebody a second turn');

select ok(
  (select qual like '%has_org_role%' from pg_policies
    where schemaname = 'public' and tablename = 'vows' and policyname = 'vows_update'),
  'the UPDATE policy admits the organizer as well as the holder (F3.3)');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.vows'::regclass),
  'RLS is enabled on vows');

select has_trigger('public', 'vows', 'vows_audit',
  'vows carries its audit trigger, in the migration that created it');

-- next_vow_holder must stay SECURITY INVOKER: it reads memberships and vows,
-- both RLS-protected, and invariant 5 says a new read path goes THROUGH policy.
-- A definer here would return another Family's member list to anyone who
-- guessed an org_id -- the shape of C1 PR4's unread-count defect.
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'next_vow_holder'),
  false,
  'next_vow_holder is SECURITY INVOKER, so it reads through RLS rather than around it');

-- ------------------------------------------------------------------- cascade
select lives_ok(
  $$delete from public.organizations
     where id = '00000000-0000-0000-0000-000000000101'$$,
  'a Family with Vow history can be deleted');

select is(
  (select count(*)::int from public.vows
    where org_id = '00000000-0000-0000-0000-000000000101'),
  0,
  'and its Vows go with it');

select * from finish();
rollback;
