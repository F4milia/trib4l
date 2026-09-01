-- The named QA fixtures, asserted. docs/qa-previous-session-sop.md, prereq 2.
--
-- WHY A TEST. The SOP's whole premise is that a QA doc can say "log in as
-- departed@f4milia.test" and mean something exact. That only holds while each
-- account is genuinely in the state its name claims -- and every one of those
-- states is the RESULT OF A TRANSITION (a soft delete, a block, a memorial
-- lock), not a column somebody typed. A future edit that reorders the seed, or
-- seeds an end state directly instead of performing the transition, would
-- leave the emails intact and the states wrong. The QA doc would then verify
-- nothing and look like it had.

begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

create temporary table _qa as
select '00000000-0000-0000-0000-00000000000d'::uuid as fam_a,
       '00000000-0000-0000-0000-00000000000e'::uuid as fam_b;

-- ------------------------------------------------------- every account exists
select is(
  (select count(*)::int from auth.users
    where email in ('dual@f4milia.test', 'blocker@f4milia.test', 'blocked@f4milia.test',
                    'departed@f4milia.test', 'memorial@f4milia.test', 'second@f4milia.test',
                    'orphan@f4milia.test', 'staff1@f4milia.test', 'staff2@f4milia.test')),
  9,
  'all nine named QA fixtures exist with the emails the SOP specifies');

-- ------------------------------------------------------------ dual-Family user
select is(
  (select count(*)::int from memberships m join auth.users u on u.id = m.profile_id
    where u.email = 'dual@f4milia.test' and m.deleted_at is null),
  2,
  'dual@ is an active member of exactly two Families');

select isnt(
  (select t.title from towers t where t.org_id = (select fam_a from _qa) and t.status = 'active'),
  (select t.title from towers t where t.org_id = (select fam_b from _qa) and t.status = 'active'),
  'and those two Families have DIFFERENT Towers -- switching between them has to change the screen');

select isnt(
  public.family_streak((select fam_a from _qa)),
  public.family_streak((select fam_b from _qa)),
  'and different streaks');

-- ------------------------------------------------------------- no-Family user
select is(
  (select count(*)::int from memberships m join auth.users u on u.id = m.profile_id
    where u.email = 'orphan@f4milia.test'),
  0,
  'orphan@ has no membership at all -- not a soft-deleted one, none');

-- --------------------------------------------------------------- the block
select is(
  (select count(*)::int
     from member_blocks b
     join memberships bm on bm.id = b.blocker_membership_id
     join auth.users bu on bu.id = bm.profile_id
     join memberships km on km.id = b.blocked_membership_id
     join auth.users ku on ku.id = km.profile_id
    where bu.email = 'blocker@f4milia.test' and ku.email = 'blocked@f4milia.test'),
  1,
  'blocker@ has blocked blocked@, in qa-family-a');

select ok(
  (select count(*) from table_entries e
     join memberships m on m.id = e.member_id
     join auth.users u on u.id = m.profile_id
    where u.email = 'blocked@f4milia.test' and e.deleted_at is null) > 0,
  'and blocked@ has written entries, so the block has real content to hide');

-- ------------------------------------------------------------ departed member
select ok(
  (select m.deleted_at is not null from memberships m
     join auth.users u on u.id = m.profile_id
    where u.email = 'departed@f4milia.test'),
  'departed@ has left qa-family-a -- a SOFT delete, which is what leaving is');

-- The transition, not the end state. These two were assigned to departed@ and
-- 20260903100911's trigger released them when the membership was soft-deleted.
select is(
  (select count(*)::int from bricks
    where org_id = (select fam_a from _qa) and status = 'open' and assignee is null),
  2,
  'their two open Bricks reverted to open and unassigned -- D2''s named edge case');

select is(
  (select count(*)::int from bricks
    where org_id = (select fam_a from _qa) and status = 'in_progress'),
  0,
  'and none is left in progress with nobody holding it -- no ghost');

-- ...while the finished one keeps its contributor, which is K1's edge case.
select is(
  (select count(*)::int from bricks b
     join memberships m on m.id = b.assignee
     join auth.users u on u.id = m.profile_id
    where u.email = 'departed@f4milia.test' and b.status = 'done'),
  1,
  'the Brick they finished stays attributed to them -- K1 exports it that way');

select ok(
  (select b.verified_at is not null from bricks b
     join memberships m on m.id = b.assignee
     join auth.users u on u.id = m.profile_id
    where u.email = 'departed@f4milia.test' and b.status = 'done'),
  'and keeps its verification');

-- ------------------------------------------------------------- memorial lock
select ok(
  (select p.memorialized_at is not null from profiles p
     join auth.users u on u.id = p.id
    where u.email = 'memorial@f4milia.test'),
  'memorial@ is memorial-locked');

select ok(
  public.membership_is_memorialized(
    (select m.id from memberships m join auth.users u on u.id = m.profile_id
      where u.email = 'memorial@f4milia.test')),
  'and the function the UPDATE policy consults agrees');

select ok(
  (select count(*) from table_entries e
     join memberships m on m.id = e.member_id
     join auth.users u on u.id = m.profile_id
    where u.email = 'memorial@f4milia.test' and e.deleted_at is null) > 0,
  'their entries still exist -- F8.2 locks editing, not visibility');

-- -------------------------------------------------------- non-creator member
select is(
  (select m.role::text from memberships m join auth.users u on u.id = m.profile_id
    where u.email = 'second@f4milia.test'),
  'member',
  'second@ is a plain member of qa-family-a');

select is(
  (select m.role::text from memberships m join auth.users u on u.id = m.profile_id
    where u.email = 'dual@f4milia.test' and m.org_id = (select fam_a from _qa)),
  'org_owner',
  'and somebody else owns that Family, so second@ is genuinely not its creator');

-- --------------------------------------------------------- platform staff 2FA
select is(
  (select count(*)::int from platform_staff s join auth.users u on u.id = s.profile_id
    where u.email in ('staff1@f4milia.test', 'staff2@f4milia.test')),
  2,
  'two staff fixtures, per invariant 3 -- never just one');

-- Invariant 7 ENFORCES two-factor for platform_staff at sign-in, so a staff
-- fixture without a verified factor cannot reach a single staff route and the
-- QA step for one is unrunnable.
select is(
  (select count(*)::int from auth.mfa_factors f join auth.users u on u.id = f.user_id
    where u.email in ('staff1@f4milia.test', 'staff2@f4milia.test')
      and f.factor_type = 'totp' and f.status = 'verified'),
  2,
  'and both carry a seeded VERIFIED TOTP factor, so staff routes are reachable without enrolling one by hand');

select ok(
  (select bool_and(f.secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP')
     from auth.mfa_factors f join auth.users u on u.id = f.user_id
    where u.email in ('staff1@f4milia.test', 'staff2@f4milia.test')),
  'with the documented secret, so a QA script can generate a code for it');

select * from finish();
rollback;
