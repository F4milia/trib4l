-- Reverse: drop function moderate_video_asset; drop trigger
-- video_assets_privileged_columns_guard, drop function
-- check_video_asset_privileged_columns; drop policies + revoke grants +
-- disable RLS on video_assets.

alter table video_assets enable row level security;
grant select, insert, update on video_assets to authenticated;
-- The Mux webhook route is the only writer of status/mux_asset_id/
-- playback_id/duration_seconds, and it has no user session to act
-- under -- same "provider webhooks land here via a service-role server
-- route" reasoning as webhook_events (Session 0/1). service_role
-- bypasses RLS by role attribute, but still needs the underlying grant.
grant select, insert, update on video_assets to service_role;

-- Same bug shape Session 8 found and fixed for posts/comments/reactions:
-- ANDing a moderation check onto can_see_org_cohort_content's own result
-- would re-impose it on staff too, since that helper's bypass only
-- covers cohort scoping. This wraps the bypass around cohort AND
-- moderation together, once -- and adds a second bypass an isolation
-- test caught missing: the uploader must be able to see their own
-- video regardless of moderation_state, or the "My videos" page could
-- never show upload/processing status for anything not yet approved.
create or replace function can_see_video_asset(
  check_org_id uuid,
  check_cohort_id uuid,
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
      and check_moderation_state = 'approved'
    );
$$;

create policy video_assets_select on video_assets
  for select to authenticated
  using (can_see_video_asset(org_id, cohort_id, moderation_state, uploader_profile_id));

-- Anyone can start an upload into their own org/cohort, as themselves.
-- mux_upload_id is legitimately client-set here (createVideoUpload
-- inserts it in the same statement, right after creating the Mux
-- upload) -- but status/moderation_state/mux_asset_id/playback_id/
-- duration_seconds are NOT restricted by this policy at all, and
-- without the trigger below a member could insert their own row
-- pre-declared status='ready', moderation_state='approved', and any
-- playback_id they like, skipping Mux (and moderation) entirely.
create policy video_assets_insert on video_assets
  for insert to authenticated
  with check (
    uploader_profile_id = auth.uid()
    and is_org_member(org_id)
    and (cohort_id is null or is_in_cohort(cohort_id))
  );

-- Staff moderate (via moderate_video_asset below); the uploader
-- themselves gets no update path at all -- the row's technical fields
-- are Mux-driven and the moderation field is a staff decision, so there
-- is nothing here for an uploader to legitimately change post-creation.
create policy video_assets_update on video_assets
  for update to authenticated
  using (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin())
  with check (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin());

-- RLS gates rows, not columns. Two gaps closed here, both the same
-- shape as Session 9's mentor_pairings trigger: (1) on INSERT, a member
-- could otherwise pre-declare their own row status='ready',
-- moderation_state='approved', with any playback_id they like, skipping
-- Mux and moderation entirely; (2) on UPDATE, a staff member's
-- legitimately-permitted update (for moderation_state) could also
-- smuggle in a rewrite of status/mux_asset_id/playback_id/etc. Every
-- column may move for the service-role webhook path -- that's the one
-- path meant to set them. auth.jwt() ->> 'role', not the deprecated
-- auth.role() wrapper -- both read the same request.jwt.claims GUC
-- PostgREST sets from the decoded bearer token (the service_role key is
-- itself a JWT with role: "service_role" in its payload), the identical
-- mechanism auth.uid() already relies on everywhere else in this
-- codebase.
create or replace function check_video_asset_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if (auth.jwt() ->> 'role') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'waiting'
      or new.moderation_state is distinct from 'pending'
      or new.mux_asset_id is not null
      or new.playback_id is not null
      or new.duration_seconds is not null
    then
      raise exception 'status, moderation_state, mux_asset_id, playback_id, and duration_seconds cannot be set directly on insert';
    end if;
    return new;
  end if;

  if new.org_id is distinct from old.org_id
    or new.cohort_id is distinct from old.cohort_id
    or new.uploader_profile_id is distinct from old.uploader_profile_id
    or new.mux_upload_id is distinct from old.mux_upload_id
    or new.mux_asset_id is distinct from old.mux_asset_id
    or new.playback_id is distinct from old.playback_id
    or new.policy is distinct from old.policy
    or new.status is distinct from old.status
    or new.duration_seconds is distinct from old.duration_seconds
  then
    raise exception 'Only moderation_state may be changed through this path';
  end if;

  return new;
end;
$$;

create trigger video_assets_privileged_columns_guard
  before insert or update on video_assets
  for each row execute function check_video_asset_privileged_columns();

-- Same shape as Session 6's moderate_post: not SECURITY DEFINER, both
-- the UPDATE and the audit_log INSERT run under the caller's own
-- already-permitted RLS (video_assets_update and audit_log_insert) --
-- this function buys atomicity, not privilege.
create or replace function moderate_video_asset(target_video_asset_id uuid, reason text default null)
returns video_assets
language plpgsql
as $$
declare
  result video_assets;
begin
  update video_assets set moderation_state = 'rejected'
    where id = target_video_asset_id and deleted_at is null
  returning * into result;

  if result is null then
    raise exception 'Video asset not found or not permitted';
  end if;

  insert into audit_log (actor_profile_id, org_id, action, target_type, target_id, metadata)
  values (auth.uid(), result.org_id, 'moderate_video_asset', 'video_assets', result.id, jsonb_build_object('reason', reason));

  return result;
end;
$$;

grant execute on function moderate_video_asset(uuid, text) to authenticated;
