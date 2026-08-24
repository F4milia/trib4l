-- Reverse: drop trigger video_assets_stage_matches_org, drop function
-- check_video_asset_stage_matches_org; drop policy video_assets_select,
-- recreate it exactly as in 20260828160201_video_assets_rls.sql; drop
-- function can_see_video_asset (5-arg version), recreate the 4-arg
-- version from that same migration; drop column
-- video_assets.required_stage_id.

-- Session 12's "Library UI with stage and cohort entitlement filtering"
-- needs video content to support the same stage gate posts already have
-- (Session 8) -- added here, to the existing video_assets table, rather
-- than as a new column on some separate "library" table, so live-stream
-- VOD archives (Session 12) and member-uploaded clips (Session 11) are
-- gated by the exact same mechanism.
alter table video_assets add column required_stage_id uuid references stages (id);

-- Same org-matching validation every other required_stage_id column
-- already has (posts: check_post_stage_matches_org; live_streams: this
-- migration's sibling) -- video_assets had gone without one only because
-- the column didn't exist until this migration.
create or replace function check_video_asset_stage_matches_org()
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

create trigger video_assets_stage_matches_org
  before insert or update on video_assets
  for each row execute function check_video_asset_stage_matches_org();

drop policy video_assets_select on video_assets;
drop function can_see_video_asset(uuid, uuid, text, uuid);

-- Extends Session 11's can_see_video_asset with the stage check, reusing
-- is_at_or_past_stage (Session 8) directly rather than re-deriving
-- stage-comparison logic -- this is the literal "entitlement resolution
-- shares one code path" the plan asks for: the stage-gating primitive is
-- the same function call everywhere it's used (posts, comments,
-- reactions, and now video), not a parallel reimplementation.
create or replace function can_see_video_asset(
  check_org_id uuid,
  check_cohort_id uuid,
  check_required_stage_id uuid,
  check_moderation_state text,
  check_uploader_profile_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    is_platform_admin()
    or has_org_role(check_org_id, array['organizer', 'org_owner']::membership_role[])
    or check_uploader_profile_id = auth.uid()
    or (
      is_org_member(check_org_id)
      and (check_cohort_id is null or is_in_cohort(check_cohort_id))
      and is_at_or_past_stage(check_org_id, check_required_stage_id)
      and check_moderation_state = 'approved'
    );
$$;

create policy video_assets_select on video_assets
  for select to authenticated
  using (can_see_video_asset(org_id, cohort_id, required_stage_id, moderation_state, uploader_profile_id));
