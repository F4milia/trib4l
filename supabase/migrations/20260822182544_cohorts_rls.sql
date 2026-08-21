-- Reverse: drop policies on cohorts/cohort_members, revoke grants, disable
-- RLS on both tables, drop function assign_member_to_cohort, drop function
-- is_in_cohort. RLS and grants ship together, same as Session 2 -- see
-- that migration's header for why granting without RLS (or vice versa) is
-- unsafe either direction.

-- SECURITY DEFINER for the same reason as the Session 2 helpers: a policy
-- on cohort_members that queries cohort_members would recurse into RLS.
create or replace function is_in_cohort(check_cohort_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from cohort_members
    where cohort_id = check_cohort_id
      and profile_id = auth.uid()
      and deleted_at is null
  );
$$;

-- ===== cohorts =====

alter table cohorts enable row level security;
grant select, insert, update on cohorts to authenticated;

-- Cohorts themselves (name, existence) are org-scoped, not cohort-scoped --
-- any member of the org can see what cohorts exist in it. Who's *in* which
-- cohort is the more sensitive question, handled by cohort_members below.
create policy cohorts_select on cohorts
  for select to authenticated
  using (is_org_member(org_id) or is_platform_admin());

create policy cohorts_insert on cohorts
  for insert to authenticated
  with check (
    has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

create policy cohorts_update on cohorts
  for update to authenticated
  using (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin())
  with check (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin());

-- ===== cohort_members =====

alter table cohort_members enable row level security;
grant select, insert, update on cohort_members to authenticated;

-- A plain member sees their own row and their cohort-mates' rows (a class
-- roster), but nothing from sibling cohorts in the same org -- that's the
-- "nothing from sibling cohorts" line from the plan, enforced here rather
-- than only in Session 6's content queries. organizer/org_owner see the
-- whole org's cohort roster, since they manage it.
create policy cohort_members_select on cohort_members
  for select to authenticated
  using (
    profile_id = auth.uid()
    or is_in_cohort(cohort_id)
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

create policy cohort_members_insert on cohort_members
  for insert to authenticated
  with check (
    has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

create policy cohort_members_update on cohort_members
  for update to authenticated
  using (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin())
  with check (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin());

-- Moves someone into a cohort atomically (soft-delete their old cohort row,
-- insert the new one, in one transaction) -- not SECURITY DEFINER, so both
-- inner statements still run under the caller's own RLS. This function
-- adds atomicity, not privilege: an organizer with legitimate access could
-- do the same two statements by hand, just not atomically.
create or replace function assign_member_to_cohort(
  target_org_id uuid,
  target_profile_id uuid,
  target_cohort_id uuid
)
returns cohort_members
language plpgsql
as $$
declare
  result cohort_members;
begin
  update cohort_members
  set deleted_at = now()
  where org_id = target_org_id
    and profile_id = target_profile_id
    and deleted_at is null;

  insert into cohort_members (org_id, cohort_id, profile_id)
  values (target_org_id, target_cohort_id, target_profile_id)
  returning * into result;

  return result;
end;
$$;

grant execute on function assign_member_to_cohort(uuid, uuid, uuid) to authenticated;
