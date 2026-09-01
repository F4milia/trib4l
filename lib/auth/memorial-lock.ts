/**
 * What "frozen" means for a memorial-locked account.
 *
 * ONE PLACE, ON PURPOSE. These four answers are decision 4, and they are the
 * part of memorial-lock most likely to be revisited -- so they live here as four
 * named booleans rather than as four hardcoded behaviours scattered across the
 * surfaces that enforce them. Changing the policy is editing this object; the
 * tests read it rather than restating it, so they move with it instead of
 * failing.
 *
 * The values below are engineering's suggestions, taken as the working answer on
 * 2026-09-01. They are provisional in the sense that a product decision could
 * change any one of them; nothing about the shape of the code depends on which
 * way they go.
 *
 * WHY THIS IS NOT A DATABASE SETTING. A per-deployment toggle would let
 * production and staging disagree about what happens to a dead member's account,
 * which is the last thing anyone wants to debug. It is a product rule, so it
 * ships with the code and changes through review.
 */
export const MEMORIAL_LOCK = {
  /**
   * Can anyone sign in to the account? **No, never again.**
   *
   * Enforced in lib/auth/assurance.ts (accountGate), which every protected
   * surface passes through. This is the only one of the four that is enforced
   * today, because it is the only one whose surface already exists.
   */
  signInAllowed: false,

  /**
   * Can other members still comment on and react to their posts? **Yes.**
   *
   * A Family talking about someone they lost is the point of keeping the content
   * at all. Nothing to enforce -- this is the default behaviour, and it is
   * recorded here so nobody "tidies up" by locking the thread later.
   */
  familyMayComment: true,

  /**
   * Can they be removed from the Family roster? **No.** They stay listed as a
   * member.
   *
   * Not yet enforced: the removal path this would guard is D2's departure
   * cleanup, which does not exist. Whoever builds it reads this.
   */
  removableFromRoster: false,

  /**
   * Can their Member Card still be edited by others? **No.** Their own words
   * about themselves stop where they stopped.
   *
   * Not yet enforced: Member Cards arrive in A4. Worth noting that A4 is the
   * AI-suggestion surface, so the rule it needs is "do not offer a suggestion
   * for a memorialised member at all", not "let them dismiss it".
   */
  memberCardEditable: false,
} as const;

/** True when this profile's state means the account is frozen. Reads the policy
 *  rather than testing the column directly, so a change above reaches every
 *  call site. */
export function memorialSignInBlocked(profile: { memorialized_at: string | null }): boolean {
  return Boolean(profile.memorialized_at) && !MEMORIAL_LOCK.signInAllowed;
}
