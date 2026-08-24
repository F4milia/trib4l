-- Reverse: drop trigger posts_video_matches_org, drop function
-- check_post_video_matches_org, drop index posts_video_asset_id_idx,
-- drop column posts.video_asset_id, drop table video_assets.

-- One row per Mux Direct Upload, created (and org/cohort/uploader fixed)
-- the moment a member starts an upload -- before Mux has even ingested
-- anything. mux_asset_id/playback_id/duration_seconds arrive later, via
-- webhook, once Mux actually processes the file.
--
-- cohort_id/uploader_profile_id are set directly at upload time, not
-- trigger-derived from a post: uploading happens before a post exists to
-- derive from (a two-step flow -- upload, then optionally attach to a
-- post), unlike comments/reactions, which always have their parent post
-- already in hand.
--
-- policy/status are CHECK-constrained (not free text like meetups'
-- meeting_provider): both mirror a small, genuinely fixed set of values
-- Mux's own API defines, not something this app expects to extend later.
create table video_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  cohort_id uuid references cohorts (id) on delete cascade,
  uploader_profile_id uuid references profiles (id) on delete set null,
  mux_upload_id text unique,
  mux_asset_id text unique,
  playback_id text unique,
  policy text not null default 'signed' check (policy in ('public', 'signed')),
  -- 'waiting' is this app's own pre-Mux state (upload created, nothing
  -- ingested yet); 'preparing'/'ready'/'errored' mirror Mux's own Asset
  -- status values exactly, set by the webhook handler as those events
  -- arrive.
  status text not null default 'waiting' check (status in ('waiting', 'preparing', 'ready', 'errored')),
  -- Distinct from `status` (technical processing state, Mux-driven) --
  -- this is the human moderation decision. Defaults to 'pending' but the
  -- webhook handler sets it to 'approved' automatically the moment an
  -- asset becomes ready (post-report moderation, a deliberate decision:
  -- video is visible immediately like any other content, and organizers
  -- remove it after the fact via moderate_video_asset below, the same
  -- shape as Session 6's moderate_post) -- 'rejected' otherwise only
  -- happens through that same staff action, or automatically if a video
  -- exceeds the hard duration cap.
  moderation_state text not null default 'pending' check (moderation_state in ('pending', 'approved', 'rejected')),
  duration_seconds numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger video_assets_set_updated_at
  before update on video_assets
  for each row execute function set_updated_at();

create index video_assets_org_id_idx on video_assets (org_id);
create index video_assets_uploader_profile_id_idx on video_assets (uploader_profile_id);

-- A post attaches at most one existing video asset it's entitled to --
-- the asset must already belong to the post's own org/cohort and have
-- been uploaded by the post's own author, and must actually be usable
-- (ready and not rejected). Same validate-don't-derive shape as
-- check_post_stage_matches_org (Session 8): the asset already exists
-- with its own org_id/cohort_id/uploader fixed at upload time, so this
-- checks agreement rather than copying values down.
-- Unique (where set) so a video belongs to at most one post -- without
-- this, nothing would stop the same ready video from being attached to
-- several posts at once.
alter table posts add column video_asset_id uuid references video_assets (id) on delete set null;
create unique index posts_video_asset_id_idx on posts (video_asset_id) where video_asset_id is not null;

create or replace function check_post_video_matches_org()
returns trigger
language plpgsql
as $$
begin
  if new.video_asset_id is not null and not exists (
    select 1 from video_assets
    where id = new.video_asset_id
      and org_id = new.org_id
      and cohort_id is not distinct from new.cohort_id
      and uploader_profile_id = new.author_profile_id
      and status = 'ready'
      and moderation_state = 'approved'
      and deleted_at is null
  ) then
    raise exception 'posts.video_asset_id must be a ready, approved video in the same org/cohort, uploaded by the post''s own author';
  end if;
  return new;
end;
$$;

create trigger posts_video_matches_org
  before insert or update on posts
  for each row execute function check_post_video_matches_org();
