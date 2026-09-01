-- Reverse: drop policies on table_entries, table_prompts, mood_tags; alter each
-- disable row level security; revoke the grants below; drop function
-- public.membership_is_memorialized(uuid).

-- Schema session, PR 6, second half. RLS is the security model (invariant 5),
-- so every read path here goes through policy -- including the streak, which
-- lands in a later PR as a SECURITY INVOKER function precisely so it inherits
-- these policies rather than working around them.

alter table mood_tags     enable row level security;
alter table table_prompts enable row level security;
alter table table_entries enable row level security;

-- ------------------------------------------------------------- mood_tags
-- A platform-wide tag (org_id null) is readable by any signed-in member; a
-- Family's own tag only within that Family.
create policy mood_tags_select on mood_tags
  for select to authenticated
  using (org_id is null or is_org_member(org_id) or is_platform_admin());

-- Writes are not a member action. A Family's organizer curates its own
-- vocabulary; the platform-wide set is staff-only, and `org_id is null` is
-- deliberately NOT writable by any member -- otherwise one Family could add a
-- mood tag every Family sees.
create policy mood_tags_write on mood_tags
  for all to authenticated
  using (
    (org_id is not null and has_org_role(org_id, array['organizer','org_owner']::membership_role[]))
    or is_platform_admin())
  with check (
    (org_id is not null and has_org_role(org_id, array['organizer','org_owner']::membership_role[]))
    or is_platform_admin());

-- --------------------------------------------------------- table_prompts
create policy table_prompts_select on table_prompts
  for select to authenticated
  using (org_id is null or is_org_member(org_id) or is_platform_admin());

create policy table_prompts_write on table_prompts
  for all to authenticated
  using (
    (org_id is not null and has_org_role(org_id, array['organizer','org_owner']::membership_role[]))
    or is_platform_admin())
  with check (
    (org_id is not null and has_org_role(org_id, array['organizer','org_owner']::membership_role[]))
    or is_platform_admin());

-- --------------------------------------------------------- table_entries
--
-- Is this membership's person memorial-locked? Spec 2.9 (F8.1): a memorialised
-- member's table_entries are locked from editing, and F8.2 adds that their
-- entries REMAIN VISIBLE to the Family. So this gates UPDATE and not SELECT.
--
-- search_path names pg_temp explicitly and last, per the 2026-09-01 S2
-- constraint. The fifteen older definer functions that pin `search_path =
-- public` are owed their own migration; this file does not add a sixteenth.
create or replace function public.membership_is_memorialized(check_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
      from public.memberships m
      join public.profiles p on p.id = m.profile_id
     where m.id = check_membership_id
       and p.memorialized_at is not null
  );
$$;

revoke execute on function public.membership_is_memorialized(uuid) from public;
grant execute on function public.membership_is_memorialized(uuid) to authenticated, service_role;

-- SELECT: the Family reads its own Table. Two things narrow it.
--
-- INVARIANT 6, checked explicitly rather than assumed, because the Table is a
-- new social surface and the invariant says to check blocks against every one:
-- an entry by a member the viewer has BLOCKED is hidden FROM THE VIEWER
-- SPECIFICALLY. Not deleted, not hidden from the Family -- the author's own
-- entry stays visible to the author and to everyone who has not blocked them.
--
-- The author is exempted from their own block check so the rule can never hide
-- somebody's writing from themselves.
create policy table_entries_select on table_entries
  for select to authenticated
  using (
    deleted_at is null
    and (
      is_platform_admin()
      or (
        is_org_member(org_id)
        and (
          member_id in (select id from memberships where profile_id = auth.uid())
          or not viewer_blocks_membership(member_id)
        )
      )
    )
  );

-- INSERT: your own entry, in a Family you are actually in. member_id is checked
-- against memberships rather than trusted from the client -- the same reason
-- H1's support form re-checks org_id in policy (invariant 5: role and identity
-- resolve server-side from the database, never from a claim).
create policy table_entries_insert on table_entries
  for insert to authenticated
  with check (
    is_org_member(org_id)
    and member_id in (
      select id from memberships
       where profile_id = auth.uid() and org_id = table_entries.org_id
         and deleted_at is null)
  );

-- UPDATE: the author, and only while not memorial-locked.
--
-- KNOWINGLY INCOMPLETE, and named so it is not mistaken for finished: spec 2.9
-- gives a memorialised member's designated EXECUTOR edit access scoped to that
-- member's content. There is no executor_membership_id anywhere in this schema
-- yet -- it is one of the entities docs/f4milia/d1-readiness.md section 8.4
-- records as unscheduled. So the lock is currently TOTAL rather than
-- executor-shaped: nobody can edit, including the executor who does not exist.
-- That is the strict direction, which is the right way to be wrong about a
-- memorial. When the executor lands, this policy gains an OR branch; it does
-- not need rewriting.
create policy table_entries_update on table_entries
  for update to authenticated
  using (
    member_id in (
      select id from memberships
       where profile_id = auth.uid() and deleted_at is null)
    and not membership_is_memorialized(member_id)
  )
  with check (
    member_id in (
      select id from memberships
       where profile_id = auth.uid() and deleted_at is null)
    and not membership_is_memorialized(member_id)
  );

-- No DELETE policy and no DELETE grant, deliberately. An entry is soft-deleted
-- through UPDATE, so the row survives for the Ledger, the Keepsake and the
-- memorial lock. A hard delete happens only when the Family itself is deleted,
-- through the organizations cascade, which does not consult RLS.

-- ------------------------------------------------------------------ grants
-- Least-privilege per migration, per the 2026-08-29 constraint: each grant
-- names only what a code path here needs. "The service role reads everything"
-- is false in this repo.
grant select on mood_tags, table_prompts to authenticated;
grant insert, update, delete on mood_tags, table_prompts to authenticated;
grant select, insert, update on table_entries to authenticated;

-- service_role reads entries for the Inngest daily-prompt job (F1.2) and
-- inserts prompts; it is given no UPDATE or DELETE on entries, because nothing
-- server-side has a reason to rewrite a member's own words.
grant select on table_entries to service_role;
grant select, insert, update on table_prompts, mood_tags to service_role;
