-- Two Family-level scheduling columns, slotted here by docs/v1-repo-audit.md
-- (James 17.1's schema half) because two later acceptance criteria name a
-- value that has no column:
--   D2 (Wave 3 B): "Calendar respects the Family's stored timezone"
--   N1 (Wave 4 A): "The daily Table prompt push fires at the Family's chosen
--                   time in the Family's timezone"
--
-- profiles.timezone is per-USER and cannot answer either one: a Family Night
-- happens at one time for the whole Family, not at each member's local time.
--
-- `time` and not `timestamptz`: this is a recurring wall-clock time-of-day
-- ("the Table opens at 20:00"), which only means anything paired with the
-- Family's own zone. Storing an instant would fix it to one date, and storing
-- an offset would drift across a DST boundary -- 20:00 must stay 20:00 in
-- June and in December.

begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

-- ------------------------------------------------------------------- shape
select has_column('public', 'organizations', 'table_prompt_time',
  'organizations has table_prompt_time');
select col_not_null('public', 'organizations', 'table_prompt_time',
  'table_prompt_time is never null -- N1 has a time to fire at for every Family');
select col_type_is('public', 'organizations', 'table_prompt_time',
  'time without time zone',
  'table_prompt_time is a wall-clock time, not an instant');

select has_column('public', 'organizations', 'timezone',
  'organizations has timezone');
select col_not_null('public', 'organizations', 'timezone',
  'timezone is never null -- D2 never has to fall back to UTC by guessing');

-- --------------------------------------------------------------- defaults
insert into public.organizations (id, slug, name)
values ('00000000-0000-0000-0000-0000000000e1', 'e1-defaults-probe', 'E1 Defaults Probe');

select is(
  (select table_prompt_time from public.organizations
    where id = '00000000-0000-0000-0000-0000000000e1'),
  '20:00:00'::time,
  'a Family created without a prompt time gets 20:00'
);

select is(
  (select timezone from public.organizations
    where id = '00000000-0000-0000-0000-0000000000e1'),
  'UTC',
  'a Family created without a timezone gets UTC -- same default as profiles'
);

-- ------------------------------------------------------------ the tz check
select throws_ok(
  $$update public.organizations set timezone = 'Mars/Olympus_Mons'
     where id = '00000000-0000-0000-0000-0000000000e1'$$,
  '23514',
  null,
  'a name that is not an IANA zone is rejected'
);

-- is_valid_iana_timezone() checks pg_timezone_names specifically, so raw
-- offsets fail even though `at time zone` would accept them. Asserted here
-- because an offset is the failure that survives review: it looks like a
-- timezone and silently stops tracking DST.
select throws_ok(
  $$update public.organizations set timezone = '+02:00'
     where id = '00000000-0000-0000-0000-0000000000e1'$$,
  '23514',
  null,
  'a raw UTC offset is rejected -- offsets do not track DST'
);

update public.organizations
   set timezone = 'America/New_York', table_prompt_time = '19:30'
 where id = '00000000-0000-0000-0000-0000000000e1';

select is(
  (select timezone || ' ' || table_prompt_time::text from public.organizations
    where id = '00000000-0000-0000-0000-0000000000e1'),
  'America/New_York 19:30:00',
  'a real IANA zone and a chosen prompt time are accepted'
);

-- ------------------------------------------------------------------ audit
-- organizations already carries organizations_audit (mode 'self'). Asserted
-- rather than assumed: invariant 5 is about mutations, and two new columns
-- are two new things to mutate. Scoped to this probe's own target_id -- a
-- global count by action is order-dependent (CLAUDE.md, 2026-08-29).
select ok(
  (select count(*)::int from public.audit_log
    where target_type = 'organizations'
      and target_id = '00000000-0000-0000-0000-0000000000e1'
      and action = 'organizations.update'
      and metadata -> 'changed' ?& array['timezone', 'table_prompt_time']) >= 1,
  'updating the new columns writes an audit row naming them'
);

select * from finish();
rollback;
