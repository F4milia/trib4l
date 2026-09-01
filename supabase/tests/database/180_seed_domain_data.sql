-- The seed itself, asserted. D1's readiness checks 6 and 7.
--
-- WHY A TEST AND NOT A COMMENT: the fixture has one property that is easy to
-- break and impossible to notice -- the two populated Families must DIFFER on
-- every element D1's named edge case names.
--
--   "Dual-Family member switches Families -- Tower, streak, Vow holder all
--    switch with zero bleed."
--
-- Identical data on both sides passes that check while proving nothing. A
-- future session tidying the seed, or copy-pasting one Family's rows to flesh
-- out the other, would silently turn D1's edge case into a tautology. These
-- assertions are what stop that.
--
-- Most of them assert INEQUALITY rather than exact values, so the seed can be
-- rewritten freely as long as the property survives. The handful of exact
-- numbers are the ones a reader needs to trust when debugging the dashboard.

begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

create temporary table _s as
select '00000000-0000-0000-0000-00000000000a'::uuid as caregiver,
       '00000000-0000-0000-0000-00000000000b'::uuid as founder,
       '00000000-0000-0000-0000-00000000000c'::uuid as wellness,
       '00000000-0000-0000-0000-0000000000a1'::uuid as alice;

-- ============================================ check 6: the populated Families
-- D1's first acceptance clause is "every element reflects live seeded data",
-- and every one of its six elements needs a row to render from.
select ok((select count(*) from towers where org_id = (select caregiver from _s)) > 0,
  'caregiver-circle has a Tower (D1 element 3)');
select ok((select count(*) from builds where org_id = (select caregiver from _s)) > 0,
  'and Builds, which is what Tower progress is measured over');
select ok((select count(*) from bricks where org_id = (select caregiver from _s)) > 0,
  'and Bricks (D1 element 2)');
select ok((select count(*) from table_entries where org_id = (select caregiver from _s)) > 0,
  'and Table entries (D1 elements 4 and 5)');
select ok((select count(*) from vows where org_id = (select caregiver from _s) and status <> 'complete') = 1,
  'and exactly one open Vow (D1 element 6)');
select ok((select count(*) from ledger_events where org_id = (select caregiver from _s)) > 0,
  'and Ledger events (D1 element 1)');

select ok((select count(*) from towers where org_id = (select founder from _s)) > 0,
  'founder-collective has a Tower too -- both sides of the switch are populated');
select ok((select count(*) from bricks where org_id = (select founder from _s)) > 0,
  'and Bricks');
select ok((select count(*) from table_entries where org_id = (select founder from _s)) > 0,
  'and Table entries');
select ok((select count(*) from vows where org_id = (select founder from _s) and status <> 'complete') = 1,
  'and exactly one open Vow');

-- ================================================ check 7: the empty Family
-- D1's second acceptance clause: "loads correctly for a brand-new Family with
-- no Tower yet -- honest empty states, no invented placeholders." This is what
-- that renders from, so its emptiness is a property, not an oversight.
select is((select count(*)::int from towers where org_id = (select wellness from _s)), 0,
  'wellness-guild has no Tower -- this is the empty state D1 must render honestly');
select is((select count(*)::int from bricks where org_id = (select wellness from _s)), 0,
  'no Bricks');
select is((select count(*)::int from table_entries where org_id = (select wellness from _s)), 0,
  'no Table entries');
select is((select count(*)::int from vows where org_id = (select wellness from _s)), 0,
  'no Vow');
select is(public.family_streak((select wellness from _s)), 0,
  'and a streak of 0 -- zero, not null, so the dashboard renders a number');

-- ======================================= the edge case has something to prove
-- Inequality, not exact values: the seed may be rewritten, the property may not.
select isnt(
  (select title from towers t join organizations o on o.active_tower_id = t.id
    where o.id = (select caregiver from _s)),
  (select title from towers t join organizations o on o.active_tower_id = t.id
    where o.id = (select founder from _s)),
  'the two Families have DIFFERENT active Towers -- identical ones would pass D1''s edge case while proving nothing');

select isnt(
  public.family_streak((select caregiver from _s)),
  public.family_streak((select founder from _s)),
  'and different streaks');

select isnt(
  (select holder_id from vows where org_id = (select caregiver from _s) and status <> 'complete'),
  (select holder_id from vows where org_id = (select founder from _s) and status <> 'complete'),
  'and different Vow holders');

-- Alice is the dual-Family member, and she is in both.
select is(
  (select count(*)::int from memberships
    where profile_id = (select alice from _s) and deleted_at is null),
  2,
  'Alice is a member of exactly two Families -- she is what the edge case switches between');

-- ------------------------------------------------------- the exact numbers
-- Worth pinning because a person debugging the dashboard needs to know what
-- the right answer looks like before they can tell it is wrong.
select is(public.family_streak((select caregiver from _s)), 6,
  'caregiver-circle''s streak is 6 -- distinct days written, and a missed day held it');
select is(public.family_streak((select founder from _s)), 3,
  'founder-collective''s streak is 3');

-- D1 renders "their claimed Bricks with due windows", and an overdue one is
-- the case a reviewer never sees if every seeded date is in the future.
select ok(
  (select count(*) from bricks
    where org_id = (select caregiver from _s)
      and assignee in (select id from memberships where profile_id = (select alice from _s))
      and status <> 'done'
      and due_at < now()) > 0,
  'Alice holds at least one OVERDUE Brick, so the overdue treatment is reachable in the fixture');

select * from finish();
rollback;
