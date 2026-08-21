-- Reverse: drop policies + revoke grants + disable RLS on
-- stage_transitions, member_stages, stages (in that order); drop function
-- transition_member_stage; drop function is_at_or_past_stage.

-- ===== stages =====

alter table stages enable row level security;
grant select, insert, update on stages to authenticated;

create policy stages_select on stages
  for select to authenticated
  using (is_org_member(org_id) or is_platform_admin());

create policy stages_insert on stages
  for insert to authenticated
  with check (
    has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

create policy stages_update on stages
  for update to authenticated
  using (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin())
  with check (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin());

-- ===== member_stages =====

alter table member_stages enable row level security;
grant select, insert, update on member_stages to authenticated;

-- Same visibility shape as cohort_members (Session 5): your own row,
-- org staff see everyone's (they manage progression), platform_admin
-- always. Unlike cohort_members, there's no "see your stage-mates" case --
-- what stage someone else is at isn't something a peer needs to browse,
-- only staff running the program.
create policy member_stages_select on member_stages
  for select to authenticated
  using (
    profile_id = auth.uid()
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

create policy member_stages_insert on member_stages
  for insert to authenticated
  with check (
    has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

create policy member_stages_update on member_stages
  for update to authenticated
  using (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin())
  with check (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin());

-- ===== stage_transitions =====

alter table stage_transitions enable row level security;
grant select, insert on stage_transitions to authenticated;

create policy stage_transitions_select on stage_transitions
  for select to authenticated
  using (
    profile_id = auth.uid()
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

-- Only written by transition_member_stage() below in practice, but the
-- policy itself mirrors audit_log's: self-attributed, and org-scoped
-- unless platform_admin.
create policy stage_transitions_insert on stage_transitions
  for insert to authenticated
  with check (
    transitioned_by_profile_id = auth.uid()
    and (
      has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
      or is_platform_admin()
    )
  );

-- Moves someone to a new stage and logs the transition, atomically. Not
-- SECURITY DEFINER: every inner statement runs under the caller's own
-- already-permitted RLS -- same atomicity-not-privilege pattern as
-- Session 5's assign_member_to_cohort() and Session 6's moderate_post().
create or replace function transition_member_stage(
  target_org_id uuid,
  target_profile_id uuid,
  target_stage_id uuid
)
returns member_stages
language plpgsql
as $$
declare
  prior_stage_id uuid;
  result member_stages;
begin
  select stage_id into prior_stage_id from member_stages
    where org_id = target_org_id and profile_id = target_profile_id and deleted_at is null;

  update member_stages set deleted_at = now()
    where org_id = target_org_id and profile_id = target_profile_id and deleted_at is null;

  insert into member_stages (org_id, profile_id, stage_id)
  values (target_org_id, target_profile_id, target_stage_id)
  returning * into result;

  insert into stage_transitions (org_id, profile_id, from_stage_id, to_stage_id, transitioned_by_profile_id)
  values (target_org_id, target_profile_id, prior_stage_id, target_stage_id, auth.uid());

  return result;
end;
$$;

grant execute on function transition_member_stage(uuid, uuid, uuid) to authenticated;

-- Content-gating helper (used by the next migration): true if the caller
-- has no stage yet and no gate is required, or if their current stage's
-- sort_order is at or past the required stage's. SECURITY DEFINER for the
-- same recursion-avoiding reason as every other *_id-checking helper.
create or replace function is_at_or_past_stage(check_org_id uuid, check_required_stage_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    check_required_stage_id is null
    or exists (
      select 1
      from member_stages ms
      join stages my_stage on my_stage.id = ms.stage_id
      join stages required_stage on required_stage.id = check_required_stage_id
      where ms.org_id = check_org_id
        and ms.profile_id = auth.uid()
        and ms.deleted_at is null
        and my_stage.sort_order >= required_stage.sort_order
    );
$$;
