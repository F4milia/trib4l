-- Reverse: for each table, `drop policy` every policy created below, then
-- `alter table ... disable row level security`, then `revoke` the grants.
-- Re-enabling RLS with no policies would silently block all access (the
-- Supabase CLI's own advisory warns about exactly this), so the grants and
-- policies are written together, in this one migration, on purpose.
--
-- All app-facing access goes through the `authenticated` Postgres role
-- (every signed-in user, regardless of org role or platform_admin status)
-- -- there is no separate Postgres role per membership role or for
-- platform_admin. GRANT controls *whether an operation is possible at all*;
-- RLS policies, using the helper functions from the previous migration,
-- control *which rows*. `anon` gets nothing on any of these tables -- none
-- of this data is meant to be readable without signing in.

-- ===== organizations =====

alter table organizations enable row level security;
grant select, insert, update on organizations to authenticated;

create policy organizations_select on organizations
  for select to authenticated
  using (is_org_member(id) or is_platform_admin());

-- Org creation is platform_admin-only per the plan (Session 3): orgs are
-- provisioned by us, not self-served.
create policy organizations_insert on organizations
  for insert to authenticated
  with check (is_platform_admin());

create policy organizations_update on organizations
  for update to authenticated
  using (has_org_role(id, array['org_owner']::membership_role[]) or is_platform_admin())
  with check (has_org_role(id, array['org_owner']::membership_role[]) or is_platform_admin());

-- ===== profiles =====

alter table profiles enable row level security;
grant select, update on profiles to authenticated;

create policy profiles_select on profiles
  for select to authenticated
  using (id = auth.uid() or shares_org_with(id) or is_platform_admin());

-- No insert policy: rows are created exclusively by the handle_new_user
-- trigger, which runs SECURITY DEFINER and bypasses RLS entirely.
create policy profiles_update on profiles
  for update to authenticated
  using (id = auth.uid() or is_platform_admin())
  with check (id = auth.uid() or is_platform_admin());

-- ===== org_profiles =====

alter table org_profiles enable row level security;
grant select, insert, update on org_profiles to authenticated;

create policy org_profiles_select on org_profiles
  for select to authenticated
  using (is_org_member(org_id) or is_platform_admin());

create policy org_profiles_insert on org_profiles
  for insert to authenticated
  with check (profile_id = auth.uid() and is_org_member(org_id));

create policy org_profiles_update on org_profiles
  for update to authenticated
  using (profile_id = auth.uid() or is_platform_admin())
  with check (profile_id = auth.uid() or is_platform_admin());

-- ===== memberships =====

alter table memberships enable row level security;
grant select, insert, update on memberships to authenticated;

create policy memberships_select on memberships
  for select to authenticated
  using (is_org_member(org_id) or is_platform_admin());

-- Adding a member requires already being organizer/org_owner *of that exact
-- org* -- the org_id on the new row is what's checked, so this can't be
-- used to bootstrap a first membership in an org the actor isn't already
-- staff of. The very first org_owner row for a brand new org is inserted
-- via the platform_admin bypass (Session 3's provisioning flow).
create policy memberships_insert on memberships
  for insert to authenticated
  with check (
    has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

-- Role changes (including promoting/demoting) require org_owner in that
-- org already -- both USING and WITH CHECK reference the actor's *existing*
-- membership rows, so a member updating their own row can't self-promote:
-- at evaluation time their own role is still 'member'.
create policy memberships_update on memberships
  for update to authenticated
  using (has_org_role(org_id, array['org_owner']::membership_role[]) or is_platform_admin())
  with check (has_org_role(org_id, array['org_owner']::membership_role[]) or is_platform_admin());

-- ===== platform_staff =====

-- No policy references any org role at all -- default-deny means a member,
-- mentor, organizer, or org_owner has zero access to this table, in either
-- direction. This is what makes "no org role can grant itself
-- platform_staff" true by construction rather than by a role check that
-- could be gotten wrong.
alter table platform_staff enable row level security;
grant select, insert, update on platform_staff to authenticated;

create policy platform_staff_select on platform_staff
  for select to authenticated
  using (is_platform_admin());

create policy platform_staff_insert on platform_staff
  for insert to authenticated
  with check (is_platform_admin());

create policy platform_staff_update on platform_staff
  for update to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());

-- ===== audit_log =====

-- Append-only even to platform_admin: no update/delete policy exists at
-- all, for anyone. An audit trail that can be edited after the fact isn't
-- an audit trail.
alter table audit_log enable row level security;
grant select, insert on audit_log to authenticated;

create policy audit_log_select on audit_log
  for select to authenticated
  using (
    is_platform_admin()
    or (org_id is not null and has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]))
  );

-- Entries are always self-attributed (actor_profile_id must be the caller)
-- and org-scoped unless the caller is platform_admin -- prevents anyone
-- from writing a log entry as someone else, or about an org they're not in.
create policy audit_log_insert on audit_log
  for insert to authenticated
  with check (
    actor_profile_id = auth.uid()
    and (is_platform_admin() or (org_id is not null and is_org_member(org_id)))
  );

-- ===== webhook_events =====

-- Pure backend infrastructure -- provider webhooks land here via a
-- service-role server route, never via a signed-in user's session. RLS is
-- enabled for defense in depth and to satisfy the CLI's own advisory, but
-- the real control is that `authenticated`/`anon` get no grants at all;
-- `service_role` bypasses RLS by role attribute (rolbypassrls), so no
-- policy is needed for it either.
alter table webhook_events enable row level security;
grant select, insert, update on webhook_events to service_role;

-- ===== idempotency_keys =====

-- Unlike webhook_events, this one *is* touched by the signed-in user's own
-- session -- lib/idempotency.ts runs as whichever client it's called with,
-- typically the requesting user's server client. Scoped to the caller's own
-- keys; platform_admin can see all of them for support/debugging.
alter table idempotency_keys enable row level security;
grant select, insert, update on idempotency_keys to authenticated;

create policy idempotency_keys_select on idempotency_keys
  for select to authenticated
  using (profile_id = auth.uid() or is_platform_admin());

create policy idempotency_keys_insert on idempotency_keys
  for insert to authenticated
  with check (profile_id = auth.uid());

create policy idempotency_keys_update on idempotency_keys
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
