-- Reverse: drop policies support_requests_select / _insert / _update, revoke
-- grants, disable row level security on support_requests.

-- Wave 7 / H1, PR 1 of 4, RLS half.
--
-- Three roles, three answers:
--   the submitter   may write one and read their own back, and nothing else
--   platform staff  may read every request and mark it handled
--   an organizer    has no special access at all
--
-- That last one is deliberate and worth stating, because every other table in
-- this repo extends reads to organizer/org_owner. A support request is a
-- member writing to the platform, frequently ABOUT their Family or the person
-- running it. Routing it through that person's own read access would make the
-- channel useless in exactly the cases it matters most. The run doc says
-- "routing to platform_staff", and that is the whole routing.

alter table support_requests enable row level security;

-- No DELETE for anyone, and no UPDATE for the submitter -- see below.
grant select, insert on support_requests to authenticated;
-- Staff mark requests handled through their own session, not a service key.
grant update (status) on support_requests to authenticated;

-- service_role gets nothing. No background job reads this table today; when a
-- staff-notification email exists it will run through an explicit narrow path,
-- the way E1's send path reads one preference through one function rather than
-- being handed the table. Per the 2026-08-29 learned constraint, grants here
-- are least-privilege per migration.

create policy support_requests_select on support_requests
  for select to authenticated
  using (
    submitted_by_profile_id = auth.uid()
    or is_platform_admin()
  );

-- submitted_by_profile_id = auth.uid() and NOTHING about membership.
--
-- This clause is H1's named edge case expressed as a policy: there is
-- deliberately no is_org_member() test, so a member of no Family can submit.
-- Adding one would read as tidy and would silently close the pre-Family
-- support path -- the single thing this session exists to keep open.
--
-- Still authenticated-only: an anonymous contact form on a platform whose
-- Families are invite-only is a spam intake with no rate-limit handle.
create policy support_requests_insert on support_requests
  for insert to authenticated
  with check (submitted_by_profile_id = auth.uid());

-- Only staff, and the column grant above already limits them to `status`.
-- The submitter cannot edit a request after sending it: staff may have acted
-- on it already, and a thread that changes under them is worse than no thread.
-- Postgres enforces the column limit at the grant layer regardless of what
-- this policy's USING/WITH CHECK would otherwise permit -- the same pattern
-- orders uses for stripe_checkout_session_id.
create policy support_requests_update on support_requests
  for update to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());
