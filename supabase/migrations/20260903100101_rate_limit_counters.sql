-- Reverse: drop function public.consume_rate_limit(text, integer, integer),
-- drop schema ratelimit cascade.

-- S2's acceptance criterion is "the sixth rapid auth attempt is refused".
-- GoTrue's own [auth.rate_limit] cannot satisfy it: sign_in_sign_ups is 30 per
-- five minutes, per IP only, and it never sees this app's own actions. So the
-- counter is ours, and it has to be shared -- server actions run on serverless
-- instances with no memory between requests, so an in-process counter would
-- reset on every cold start and count per-instance in between.
--
-- WHY THIS IS NOT IN `public`. Invariant 5 attaches audit_row_change() to every
-- table in `public` bar three named exemptions. This one takes a write per auth
-- attempt, so in `public` it would either write an audit row per attempt -- free
-- write amplification against an append-only table with no retention policy --
-- or need a fourth name on the exemption list, which is an invariant change.
-- Its own schema honours the invariant's intent without amending its text
-- (James's call, 2026-09-01), and being outside [api] schemas means PostgREST
-- cannot see it either. The one path in is the definer function below.
create schema ratelimit;

comment on schema ratelimit is
  'Infrastructure bookkeeping for the auth rate limiter. Not exposed through '
  'the Data API, not audited (invariant 5''s intent, see the migration that '
  'creates it), same class as idempotency_keys and webhook_events.';

-- A fixed window per bucket, not a sliding log: one row per bucket rather than
-- one per attempt, so a spray attack is not its own storage bill.
--
-- `bucket` is opaque and must stay that way -- lib/auth/rate-limit.ts (PR 2)
-- hashes the identifying half before it ever leaves the app, so neither this
-- table nor any statement log capturing the function's arguments holds an
-- address. A rate-limit table is not a place to accumulate a list of everyone
-- who has tried to sign in.
create table ratelimit.counters (
  bucket text primary key,
  window_start timestamptz not null default clock_timestamp(),
  attempts integer not null default 0
);

-- For pruning by age. Nothing prunes yet, deliberately and consistently with
-- docs/trib4l-docs/data-retention-policy.md on the other two bookkeeping tables ("pruned by
-- age if they ever become a storage concern"); the index is here so that job is
-- a one-liner rather than a full scan when somebody writes it.
create index counters_window_start_idx on ratelimit.counters (window_start);

-- A new schema grants no USAGE to PUBLIC anyway, but saying so is cheaper than
-- a reader having to know that.
revoke all on schema ratelimit from public;
revoke all on ratelimit.counters from public;

/**
 * Records one attempt against `p_bucket` and returns whether it is allowed.
 *
 * Atomic by construction: INSERT ... ON CONFLICT DO UPDATE takes a row lock, so
 * concurrent attempts serialise and neither reads a count it then overwrites. A
 * read-then-write limiter is exactly wrong under the load it exists to handle.
 *
 * clock_timestamp(), not now(): now() is transaction time, so every attempt in
 * one transaction would share a window_start -- the trap the 2026-08-29
 * audit_log lesson records.
 *
 * A refused attempt increments but does not move window_start. Moving it turns a
 * fixed window into an indefinitely extending lockout for anyone who keeps
 * retrying -- a policy nobody asked for, which punishes a legitimate user with a
 * stuck client hardest.
 *
 * Seconds, not an interval: the argument arrives as JSON over PostgREST, where
 * an integer needs no cast to be unambiguous.
 */
create function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_attempts integer;
begin
  -- Guards, not validation theatre. An empty bucket would be one allowance
  -- shared by every caller in the platform; a limit of 0 would refuse
  -- everyone, including a legitimate sign-in, and would look like an outage.
  if p_bucket is null or length(p_bucket) = 0 or length(p_bucket) > 200 then
    raise exception 'consume_rate_limit: bucket must be 1..200 characters';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'consume_rate_limit: limit must be between 1 and 10000';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'consume_rate_limit: window must be 1..86400 seconds';
  end if;

  insert into ratelimit.counters as c (bucket, window_start, attempts)
  values (p_bucket, clock_timestamp(), 1)
  on conflict (bucket) do update
     set attempts = case
           when c.window_start < clock_timestamp() - make_interval(secs => p_window_seconds)
             then 1
           else c.attempts + 1
         end,
         window_start = case
           when c.window_start < clock_timestamp() - make_interval(secs => p_window_seconds)
             then clock_timestamp()
           else c.window_start
         end
  returning c.attempts into v_attempts;

  return v_attempts <= p_limit;
end;
$$;

-- A function is EXECUTE-to-PUBLIC on creation, so this revoke is the whole
-- access control, not a belt-and-braces line. anon and authenticated
-- deliberately get nothing: the arguments include the bucket AND the limit, so
-- a client-callable version would let any visitor exhaust another person's
-- allowance, or grant themselves a limit of 10000.
revoke all on function public.consume_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
