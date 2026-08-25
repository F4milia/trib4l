-- Reverse: drop policies + revoke grants + disable RLS on member_reports;
-- drop policies + revoke grants + disable RLS on member_blocks.

-- ===== member_blocks =====

alter table member_blocks enable row level security;
grant select, insert, delete on member_blocks to authenticated;
-- Same gap Session 12 found for stages/cohorts and this session found for
-- memberships: service_role bypasses RLS but not plain Postgres grants, so
-- a brand-new table needs this from day one, not discovered later via a
-- failing isolation test.
grant select, insert, update, delete on member_blocks to service_role;

-- Same "only ever your own list" narrowness as Session 7's blocks_select
-- -- not even platform_admin/org staff get a bypass here, same reasoning:
-- who someone has chosen to block is personal safety information, not
-- administrative data, even at this narrower per-community grain.
create policy member_blocks_select on member_blocks
  for select to authenticated
  using (
    exists (
      select 1 from memberships m
      where m.id = blocker_membership_id and m.profile_id = auth.uid()
    )
  );

create policy member_blocks_insert on member_blocks
  for insert to authenticated
  with check (
    exists (
      select 1 from memberships m
      where m.id = blocker_membership_id and m.profile_id = auth.uid() and m.deleted_at is null
    )
  );

create policy member_blocks_delete on member_blocks
  for delete to authenticated
  using (
    exists (
      select 1 from memberships m
      where m.id = blocker_membership_id and m.profile_id = auth.uid()
    )
  );

-- ===== member_reports =====

alter table member_reports enable row level security;
grant select, insert, update on member_reports to authenticated;
grant select, insert, update, delete on member_reports to service_role;

-- Mirrors Session 7's reports_select: the reporter sees their own report,
-- org staff/platform_admin see everything in their org (they're the ones
-- routing/acting on it).
create policy member_reports_select on member_reports
  for select to authenticated
  using (
    exists (
      select 1 from memberships m
      where m.id = reporter_membership_id and m.profile_id = auth.uid()
    )
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

create policy member_reports_insert on member_reports
  for insert to authenticated
  with check (
    exists (
      select 1 from memberships m
      where m.id = reporter_membership_id and m.profile_id = auth.uid() and m.deleted_at is null
    )
  );

-- Only org staff/platform_admin change status -- never the reporter, never
-- the reported person, matching reports_update.
create policy member_reports_update on member_reports
  for update to authenticated
  using (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin())
  with check (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin());

-- No delete policy for ordinary callers -- matches reports' "permanent
-- record while open" reasoning. The one path that does delete rows (the
-- membership-deleted cleanup trigger) runs SECURITY DEFINER and so
-- bypasses RLS entirely, per that trigger's own comment.
