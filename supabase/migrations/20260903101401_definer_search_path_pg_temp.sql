-- Reverse: alter each function below back to `set search_path = public`.
--          Reverting reopens the escalation described here; do it only to
--          unblock a deploy, and re-apply immediately.

-- Stream A unblocking, PR 2. The carried finding from S2, owed as its own
-- migration and never written until now.
--
-- THE BUG. `set search_path = public` does not remove pg_temp from the search
-- path. Postgres searches the temporary schema FIRST for relations whenever
-- pg_temp is not named explicitly, so a function pinned to `public` still
-- resolves table references against pg_temp before public.
--
-- Measured in S2 as the `authenticated` role: a temp table named
-- platform_staff makes is_platform_admin() return true for a plain member.
-- These 15 functions include is_org_member() and has_org_role(), which every
-- C1 policy and all 48 role-checking policies call, so the escalation is not
-- scoped to one surface -- it is the whole RLS layer.
--
-- LATENT, NOT LIVE. No client path in this repo runs DDL, so `authenticated`
-- cannot create the temp table through PostgREST today. That makes this
-- hardening rather than an incident, and it is why it survived three sessions
-- unfixed. It is fixed now because A1's entire gate is that its context
-- assembler cannot reach another Family, and it reaches through these
-- functions.
--
-- WHY ALTER AND NOT CREATE OR REPLACE. ALTER changes only the setting. Fifteen
-- `create or replace` statements would re-paste fifteen function bodies into a
-- migration whose subject is one GUC, and a body altered by accident in that
-- diff is invisible to review. Nothing here touches a single line of logic.
--
-- WHY `public, pg_temp` AND NOT `pg_catalog, pg_temp`. The newer functions in
-- this schema use `pg_catalog, pg_temp` and schema-qualify every reference.
-- These 15 do not: they were written expecting public in the path, so moving
-- them to pg_catalog would break every unqualified reference in their bodies.
-- Naming pg_temp explicitly and LAST is the documented fix and changes nothing
-- else.
--
-- Verified against pg_proc, not against the migration text: `grep -c` reports
-- 16 occurrences, but can_see_video_asset is defined twice (20260828160201,
-- then replaced by 20260829170101). Fifteen functions carry the setting.
-- CLAUDE.md's two entries disagree on this for the same reason.

alter function public.accept_invitation(text)
  set search_path = public, pg_temp;
alter function public.am_i_platform_admin()
  set search_path = public, pg_temp;
alter function public.can_see_gated_content(uuid, uuid, uuid)
  set search_path = public, pg_temp;
alter function public.can_see_org_cohort_content(uuid, uuid)
  set search_path = public, pg_temp;
alter function public.can_see_video_asset(uuid, uuid, uuid, text, uuid)
  set search_path = public, pg_temp;
alter function public.current_user_email()
  set search_path = public, pg_temp;
alter function public.handle_new_user()
  set search_path = public, pg_temp;
alter function public.has_org_role(uuid, membership_role[])
  set search_path = public, pg_temp;
alter function public.is_at_or_past_stage(uuid, uuid)
  set search_path = public, pg_temp;
alter function public.is_in_cohort(uuid)
  set search_path = public, pg_temp;
alter function public.is_org_member(uuid)
  set search_path = public, pg_temp;
alter function public.is_platform_admin()
  set search_path = public, pg_temp;
alter function public.is_platform_staff()
  set search_path = public, pg_temp;
alter function public.purge_member_blocks_and_reports_on_membership_delete()
  set search_path = public, pg_temp;
alter function public.shares_org_with(uuid)
  set search_path = public, pg_temp;
