-- Reverse: drop policies item_reminders_select, item_reminders_insert,
-- item_reminders_delete on item_reminders; alter table item_reminders disable
-- row level security; revoke the grants below.

alter table item_reminders enable row level security;

-- SELECT: your own reminders, and nobody else's.
--
-- Narrower than care_actions on purpose. A Care Action is an offer the Family
-- can act on; a reminder is a private arrangement between a member and the
-- clock. What somebody has asked to be nudged about is a small, real signal
-- about what they are worried about, and the Family has no business reading it.
--
-- member_blocks does not apply: there is no other member's content here to
-- hide. This is the invariant 6 check for this surface, and the answer is that
-- the surface is not social.
create policy item_reminders_select on item_reminders
  for select to authenticated
  using (
    membership_id in (select id from memberships where profile_id = auth.uid())
  );

-- INSERT: set your own, in a Family you are in. membership_id is checked
-- against memberships rather than trusted from the client (invariant 5).
create policy item_reminders_insert on item_reminders
  for insert to authenticated
  with check (
    is_org_member(org_id)
    and membership_id in (
      select id from memberships
       where profile_id = auth.uid() and org_id = item_reminders.org_id
         and deleted_at is null)
  );

-- DELETE: turning a toggle off is deleting the row, so this table DOES get a
-- delete policy -- unlike care_actions, where nothing is retractable.
--
-- No UPDATE policy and no UPDATE grant: every column is part of the identity
-- of the subscription. Changing membership_id or the target would silently
-- move somebody else's reminder, which is the shape C1 PR4's lesson warns
-- about -- RLS cannot restrict WHICH columns an UPDATE touches, so the only
-- safe answer is to grant no UPDATE at all. Off then on is delete then insert.
create policy item_reminders_delete on item_reminders
  for delete to authenticated
  using (
    membership_id in (select id from memberships where profile_id = auth.uid())
  );

-- Least-privilege per migration (2026-08-29).
grant select, insert, delete on item_reminders to authenticated;
-- service_role reads them to decide what N1 sends. It writes nothing: a
-- reminder is something a member asks for, never something set on their behalf.
grant select on item_reminders to service_role;
