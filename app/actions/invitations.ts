"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertFamilyMemberCapNotExceeded, FamilyMemberCapExceeded } from "@/lib/family-cap";
import type { Database } from "@/lib/supabase/database.types";

type MembershipRole = Database["public"]["Enums"]["membership_role"];

export async function createInvitation(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "member") as MembershipRole;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  if (!email) {
    redirect(`/o/${orgSlug}/settings/members?error=${encodeURIComponent("An email address is required.")}`);
  }

  try {
    await assertFamilyMemberCapNotExceeded(supabase, orgId, role);
  } catch (err) {
    if (err instanceof FamilyMemberCapExceeded) {
      redirect(`/o/${orgSlug}/settings/members?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  const { error } = await supabase.from("invitations").insert({
    org_id: orgId,
    email,
    role,
    invited_by_profile_id: userData.user!.id,
  });

  if (error) {
    redirect(`/o/${orgSlug}/settings/members?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/settings/members`);
  redirect(`/o/${orgSlug}/settings/members`);
}

export async function revokeInvitation(formData: FormData) {
  const invitationId = String(formData.get("invitation_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");

  const supabase = await createClient();
  await supabase.from("invitations").update({ status: "revoked" }).eq("id", invitationId);

  revalidatePath(`/o/${orgSlug}/settings/members`);
  redirect(`/o/${orgSlug}/settings/members`);
}

export async function acceptInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "");

  const supabase = await createClient();
  const { data: membership, error } = await supabase.rpc("accept_invitation", {
    invitation_token: token,
  });

  if (error || !membership) {
    redirect("/?error=" + encodeURIComponent(error?.message ?? "Could not accept invitation."));
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("slug")
    .eq("id", membership.org_id)
    .single();

  redirect(org ? `/o/${org.slug}` : "/");
}
