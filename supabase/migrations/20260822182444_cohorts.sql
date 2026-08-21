-- Reverse: drop trigger cohort_members_org_id_matches, drop function
-- check_cohort_member_org_matches, drop table cohort_members, drop table
-- cohorts.

create table cohorts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger cohorts_set_updated_at
  before update on cohorts
  for each row execute function set_updated_at();

create unique index cohorts_org_id_name_idx on cohorts (org_id, name) where deleted_at is null;

-- A member belongs to at most one cohort per org at a time (decided with
-- the user rather than assumed -- the alternative, multiple concurrent
-- cohorts per person, would need every downstream "what can this member
-- see" query to union across cohorts instead of doing one lookup).
-- Historical assignments are kept (soft-deleted, not overwritten), so
-- carries its own org_id and profile_id rather than just cohort_id -- also
-- required by the "every tenant table carries org_id" rule from Session 1.
create table cohort_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  cohort_id uuid not null references cohorts (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Enforces "one active cohort per org per person" at the database level,
-- not just in application code. Partial (deleted_at is null) so history
-- isn't blocked -- moving someone between cohorts soft-deletes the old row
-- and inserts a new one, and both can coexist once the old one is deleted.
create unique index cohort_members_one_active_per_org_idx
  on cohort_members (org_id, profile_id)
  where deleted_at is null;

create index cohort_members_cohort_id_idx on cohort_members (cohort_id);

-- Guards against a caller (or a future bug) inserting a cohort_members row
-- whose org_id doesn't match the org_id of the cohort it points to --
-- cohort_id -> cohorts.org_id is a foreign-key hop away, so a plain CHECK
-- constraint can't express this; a trigger can.
create or replace function check_cohort_member_org_matches()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from cohorts where id = new.cohort_id and org_id = new.org_id
  ) then
    raise exception 'cohort_members.org_id must match the referenced cohort''s org_id';
  end if;
  return new;
end;
$$;

create trigger cohort_members_org_id_matches
  before insert or update on cohort_members
  for each row execute function check_cohort_member_org_matches();
