-- delete_my_account() against the four steps in
-- docs/trib4l-docs/data-retention-policy.md, and against the things it must NOT
-- do -- which is where an anonymize-vs-purge policy actually goes wrong.
--
-- Run against seeded data, per S2's acceptance criterion ("verified against seed
-- data, not assumed"). Dave is used because he holds exactly one membership, so
-- what survives and what does not is unambiguous.

begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- ------------------------------------------------------------------ existence
select has_function('public', 'delete_my_account', 'delete_my_account() exists');
select function_returns('public', 'delete_my_account', 'boolean',
  'delete_my_account returns boolean');
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_my_account'),
  true, 'is SECURITY DEFINER -- the policy crosses tables the caller cannot write');
select is(
  (select array_to_string(p.proconfig, ',') from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_my_account'),
  'search_path=pg_catalog, pg_temp', 'pins search_path with pg_temp last');
select ok(not has_function_privilege('anon', 'public.delete_my_account()', 'execute'),
  'anon cannot execute it');
select ok(has_function_privilege('authenticated', 'public.delete_my_account()', 'execute'),
  'authenticated can execute it');

-- ---------------------------------------------------------------- the fixture
-- Recorded before the deletion so every assertion below compares against what
-- was actually there, rather than against what the seed is assumed to contain.
create temporary table before_deletion as
select
  (select count(*)::int from public.memberships where profile_id = '00000000-0000-0000-0000-0000000000a4') as memberships,
  (select count(*)::int from public.audit_log where actor_profile_id = '00000000-0000-0000-0000-0000000000a4') as audit_rows,
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a4') as display_name;

select ok((select memberships from before_deletion) > 0,
  'the fixture has at least one membership to preserve');
select isnt((select display_name from before_deletion), 'Deleted user',
  'the fixture starts with a real display name');

-- A session to be revoked, and another member's session that must survive.
insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('44444444-0000-0000-0000-000000004444', '00000000-0000-0000-0000-0000000000a4', now(), now()),
  ('11111111-0000-0000-0000-000000001111', '00000000-0000-0000-0000-0000000000a1', now(), now());

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000a4',
                    'role', 'authenticated')::text, true);

select is(public.delete_my_account(), true, 'the request succeeds');

-- ------------------------------------------------------- step 1: the profile
select ok(
  (select deleted_at is not null from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a4'),
  'step 1: profiles.deleted_at is set'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a4'),
  'Deleted user',
  'step 1: display_name is scrubbed to the placeholder the policy names'
);
select is(
  (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-0000000000a4'),
  null,
  'step 1: avatar_url is cleared'
);
-- The row itself must SURVIVE. This is the assertion that fails if somebody
-- "simplifies" this into a delete: memberships, org_profiles and audit_log all
-- hold foreign keys to it.
select ok(
  exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000a4'),
  'step 1: the profile row still exists -- anonymized, not purged'
);

-- --------------------------------------------------- step 2: the org profiles
select ok(
  not exists (
    select 1 from public.org_profiles
     where profile_id = '00000000-0000-0000-0000-0000000000a4'
       and (deleted_at is null or display_name is not null or avatar_url is not null)
  ),
  'step 2: every org_profiles row is scrubbed and soft-deleted'
);

-- --------------------------------------------------- step 3: the memberships
select is(
  (select count(*)::int from public.memberships
    where profile_id = '00000000-0000-0000-0000-0000000000a4'),
  (select memberships from before_deletion),
  'step 3: no membership row was removed -- the count is unchanged'
);
select ok(
  not exists (
    select 1 from public.memberships
     where profile_id = '00000000-0000-0000-0000-0000000000a4' and deleted_at is null
  ),
  'step 3: every membership row is soft-deleted'
);

-- ------------------------------------------------------ step 4: the audit log
-- Compared against the count captured BEFORE, plus the rows this deletion is
-- expected to add. Never a global count by action -- the 2026-08-29 lesson.
select ok(
  (select count(*)::int from public.audit_log
    where actor_profile_id = '00000000-0000-0000-0000-0000000000a4')
  >= (select audit_rows from before_deletion),
  'step 4: no pre-existing audit row was removed'
);
select is(
  (select count(*)::int from public.audit_log
    where action = 'account.deleted'
      and target_id = '00000000-0000-0000-0000-0000000000a4'),
  1,
  'the deletion itself is recorded exactly once'
);

-- ------------------------------------------------------------ sessions ended
select ok(
  not exists (
    select 1 from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000a4'
  ),
  'every session belonging to the account is revoked'
);
select ok(
  exists (select 1 from auth.sessions where id = '11111111-0000-0000-0000-000000001111'),
  'another member''s session is untouched'
);

-- ------------------------------------------------------------- idempotence
select is(public.delete_my_account(), false,
  'a second request does nothing rather than re-scrubbing and re-logging');
select is(
  (select count(*)::int from public.audit_log
    where action = 'account.deleted'
      and target_id = '00000000-0000-0000-0000-0000000000a4'),
  1,
  'and writes no second audit row'
);

select * from finish();
rollback;
