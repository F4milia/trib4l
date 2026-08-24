-- Reverse: drop trigger meetup_attendance_set_org_and_cohort, drop
-- trigger meetup_rsvps_set_org_and_cohort, drop function
-- set_meetup_rsvp_org_and_cohort; drop trigger
-- meetup_series_cohort_matches_org, drop trigger
-- meetups_cohort_matches_org, drop function
-- check_meetup_cohort_matches_org; drop table meetup_attendance, drop
-- table meetup_rsvps, drop table meetups, drop table meetup_series, drop
-- type meetup_rsvp_status.

-- A series is the recurrence template (cadence, timezone, meeting info);
-- a row in `meetups` below is one concrete, bookable occurrence.
-- RSVPs/attendance attach to a specific occurrence, which needs a stable
-- id -- a computed-on-the-fly occurrence wouldn't have one -- so
-- occurrences are real rows, generated explicitly (see
-- generate_meetup_occurrences in the next migration), not a view over
-- the series.
--
-- next_occurrence_date is the local calendar date of the next occurrence
-- still to be generated. Recurrence is expressed as "same local date,
-- N weeks later," then converted to a UTC instant per-occurrence via
-- Postgres's own IANA timezone data (`AT TIME ZONE` in the next
-- migration's generation function) -- this is what makes recurrence
-- correct across a DST transition. A fixed UTC interval would drift the
-- wall-clock time by an hour whenever a transition falls between two
-- occurrences; this doesn't, because each occurrence's local time is
-- reinterpreted in the zone fresh, on its own date.
create table meetup_series (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  cohort_id uuid references cohorts (id) on delete cascade,
  title text not null,
  description text,
  -- Free text, deliberately not an enum or a check-constrained set: the
  -- plan calls this out by name ("provider = 'livekit' is a swap, not a
  -- migration") -- an enum or a CHECK list would need exactly the
  -- migration that decision is meant to avoid.
  meeting_provider text not null,
  meeting_url text,
  timezone text not null check (is_valid_iana_timezone(timezone)),
  local_time time not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  interval_weeks integer not null default 1 check (interval_weeks > 0),
  next_occurrence_date date not null,
  created_by_profile_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger meetup_series_set_updated_at
  before update on meetup_series
  for each row execute function set_updated_at();

-- series_id is on-delete-set-null, not cascade: past occurrences are
-- independent historical events (people RSVPed, attendance was marked)
-- that outlive the recurring template they came from.
create table meetups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  cohort_id uuid references cohorts (id) on delete cascade,
  series_id uuid references meetup_series (id) on delete set null,
  title text not null,
  description text,
  meeting_provider text not null,
  meeting_url text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by_profile_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger meetups_set_updated_at
  before update on meetups
  for each row execute function set_updated_at();

create index meetups_org_id_starts_at_idx on meetups (org_id, starts_at);
create index meetups_series_id_idx on meetups (series_id);

-- Shared by both tables: cohort_id, if set, must belong to the same org
-- as org_id -- the same invariant Session 6 enforces for posts
-- (check_post_cohort_matches_org), reused here rather than duplicated
-- per-table since the check only ever looks at NEW.org_id/NEW.cohort_id.
create or replace function check_meetup_cohort_matches_org()
returns trigger
language plpgsql
as $$
begin
  if new.cohort_id is not null and not exists (
    select 1 from cohorts where id = new.cohort_id and org_id = new.org_id
  ) then
    raise exception 'cohort_id must belong to the same org as org_id';
  end if;
  return new;
end;
$$;

create trigger meetups_cohort_matches_org
  before insert or update on meetups
  for each row execute function check_meetup_cohort_matches_org();

create trigger meetup_series_cohort_matches_org
  before insert or update on meetup_series
  for each row execute function check_meetup_cohort_matches_org();

create type meetup_rsvp_status as enum ('going', 'maybe', 'not_going');

-- Not append-only, unlike stage_transitions/mentor_pairings -- an RSVP is
-- a live preference, not a historical record the plan calls out by name;
-- someone can change their mind right up to the meetup and there's no
-- requirement to keep every intermediate answer.
create table meetup_rsvps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  cohort_id uuid references cohorts (id) on delete cascade,
  meetup_id uuid not null references meetups (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  status meetup_rsvp_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meetup_id, profile_id)
);

create trigger meetup_rsvps_set_updated_at
  before update on meetup_rsvps
  for each row execute function set_updated_at();

-- Attendance is the plan's "first-class record an organizer can mark
-- manually, so the metric survives regardless of where the call
-- happens" -- deliberately independent of meeting_provider and of any
-- future video-platform integration (Session 11+). No deleted_at: an
-- organizer un-marking a mistaken attendance entry just deletes the row,
-- since "currently known attendees" is what this table represents, not
-- an append-only log like stage_transitions.
create table meetup_attendance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  cohort_id uuid references cohorts (id) on delete cascade,
  meetup_id uuid not null references meetups (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  marked_by_profile_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (meetup_id, profile_id)
);

-- org_id/cohort_id are trigger-derived from the referenced meetup on both
-- rsvps and attendance, same reason Session 6 derives them for
-- comments/reactions from their post: the client should never be able to
-- submit an RSVP or attendance mark whose org/cohort disagrees with the
-- meetup it's actually for.
create or replace function set_meetup_child_org_and_cohort()
returns trigger
language plpgsql
as $$
begin
  select org_id, cohort_id into new.org_id, new.cohort_id
  from meetups where id = new.meetup_id;

  if new.org_id is null then
    raise exception 'Referenced meetup not found';
  end if;

  return new;
end;
$$;

create trigger meetup_rsvps_set_org_and_cohort
  before insert on meetup_rsvps
  for each row execute function set_meetup_child_org_and_cohort();

create trigger meetup_attendance_set_org_and_cohort
  before insert on meetup_attendance
  for each row execute function set_meetup_child_org_and_cohort();
