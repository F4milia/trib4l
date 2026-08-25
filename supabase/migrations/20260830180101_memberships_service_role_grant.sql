-- Reverse: revoke select, insert, update, delete on memberships from
-- service_role.

-- Same gap Session 12 found and fixed for stages/cohorts: service_role
-- bypasses RLS but not ordinary Postgres GRANT privileges, a separate
-- layer. memberships predates service_role's introduction to this
-- codebase (Session 11) and was never granted to it. Needed now because
-- the F4milia member-cap isolation tests use the service-role client to
-- set up and tear down test memberships directly (an app-layer cap, not
-- an RLS concern -- see lib/family-cap.ts -- so there's no RLS reason to
-- route test setup through a real invite/accept round trip here). Delete
-- is included alongside the others because the tests also remove
-- disposable memberships directly to simulate a slot freeing up.
grant select, insert, update, delete on memberships to service_role;
