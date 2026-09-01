-- sandbox-bootstrap.sql -- what GoTrue would have done, for schema-sandbox.sh.
--
-- NOT A MIGRATION. Never applied to a real database. `supabase db reset` does
-- not run this and must not: on a real stack GoTrue owns the auth schema and
-- applies its own migrations at container start.
--
-- The `supabase/postgres` image ships the auth schema as it stood BEFORE
-- GoTrue's migrations run -- so a bare container has auth.uid(), auth.role()
-- and auth.email() but not auth.jwt(), and its auth.users is the old narrow
-- shape. Both gaps are invisible until a migration or the seed touches them,
-- and then they present as a bug in the thing being tested rather than as a
-- missing fixture: `function auth.jwt() does not exist` fires from
-- is_platform_admin(), which is an app function that is perfectly correct.
--
-- Everything below was read off the running local stack
-- (`supabase_db_Trib4l`, image 17.6.1.159) with pg_get_functiondef and
-- information_schema, not written from memory. If the CLI's pinned image or
-- GoTrue version changes, re-read it rather than adjusting by hand -- a
-- sandbox that has drifted from the real auth schema is worse than no sandbox,
-- because it goes green on a shape production does not have.

-- ------------------------------------------------- auth.jwt / uid / role / email
-- All four verbatim from the local stack, and ALL FOUR ARE REQUIRED even
-- though the image already ships three of them.
--
-- auth.jwt() is simply absent, and without it every migration from
-- 20260821131845 onward fails outright: is_platform_admin() reads the `aal`
-- claim through it, which is how 2FA enforcement (invariant 7) is expressed in
-- policy. That failure is loud.
--
-- THE OTHER THREE ARE THE DANGEROUS ONES, because the image ships a STALE
-- definition and nothing errors. The image's version reads only the
-- per-claim GUC:
--
--   select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
--
-- GoTrue's migrations replace it with a coalesce over BOTH that GUC and the
-- `request.jwt.claims` JSON. Every pgTAP test in this repo authenticates with
-- `set_config('request.jwt.claims', json_build_object('sub', ...))` -- the
-- JSON form -- so under the image's definition auth.uid() returns NULL for
-- every test, silently. Measured: 26 assertions across three files failed
-- with diagnostics like `is_platform_staff() = false` for a profile that IS in
-- platform_staff, which reads as a bug in the app function rather than in the
-- fixture. Overwrite them.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    )::text
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim.email', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
    )::text
$$;

-- -------------------------------------------------------------- auth.users
-- The columns GoTrue's migrations add. The seed writes email_confirmed_at and
-- six of the empty-string token fields (see the note in supabase/seed.sql
-- about GoTrue's Go driver refusing to scan NULL into a string), so a sandbox
-- without these cannot even seed.
alter table auth.users
  add column if not exists email_confirmed_at timestamptz,
  add column if not exists phone text default null,
  add column if not exists phone_confirmed_at timestamptz,
  add column if not exists phone_change text default '',
  add column if not exists phone_change_token varchar default '',
  add column if not exists phone_change_sent_at timestamptz,
  add column if not exists email_change_token_new varchar,
  add column if not exists email_change_token_current varchar default '',
  add column if not exists email_change_confirm_status smallint default 0,
  add column if not exists banned_until timestamptz,
  add column if not exists reauthentication_token varchar default '',
  add column if not exists reauthentication_sent_at timestamptz,
  add column if not exists is_sso_user boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists is_anonymous boolean not null default false;

-- confirmed_at exists in the image as a plain writable column; GoTrue replaces
-- it with a generated one. Kept faithful because a test that writes to it
-- would pass here and fail on a real stack.
alter table auth.users drop column if exists confirmed_at;
alter table auth.users
  add column confirmed_at timestamptz
  generated always as (least(email_confirmed_at, phone_confirmed_at)) stored;

-- ------------------------------------------------------------ auth.sessions
-- Read and deleted by S2's session functions (20260903100201): the active
-- sessions list and sign-out-everywhere. GoTrue creates this table; the bare
-- image does not, so without it that migration fails on `relation
-- "auth.sessions" does not exist` and nothing after it applies either.
--
-- Column set copied from the real stack. `auth.refresh_tokens` and
-- `auth.mfa_amr_claims` are named only in that migration's COMMENTS, never in
-- its SQL, so they are deliberately not reproduced here.
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'auth' and t.typname = 'aal_level'
  ) then
    create type auth.aal_level as enum ('aal1', 'aal2', 'aal3');
  end if;
end
$$;

create table if not exists auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz,
  updated_at timestamptz,
  factor_id uuid,
  aal auth.aal_level,
  not_after timestamptz,
  refreshed_at timestamp,
  user_agent text,
  ip inet,
  tag text,
  -- No FK: the real table references auth.oauth_clients, which GoTrue also
  -- creates and nothing in this repo touches. Reproducing the column keeps an
  -- INSERT that names it working; reproducing the FK would mean reproducing a
  -- second table for no reader.
  oauth_client_id uuid,
  refresh_token_hmac_key text,
  refresh_token_counter bigint,
  scopes text constraint sessions_scopes_length check (char_length(scopes) <= 4096)
);

create index if not exists sessions_user_id_idx on auth.sessions (user_id);
create index if not exists user_id_created_at_idx on auth.sessions (user_id, created_at);

-- --------------------------------------------------------- auth.mfa_factors
-- The seed writes verified TOTP factors for the QA staff fixtures, because
-- invariant 7 enforces two-factor for platform_staff at sign-in and a staff
-- account without a factor cannot reach a single staff route.
--
-- Added after the sandbox refused the seed with `relation "auth.mfa_factors"
-- does not exist` -- which is the sandbox doing its job: the bare image ships
-- the pre-GoTrue auth schema, and every table the repo touches has to be
-- named here explicitly rather than assumed.
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'auth' and t.typname = 'factor_type') then
    create type auth.factor_type as enum ('totp', 'webauthn', 'phone');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'auth' and t.typname = 'factor_status') then
    create type auth.factor_status as enum ('unverified', 'verified');
  end if;
end
$$;

create table if not exists auth.mfa_factors (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  friendly_name text,
  factor_type auth.factor_type not null,
  status auth.factor_status not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  secret text,
  phone text,
  last_challenged_at timestamptz,
  web_authn_credential jsonb,
  web_authn_aaguid uuid,
  last_webauthn_challenge_data jsonb
);

create index if not exists mfa_factors_user_id_idx on auth.mfa_factors (user_id);
