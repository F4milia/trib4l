# Session 14 — Catalog and Checkout

Tracks progress against the Session 14 scope in
[`trib4l-build-from-zero.md`](./trib4l-build-from-zero.md): "`products`
(org_id, type, price, currency, active), type ∈ digital | physical |
ticket | cohort_seat. Cart, direct charge with `application_fee_amount`,
`orders` and `order_items`. Idempotency keys on checkout. Rate limiting."

Built org-level, same caveat as Session 13 (no Tower spec exists yet to
gate commerce per-Tower).

## Done and verified

- [x] **`products`** (org-scoped catalog, `product_type` enum) — any
  member sees the active catalog; org staff also see inactive/deleted
  products, since they manage the listing. Insert/update restricted to
  organizer/org_owner, same scope as cohorts/stages.
- [x] **`orders`/`order_items`** — `order_items` snapshots
  `product_name`/`unit_price_cents` at purchase time rather than reading
  live off `products`, which can be renamed/repriced/deactivated after
  the fact. Buyer sees their own orders; org staff see every order in
  their org (Session 15's fulfillment work needs that).
- [x] **Checkout** (`app/actions/checkout.ts`) — one form covering the
  whole catalog with a quantity field per product is the entire "cart";
  no separate cart table. Real Stripe Checkout Session, direct charge on
  the org's connected account (`stripeAccount` request option) with
  `application_fee_amount` (`lib/commerce.ts`'s `PLATFORM_TAKE_RATE`,
  currently a flat 20% -- the revenue doc's real tier-based rate is
  Session 19's job, this is the placeholder until org plan assignment
  exists).
- [x] **Idempotency** — reused `lib/idempotency.ts`'s
  `withIdempotencyKey` (built in Session 0/1, never actually wired into a
  feature until now) around order creation + Stripe session creation, keyed
  by a hidden field generated fresh per page load.
- [x] **Rate limiting** (`lib/commerce.ts`) — app-layer, same pattern as
  `lib/family-cap.ts`: 5 checkout attempts per buyer per 60 seconds,
  counted across all orgs. Deliberately checked *after* the
  payments-readiness gate, since an org that can't accept payments yet
  never reaches the point of creating a real Stripe session either way --
  this limits the actually-expensive path, not harmless early rejections.
- [x] **Webhook additions** — `checkout.session.completed` marks the
  order paid; `checkout.session.expired` marks it canceled, but only if
  it's still `pending` (a late redelivery must never overwrite an
  already-paid order back to canceled).
- [x] Isolation-tested: product visibility split (active-only for members
  vs. all for staff), order ownership/insert restrictions
  (can't impersonate another buyer, can't order into an org you're not a
  member of), and the exact column-scoped update gap described below.
- [x] **Fully verified against the real Stripe test API, live, not
  stubbed** -- the whole reason this session took as long as it did.
  Real product created via the real form. Real Checkout Session created
  (direct charge, `application_fee_amount` applied) after a real org_owner
  completed real Stripe Standard-account onboarding (see below -- this
  needed a human, not just an API call). Confirmed: order + order_items
  rows correct (right total, right snapshot), a genuinely signature-verified
  `checkout.session.completed` event flips the order to `paid`, resubmitting
  the exact same form with the same idempotency key replays the same
  order/Checkout Session rather than duplicating, and attempts 6-7 of a
  rapid-fire run were correctly rejected by the rate limiter after 5 real
  successful checkouts went through.

## Two real bugs found only by testing against the live API, not caught by types or isolation tests

1. **Standard Connect accounts cannot be "completed" via API by the
   platform at all.** Attempted to shortcut local testing by directly
   flipping `connected_accounts.charges_enabled` in the DB -- Stripe's
   own Checkout API correctly rejected the resulting session ("you must
   set an account or business name"), because the *real* account was
   still incomplete. Attempting to fix that via `stripe.accounts.update()`
   failed too: *"This application does not have the required permissions
   for the parameter 'business_profile'"* -- a Standard account's own
   holder controls that data, not the platform, by design
   (`requirement_collection: stripe`). There is no API-only path to a
   fully verified Standard test account; a human has to click through
   Stripe's real hosted onboarding UI, including a simulated identity
   document upload. Fixing the DB directly was reverted once this was
   understood -- the eventual test used a genuinely completed account.
2. **A column-scoped grant gap in `orders`.** The RLS migration
   deliberately granted authenticated callers *no* `UPDATE` on `orders`
   at all, reasoning that `status` should only ever move via the webhook.
   That reasoning was correct for `status` but too broad in practice:
   `checkout.ts` itself needs to write `stripe_checkout_session_id` back
   onto the order it just created, as the buyer's own authenticated
   client -- a legitimate write the blanket "no grant" also blocked
   (`permission denied for table orders`, only surfaced by an actual
   checkout attempt). Fixed with a column-scoped grant
   (`grant update (stripe_checkout_session_id) on orders to authenticated`)
   plus an `orders_update` RLS policy scoped to the buyer's own row --
   `status` stays unreachable through the same path regardless of what
   the RLS policy's `USING`/`WITH CHECK` would otherwise allow, since the
   grant layer restricts the column independently of RLS. Added a
   regression test proving both halves in the same request shape: the
   session-id write succeeds, and smuggling `status` into that same
   update call still fails.

## Also fixed: a real gap from Session 13, found while building this one

The production Stripe webhook endpoint registered in Session 13 was
created *without* `connect: true`. Per Stripe's own Connect webhooks
documentation, both `account.updated` for connected accounts and any
direct-charge event (like `checkout.session.completed` for a session
created with the `stripeAccount` option) fall under the **"Connected
accounts"** event scope, which requires a Connect-scoped endpoint --
plain account-level endpoints never receive them. Session 13's own
manual signature test never caught this because it hand-signed and
POSTed a fake event directly, which proves the endpoint's *code* verifies
signatures correctly but proves nothing about whether Stripe would have
actually *routed* a real event there. Recreated the endpoint with
`connect: true`, covering `account.updated`, `checkout.session.completed`,
and `checkout.session.expired`. The old, non-functional endpoint is still
sitting in the Stripe dashboard -- deleting it was blocked as a
destructive action; manual cleanup whenever convenient.

## Not done — explicitly out of scope this session

- Real tier-based take rate (Session 19).
- Fulfillment/entitlements -- a `cohort_seat` purchase doesn't actually
  enroll anyone yet, digital products have nothing to deliver (Session 15).
- Sales tax handling (mentioned in the plan for Session 13's onboarding
  copy, not re-scoped here).
