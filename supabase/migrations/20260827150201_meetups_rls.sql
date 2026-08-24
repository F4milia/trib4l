-- Reverse: drop function generate_meetup_occurrences, drop function
-- local_datetime_to_utc; drop policies + revoke grants + disable RLS on
-- meetup_attendance, meetup_rsvps, meetups, meetup_series (in that
-- order).

-- ===== meetup_series =====

alter table meetup_series enable row level security;
grant select, insert, update on meetup_series to authenticated;

-- Same visibility as posts (Session 6's can_see_org_cohort_content,
-- reused directly): org-wide series are visible to every member, a
-- cohort-scoped series only to that cohort's members, staff and
-- platform_admin see everything. Meetups don't have Session 8's stage
-- gating -- not asked for here, and nothing about scheduling a call
-- needs it.
create policy meetup_series_select on meetup_series
  for select to authenticated
  using (can_see_org_cohort_content(org_id, cohort_id));

create policy meetup_series_insert on meetup_series
  for insert to authenticated
  with check (
    has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

create policy meetup_series_update on meetup_series
  for update to authenticated
  using (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin())
  with check (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin());

-- ===== meetups =====

alter table meetups enable row level security;
grant select, insert, update on meetups to authenticated;

create policy meetups_select on meetups
  for select to authenticated
  using (can_see_org_cohort_content(org_id, cohort_id));

-- One-off meetups are created directly through this policy; recurring
-- occurrences are created by generate_meetup_occurrences below, which
-- relies on this same policy rather than bypassing it.
create policy meetups_insert on meetups
  for insert to authenticated
  with check (
    has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

create policy meetups_update on meetups
  for update to authenticated
  using (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin())
  with check (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin());

-- ===== meetup_rsvps =====

alter table meetup_rsvps enable row level security;
grant select, insert, update, delete on meetup_rsvps to authenticated;

-- Own row, or staff (who need headcounts) -- not "see who else is
-- going," the same minimal-by-default shape as member_stages_select
-- (Session 8): what someone else RSVPed isn't something a peer needs to
-- browse, only staff running the meetup.
create policy meetup_rsvps_select on meetup_rsvps
  for select to authenticated
  using (
    profile_id = auth.uid()
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

-- You can only RSVP as yourself, and only to a meetup you can actually
-- see -- can_see_org_cohort_content re-checked here (not just inherited
-- from the meetup's own select policy) because RLS on one table never
-- implies anything about another.
create policy meetup_rsvps_insert on meetup_rsvps
  for insert to authenticated
  with check (profile_id = auth.uid() and can_see_org_cohort_content(org_id, cohort_id));

create policy meetup_rsvps_update on meetup_rsvps
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy meetup_rsvps_delete on meetup_rsvps
  for delete to authenticated
  using (
    profile_id = auth.uid()
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

-- ===== meetup_attendance =====

alter table meetup_attendance enable row level security;
grant select, insert, delete on meetup_attendance to authenticated;

create policy meetup_attendance_select on meetup_attendance
  for select to authenticated
  using (
    profile_id = auth.uid()
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

-- Only staff mark attendance, and only attributed to themselves as the
-- marker -- self-attribution matches audit_log/stage_transitions'
-- convention.
create policy meetup_attendance_insert on meetup_attendance
  for insert to authenticated
  with check (
    marked_by_profile_id = auth.uid()
    and (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin())
  );

create policy meetup_attendance_delete on meetup_attendance
  for delete to authenticated
  using (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin());

-- Pure computation, no table access, safe for any authenticated caller:
-- interprets a local (date, time) pair as wall-clock time in the given
-- IANA zone and returns the correct UTC instant, letting Postgres's own
-- timezone database (not application code) own DST correctness. Used
-- both by generate_meetup_occurrences below and by the one-off
-- meetup-creation server action.
create or replace function local_datetime_to_utc(local_date date, local_time time, tz text)
returns timestamptz
language sql
stable
as $$
  select (local_date + local_time) at time zone tz;
$$;

grant execute on function local_datetime_to_utc(date, time, text) to authenticated;

-- Generates the next occurrence_count occurrences from a series and
-- advances next_occurrence_date past them, atomically. Not SECURITY
-- DEFINER: the SELECT on meetup_series, the INSERTs into meetups, and
-- the UPDATE advancing the pointer all run under the caller's own
-- already-permitted RLS -- this function buys one round trip and a
-- shared transaction, not extra privilege. Capped at 52 (a year of
-- weekly occurrences) as a sanity bound, not a silent truncation of
-- anything the caller asked for -- nothing in this UI ever asks for more
-- than a handful at a time.
create or replace function generate_meetup_occurrences(target_series_id uuid, occurrence_count integer default 4)
returns setof meetups
language plpgsql
as $$
declare
  series meetup_series;
  next_date date;
  computed_start timestamptz;
  computed_end timestamptz;
  new_row meetups;
  i integer;
begin
  if occurrence_count <= 0 or occurrence_count > 52 then
    raise exception 'occurrence_count must be between 1 and 52';
  end if;

  select * into series from meetup_series where id = target_series_id and deleted_at is null;
  if series is null then
    raise exception 'Meetup series not found or not permitted';
  end if;

  next_date := series.next_occurrence_date;

  for i in 1..occurrence_count loop
    computed_start := local_datetime_to_utc(next_date, series.local_time, series.timezone);
    computed_end := case
      when series.duration_minutes is null then null
      else computed_start + (series.duration_minutes || ' minutes')::interval
    end;

    insert into meetups (
      org_id, cohort_id, series_id, title, description,
      meeting_provider, meeting_url, starts_at, ends_at, created_by_profile_id
    )
    values (
      series.org_id, series.cohort_id, series.id, series.title, series.description,
      series.meeting_provider, series.meeting_url, computed_start, computed_end, auth.uid()
    )
    returning * into new_row;

    return next new_row;

    next_date := next_date + (series.interval_weeks * 7);
  end loop;

  update meetup_series set next_occurrence_date = next_date where id = target_series_id;
end;
$$;

grant execute on function generate_meetup_occurrences(uuid, integer) to authenticated;
