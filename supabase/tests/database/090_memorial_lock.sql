-- Memorial-lock, and above all the one thing that must never happen: a
-- memorialised person's name being replaced with 'Deleted user'.
--
-- Every other assertion about delete_my_account (in 080) checks that the scrub
-- HAPPENED. These check that it did not. That asymmetry is the whole reason the
-- file exists -- code that gets this wrong passes 080 completely.
--
-- Dave is 00000000-0000-0000-0000-0000000000a4 (an ordinary member), Erin is
-- …a5 (platform staff), Alice is …a1 (an ordinary member, used as the
-- not-allowed caller).

begin;
create extension if not exists pgtap with schema extensions;

select plan(29);

-- ------------------------------------------------------------------- shape
select has_column('public', 'profiles', 'memorialized_at',
  'profiles.memorialized_at exists');
select has_column('public', 'profiles', 'memorialized_by',
  'profiles.memorialized_by exists');
select has_function('public', 'memorialize_profile', array['uuid'],
  'memorialize_profile(uuid) exists');
select has_function('public', 'unmemorialize_profile', array['uuid'],
  'unmemorialize_profile(uuid) exists');

select is(
  (select array_to_string(p.proconfig, ',') from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'memorialize_profile'),
  'search_path=pg_catalog, pg_temp',
  'memorialize_profile pins search_path with pg_temp last');
select is(
  (select array_to_string(p.proconfig, ',') from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'unmemorialize_profile'),
  'search_path=pg_catalog, pg_temp',
  'unmemorialize_profile pins search_path with pg_temp last');

select ok(not has_function_privilege('anon', 'public.memorialize_profile(uuid)', 'execute'),
  'anon cannot memorialize');
select ok(not has_function_privilege('anon', 'public.unmemorialize_profile(uuid)', 'execute'),
  'anon cannot unmemorialize');

-- --------------------------------------------------- who is allowed to set it
-- An ordinary member, at aal2, is still not staff. Decision 1: staff only.
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a1',
                    'role','authenticated','aal','aal2')::text, true);
select is(public.memorialize_profile('00000000-0000-0000-0000-0000000000a4'), false,
  'an ordinary member cannot memorialize anyone, even at aal2');
select ok(
  (select memorialized_at is null from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a4'),
  'and nothing changed');

-- Staff WITHOUT a verified second factor. is_platform_admin() is
-- `is_platform_staff() and aal = aal2`, so a password-only staff session is
-- refused -- the S2 gate reaching into this action.
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a5',
                    'role','authenticated','aal','aal1')::text, true);
select is(public.memorialize_profile('00000000-0000-0000-0000-0000000000a4'), false,
  'staff at aal1 cannot memorialize -- two-factor is required for this');

-- Staff, two-factor verified.
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a5',
                    'role','authenticated','aal','aal2')::text, true);

create temporary table before_lock as
select display_name, avatar_url from public.profiles
 where id = '00000000-0000-0000-0000-0000000000a4';

select is(public.memorialize_profile('00000000-0000-0000-0000-0000000000a4'), true,
  'verified staff can memorialize');
select ok(
  (select memorialized_at is not null from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a4'),
  'memorialized_at is set');
select is(
  (select memorialized_by from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a4'),
  '00000000-0000-0000-0000-0000000000a5'::uuid,
  'and who did it is recorded');
select is(
  (select count(*)::int from public.audit_log
    where action = 'profile.memorialized'
      and target_id = '00000000-0000-0000-0000-0000000000a4'),
  1,
  'exactly one audit row for the act');

-- ------------------------------------------------- THE NAME IS LEFT ALONE
select is(
  (select display_name from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a4'),
  (select display_name from before_lock),
  'memorializing does not change the display name');
select is(
  (select avatar_url from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a4'),
  (select avatar_url from before_lock),
  'nor the picture');

select is(public.memorialize_profile('00000000-0000-0000-0000-0000000000a4'), false,
  'memorializing twice does nothing the second time');

-- ------------------------------------------ a deletion request cannot win
-- Decision 3. The person asking holds the credentials -- an executor, a
-- relative -- and is refused.
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a4',
                    'role','authenticated')::text, true);

select is(public.delete_my_account(), false,
  'delete_my_account refuses for a memorialized account');
select is(
  (select display_name from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a4'),
  (select display_name from before_lock),
  'THE NAME SURVIVES the deletion request -- not "Deleted user"');
select ok(
  (select deleted_at is null from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a4'),
  'and the account is not marked deleted');
select ok(
  not exists (
    select 1 from public.memberships
     where profile_id = '00000000-0000-0000-0000-0000000000a4' and deleted_at is not null
  ),
  'no membership was soft-deleted either');
select is(
  (select count(*)::int from public.audit_log
    where action = 'account.deletion_refused'
      and target_id = '00000000-0000-0000-0000-0000000000a4'),
  1,
  'the refusal is recorded -- somebody asked, and we said no');
select is(
  (select count(*)::int from public.audit_log
    where action = 'account.deleted'
      and target_id = '00000000-0000-0000-0000-0000000000a4'),
  0,
  'and nothing claims the account was deleted');

-- ------------------------------------------------------- reversible (dec. 2)
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a5',
                    'role','authenticated','aal','aal2')::text, true);
select is(public.unmemorialize_profile('00000000-0000-0000-0000-0000000000a4'), true,
  'verified staff can reverse it');
select is(
  (select count(*)::int from public.audit_log
    where action = 'profile.unmemorialized'
      and target_id = '00000000-0000-0000-0000-0000000000a4'),
  1,
  'the reversal is recorded too');

-- Once reversed, the ordinary path works again -- proof the refusal was the
-- state talking, not a permanent break.
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a4',
                    'role','authenticated')::text, true);
select is(public.delete_my_account(), true,
  'after reversal, an ordinary deletion succeeds again');

-- ------------------------------------ a prior self-deletion stands (dec. 4)
-- Dave is now anonymised by his own request. Memorializing him must NOT bring
-- the name back: his choice while alive outlasts him.
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a5',
                    'role','authenticated','aal','aal2')::text, true);
select is(public.memorialize_profile('00000000-0000-0000-0000-0000000000a4'), true,
  'an already-deleted account can still be memorialized');
select is(
  (select display_name from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a4'),
  'Deleted user',
  'and the name they removed stays removed -- memorial-lock preserves, never restores');

select * from finish();
rollback;
