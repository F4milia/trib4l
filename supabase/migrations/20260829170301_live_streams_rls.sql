-- Reverse: drop policies + revoke grants + disable RLS on
-- live_stream_credentials, live_streams (in that order); drop trigger
-- live_streams_privileged_columns_guard, drop function
-- check_live_stream_privileged_columns.

-- service_role bypasses RLS (rolbypassrls), but that's a separate layer
-- from ordinary GRANT privileges -- it still needs a real grant to read
-- a table at all. stages/cohorts predate service_role's existence in
-- this codebase (Session 8/5, before Session 11 introduced service_role
-- at all) and were never granted to it. The service-role webhook path
-- needs SELECT on both because the validating triggers below
-- (live_streams_stage_matches_org, live_streams_cohort_matches_org) run
-- under the CALLING role, not the trigger owner, and query those tables
-- to check org-matching on every insert/update this session's webhook
-- handler performs -- including the video_assets/live_streams linking
-- steps that set required_stage_id/cohort_id from a webhook, not just
-- from an authenticated user's own session.
grant select on stages to service_role;
grant select on cohorts to service_role;

alter table live_streams enable row level security;
grant select, insert, update on live_streams to authenticated;
grant select, insert, update on live_streams to service_role;

-- can_see_gated_content (Session 8) reused directly, unchanged -- the
-- other half of "entitlement resolution shares one code path with
-- Session 11": video_assets' can_see_video_asset (this session's
-- migration 20260829170101) layers moderation_state and uploader
-- self-visibility on top of the exact same org/cohort/stage primitives
-- this function already uses, because live streams (staff-created, no
-- member-moderation concept) don't need either of those extra layers.
create policy live_streams_select on live_streams
  for select to authenticated
  using (can_see_gated_content(org_id, cohort_id, required_stage_id));

create policy live_streams_insert on live_streams
  for insert to authenticated
  with check (
    created_by_profile_id = auth.uid()
    and (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin())
  );

create policy live_streams_update on live_streams
  for update to authenticated
  using (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin())
  with check (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin());

-- Same reasoning as video_assets' privileged-columns guard, and for the
-- same reason it matters more here: mux_live_stream_id/playback_id are
-- Mux-verified facts, not something even this row's own creator gets to
-- assert directly. Without this, an organizer could insert (or update)
-- a live stream in their own org carrying a playback_id copied from
-- somewhere else entirely, and every eligible member of their org would
-- receive a validly signed token for content that org never owned. The
-- create-live-stream flow instead: insert with these left at their
-- defaults (authenticated, ordinary staff action), then a second
-- service-role call attaches the real Mux-returned id/playback_id --
-- relaying a fact Mux already asserted, not a user decision, the same
-- category of write as the webhook path.
create or replace function check_live_stream_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if (auth.jwt() ->> 'role') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.mux_live_stream_id is not null
      or new.playback_id is not null
      or new.status is distinct from 'idle'
      or new.video_asset_id is not null
    then
      raise exception 'mux_live_stream_id, playback_id, status, and video_asset_id cannot be set directly on insert';
    end if;
    return new;
  end if;

  if new.org_id is distinct from old.org_id
    or new.cohort_id is distinct from old.cohort_id
    or new.required_stage_id is distinct from old.required_stage_id
    or new.created_by_profile_id is distinct from old.created_by_profile_id
    or new.mux_live_stream_id is distinct from old.mux_live_stream_id
    or new.playback_id is distinct from old.playback_id
    or new.status is distinct from old.status
    or new.video_asset_id is distinct from old.video_asset_id
  then
    raise exception 'Only title and description may be changed through this path';
  end if;

  return new;
end;
$$;

create trigger live_streams_privileged_columns_guard
  before insert or update on live_streams
  for each row execute function check_live_stream_privileged_columns();

-- ===== live_stream_credentials =====

alter table live_stream_credentials enable row level security;
grant select on live_stream_credentials to authenticated;
grant select, insert on live_stream_credentials to service_role;

-- Only the creator or staff -- the RTMP ingest credential is exactly
-- the kind of thing the plan's own general reasoning about blocking
-- (Session 7: RLS protects "is this row visible at all", a security
-- boundary) applies to most literally in this whole app: nobody else
-- has any legitimate reason to see it, ever.
create policy live_stream_credentials_select on live_stream_credentials
  for select to authenticated
  using (
    created_by_profile_id = auth.uid()
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

-- No authenticated insert policy at all: the stream key is Mux-issued,
-- relayed by the service-role step of the create-live-stream flow,
-- exactly like live_streams' own privileged columns -- there's no
-- legitimate reason for a user's own session to ever write this table.
