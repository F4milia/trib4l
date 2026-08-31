import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

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
