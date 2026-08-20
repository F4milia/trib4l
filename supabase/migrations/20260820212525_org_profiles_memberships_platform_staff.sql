-- Reverse: drop table platform_staff, drop table memberships, drop type
-- membership_role, drop table org_profiles.

create table org_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (org_id, profile_id)
);

create trigger org_profiles_set_updated_at
  before update on org_profiles
  for each row execute function set_updated_at();

create index org_profiles_profile_id_idx on org_profiles (profile_id);

create type membership_role as enum ('member', 'mentor', 'organizer', 'org_owner');

-- One row per (org, user) — a user holds at most one role per org. Multi-org
-- membership is just multiple rows, one per org, per the plan's "one login,
-- many communities" decision.
create table memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  role membership_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (org_id, profile_id)
);

create trigger memberships_set_updated_at
  before update on memberships
  for each row execute function set_updated_at();

create index memberships_profile_id_idx on memberships (profile_id);

-- Deliberately NOT a role inside memberships: platform_admin exists above
-- the tenant model entirely, so it can't be reached by escalating an org
-- role and doesn't need special-casing in every org-scoped RLS policy.
create table platform_staff (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
