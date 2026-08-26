-- Reverse: drop table order_items, drop table orders, drop type
-- order_status, drop table products, drop type product_type.

-- Session 14 -- Catalog and checkout. Built org-level (not per-Tower --
-- see docs/session-13-checklist.md's note on the same gap for Session
-- 13; no Tower spec exists yet to build against).
create type product_type as enum ('digital', 'physical', 'ticket', 'cohort_seat');

create table products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  type product_type not null,
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'usd',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

create index products_org_id_active_idx on products (org_id, active) where deleted_at is null;

-- Financial records -- like reports and mentor_pairings, these survive
-- the org or the buyer being (soft-)deleted, not cascade away with them.
-- No update policy for authenticated at all (see the RLS migration):
-- status only ever moves pending -> paid/canceled via the checkout
-- webhook, service_role, same pattern as connected_accounts.
create type order_status as enum ('pending', 'paid', 'canceled', 'refunded');

create table orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  buyer_profile_id uuid references profiles (id) on delete set null,
  status order_status not null default 'pending',
  stripe_checkout_session_id text unique,
  total_cents integer not null check (total_cents >= 0),
  currency text not null default 'usd',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger orders_set_updated_at
  before update on orders
  for each row execute function set_updated_at();

create index orders_org_id_idx on orders (org_id);
create index orders_buyer_profile_id_idx on orders (buyer_profile_id);

-- product_name/unit_price_cents are a snapshot at purchase time --
-- deliberately not read live off products, which can be renamed,
-- repriced, or deactivated after the fact. A completed order is a record
-- of what was actually bought and for how much, not a live view of the
-- current catalog. product_id itself is kept (on delete set null) only
-- as a soft cross-reference for future fulfillment (Session 15) -- if
-- the product row is gone, the order line item's own snapshot still
-- means something on its own.
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  product_id uuid references products (id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  created_at timestamptz not null default now()
);

create index order_items_order_id_idx on order_items (order_id);
