-- Reverse: drop policies + revoke grants + disable RLS on connected_accounts.

alter table connected_accounts enable row level security;

-- Billing is org_owner scope, per the original role table ("org_owner:
-- per-org, billing + settings") -- organizer doesn't get a look-in here,
-- unlike Members/Cohorts/etc. platform_admin sees everything (HQ,
-- Sessions 18-19).
grant select, insert on connected_accounts to authenticated;
grant select, insert, update, delete on connected_accounts to service_role;

create policy connected_accounts_select on connected_accounts
  for select to authenticated
  using (has_org_role(org_id, array['org_owner']::membership_role[]) or is_platform_admin());

-- Only the initial row -- the org_owner starting onboarding and getting a
-- real stripe_account_id back. No update policy for authenticated at
-- all: charges_enabled/payouts_enabled/requirements_due are Stripe's own
-- verification state, written only by the account.updated webhook
-- (service_role, bypasses RLS) -- an org_owner has no legitimate reason
-- to hand-edit their own account's verification status.
create policy connected_accounts_insert on connected_accounts
  for insert to authenticated
  with check (has_org_role(org_id, array['org_owner']::membership_role[]));
