-- Reverse: drop trigger mentor_pairings_roles_match_org, drop function
-- check_mentor_pairing_roles_match_org, drop table mentor_pairings, drop
-- type mentor_pairing_status.

-- 'mentor' has been a membership_role since the original Session 1 schema
-- (see 20260820212525_org_profiles_memberships_platform_staff.sql) but
-- nothing has given it meaning until now -- it's never been checked by any
-- has_org_role call anywhere, so it has behaved exactly like 'member' for
-- access control. This migration is what makes being a mentor do something.
create type mentor_pairing_status as enum ('proposed', 'active', 'completed', 'declined');

-- mentor_profile_id/mentee_profile_id/proposed_by_profile_id are nullable
-- with on-delete-set-null, unlike member_stages' not-null,
-- on-delete-cascade profile_id -- this table IS the historical record of
-- a mentorship, which the data-retention policy calls out by name ("a
-- completed pairing belongs to the mentorship program's track record ...
-- survives either party's deletion request"), so it follows
-- stage_transitions' convention for history rows, not member_stages'
-- convention for current-state rows.
create table mentor_pairings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  mentor_profile_id uuid references profiles (id) on delete set null,
  mentee_profile_id uuid references profiles (id) on delete set null,
  status mentor_pairing_status not null default 'proposed',
  proposed_by_profile_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz,
  check (mentor_profile_id is distinct from mentee_profile_id)
);

-- At most one live (proposed or active) pairing per mentee per org -- the
-- same "one active row per org per person" shape as cohort_members and
-- member_stages, extended to also cover "proposed" so an organizer can't
-- leave a mentee's fate ambiguous between two simultaneous candidates.
-- Nothing constrains the mentor side -- one mentor can have many mentees.
create unique index mentor_pairings_one_live_per_mentee_idx
  on mentor_pairings (org_id, mentee_profile_id)
  where status in ('proposed', 'active');

create index mentor_pairings_org_id_status_idx on mentor_pairings (org_id, status);

create or replace function check_mentor_pairing_roles_match_org()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from memberships
    where org_id = new.org_id
      and profile_id = new.mentor_profile_id
      and role = 'mentor'
      and deleted_at is null
  ) then
    raise exception 'mentor_profile_id must be an active mentor in the same org';
  end if;

  if not exists (
    select 1 from memberships
    where org_id = new.org_id
      and profile_id = new.mentee_profile_id
      and deleted_at is null
  ) then
    raise exception 'mentee_profile_id must be an active member of the same org';
  end if;

  return new;
end;
$$;

create trigger mentor_pairings_roles_match_org
  before insert on mentor_pairings
  for each row execute function check_mentor_pairing_roles_match_org();
