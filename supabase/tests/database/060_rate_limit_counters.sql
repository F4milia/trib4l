-- Asserts the rate-limit counter store's contract: where it lives, who can
-- reach it, and that it actually refuses the sixth attempt.
--
-- pgTAP rather than vitest for the same reason as 010: SECURITY DEFINER, the
-- pinned search_path, EXECUTE revoked from PUBLIC and the table sitting outside
-- every exposed schema are facts about the catalog. A source grep passes on a
-- function altered in place, and a TypeScript test calling the RPC as
-- service_role cannot observe what anon was denied.
--
-- `supabase test db` wraps each file in a transaction and rolls it back.

begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

-- ------------------------------------------------------------------ existence
select has_schema('ratelimit', 'the ratelimit schema exists');
select has_table('ratelimit', 'counters', 'ratelimit.counters exists');
select has_function('public', 'consume_rate_limit',
  array['text', 'integer', 'integer'], 'consume_rate_limit(text,int,int) exists');
select function_returns('public', 'consume_rate_limit',
  array['text', 'integer', 'integer'], 'boolean',
  'consume_rate_limit returns boolean');

-- ------------------------------------------------------------- where it lives
-- Load-bearing, not cosmetic: outside `public`, invariant 5's audit trigger
-- does not apply, so a write per auth attempt cannot flood an append-only log.
-- This assertion is what keeps the table from drifting back in.
select is(
  (select n.nspname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relname = 'counters' and n.nspname = 'ratelimit'),
  'ratelimit',
  'the counter table is outside public, so invariant 5''s trigger discipline is not implicated'
);

select is(
  (select count(*)::int
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'ratelimit' and not t.tgisinternal),
  0,
  'ratelimit.counters carries no trigger at all'
);

-- ------------------------------------------------------------- security shape
select is(
  (select prosecdef from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'consume_rate_limit'),
  true,
  'is SECURITY DEFINER -- it is the only path into a schema nobody else can reach'
);

-- pg_temp named explicitly and last, per the 2026-08-28 learned constraint: an
-- empty pin leaves pg_temp implicitly FIRST.
select is(
  (select array_to_string(p.proconfig, ',')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'consume_rate_limit'),
  'search_path=pg_catalog, pg_temp',
  'pins search_path with pg_temp explicit and last'
);

-- ------------------------------------------------------------------ who calls
select ok(
  not has_function_privilege('public',
    'public.consume_rate_limit(text,integer,integer)', 'execute'),
  'EXECUTE is revoked from PUBLIC'
);
select ok(
  not has_function_privilege('anon',
    'public.consume_rate_limit(text,integer,integer)', 'execute'),
  'anon cannot execute it -- the limiter is not a client-callable counter'
);
select ok(
  not has_function_privilege('authenticated',
    'public.consume_rate_limit(text,integer,integer)', 'execute'),
  'authenticated cannot execute it either: a caller passing an arbitrary bucket could exhaust somebody else''s allowance'
);
select ok(
  has_function_privilege('service_role',
    'public.consume_rate_limit(text,integer,integer)', 'execute'),
  'service_role can execute it -- the server action''s only path in'
);

-- --------------------------------------------------------------- who reads it
select ok(not has_schema_privilege('anon', 'ratelimit', 'usage'),
  'anon has no USAGE on the ratelimit schema');
select ok(not has_schema_privilege('authenticated', 'ratelimit', 'usage'),
  'authenticated has no USAGE on the ratelimit schema');
-- service_role bypasses RLS but not GRANTs (the 2026-08-29 constraint), and it
-- is deliberately given nothing here: the definer function is the whole API.
select ok(not has_table_privilege('service_role', 'ratelimit.counters', 'select'),
  'not even service_role can read the table directly');

-- ------------------------------------------------------------------ behaviour
-- The acceptance criterion, literally: five allowed, the sixth refused.
select is(
  (select bool_and(public.consume_rate_limit('probe:a', 5, 900))
     from generate_series(1, 5)),
  true,
  'the first five attempts in a window are allowed'
);
select is(public.consume_rate_limit('probe:a', 5, 900), false,
  'the sixth rapid attempt is refused');

select is(public.consume_rate_limit('probe:b', 5, 900), true,
  'a different bucket has its own allowance -- one address being limited does not lock out another');

-- A refused attempt still counts, but must not push window_start forward, or a
-- caller hammering the endpoint would extend their own lockout indefinitely --
-- a sliding penalty nobody specified. Compared against the value observed
-- before the extra refusals, not against itself.
create temporary table probe_window as
  select window_start from ratelimit.counters where bucket = 'probe:a';
do $$ begin
  perform public.consume_rate_limit('probe:a', 5, 900);
  perform public.consume_rate_limit('probe:a', 5, 900);
end $$;
select is(
  (select window_start from ratelimit.counters where bucket = 'probe:a'),
  (select window_start from probe_window),
  'two further refused attempts leave the window where it was'
);

-- Expiry, by back-dating the row rather than by sleeping.
update ratelimit.counters
   set window_start = clock_timestamp() - interval '16 minutes'
 where bucket = 'probe:a';
select is(public.consume_rate_limit('probe:a', 5, 900), true,
  'the allowance returns once the window has passed');

-- ------------------------------------------------------------ argument guards
-- Explicit ::text casts on every argument: throws_ok has overloads taking an
-- integer second argument, and untyped NULLs make the call ambiguous.
select throws_ok(
  $$ select public.consume_rate_limit('', 5, 900) $$,
  'P0001'::text, null::text,
  'an empty bucket is refused, not silently shared by every caller'
);
select throws_ok(
  $$ select public.consume_rate_limit('probe:c', 0, 900) $$,
  'P0001'::text, null::text,
  'a limit below 1 is refused rather than locking every caller out'
);
select throws_ok(
  $$ select public.consume_rate_limit('probe:c', 5, 0) $$,
  'P0001'::text, null::text,
  'a zero-length window is refused'
);

select * from finish();
rollback;
