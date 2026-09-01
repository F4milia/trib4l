-- Reverse: drop policies ledger_events_select / _insert, revoke grants,
-- disable row level security on ledger_events.

-- Schema session, PR 1 of 10, RLS half.
--
-- Two grants only: SELECT and INSERT. No UPDATE, no DELETE, for anybody --
-- including service_role.
--
-- Append-only is enforced at the GRANT layer rather than by policy, because a
-- policy can be widened by a later migration that looks reasonable in isolation
-- ("staff should be able to fix a typo"), whereas a missing grant refuses the
-- statement outright regardless of what any policy says. The Ledger is the
-- record the Keepsake exports and that the Contribution Report will sit beside.
-- Corrections are new events. That is how a ledger has always worked.

alter table ledger_events enable row level security;

grant select, insert on ledger_events to authenticated;

-- service_role can write events from background jobs -- the Family Night
-- rollup (F2.1) and the Brick escalation (F4.5) both run without a session --
-- but it cannot rewrite history either.
grant select, insert on ledger_events to service_role;

-- Every member reads their own Family's history. That is the entire point of
-- the table: it is the Family's story, told back to them. Deliberately NOT
-- restricted to organizers.
create policy ledger_events_select on ledger_events
  for select to authenticated
  using (is_org_member(org_id) or is_platform_admin());

-- Members write events too -- completing a Brick, sending a Care Action.
-- Constrained to their own Family, so nobody can write history into a Family
-- they do not belong to. Note this does not constrain WHAT they write: a
-- member could in principle insert an event describing something that did not
-- happen. That is a product concern (events are written by the code paths that
-- perform the action, not by a free-text form), not something RLS can settle.
create policy ledger_events_insert on ledger_events
  for insert to authenticated
  with check (is_org_member(org_id));
