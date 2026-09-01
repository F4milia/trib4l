-- sandbox-bootstrap-storage.sql -- what the Storage container would have done,
-- for schema-sandbox.sh.
--
-- NOT A MIGRATION. Never applied to a real database. `supabase db reset` does not run
-- this and must not: on a real stack the Storage service owns the `storage`
-- schema and applies its own migrations at container start.
--
-- WHY IT EXISTS. The bare `supabase/postgres` image has no `storage` schema, so
-- C2's migration 20260903101701 -- which creates a bucket and puts RLS policies
-- on storage.objects -- aborts the whole sandbox run with `relation
-- "storage.buckets" does not exist`. Third instance of the same gap, after auth
-- and realtime: the sandbox is a bare Postgres, and every Supabase service that
-- owns a schema is missing from it.
--
-- Read off the running local stack (`supabase_db_Trib4l`) with
-- information_schema and pg_get_expr, not written from memory. path_tokens in
-- particular is a STORED GENERATED column, and a migration that filters on it
-- behaves differently against a plain column -- so getting that detail wrong
-- would make the sandbox go green on a shape production does not have.
--
-- WHAT THIS DOES NOT GIVE YOU. There is no Storage service, so nothing ever
-- writes an object and `metadata->>'size'` is never populated. The quota
-- functions can be proven to EXIST and to return the right shape here; whether
-- they add up correctly over real uploads needs the isolation suite against the
-- real stack.

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner_id text,
  type text default 'STANDARD'
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  -- STORED GENERATED, exactly as the real service defines it. A migration that
  -- filters on path_tokens[1] depends on this.
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  owner_id text,
  user_metadata jsonb
);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

grant usage on schema storage to postgres, anon, authenticated, service_role;
grant select, insert, update, delete on storage.buckets
  to postgres, anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects
  to postgres, anon, authenticated, service_role;
