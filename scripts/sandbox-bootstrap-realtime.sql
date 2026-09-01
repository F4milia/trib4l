-- sandbox-bootstrap-realtime.sql -- what the Realtime container would have
-- done, for schema-sandbox.sh.
--
-- NOT A MIGRATION. Never applied to a real database. `supabase db reset` does not run
-- this and must not: on a real stack the Realtime service owns the `realtime`
-- schema and applies its own migrations at container start.
--
-- WHY IT EXISTS. The bare `supabase/postgres` image has no `realtime` schema at
-- all, so C2's migration 20260903101501 -- which puts RLS policies on
-- realtime.messages -- aborts the whole sandbox run with `relation
-- "realtime.messages" does not exist`. That breaks the one escape hatch a
-- schema session has from the shared stack, for every session after it, and
-- the error names a Supabase-internal table rather than anything the migration
-- appears to be about.
--
-- Same shape of gap as sandbox-bootstrap-auth.sql, and the same rule applies:
-- everything below was read off the running local stack (`supabase_db_Trib4l`)
-- with information_schema and pg_get_functiondef, not written from memory. A
-- sandbox that has drifted from the real schema is worse than no sandbox,
-- because it goes green on a shape production does not have.
--
-- WHAT THIS DOES NOT GIVE YOU. There is no Realtime service here, so nothing
-- ever sets `realtime.topic` and no channel is ever joined. A pgTAP assertion
-- here can prove a policy EXISTS and is well-formed; it cannot prove the policy
-- admits the right subscribers. That claim needs
-- tests/isolation/conversations-broadcast-authorization.test.ts against the
-- real stack, which is where it lives.

create schema if not exists realtime;

-- Read off the live stack, column for column and in order.
create table if not exists realtime.messages (
  topic text not null,
  extension text not null,
  payload jsonb,
  event text,
  private boolean default false,
  updated_at timestamp without time zone not null default now(),
  inserted_at timestamp without time zone not null default now(),
  id uuid not null default gen_random_uuid(),
  binary_payload bytea
);

-- RLS is enabled by the real Realtime service, not by any migration in this
-- repo. Enabling it here matters: with RLS on and no policies a private channel
-- admits nobody -- which is exactly why C2's client flag and its policies have
-- to land as one change, and the sandbox should reflect that.
alter table realtime.messages enable row level security;

-- The topic of the channel currently being authorized. Returns null outside a
-- join, which is the whole reason a policy here cannot be exercised in the
-- sandbox.
create or replace function realtime.topic()
returns text
language sql
stable
as $$
  select nullif(current_setting('realtime.topic', true), '')::text;
$$;

grant usage on schema realtime to postgres, anon, authenticated, service_role;
grant select, insert, update on realtime.messages
  to postgres, anon, authenticated, service_role;
grant execute on function realtime.topic() to postgres, anon, authenticated, service_role;
