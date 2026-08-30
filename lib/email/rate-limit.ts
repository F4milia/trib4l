import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

/**
 * CLAUDE.md invariant 7: "Rate limits on every endpoint that costs money or
 * sends anything: auth, AI, email, push, storage."
 *
 * Q2 (Wave 9) does the full sweep across every cost-bearing endpoint. This is
 * the one E1 itself opens: inviting somebody sends mail, and mail costs money
 * and lands in a stranger's inbox. Shipping a send path with no limit and
 * planning to add one eight waves later is how an open relay happens.
 */

export class InviteRateLimitExceeded extends Error {
  constructor() {
    super("Too many invitations sent just now. Please wait a moment and try again.");
    this.name = "InviteRateLimitExceeded";
  }
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_INVITES = 5;

/**
 * Counts the inviter's own recent invitations, the same shape as
 * assertCheckoutRateLimitNotExceeded() in lib/commerce.ts -- app layer rather
 * than a database trigger, because this is abuse prevention and not a
 * tenant-isolation boundary, and it needs no new state because `invitations`
 * already records who sent what and when.
 *
 * Counted across every Family the inviter belongs to, not per Family: someone
 * firing invitations at strangers is abusive regardless of which Family they
 * happen to be doing it from, and per-Family counting would let an organizer
 * of three Families send three times as much.
 *
 * Revoked and expired invitations still count. The limit is on how often mail
 * can be triggered, not on how many invitations succeed -- an invitation
 * revoked one second later has already been delivered.
 */
export async function assertInviteRateLimitNotExceeded(
  supabase: SupabaseClient<Database>,
  inviterProfileId: string,
): Promise<void> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("invitations")
    .select("id", { count: "exact", head: true })
    .eq("invited_by_profile_id", inviterProfileId)
    .gte("created_at", since);

  if (error) throw error;
  if ((count ?? 0) >= RATE_LIMIT_MAX_INVITES) {
    throw new InviteRateLimitExceeded();
  }
}
