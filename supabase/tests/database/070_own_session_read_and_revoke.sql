-- The two session functions' contract: shape, privileges, and -- the part that
-- matters -- that neither can be pointed at somebody else's sessions.
--
-- The isolation counterpart (tests/isolation/sessions.test.ts) drives these
-- through PostgREST as two real signed-in users, which is the only way to
-- exercise auth.uid(). This file asserts what the catalog knows, plus the
-- self-scoping predicate under an impersonated JWT.

begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

-- ------------------------------------------------------------------ existence
select has_function('public', 'my_sessions', 'my_sessions() exists');
select has_function('public', 'revoke_my_session', array['uuid'],
  'revoke_my_session(uuid) exists');
select function_returns('public', 'revoke_my_session', array['uuid'], 'boolean',
  'revoke_my_session returns boolean');

-- ------------------------------------------------------------- security shape
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'my_sessions'),
  true, 'my_sessions is SECURITY DEFINER -- authenticated has no auth-schema privilege');
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'revoke_my_session'),
  true, 'revoke_my_session is SECURITY DEFINER');

-- pg_temp explicit and last on both, per the 2026-08-28 learned constraint. It
-- is load-bearing here and not a formality: these functions read and DELETE from
-- auth.sessions, and an unqualified relation reference under an unpinned
-- search_path can be shadowed by a caller's temp table.
select is(
  (select array_to_string(p.proconfig, ',') from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'my_sessions'),
  'search_path=pg_catalog, pg_temp', 'my_sessions pins search_path with pg_temp last');
select is(
  (select array_to_string(p.proconfig, ',') from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'revoke_my_session'),
  'search_path=pg_catalog, pg_temp', 'revoke_my_session pins search_path with pg_temp last');

-- ------------------------------------------------------------------ who calls
select ok(not has_function_privilege('public', 'public.my_sessions()', 'execute'),
  'my_sessions: EXECUTE revoked from PUBLIC');
select ok(not has_function_privilege('anon', 'public.my_sessions()', 'execute'),
  'my_sessions: anon cannot execute');
select ok(has_function_privilege('authenticated', 'public.my_sessions()', 'execute'),
  'my_sessions: authenticated can execute');
select ok(not has_function_privilege('anon', 'public.revoke_my_session(uuid)', 'execute'),
  'revoke_my_session: anon cannot execute');
select ok(has_function_privilege('authenticated', 'public.revoke_my_session(uuid)', 'execute'),
  'revoke_my_session: authenticated can execute');

-- ------------------------------------------------------- the self-scoping test
-- Two real sessions belonging to two different seeded users, then each function
-- called under Alice's JWT. This is the assertion the whole design rests on.
insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a1', now(), now()),
  ('bbbbbbbb-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-0000000000a2', now(), now());

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000a1',
                    'role', 'authenticated',
                    'session_id', 'aaaaaaaa-0000-0000-0000-00000000aaaa')::text, true);

-- Joined back to auth.sessions to check OWNERSHIP of every row returned, rather
-- than asserting the result equals the one row this file inserted. Alice has
-- other, real sessions here from the isolation suite's sign-ins, so an
-- equality assertion would pass or fail depending on what ran first -- the
-- 2026-08-29 residue lesson, which this file hit on its first run.
select ok(
  (select bool_and(s.user_id = '00000000-0000-0000-0000-0000000000a1'::uuid)
     from public.my_sessions() m join auth.sessions s on s.id = m.id),
  'every row my_sessions returns belongs to the caller'
);

select ok(
  not exists (
    select 1 from public.my_sessions()
     where id = 'bbbbbbbb-0000-0000-0000-00000000bbbb'::uuid
  ),
  'the other user''s session is not among them'
);

select is(
  (select is_current from public.my_sessions()
    where id = 'aaaaaaaa-0000-0000-0000-00000000aaaa'),
  true,
  'the row matching the JWT''s session_id claim is marked current'
);

-- The one that would be a cross-account session kill.
select is(
  public.revoke_my_session('bbbbbbbb-0000-0000-0000-00000000bbbb'),
  false,
  'revoking another user''s session does nothing and says so'
);
select ok(
  exists (select 1 from auth.sessions where id = 'bbbbbbbb-0000-0000-0000-00000000bbbb'),
  'the other user''s session is still there afterwards'
);

-- A probe for somebody else's session must leave no audit row. Scoped to this
-- test's own target_id, never a global count by action -- the 2026-08-29 lesson.
select is(
  (select count(*)::int from public.audit_log
    where action = 'session.revoked'
      and target_id = 'bbbbbbbb-0000-0000-0000-00000000bbbb'),
  0,
  'a refused revoke writes no audit row'
);

select is(
  public.revoke_my_session('aaaaaaaa-0000-0000-0000-00000000aaaa'),
  true,
  'revoking the caller''s own session removes it'
);

-- Invariant 5, for the one mutation a trigger cannot reach: auth.sessions is
-- outside `public`, so the audit write lives inside the function's own
-- transaction instead.
select is(
  (select count(*)::int from public.audit_log
    where action = 'session.revoked'
      and target_id = 'aaaaaaaa-0000-0000-0000-00000000aaaa'),
  1,
  'a successful revoke writes exactly one audit row for that session'
);

select is(
  (select actor_profile_id from public.audit_log
    where action = 'session.revoked'
      and target_id = 'aaaaaaaa-0000-0000-0000-00000000aaaa'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'the audit row is attributed to the caller, resolved server-side from auth.uid()'
);

select is(
  (select metadata from public.audit_log
    where action = 'session.revoked'
      and target_id = 'aaaaaaaa-0000-0000-0000-00000000aaaa'),
  '{}'::jsonb,
  'metadata carries no user agent, no IP, no content'
);

-- ------------------------------------------------------ revoke_all_my_sessions
select has_function('public', 'revoke_all_my_sessions',
  'revoke_all_my_sessions() exists');
select ok(not has_function_privilege('anon', 'public.revoke_all_my_sessions()', 'execute'),
  'revoke_all_my_sessions: anon cannot execute');
select ok(has_function_privilege('authenticated', 'public.revoke_all_my_sessions()', 'execute'),
  'revoke_all_my_sessions: authenticated can execute');
select is(
  (select array_to_string(p.proconfig, ',') from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'revoke_all_my_sessions'),
  'search_path=pg_catalog, pg_temp',
  'revoke_all_my_sessions pins search_path with pg_temp last');

-- Two more of Alice's, plus Bob's, which must survive. Bob's is the assertion
-- that matters: a bulk revoke is the easiest place to delete too much.
insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('cccccccc-0000-0000-0000-00000000cccc', '00000000-0000-0000-0000-0000000000a1', now(), now()),
  ('dddddddd-0000-0000-0000-00000000dddd', '00000000-0000-0000-0000-0000000000a1', now(), now());

select ok(
  (select public.revoke_all_my_sessions()) >= 2,
  'revoke_all_my_sessions removes the caller''s remaining sessions'
);

select ok(
  not exists (
    select 1 from auth.sessions
     where user_id = '00000000-0000-0000-0000-0000000000a1'
  ),
  'the caller has no sessions left at all'
);

select ok(
  exists (select 1 from auth.sessions where id = 'bbbbbbbb-0000-0000-0000-00000000bbbb'),
  'the other member''s session is untouched by a bulk revoke'
);

select is(
  (select count(*)::int from public.audit_log
    where action = 'sessions.revoked_all'
      and target_id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'a bulk revoke writes exactly ONE audit row, not one per session'
);

select * from finish();
rollback;
