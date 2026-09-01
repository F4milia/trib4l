-- table_entries, table_prompts, mood_tags -- Ferenz 1.1.
--
-- WHAT THIS FILE CANNOT DO, stated first so a reader does not mistake it for
-- proof of the policies below: pgTAP connects as `postgres` and BYPASSES RLS
-- entirely. Nothing here demonstrates that a policy works. The policy proof is
-- owed in tests/isolation/** with real users and their own JWTs, per CLAUDE.md's
-- testing rules, and it is schema PR 9. What this file asserts is the schema:
-- the constraints, the trigger, the indexes, and that the policies and grants
-- EXIST with the shape they claim.

begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

-- ------------------------------------------------------------------ fixture
create temporary table _f as
select '00000000-0000-0000-0000-0000000000f1'::uuid as org_a,
       '00000000-0000-0000-0000-0000000000f2'::uuid as org_b,
       '00000000-0000-0000-0000-0000000000f3'::uuid as member_a,
       '00000000-0000-0000-0000-0000000000f4'::uuid as member_b,
       '00000000-0000-0000-0000-0000000000a1'::uuid as profile_a,
       '00000000-0000-0000-0000-0000000000a2'::uuid as profile_b;

insert into public.organizations (id, slug, name)
select org_a, 'table-probe-a', 'Table Probe A' from _f
union all
select org_b, 'table-probe-b', 'Table Probe B' from _f;

insert into public.memberships (id, org_id, profile_id, role)
select member_a, org_a, profile_a, 'member'::membership_role from _f
union all
select member_b, org_b, profile_b, 'member'::membership_role from _f;

-- ------------------------------------------------------- 10.5 stays unanswered
select is(
  (select count(*)::int from public.mood_tags),
  0,
  'mood_tags ships EMPTY -- 10.5 is unspecified and a vocabulary is not invented here');

-- ------------------------------------------------------------- the happy path
insert into public.table_prompts (id, org_id, body)
values ('00000000-0000-0000-0000-0000000000c1', null, 'A platform-wide prompt');

insert into public.table_prompts (id, org_id, body)
select '00000000-0000-0000-0000-0000000000c2', org_a, 'Family A''s own prompt' from _f;

insert into public.table_entries (id, org_id, member_id, entry_date, prompt_id, response_text)
select '00000000-0000-0000-0000-0000000000b1', org_a, member_a, current_date,
       '00000000-0000-0000-0000-0000000000c1', 'today''s words' from _f;

select is(
  (select response_text from public.table_entries
    where id = '00000000-0000-0000-0000-0000000000b1'),
  'today''s words',
  'an entry against a platform-wide prompt is accepted');

-- A Family's own prompt, on a different day so the one-per-day index allows it.
insert into public.table_entries (org_id, member_id, entry_date, prompt_id, response_text)
select org_a, member_a, current_date - 1,
       '00000000-0000-0000-0000-0000000000c2', 'yesterday' from _f;

-- Asserted rather than `pass()`: a free pass records that the insert above did
-- not throw and nothing else, which is not what the description claims.
select is(
  (select prompt_id from public.table_entries
    where org_id = (select org_a from _f) and entry_date = current_date - 1),
  '00000000-0000-0000-0000-0000000000c2'::uuid,
  'an entry against the Family''s own prompt is accepted and keeps the reference');

-- --------------------------------------------------- the cross-Family guard
-- The reason this is a trigger and not a composite FK: a composite key on
-- (prompt_id, org_id) is MATCH SIMPLE, so a NULL org_id skips the check
-- entirely and a platform prompt would let an entry reference any Family's.
select throws_like(
  $$insert into public.table_entries (org_id, member_id, entry_date, prompt_id, response_text)
    select '00000000-0000-0000-0000-0000000000f2',
           '00000000-0000-0000-0000-0000000000f4',
           current_date, '00000000-0000-0000-0000-0000000000c2', 'not mine'$$,
  '%belongs to another Family%',
  'Family B cannot write an entry against Family A''s prompt');

select throws_like(
  $$insert into public.table_entries (org_id, member_id, entry_date, prompt_id, response_text)
    select '00000000-0000-0000-0000-0000000000f1',
           '00000000-0000-0000-0000-0000000000f3',
           current_date + 5, '00000000-0000-0000-0000-00000000ffff', 'ghost prompt'$$,
  -- The trigger's OWN message, not '%'. A bare wildcard accepts any error and
  -- would pass on the plain FK violation, on a typo, on anything -- the trap
  -- CLAUDE.md records for C1 PR1's `throws_ok(sql, null, null, desc)`. The
  -- BEFORE trigger fires ahead of the FK check, so this message is the one that
  -- must appear.
  '%does not exist%',
  'an entry cannot reference a prompt that does not exist');

-- An entry cannot claim a Family its author is not in -- the composite FK.
select throws_like(
  $$insert into public.table_entries (org_id, member_id, entry_date, response_text)
    select '00000000-0000-0000-0000-0000000000f1',
           '00000000-0000-0000-0000-0000000000f4',
           current_date + 6, 'wrong family'$$,
  '%violates foreign key constraint%',
  'an entry cannot attribute itself to a member of another Family');

-- --------------------------------------------------------- one entry per day
select throws_like(
  $$insert into public.table_entries (org_id, member_id, entry_date, response_text)
    select '00000000-0000-0000-0000-0000000000f1',
           '00000000-0000-0000-0000-0000000000f3',
           current_date, 'a second entry today'$$,
  '%table_entries_one_per_member_per_day_idx%',
  'one entry per member per day (F1.2)');

-- ...but the index is PARTIAL, so soft-deleting frees the day again. Otherwise
-- deleting an entry would cost the member that day permanently.
update public.table_entries set deleted_at = now()
 where id = '00000000-0000-0000-0000-0000000000b1';

select lives_ok(
  $$insert into public.table_entries (org_id, member_id, entry_date, response_text)
    select '00000000-0000-0000-0000-0000000000f1',
           '00000000-0000-0000-0000-0000000000f3',
           current_date, 'rewritten'$$,
  'soft-deleting an entry frees that day to be written again');

-- --------------------------------------------------------------- constraints
select throws_like(
  $$insert into public.table_entries (org_id, member_id, entry_date, response_text)
    select '00000000-0000-0000-0000-0000000000f1',
           '00000000-0000-0000-0000-0000000000f3',
           current_date + 7, '   '$$,
  '%response_text%',
  'a blank response is not an entry');

select col_not_null('public', 'table_entries', 'entry_date', 'entry_date is required');
select col_type_is('public', 'table_entries', 'entry_date', 'date',
  'entry_date is a DATE -- the Family''s day, resolved against its timezone, not an instant');
select col_is_unique('public', 'table_entries', array['id', 'org_id'],
  '(id, org_id) is unique, for the composite keys M1''s photos and the Hurt/Repair flags need');

-- An entry outlives its prompt.
delete from public.table_prompts where id = '00000000-0000-0000-0000-0000000000c2';
select is(
  (select count(*)::int from public.table_entries
    where org_id = '00000000-0000-0000-0000-0000000000f1'
      and entry_date = current_date - 1),
  1,
  'deleting a prompt does not delete the responses to it');
select is(
  (select prompt_id from public.table_entries
    where org_id = '00000000-0000-0000-0000-0000000000f1'
      and entry_date = current_date - 1),
  null,
  'the reference is nulled, the words are kept');

-- ------------------------------------------------------------- memorial lock
-- Spec 2.9: a memorialised member's entries are locked from editing, and F8.2
-- says they REMAIN VISIBLE. So the gate belongs on UPDATE, not on SELECT.
select is(
  public.membership_is_memorialized((select member_a from _f)),
  false,
  'a living member is not memorial-locked');

update public.profiles set memorialized_at = now()
 where id = (select profile_a from _f);

select is(
  public.membership_is_memorialized((select member_a from _f)),
  true,
  'and is once their profile is memorialised');

select is(
  (select count(*)::int from public.table_entries
    where member_id = (select member_a from _f) and deleted_at is null),
  2,
  'their entries still EXIST -- the lock is on editing, not on visibility (F8.2)');

update public.profiles set memorialized_at = null
 where id = (select profile_a from _f);

-- ------------------------------------------------------ policies and grants
-- Existence and shape only. See the header: this file cannot prove a policy.
select policies_are('public', 'table_entries',
  array['table_entries_select', 'table_entries_insert', 'table_entries_update'],
  'table_entries has exactly select, insert and update policies -- no DELETE policy');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'table_entries' and cmd = 'DELETE'),
  0,
  'and no DELETE policy exists -- an entry is soft-deleted, never removed by a member');

select ok(
  not has_table_privilege('authenticated', 'public.table_entries', 'DELETE'),
  'authenticated has no DELETE grant on table_entries either');

select ok(
  has_table_privilege('authenticated', 'public.table_entries', 'INSERT')
  and has_table_privilege('authenticated', 'public.table_entries', 'UPDATE')
  and has_table_privilege('authenticated', 'public.table_entries', 'SELECT'),
  'authenticated can read, write and edit through policy');

-- service_role writes nothing to a member's own words. The Inngest daily-prompt
-- job reads entries and writes prompts; it has no business rewriting a response.
select ok(
  has_table_privilege('service_role', 'public.table_entries', 'SELECT')
  and not has_table_privilege('service_role', 'public.table_entries', 'UPDATE')
  and not has_table_privilege('service_role', 'public.table_entries', 'INSERT'),
  'service_role reads entries but cannot write or rewrite them');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.table_entries'::regclass),
  'RLS is enabled on table_entries');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.table_prompts'::regclass),
  'RLS is enabled on table_prompts');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.mood_tags'::regclass),
  'RLS is enabled on mood_tags');

-- INVARIANT 6, asserted structurally: the SELECT policy must consult
-- viewer_blocks_membership. The Table is a new social surface, and the
-- invariant says to check blocks against every one. Whether it BEHAVES
-- correctly is schema PR 9's job, with two real users.
select ok(
  (select qual like '%viewer_blocks_membership%' from pg_policies
    where schemaname = 'public' and tablename = 'table_entries'
      and policyname = 'table_entries_select'),
  'the SELECT policy consults member_blocks (invariant 6)');

select ok(
  (select qual like '%membership_is_memorialized%' from pg_policies
    where schemaname = 'public' and tablename = 'table_entries'
      and policyname = 'table_entries_update'),
  'the UPDATE policy consults the memorial lock (invariant 8)');

-- ---------------------------------------------------------- audit and cascade
select has_trigger('public', 'table_entries', 'table_entries_audit',
  'table_entries carries its audit trigger, in the migration that created it');
select has_trigger('public', 'table_prompts', 'table_prompts_audit',
  'so does table_prompts');
select has_trigger('public', 'mood_tags', 'mood_tags_audit',
  'so does mood_tags');

select lives_ok(
  $$delete from public.organizations
     where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'a Family holding Table entries can be deleted');

select is(
  (select count(*)::int from public.table_entries
    where org_id = '00000000-0000-0000-0000-0000000000f1'),
  0,
  'and its entries go with it');

select * from finish();
rollback;
