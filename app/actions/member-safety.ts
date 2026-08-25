"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * member_blocks/member_reports key off membership id, not profile id --
 * every action here needs the caller's own membership row in the org
 * they're acting in, which lib/session.ts's getUserOrgs() doesn't return.
 */
async function getOwnMembershipId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  profileId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("memberships")
    .select("id")
    .eq("org_id", orgId)
    .eq("profile_id", profileId)
    .is("deleted_at", null)
    .maybeSingle();
  return data?.id ?? null;
}

export async function createMemberReport(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const reportedMembershipId = String(formData.get("reported_membership_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!reason) {
    redirect(
      `/o/${orgSlug}/members/report?membership_id=${reportedMembershipId}&error=${encodeURIComponent("A reason is required.")}`,
    );
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const reporterMembershipId = await getOwnMembershipId(supabase, orgId, userData.user!.id);
  if (!reporterMembershipId) redirect(`/o/${orgSlug}`);

  const { error } = await supabase.from("member_reports").insert({
    org_id: orgId,
    reporter_membership_id: reporterMembershipId,
    reported_membership_id: reportedMembershipId,
    reason,
  });

  if (error) {
    redirect(
      `/o/${orgSlug}/members/report?membership_id=${reportedMembershipId}&error=${encodeURIComponent(error.message)}`,
    );
  }

  redirect(`/o/${orgSlug}/members?notice=${encodeURIComponent("Report sent to this community's organizers.")}`);
}

export async function resolveMemberReport(formData: FormData) {
  const reportId = String(formData.get("report_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");

  const supabase = await createClient();
  const { error } = await supabase
    .from("member_reports")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", reportId);

  if (error) {
    redirect(`/o/${orgSlug}/settings/member-reports?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/settings/member-reports`);
  redirect(`/o/${orgSlug}/settings/member-reports`);
}

export async function blockMember(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const blockedMembershipId = String(formData.get("blocked_membership_id") ?? "");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const blockerMembershipId = await getOwnMembershipId(supabase, orgId, userData.user!.id);
  if (!blockerMembershipId) redirect(`/o/${orgSlug}`);

  await supabase.from("member_blocks").insert({
    org_id: orgId,
    blocker_membership_id: blockerMembershipId,
    blocked_membership_id: blockedMembershipId,
  });

  revalidatePath(`/o/${orgSlug}/members`);
  redirect(`/o/${orgSlug}/members`);
}

export async function unblockMember(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const blockedMembershipId = String(formData.get("blocked_membership_id") ?? "");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const blockerMembershipId = await getOwnMembershipId(supabase, orgId, userData.user!.id);
  if (!blockerMembershipId) redirect(`/o/${orgSlug}`);

  await supabase
    .from("member_blocks")
    .delete()
    .eq("blocker_membership_id", blockerMembershipId)
    .eq("blocked_membership_id", blockedMembershipId);

  revalidatePath(`/o/${orgSlug}/members`);
  redirect(`/o/${orgSlug}/members`);
}
