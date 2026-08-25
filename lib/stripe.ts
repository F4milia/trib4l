import Stripe from "stripe";

// Unlike @mux/mux-node, the Stripe SDK's constructor doesn't read
// STRIPE_SECRET_KEY from process.env on its own (verified against the
// installed package's stripe.core.d.ts -- `constructor(key: string, ...)`
// is required, not optional) -- has to be passed explicitly.
//
// Constructed lazily, not as a module-level singleton, for the same
// reason as lib/mux.ts: until real Stripe test-mode credentials exist,
// this shouldn't crash every import of the module.
let cachedClient: Stripe | undefined;

export function getStripe(): Stripe {
  cachedClient ??= new Stripe(process.env.STRIPE_SECRET_KEY!);
  return cachedClient;
}

// The `type` param on account creation is deprecated in this SDK version
// (verified against Accounts.d.ts) in favor of `controller` -- this is
// the documented Stripe migration equivalent of a "Standard" account:
// the connected account pays its own Stripe fees and carries its own
// negative-balance liability, gets a full Stripe-hosted Dashboard, and
// Stripe (not this platform) collects its KYC requirements directly.
// Matches the plan's "Standard account creation."
export const STANDARD_ACCOUNT_CONTROLLER: Stripe.AccountCreateParams.Controller = {
  fees: { payer: "account" },
  losses: { payments: "stripe" },
  requirement_collection: "stripe",
  stripe_dashboard: { type: "full" },
};
