-- Reverse: drop policies vows_select, vows_insert, vows_update on vows; alter
-- table vows disable row level security; revoke the grants below.

alter table vows enable row level security;

-- The whole Family sees its Vow, including its status. F3.3 makes renegotiation
-- "visible to the whole Family", so there is deliberately no narrowing here --
-- a Vow is not private content and member_blocks does not apply to it. A block
-- hides what somebody WROTE; it cannot hide who holds the Family's commitment,
-- or the room would disagree with itself about whose turn it is.
create policy vows_select on vows
  for select to authenticated
  using (is_org_member(org_id) or is_platform_admin());

-- Assigning the Vow is an organizer act. A member cannot hand themselves the
-- Family's commitment, and the one-open-per-Family index means an unguarded
-- insert would also be a way to seize a turn out of order.
create policy vows_insert on vows
  for insert to authenticated
  with check (
    has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    and holder_id in (
      select id from memberships
       where org_id = vows.org_id and deleted_at is null and role <> 'mentor')
  );

-- F3.3, exactly: a transition is triggerable by the CURRENT VOW-HOLDER or the
-- organizer. Both, and nobody else.
--
-- Note what RLS cannot do here, so it is not mistaken for done: a policy
-- decides WHO may update the row, never WHICH transitions are legal. `assigned`
-- -> `complete` skipping `active` is refused by no constraint in this file. The
-- state machine is F3.2's XState machine in the application, and the enum plus
-- vows_complete_iff_completed_at are the only parts the database holds. Same
-- limitation C1 PR4 hit from the other side (RLS cannot restrict which COLUMNS
-- an UPDATE touches) -- and the same conclusion: if a transition ever needs
-- enforcing server-side, it becomes one SECURITY DEFINER function per
-- transition, not a wider policy.
create policy vows_update on vows
  for update to authenticated
  using (
    is_org_member(org_id)
    and (
      holder_id in (select id from memberships
                     where profile_id = auth.uid() and deleted_at is null)
      or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    )
  )
  with check (
    is_org_member(org_id)
    and (
      holder_id in (select id from memberships
                     where profile_id = auth.uid() and deleted_at is null)
      or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    )
  );

-- No DELETE policy and no DELETE grant. A completed Vow is the rotation
-- history that next_vow_holder() reads; deleting one would silently give
-- somebody a second turn before everyone had a first.

-- Least-privilege per migration (2026-08-29): only what a code path here needs.
grant select, insert, update on vows to authenticated;
-- service_role reads for the rotation/reminder jobs (N1's Vow events) and
-- writes nothing: assigning a Vow is a human act with an organizer behind it.
grant select on vows to service_role;
