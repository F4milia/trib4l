-- Reverse: drop policies care_actions_select, care_actions_insert on
-- care_actions; alter table care_actions disable row level security; revoke
-- the grants below.

alter table care_actions enable row level security;

-- SELECT: the Family sees who is helping whom.
--
-- Family-wide rather than sender-and-target-only, and that is a product
-- reading worth stating: F4.6 makes a "need help" Brick claimable BY ANYONE,
-- so the linked Care Action has to be visible to anyone who might pick it up.
-- A Care Action narrowed to two people would be a private message, which is
-- what C1's DMs are for.
--
-- INVARIANT 6, checked explicitly because this is a new social surface: an
-- offer from a member the viewer has BLOCKED is hidden from that viewer
-- specifically -- not withdrawn, and not hidden from the room. The offerer
-- always sees their own, so a block can never hide somebody's own act of help
-- from themselves.
create policy care_actions_select on care_actions
  for select to authenticated
  using (
    is_platform_admin()
    or (
      is_org_member(org_id)
      and (
        from_membership_id in (select id from memberships where profile_id = auth.uid())
        or not viewer_blocks_membership(from_membership_id)
      )
    )
  );

-- INSERT: you offer your own help, in a Family you are in. from_membership_id
-- is checked against memberships rather than trusted from the client, for the
-- same reason table_entries checks member_id -- invariant 5 resolves identity
-- server-side, never from a claim.
create policy care_actions_insert on care_actions
  for insert to authenticated
  with check (
    is_org_member(org_id)
    and from_membership_id in (
      select id from memberships
       where profile_id = auth.uid() and org_id = care_actions.org_id
         and deleted_at is null)
  );

-- No UPDATE and no DELETE, by policy or by grant.
--
-- There is nothing to update: the table has no lifecycle (see the migration
-- that created it), so every column is set once at the moment of the offer.
-- And an offer of help is not withdrawable by design -- "I said I would cover
-- this and then unsaid it" is a conversation, not a row edit. If a lifecycle
-- is specified later it arrives with its own policy.
--
-- The organizations cascade still removes them with the Family; that path does
-- not consult RLS.

-- Least-privilege per migration (2026-08-29): only what a code path needs.
grant select, insert on care_actions to authenticated;
-- service_role reads for N1's inbox aggregation and the F4.6 write, which runs
-- server-side when a Brick enters needs_help.
grant select, insert on care_actions to service_role;
