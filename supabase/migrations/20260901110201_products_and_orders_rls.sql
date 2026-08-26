-- Reverse: drop policies + revoke grants + disable RLS on order_items;
-- drop policies + revoke grants + disable RLS on orders; drop policies +
-- revoke grants + disable RLS on products.

-- ===== products =====

alter table products enable row level security;
grant select, insert, update on products to authenticated;
grant select, insert, update on products to service_role;

-- Any member sees the active catalog; staff also see inactive/deleted
-- products, since they're the ones managing them (toggling active,
-- deciding what to relist).
create policy products_select on products
  for select to authenticated
  using (
    (active and deleted_at is null and is_org_member(org_id))
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

-- Product management is a staff task, same scope as cohorts/stages --
-- not extended to every member the way posting is.
create policy products_insert on products
  for insert to authenticated
  with check (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]));

create policy products_update on products
  for update to authenticated
  using (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]))
  with check (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]));

-- ===== orders =====

alter table orders enable row level security;
grant select, insert on orders to authenticated;
-- Column-scoped, not a blanket UPDATE grant: the checkout action (running
-- as the buyer's own client) writes stripe_checkout_session_id back onto
-- its own just-created order right after creating the Stripe session --
-- a real, legitimate authenticated write that isn't a status change.
-- Postgres enforces this at the grant layer regardless of what any RLS
-- policy's USING/WITH CHECK would otherwise allow, so status stays
-- unreachable by the buyer even though the row itself is theirs to
-- update in principle.
grant update (stripe_checkout_session_id) on orders to authenticated;
grant select, insert, update on orders to service_role;

-- The buyer sees their own orders; org staff see every order in their
-- org (they're the ones who'll handle fulfillment, Session 15).
create policy orders_select on orders
  for select to authenticated
  using (
    buyer_profile_id = auth.uid()
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

-- Buying is member-scoped, not open to the world -- F4milia's Families
-- are capped, invite-based communities, not a public storefront.
create policy orders_insert on orders
  for insert to authenticated
  with check (buyer_profile_id = auth.uid() and is_org_member(org_id));

-- The only authenticated update path is the column-scoped grant above --
-- this policy just says which rows (your own order), the grant already
-- said which column. status itself only ever moves
-- pending -> paid/canceled/refunded via the checkout webhook
-- (service_role), same reasoning as connected_accounts'
-- charges_enabled/payouts_enabled: nobody has a legitimate reason to
-- hand-edit their own order's payment status.
create policy orders_update on orders
  for update to authenticated
  using (buyer_profile_id = auth.uid())
  with check (buyer_profile_id = auth.uid());

-- ===== order_items =====

alter table order_items enable row level security;
grant select, insert on order_items to authenticated;
grant select, insert, update on order_items to service_role;

-- No org_id here -- order_items has no query need for it beyond RLS, so
-- visibility is derived from the parent order's own visibility rather
-- than duplicating a column purely to re-run the same check.
create policy order_items_select on order_items
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = order_id
        and (
          o.buyer_profile_id = auth.uid()
          or has_org_role(o.org_id, array['organizer', 'org_owner']::membership_role[])
          or is_platform_admin()
        )
    )
  );

create policy order_items_insert on order_items
  for insert to authenticated
  with check (
    exists (select 1 from orders o where o.id = order_id and o.buyer_profile_id = auth.uid())
  );
