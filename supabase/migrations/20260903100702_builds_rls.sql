-- Reverse: drop policies builds_select / _insert / _update, revoke grants,
-- disable row level security on builds.

-- Schema session, PR 3 of 10, RLS half.

alter table builds enable row level security;

grant select, insert, update on builds to authenticated;
-- F4.8's completion cascade is a durable background function with no session,
-- and closing a Build is its job.
grant select, update on builds to service_role;

create policy builds_select on builds
  for select to authenticated
  using (is_org_member(org_id) or is_platform_admin());

-- Any member may add a Build. A2's assistant drafts a Build/Brick breakdown
-- that "the Family edits and accepts", and whoever is looking at it does the
-- accepting -- not necessarily an organizer.
create policy builds_insert on builds
  for insert to authenticated
  with check (is_org_member(org_id));

-- Any member may update, unlike towers. Closing a Build is F4.8's cascade
-- reacting to Bricks finishing, not the Family-wide moment a Tower pivot is,
-- so it does not warrant the same restriction.
create policy builds_update on builds
  for update to authenticated
  using (is_org_member(org_id))
  with check (is_org_member(org_id));

-- No DELETE, same reasoning as towers: a completed Build is part of what the
-- Keepsake exports, and 'complete' is the honest record.
