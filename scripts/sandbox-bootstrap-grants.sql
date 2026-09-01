-- sandbox-bootstrap-grants.sql -- what the Supabase CLI does to default
-- privileges, for schema-sandbox.sh. Runs as `postgres`, BEFORE any migration.
--
-- NOT A MIGRATION. See scripts/sandbox-bootstrap-auth.sql for the same caveat.
--
-- THIS IS THE FILE THAT DECIDES WHETHER THE SANDBOX TELLS THE TRUTH.
--
-- supabase/config.toml documents the behaviour in its own words:
--
--   auto_expose_new_tables -- "Controls whether new tables, views, sequences
--   and functions created in the `public` schema by `postgres` are reachable
--   through the Data API roles (`anon`, `authenticated`, `service_role`)
--   without explicit GRANTs. When unset, new entities are NOT auto-exposed,
--   matching the new cloud default."
--
-- The key is unset in this repo, so on a real stack the CLI has already
-- narrowed `postgres`'s default privileges in `public` before the first
-- migration runs. The bare `supabase/postgres` image has NOT: it still carries
-- the legacy grants, so every table a migration creates is silently readable
-- and writable by anon, authenticated and service_role.
--
-- Measured, `postgres`'s default ACL for tables in `public`:
--
--   real stack   postgres=arwdDxtm  anon=Dxtm  authenticated=Dxtm  service_role=Dxtm
--   bare image   postgres=arwdDxtm  anon=arwdDxtm  authenticated=arwdDxtm  service_role=arwdDxtm
--                                        ^^^^ SELECT, INSERT, UPDATE, DELETE
--
-- The consequence is not a broken sandbox, it is a LYING one. Without this
-- file, 38 pgTAP assertions across seven files failed here while passing on
-- the real stack -- among them ledger_events' append-only guarantee, which is
-- enforced at the grant layer precisely because a grant cannot be widened by a
-- later migration that reads reasonably in isolation (PR #58). A sandbox that
-- hands every role full DML reports that guarantee as broken. The inverse is
-- the dangerous direction and the reason this file is not optional: a NEW
-- table added by a future migration would be exposed to anon here and the
-- sandbox would say nothing, because there would be no assertion to fail.
--
-- Read off the running stack, not written from memory. Re-read it if the CLI's
-- pinned image changes.

-- Tables: strip the four DML privileges, leave TRUNCATE / REFERENCES /
-- TRIGGER / MAINTAIN, which is exactly what the real stack leaves.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables
  from anon, authenticated, service_role;

-- Sequences: the real stack leaves UPDATE alone (anon=w) and drops SELECT and
-- USAGE. Not obvious, and worth matching rather than rounding to "revoke all".
alter default privileges for role postgres in schema public
  revoke select, usage on sequences
  from anon, authenticated, service_role;

-- Functions: the real stack leaves only postgres=X. A function reachable
-- through the Data API without an explicit grant is how a definer function
-- becomes an unintended RPC endpoint.
alter default privileges for role postgres in schema public
  revoke execute on functions
  from anon, authenticated, service_role;
