import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

// The revenue-model doc's four-tier take rate (Free 20% / Growth 10% /
// Scale 6% / Owned 4%) depends on a plan/tier concept that doesn't exist
// yet -- that's Session 19's job ("subscription plans, org plan
// assignment"). Every org defaults to the Free tier's rate until then;
// this constant is the one place that changes when Session 19 ships
// real tier assignment.
export const PLATFORM_TAKE_RATE = 0.2;

export function applicationFeeAmount(totalCents: number): number {
  return Math.round(totalCents * PLATFORM_TAKE_RATE);
}

export class CheckoutRateLimitExceeded extends Error {
  constructor() {
    super("Too many checkout attempts. Please wait a moment and try again.");
    this.name = "CheckoutRateLimitExceeded";
  }
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

/**
 * Checked here, in the app layer, not as a database trigger -- same
 * reasoning as lib/family-cap.ts: this is abuse prevention, not a
 * tenant-isolation boundary, so it doesn't need to be airtight against
 * someone bypassing the app entirely. Counts a buyer's own order attempts
 * (any status -- a pending order this same buyer never completed still
 * counts, since the point is limiting how often checkout can be
 * triggered, not how many purchases succeed) across all orgs, not just
 * this one: a buyer hammering checkout is abusive regardless of which
 * community they're doing it in.
 */
export async function assertCheckoutRateLimitNotExceeded(
  supabase: SupabaseClient<Database>,
  buyerProfileId: string,
): Promise<void> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("buyer_profile_id", buyerProfileId)
    .gte("created_at", since);

  if (error) throw error;
  if ((count ?? 0) >= RATE_LIMIT_MAX_ATTEMPTS) {
    throw new CheckoutRateLimitExceeded();
  }
}
