-- Reverse: drop policies + revoke grants + disable RLS on blocks; drop
-- policies + revoke grants + disable RLS on reports.

-- ===== reports =====

alter table reports enable row level security;
grant select, insert, update on reports to authenticated;

-- The reporter sees their own reports (so they know something happened),
-- org staff see everything in their org (they're the ones routing/acting
-- on reports), platform_admin sees everything (the escalation path).
create policy reports_select on reports
  for select to authenticated
  using (
    reporter_profile_id = auth.uid()
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

create policy reports_insert on reports
  for insert to authenticated
  with check (reporter_profile_id = auth.uid() and is_org_member(org_id));

-- Only org staff/platform_admin change status (resolve or escalate) --
-- never the reporter themselves, and never the reported person.
create policy reports_update on reports
  for update to authenticated
  using (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin())
  with check (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin());

-- No delete policy: a report, once filed, is a permanent record even if
-- later marked resolved -- the resolution history matters as much as the
-- report itself.

-- ===== blocks =====

alter table blocks enable row level security;
grant select, insert, delete on blocks to authenticated;

-- Deliberately narrow: you can only ever see your own block list, never
-- who has blocked you, and never anyone else's list -- not even
-- platform_admin gets a blanket bypass here, since who someone has chosen
-- to block is exactly the kind of personal safety information this
-- feature exists to protect, not administrative data.
create policy blocks_select on blocks
  for select to authenticated
  using (blocker_profile_id = auth.uid());

create policy blocks_insert on blocks
  for insert to authenticated
  with check (blocker_profile_id = auth.uid());

create policy blocks_delete on blocks
  for delete to authenticated
  using (blocker_profile_id = auth.uid());
