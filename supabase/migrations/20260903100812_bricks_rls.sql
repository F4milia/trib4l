-- Reverse: drop policies bricks_select / _insert / _update, revoke grants,
-- disable row level security on bricks.

-- Schema session, PR 4 of 10, RLS half.
--
-- WHAT RLS CAN AND CANNOT DO HERE, stated plainly so the next session does not
-- assume more protection than exists.
--
-- A Postgres UPDATE policy's USING clause sees the OLD row and WITH CHECK sees
-- the NEW one; neither can compare the two. So RLS cannot express "you may
-- change assignee from null to yourself, but not from someone else to
-- yourself" -- the rule that would make claim-stealing impossible by policy.
--
-- That rule is instead carried by the table's own constraints and by the shape
-- of the write:
--
--   * nobody signs off their own work    -> bricks_verifier_is_not_assignee
--   * done requires a verifier           -> bricks_done_requires_verification
--   * assignee is in the same Family     -> composite foreign key
--   * concurrent claims resolve to one   -> `where assignee is null` on the
--                                           claim UPDATE, atomic under row
--                                           locking
--
-- What RLS adds is the Family boundary, and that is genuinely all it adds.
-- Peer verification and claim mechanics are enforced by the two CHECK
-- constraints above, which no policy change can loosen.

alter table bricks enable row level security;

grant select, insert, update on bricks to authenticated;
-- F4.5's escalation sweep and F4.8's completion cascade both run without a
-- session and both move Bricks.
grant select, update on bricks to service_role;

create policy bricks_select on bricks
  for select to authenticated
  using (is_org_member(org_id) or is_platform_admin());

create policy bricks_insert on bricks
  for insert to authenticated
  with check (is_org_member(org_id));

-- Any member of the Family, deliberately.
--
-- It has to be any member, because F4.4 lets any member claim an open Brick and
-- F4.7 requires a member OTHER than the assignee to verify it. A policy
-- restricted to the assignee would make peer verification impossible; one
-- restricted to organizers would make self-claim impossible. The narrowing that
-- matters -- who may verify, and what "done" requires -- lives in the CHECK
-- constraints, where it cannot be widened by a later policy edit.
create policy bricks_update on bricks
  for update to authenticated
  using (is_org_member(org_id) or is_platform_admin())
  with check (is_org_member(org_id) or is_platform_admin());

-- No DELETE. F4.2's five states cover a Brick's whole life; a Brick nobody
-- wants any more is one nobody claims. And the Ledger accrues from completed
-- Bricks, so removing one would silently change a member's slice history.
