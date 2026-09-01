-- family_streak and family_table_day -- Ferenz 1.3, D1's elements 4 and 5.
--
-- The three cases spec 2.1 names explicitly ("a missed day, several consecutive
-- misses, and broken-then-resumed") are all here, and they exist to catch a
-- future change that turns this into a conventional consecutive-day streak.
-- A missed day HOLDS the value; nothing resets it.

begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

create temporary table _f as
select '00000000-0000-0000-0000-000000000301'::uuid as org_id,
       '00000000-0000-0000-0000-000000000302'::uuid as member_id,
       '00000000-0000-0000-0000-000000000303'::uuid as other_member,
       '00000000-0000-0000-0000-000000000311'::uuid as other_org,
       '00000000-0000-0000-0000-000000000312'::uuid as other_org_member;

-- Pacific/Auckland deliberately, not UTC: family_table_day resolves "today"
-- against the Family's own timezone, and a UTC-only fixture would pass whether
-- that conversion happened or not.
insert into public.organizations (id, slug, name, timezone)
select org_id, 'streak-probe', 'Streak Probe', 'Pacific/Auckland' from _f;

insert into public.organizations (id, slug, name)
select other_org, 'streak-probe-other', 'Other Family' from _f;

insert into public.memberships (id, org_id, profile_id, role)
select member_id, org_id, '00000000-0000-0000-0000-0000000000a1'::uuid, 'member'::membership_role from _f
union all
select other_member, org_id, '00000000-0000-0000-0000-0000000000a2'::uuid, 'member'::membership_role from _f
union all
select other_org_member, other_org, '00000000-0000-0000-0000-0000000000a1'::uuid, 'member'::membership_role from _f;

-- Anchor every date to the FAMILY's today, not the server's, so the fixture
-- does not drift depending on when in the UTC day the suite runs.
create temporary table _d as
select (now() at time zone 'Pacific/Auckland')::date as today;

-- family_table_day answers for the CALLING member, so it needs a caller.
-- pgTAP connects as `postgres` with no JWT, and auth.uid() then returns null --
-- which makes the function report "not written" for every date regardless of
-- what is in the table. Setting the claim is what makes those assertions mean
-- anything; it does NOT make this an RLS test, since postgres still bypasses
-- policy entirely.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000a1',
                    'role', 'authenticated')::text, true);

-- ------------------------------------------------------------- empty Family
select is(public.family_streak((select org_id from _f)), 0,
  'a Family that has never written has a streak of 0, not null');

select is(
  (select written from public.family_table_day((select org_id from _f))),
  false,
  'and today is unwritten');

select is(
  (select family_date from public.family_table_day((select org_id from _f))),
  (select today from _d),
  'today is the Family''s date in ITS timezone, not the server''s');

-- ------------------------------------------------- three consecutive days
insert into public.table_entries (org_id, member_id, entry_date, response_text)
select org_id, member_id, (select today from _d) - 4, 'day one' from _f
union all
select org_id, member_id, (select today from _d) - 3, 'day two' from _f
union all
select org_id, member_id, (select today from _d) - 2, 'day three' from _f;

select is(public.family_streak((select org_id from _f)), 3,
  'three days written is a streak of 3');

-- ============================================ CASE 1: a missed day HOLDS it
-- Nothing is written for today-1. The streak must not move.
select is(public.family_streak((select org_id from _f)), 3,
  'a missed day HOLDS the streak at 3 -- it does not reset to zero (F1.3)');

-- ================================== CASE 3: broken, then resumed
insert into public.table_entries (org_id, member_id, entry_date, response_text)
select org_id, member_id, (select today from _d), 'resumed' from _f;

select is(public.family_streak((select org_id from _f)), 4,
  'resuming after a gap increments from the held value -- 3 becomes 4, not 1');

select is(
  (select written from public.family_table_day((select org_id from _f))),
  true,
  'and today now reads as written');

-- ============================ CASE 2: several consecutive misses HOLD it
-- Reach back and add an older run, leaving a WIDE gap. The streak counts days
-- shown up, so it rises by the number of new days and by nothing else -- the
-- size of the gap never matters.
insert into public.table_entries (org_id, member_id, entry_date, response_text)
select org_id, member_id, (select today from _d) - 40, 'long ago' from _f
union all
select org_id, member_id, (select today from _d) - 39, 'long ago plus one' from _f;

select is(public.family_streak((select org_id from _f)), 6,
  'a 35-day gap HOLDS the streak too -- several consecutive misses reset nothing');

-- --------------------------------------------------------- Family-level, not per-member
-- A second member writing on a day already covered adds nothing: the question
-- is whether the FAMILY showed up, not how many did.
insert into public.table_entries (org_id, member_id, entry_date, response_text)
select org_id, other_member, (select today from _d), 'me too' from _f;

select is(public.family_streak((select org_id from _f)), 6,
  'two members writing on the same day is one day -- the streak is Family-level');

-- A second member writing on an UNCOVERED day does count.
insert into public.table_entries (org_id, member_id, entry_date, response_text)
select org_id, other_member, (select today from _d) - 1, 'only me today' from _f;

select is(public.family_streak((select org_id from _f)), 7,
  'and any one member showing up is the Family showing up');

-- ------------------------------------------------------------- soft deletes
update public.table_entries set deleted_at = now()
 where org_id = (select org_id from _f)
   and entry_date = (select today from _d) - 1;

select is(public.family_streak((select org_id from _f)), 6,
  'a soft-deleted entry stops counting -- the day was withdrawn, not held');

-- ------------------------------------------------------- no bleed across Families
insert into public.table_entries (org_id, member_id, entry_date, response_text)
select other_org, other_org_member, (select today from _d), 'other family' from _f;

select is(public.family_streak((select org_id from _f)), 6,
  'another Family''s entries do not touch this streak');
select is(public.family_streak((select other_org from _f)), 1,
  'and that Family has its own -- D1''s edge case, at the data layer');

-- ------------------------------------------------------------ shape guarantees
-- Both must stay SECURITY INVOKER. As definers they would answer for any
-- org_id a caller guessed: family_streak would report how active another
-- Family is, which is the aggregate-leak shape C1 PR4 found in unread counts.
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'family_streak'),
  false,
  'family_streak is SECURITY INVOKER, so it counts only entries the caller can see');
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'family_table_day'),
  false,
  'family_table_day is SECURITY INVOKER too');

select ok(
  not has_function_privilege('service_role', 'public.family_streak(uuid)', 'EXECUTE'),
  'service_role has no grant on either: nothing server-side reads a streak');

select is(public.family_streak('00000000-0000-0000-0000-0000000000ff'), 0,
  'an org_id that does not exist answers 0, not an error');

select * from finish();
rollback;
