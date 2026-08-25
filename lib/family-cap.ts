import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

export const FAMILY_MEMBER_CAP = 12;

export class FamilyMemberCapExceeded extends Error {
  constructor() {
    super(`A Family cannot have more than ${FAMILY_MEMBER_CAP} members (mentors don't count toward this).`);
    this.name = "FamilyMemberCapExceeded";
  }
}

/**
 * Throws FamilyMemberCapExceeded if adding one more non-mentor member or
 * invitation to this org would put it over the cap. Mentors are excluded
 * from the count entirely (F4milia's retroactive role-model fix, item
 * 0.2).
 *
 * Deliberately checked here, in the app layer, not as a database
 * trigger: a membership cap is a product policy, the same category as
 * Session 11's upload rate limit, not a tenant-isolation security
 * boundary -- it doesn't need to be airtight against someone bypassing
 * the app and talking to the database directly. Enforcing it as a hard
 * trigger was tried first and reverted: the isolation test suite's
 * shared seeded orgs (caregiverCircle, founderCollective, wellnessGuild)
 * have accumulated far more than 12 disposable test members across many
 * sessions' worth of tests, and a hard cap broke ~27 unrelated tests
 * outright the moment it was turned on.
 *
 * Counts pending invitations alongside active memberships, not just the
 * latter -- otherwise an org could be invited past the cap before
 * anyone actually accepts.
 */
export async function assertFamilyMemberCapNotExceeded(
  supabase: SupabaseClient<Database>,
  orgId: string,
  role: Database["public"]["Enums"]["membership_role"],
): Promise<void> {
  if (role === "mentor") return;

  const [memberResult, invitationResult] = await Promise.all([
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null).neq("role", "mentor"),
    supabase.from("invitations").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "pending").neq("role", "mentor"),
  ]);

  if (memberResult.error) throw memberResult.error;
  if (invitationResult.error) throw invitationResult.error;

  const prospectiveCount = (memberResult.count ?? 0) + (invitationResult.count ?? 0);
  if (prospectiveCount >= FAMILY_MEMBER_CAP) {
    throw new FamilyMemberCapExceeded();
  }
}
