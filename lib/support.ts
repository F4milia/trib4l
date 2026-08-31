import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

/**
 * CLAUDE.md invariant 7: "Rate limits on every endpoint that costs money or
 * sends anything."
 *
 * A support request strictly speaking does neither -- nothing is charged and
 * no mail goes out today. It is here anyway, because /help is the one write
 * endpoint in this product reachable by an account that belongs to nothing:
 * the insert policy deliberately has no membership test, so a script that can
 * sign up can write rows addressed to staff. Q2 does the Wave 9 sweep; leaving
 * this particular door unlatched until then is not a trade worth making.
 */

export class SupportRateLimitExceeded extends Error {
  constructor() {
    super("You have sent several requests already. Please wait a few minutes before sending another.");
    this.name = "SupportRateLimitExceeded";
  }
}

const RATE_LIMIT_WINDOW_MS = 60 * 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;

/**
 * Counts the submitter's own recent requests, the same shape as
 * assertCheckoutRateLimitNotExceeded() in lib/commerce.ts and
 * assertInviteRateLimitNotExceeded() in lib/email/rate-limit.ts -- app layer
 * rather than a database trigger, because this is abuse prevention and not a
 * tenant-isolation boundary, and it needs no new state because
 * support_requests already records who wrote what and when.
 *
 * An hour rather than a minute: somebody genuinely stuck will send two or
 * three messages in quick succession, and being told to wait is a bad first
 * experience of asking for help. Five in an hour still stops a script.
 *
 * Handled requests count. The limit is on how much a person can put into the
 * queue, not on how much of it staff have got through.
 */
export async function assertSupportRateLimitNotExceeded(
  supabase: SupabaseClient<Database>,
  submitterProfileId: string,
): Promise<void> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("support_requests")
    .select("id", { count: "exact", head: true })
    .eq("submitted_by_profile_id", submitterProfileId)
    .gte("created_at", since);

  if (error) throw error;
  if ((count ?? 0) >= RATE_LIMIT_MAX_REQUESTS) {
    throw new SupportRateLimitExceeded();
  }
}
