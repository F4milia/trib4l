-- Reverse: drop policies notification_preferences_select / _insert / _update /
-- _delete, revoke grants, disable row level security on
-- notification_preferences.

-- Wave 1 / E1, PR 2 of 5, RLS half.
--
-- A mute is private to the member who set it. Deliberately NOT extended to
-- organizer/org_owner the way products or reports are: "who in this Family
-- muted the digest" is a social surveillance surface, not an administrative
-- one, and an organizer who can see it can act on it. Nothing in E1, N1 or
-- 17.1's settings UI needs an organizer to read another member's preferences,
-- so nothing here grants it.
--
-- is_platform_admin() is kept for parity with every other table -- staff
-- support paths need it, and it is audited at the application layer through
-- withAdminAudit() (lib/audit.ts), which RLS cannot log on its own.

alter table notification_preferences enable row level security;

-- Least privilege, per the 2026-08-29 learned constraint: grants in this repo
-- are per-migration, and "the service role reads everything" is false here.
-- service_role gets EXECUTE on notification_preference_enabled() and no table
-- privilege at all -- the send path needs one boolean about one member, not
-- the ability to enumerate who muted what.
grant select, insert, update, delete on notification_preferences to authenticated;

create policy notification_preferences_select on notification_preferences
  for select to authenticated
  using (profile_id = auth.uid() or is_platform_admin());

-- is_org_member(org_id) as well as ownership: you cannot hold a preference in
-- a Family you are not in. Without it a member could seed rows for a Family
-- they are about to be invited to and pre-empt the fresh defaults the removal
-- trigger exists to guarantee.
create policy notification_preferences_insert on notification_preferences
  for insert to authenticated
  with check (profile_id = auth.uid() and is_org_member(org_id));

create policy notification_preferences_update on notification_preferences
  for update to authenticated
  using (profile_id = auth.uid() and is_org_member(org_id))
  with check (profile_id = auth.uid() and is_org_member(org_id));

-- Deleting your own row means "back to the default". Allowed without the
-- membership test on purpose: a member who has already lost membership should
-- still be able to clear a leftover row, and the removal trigger has usually
-- done it for them already.
create policy notification_preferences_delete on notification_preferences
  for delete to authenticated
  using (profile_id = auth.uid());
