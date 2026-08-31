import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { memorialSignInBlocked } from "./memorial-lock";

/**
 * The two-factor gate (S2).
 *
 * CLAUDE.md invariant 7: "2FA is ENFORCED for platform_staff at sign-in -- an
 * invariant, not a setting." S2's prompt adds "verify it is actually enforced at
 * sign-in, not just documented", and the honest answer to that was: half of it
 * already was, and the half that mattered most was not.
 *
 * WHAT WAS ALREADY TRUE. is_platform_admin() has been `is_platform_staff() and
 * aal = 'aal2'` since Session 2, so every RLS policy granting the platform
 * bypass already refuses a staff member who has not verified a factor in this
 * session. tests/isolation/platform-admin.test.ts proves it. That is the
 * strongest layer and it needs nothing from this session.
 *
 * WHAT WAS NOT. A staff member with no authenticator at all could sign in and
 * use the product normally -- they simply had no admin bypass. Nothing stopped
 * them at the door, and nothing told them why. That is what this closes.
 *
 * IT ALSO CLOSES A GAP FOR ORDINARY MEMBERS, and this is the part the prompt did
 * not ask for but the feature is meaningless without: once anyone enrols an
 * authenticator, a password alone must stop being enough. Supabase issues an
 * aal1 session for a correct password whether or not a factor exists -- deciding
 * that aal1 is insufficient is the application's job, and nowhere else. Without
 * this, "two-factor is on" would be a claim the product does not honour.
 *
 * WHY READING THE SESSION HERE IS SAFE. requireUser() calls getUser() first,
 * which validates against GoTrue over the network, so by the time this runs the
 * session is known genuine and its `aal` claim is GoTrue's, not a client's. This
 * is deliberately unlike the `email_verified` trap S1 documented: that flag
 * lives in user_metadata, which a user can rewrite with
 * auth.updateUser({ data }). `aal` and the factor list cannot be written that
 * way.
 */
export type AssuranceOutcome =
  | { ok: true }
  | { ok: false; reason: "staff-must-enrol" | "code-required"; redirectTo: string }
;

/** Where a staff member with no authenticator is sent, and the only page they
 *  can reach until they have one. */
export const ENROL_PATH = "/settings/security";

/** Where anyone holding a verified factor is sent to present a code. */
export const CHALLENGE_PATH = "/auth/verify";

export async function assuranceOutcome(
  supabase: SupabaseClient<Database>,
): Promise<AssuranceOutcome> {
  /**
   * nextLevel is 'aal2' exactly when this account has a VERIFIED factor, and
   * currentLevel is what this session has actually reached. So:
   *   nextLevel aal1              -> no authenticator exists
   *   nextLevel aal2, current aal1 -> an authenticator exists, unused this session
   *   current aal2                -> a code was presented
   */
  const { data: levels } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const hasFactor = levels?.nextLevel === "aal2";
  const verifiedThisSession = levels?.currentLevel === "aal2";

  if (verifiedThisSession) {
    return { ok: true };
  }

  if (hasFactor) {
    return { ok: false, reason: "code-required", redirectTo: CHALLENGE_PATH };
  }

  /**
   * No factor. Fine for a member; disqualifying for staff.
   *
   * The staff question goes to the database, not to a claim on the session:
   * is_platform_staff() reads the platform_staff table under SECURITY DEFINER.
   * CLAUDE.md's rule -- role resolves server-side from the database, never from
   * a client claim -- and there is no cheaper answer that is also correct.
   *
   * Note this is asked ONLY when there is no factor, so the common path for
   * every member costs no extra round trip.
   */
  const { data: isStaff } = await supabase.rpc("is_platform_staff");
  if (isStaff) {
    return { ok: false, reason: "staff-must-enrol", redirectTo: ENROL_PATH };
  }

  return { ok: true };
}

/** Where a deleted account is sent. Not "/login" bare: the notice is the whole
 *  point, since signing in appears to work. */
export const DELETED_PATH = "/login?deleted=already";

/** Where a memorial-locked account is sent. A different message from DELETED_PATH
 *  because it is a different fact: nothing was erased, and nobody did anything
 *  wrong. */
export const MEMORIAL_PATH = "/login?memorial=1";

/**
 * Both gates, together, because separating them was a bug twice.
 *
 * A deleted account and an unverified session are two different refusals, and
 * app/page.tsx originally got only one of each -- it cannot call requireUser()
 * (it renders a signed-out view too), so it invoked the assurance check by hand
 * and silently missed the deletion check that arrived later. The second miss was
 * found the same way as the first: by a browser spec signing in with a deleted
 * account and landing on the home page.
 *
 * One function, so a caller cannot take one and forget the other.
 *
 * `skipAssurance` skips ONLY the two-factor half. A deleted account is refused
 * everywhere, including on the pages the assurance gate itself redirects to --
 * there is nothing for a deleted account to enrol or verify.
 */
export async function accountGate(
  supabase: SupabaseClient<Database>,
  userId: string,
  options?: { skipAssurance?: boolean },
): Promise<{ ok: true } | { ok: false; redirectTo: string }> {
  /**
   * One primary-key lookup. It is the only thing stopping a deleted account from
   * being used again: profiles.id cascades from auth.users, so the retention
   * policy requires the GoTrue user to survive -- password intact -- and GoTrue
   * will authenticate it. Deletion revoked the sessions; it did not remove the
   * credential.
   */
  const { data: profile } = await supabase
    .from("profiles")
    .select("deleted_at, memorialized_at")
    .eq("id", userId)
    .maybeSingle();

  /**
   * Memorial-lock first, and the order is a copy decision rather than a security
   * one: an account can be both memorialised and previously self-deleted, and
   * "this account has been memorialised" is the truer thing to say to whoever is
   * holding the password. Both refuse.
   *
   * The rule itself lives in lib/auth/memorial-lock.ts -- if signInAllowed ever
   * becomes true, this stops blocking without an edit here.
   */
  if (profile && memorialSignInBlocked(profile)) {
    return { ok: false, redirectTo: MEMORIAL_PATH };
  }

  if (profile?.deleted_at) {
    return { ok: false, redirectTo: DELETED_PATH };
  }

  if (options?.skipAssurance) {
    return { ok: true };
  }

  const outcome = await assuranceOutcome(supabase);
  return outcome.ok ? { ok: true } : { ok: false, redirectTo: outcome.redirectTo };
}
