-- Reverse: drop trigger live_stream_credentials_set_org_and_creator,
-- drop function set_live_stream_credentials_org_and_creator; drop
-- trigger live_streams_stage_matches_org, drop function
-- check_live_stream_stage_matches_org, drop trigger
-- live_streams_cohort_matches_org, drop table live_stream_credentials,
-- drop table live_streams.

-- One row per broadcast event, single-use (not re-armed for a second
-- broadcast) -- Mux itself supports reusing one live stream across many
-- RTMP sessions (`recent_asset_ids` tracks that history), but nothing in
-- this app's scope asks for that, and single-use keeps `video_asset_id`
-- a plain nullable FK instead of a list.
--
-- mux_live_stream_id/playback_id/status/video_asset_id are Mux-verified
-- facts, not something even this row's own creator gets to assert
-- directly -- see the RLS migration's column guard for why this matters
-- more here than it might look: without it, a broadcaster could insert
-- a live stream in their own org that "coincidentally" carries another
-- org's real playback_id, and every member of their org would receive a
-- validly signed token for content that was never that org's to show.
create table live_streams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  cohort_id uuid references cohorts (id) on delete cascade,
  required_stage_id uuid references stages (id),
  title text not null,
  description text,
  created_by_profile_id uuid references profiles (id) on delete set null,
  mux_live_stream_id text unique,
  playback_id text unique,
  status text not null default 'idle' check (status in ('idle', 'active', 'disabled')),
  video_asset_id uuid references video_assets (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger live_streams_set_updated_at
  before update on live_streams
  for each row execute function set_updated_at();

create index live_streams_org_id_idx on live_streams (org_id);

-- check_meetup_cohort_matches_org (Session 10) is reused directly, not
-- reimplemented -- its body only ever looks at NEW.org_id/NEW.cohort_id
-- and its error message is already table-neutral, so it applies
-- unchanged here. The equivalent stage check exists per-table already
-- (check_post_stage_matches_org, Session 8) but its error message names
-- "posts" specifically, which would be actively misleading raised
-- against live_streams -- worth a few duplicate lines for an accurate
-- message rather than reusing a function whose text lies about which
-- table failed.
create trigger live_streams_cohort_matches_org
  before insert or update on live_streams
  for each row execute function check_meetup_cohort_matches_org();

create or replace function check_live_stream_stage_matches_org()
returns trigger
language plpgsql
as $$
begin
  if new.required_stage_id is not null and not exists (
    select 1 from stages where id = new.required_stage_id and org_id = new.org_id
  ) then
    raise exception 'required_stage_id must belong to the same org as org_id';
  end if;
  return new;
end;
$$;

create trigger live_streams_stage_matches_org
  before insert or update on live_streams
  for each row execute function check_live_stream_stage_matches_org();

-- Split into its own table, not a column on live_streams: a stream key
-- is a broadcasting credential ("anyone with this stream key can begin
-- streaming" -- Mux's own words), and RLS protects rows, not columns.
-- live_streams itself needs broad read access (any entitled member sees
-- title/status/playback_id to watch), which would have made the key
-- readable by every viewer too if it lived on the same row. org_id/
-- created_by_profile_id are trigger-copied from the parent, the same
-- shape as meetup_rsvps/meetup_attendance copying from their meetup.
create table live_stream_credentials (
  id uuid primary key default gen_random_uuid(),
  live_stream_id uuid not null unique references live_streams (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  created_by_profile_id uuid references profiles (id) on delete set null,
  stream_key text not null,
  created_at timestamptz not null default now()
);

create or replace function set_live_stream_credentials_org_and_creator()
returns trigger
language plpgsql
as $$
begin
  select org_id, created_by_profile_id into new.org_id, new.created_by_profile_id
  from live_streams where id = new.live_stream_id;

  if new.org_id is null then
    raise exception 'Referenced live stream not found';
  end if;

  return new;
end;
$$;

create trigger live_stream_credentials_set_org_and_creator
  before insert on live_stream_credentials
  for each row execute function set_live_stream_credentials_org_and_creator();
