-- Reverse: create or replace function public.unread_message_counts() with no
--          argument, restoring the cross-Family behaviour described below.
--          Reverting reintroduces the defect; do it only to unblock a deploy.

-- Stream A unblocking, PR 13. A C1 defect owed to N1 (Wave 4).
--
-- THE BUG IS INVARIANT 6 DEFEATED BY ARITHMETIC RATHER THAN BY CONTENT.
-- unread_message_counts() took no argument, so one call spanned every Family
-- the caller belongs to. The rows it returns are correct individually -- RLS
-- holds, SECURITY INVOKER, and the caller may see each conversation. What is
-- wrong is the SET: a dual-Family member asking "what is unread" gets one
-- answer covering both Families, and any surface that sums it renders a
-- cross-Family number inside one Family's UI.
--
-- C1's own record says "revisit before unread counts drive notifications".
-- N1 is that session, and a notification badge is exactly the surface that
-- sums this.
--
-- STILL SECURITY INVOKER, and that is not incidental. C1 PR4's lesson: a
-- derived COUNT is a read path and needs the same policy as the rows it counts.
-- A definer version would count messages the viewer cannot see, so a blocker's
-- unread badge would report how much the blocked member is posting -- the same
-- invariant defeated by the same mechanism, one layer down.
--
-- The argument is required rather than defaulted. A default would let every
-- existing caller keep the old behaviour silently, which is the failure this
-- migration exists to remove.

drop function if exists public.unread_message_counts();

create or replace function public.unread_message_counts(check_org_id uuid)
returns table (conversation_id uuid, unread_count bigint)
language sql
security invoker
stable
set search_path = pg_catalog, pg_temp
as $$
  select m.conversation_id, count(*)
    from public.messages m
    join public.conversation_participants cp
      on cp.conversation_id = m.conversation_id
    join public.memberships mem
      on mem.id = cp.membership_id
   where mem.profile_id = auth.uid()
     and mem.deleted_at is null
     -- The whole change: this Family, not every Family the caller is in.
     -- Read from the MEMBERSHIP rather than from the message, so a member who
     -- left keeps no count in a Family they are no longer part of.
     and mem.org_id = check_org_id
     and m.deleted_at is null
     -- Your own messages are never unread to you.
     and m.author_membership_id <> cp.membership_id
     and (cp.last_read_at is null or m.created_at > cp.last_read_at)
   group by m.conversation_id;
$$;

revoke execute on function public.unread_message_counts(uuid) from public;
grant execute on function public.unread_message_counts(uuid)
  to authenticated, service_role;

comment on function public.unread_message_counts(uuid) is
  'Unread counts for ONE Family. The org argument is required, not defaulted: '
  'a default would let existing callers keep the cross-Family behaviour this '
  'migration removes, silently. SECURITY INVOKER because a count is a read '
  'path -- a definer version would leak a blocked member''s volume as a number.';
