-- Reverse: drop policies towers_select / _insert / _update, revoke grants,
-- disable row level security on towers.

-- Schema session, PR 2 of 10, RLS half.

alter table towers enable row level security;

grant select, insert, update on towers to authenticated;
-- The completion cascade (F4.8) runs as a durable background function with no
-- session, and it moves a Tower toward its completion path.
grant select, update on towers to service_role;

-- Every member sees their Family's Tower, including its history of stalled,
-- pivoted and completed ones. The Tower is the shared goal; there is nothing
-- to hide from the people building it.
create policy towers_select on towers
  for select to authenticated
  using (is_org_member(org_id) or is_platform_admin());

-- Any member can define a Tower, not just staff.
--
-- O1's acceptance is explicit that the onboarding guide "cannot write a Tower
-- directly -- it prefills the definition form the member submits", so the
-- member is the author. Restricting this to organizers would make the guide
-- unusable for the person it was written for: someone in a brand-new Family
-- that may have no organizer yet.
create policy towers_insert on towers
  for insert to authenticated
  with check (is_org_member(org_id));

-- Editing and status transitions are staff-scoped, and this is the one place
-- this PR departs from "any member".
--
-- F3.4's pivot/stall writes a Ledger event the whole Family reads, and F3.5's
-- completion opens the three-way ceremony. Those are consequential, Family-wide
-- moments; a stray tap should not trigger one. F3.3 sets the precedent by
-- naming "the current Vow-holder or the organizer" for the analogous Vow
-- transition. Flagged in the PR description as an assumption -- F3 does not
-- say who may transition a Tower.
create policy towers_update on towers
  for update to authenticated
  using (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin())
  with check (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin());

-- No DELETE policy and no DELETE grant. A Tower is never deleted: F3.1's four
-- statuses cover its whole life, and 'complete' or 'pivoted' is the honest
-- record of what happened. The Keepsake exports completed Towers, so removing
-- one would erase the artifact the product exists to produce.
