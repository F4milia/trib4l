-- Reverse: drop trigger member_stages_org_id_matches, drop function
-- check_member_stage_org_matches, drop table stage_transitions, drop
-- table member_stages, drop table stages.

-- Distinct from cohorts (Session 5): a cohort is a point-in-time grouping
-- (which batch you're in); a stage is a position in an ordered
-- progression (how far along you are). sort_order is what makes "content
-- gating" in the next migration meaningful -- gating means "reached at
-- least this far," which only makes sense because stages are ordered,
-- unlike cohorts.
create table stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger stages_set_updated_at
  before update on stages
  for each row execute function set_updated_at();

create unique index stages_org_id_name_idx on stages (org_id, name) where deleted_at is null;
create unique index stages_org_id_sort_order_idx on stages (org_id, sort_order) where deleted_at is null;

-- Same "one active row per org per person" shape as Session 5's
-- cohort_members, for the same reason: a member is at exactly one stage
-- in a given org's progression at a time. History survives as
-- soft-deleted rows here, but the real progression record is
-- stage_transitions below -- "transitions are logged" is a first-class
-- requirement in the plan, not something to leave implicit in which rows
-- got soft-deleted when.
create table member_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  stage_id uuid not null references stages (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index member_stages_one_active_per_org_idx
  on member_stages (org_id, profile_id)
  where deleted_at is null;

create or replace function check_member_stage_org_matches()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from stages where id = new.stage_id and org_id = new.org_id
  ) then
    raise exception 'member_stages.org_id must match the referenced stage''s org_id';
  end if;
  return new;
end;
$$;

create trigger member_stages_org_id_matches
  before insert or update on member_stages
  for each row execute function check_member_stage_org_matches();

-- Append-only, like audit_log -- a transition, once logged, is never
-- edited. from_stage_id is null for a first assignment (nothing to
-- transition from). "The log feeds the HQ and org dashboards" (the plan's
-- words) is exactly why this needs to be its own durable table rather
-- than reconstructed later from member_stages' soft-delete history.
create table stage_transitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete set null,
  from_stage_id uuid references stages (id) on delete set null,
  to_stage_id uuid not null references stages (id) on delete cascade,
  transitioned_by_profile_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index stage_transitions_org_id_profile_id_idx on stage_transitions (org_id, profile_id, created_at);
