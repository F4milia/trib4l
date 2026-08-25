-- Reverse: drop table connected_accounts.

-- Session 13 -- Connect onboarding. One Stripe Connect Standard-equivalent
-- account per org (per the F4milia handoff doc, org = Family). The row is
-- created by the org_owner's own onboarding action (real Stripe account id
-- assigned at that point) and kept in sync by the account.updated webhook
-- thereafter -- charges_enabled/payouts_enabled/requirements_due are
-- Stripe's own state, mirrored here so the app can gate commerce UI
-- without calling Stripe on every page load.
create table connected_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  requirements_due text[] not null default '{}',
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id)
);

create trigger connected_accounts_set_updated_at
  before update on connected_accounts
  for each row execute function set_updated_at();
