import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Database } from "./supabase/database.types";

type OrgMembership = {
  org_id: string;
  slug: string;
  name: string;
  role: Database["public"]["Enums"]["membership_role"];
};

/** Redirects to /login if there's no signed-in user, and to /check-email if
 *  that user's address is not confirmed.
 *
 *  The verification check is defence in depth, not the gate. The gate is
 *  upstream and structural: `[auth.email] enable_confirmations = true` means
 *  GoTrue mints no session for an unconfirmed address, so this branch is
 *  unreachable through the password path -- tests/isolation/
 *  email-verification.test.ts proves that against a real GoTrue. It exists
 *  because a provider path could later hand back a session whose address was
 *  never confirmed, and the session is the ONLY signal the app layer can
 *  trust here: GoTrue keeps `email_verified` in user_metadata, which the user
 *  can rewrite themselves via auth.updateUser({ data }).
 *
 *  Scoped to users who actually have an address. A session with no email at
 *  all is a different state with a different answer, and `email_optional =
 *  false` on every configured provider keeps it unreachable; sending someone
 *  with no address to "check your email" would be advice they cannot act on. */
export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    redirect("/login");
  }
  if (data.user.email && !data.user.email_confirmed_at) {
    redirect("/check-email");
  }
  return { supabase, user: data.user };
}

/** The signed-in user's own orgs and their role in each.
 *
 * The `profile_id` filter here is doing real work, not just being
 * defensive: the memberships SELECT policy is org-scoped (any member of an
 * org can see that org's full roster, by design -- Session 2), not
 * self-scoped. Without this filter, an organizer of a multi-member org
 * would see every member's row here, not just their own. RLS answers "is
 * this row visible to the caller at all," never "is this row the
 * caller's" -- that second question is this function's job. */
export async function getUserOrgs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
): Promise<OrgMembership[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select("org_id, role, organizations(slug, name)")
    .eq("profile_id", profileId)
    .order("created_at");
  if (error || !data) return [];

  return data
    .filter((row) => row.organizations)
    .map((row) => ({
      org_id: row.org_id,
      role: row.role,
      slug: row.organizations!.slug,
      name: row.organizations!.name,
    }));
}

export async function getPendingInvitations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string,
) {
  const { data } = await supabase
    .from("invitations")
    .select("id, token, role, organizations(name, slug)")
    .eq("email", email)
    .eq("status", "pending");
  return data ?? [];
}

/** Redirects to /login if signed out, or / if not platform_admin. */
export async function requirePlatformAdmin() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.rpc("am_i_platform_admin");
  if (error || !data) {
    redirect("/");
  }
  return { supabase, user };
}
