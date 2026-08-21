"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type PairingStatus = Database["public"]["Enums"]["mentor_pairing_status"];

export async function designateMentor(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const profileId = String(formData.get("profile_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("designate_mentor", {
    target_org_id: orgId,
    target_profile_id: profileId,
  });

  if (error) {
    redirect(`/o/${orgSlug}/settings/mentorship?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/settings/mentorship`);
  redirect(`/o/${orgSlug}/settings/mentorship`);
}

export async function proposeMentorPairing(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const mentorProfileId = String(formData.get("mentor_profile_id") ?? "");
  const menteeProfileId = String(formData.get("mentee_profile_id") ?? "");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { error } = await supabase.from("mentor_pairings").insert({
    org_id: orgId,
    mentor_profile_id: mentorProfileId,
    mentee_profile_id: menteeProfileId,
    proposed_by_profile_id: userData.user.id,
  });

  if (error) {
    redirect(`/o/${orgSlug}/settings/mentorship?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/settings/mentorship`);
  redirect(`/o/${orgSlug}/settings/mentorship`);
}

// Shared by both the staff settings page (decline/complete) and the
// member-facing mentorship page (accept/decline/complete) -- the trigger
// (check_mentor_pairing_transition) enforces who's actually allowed to
// make each transition, so one action is enough for every caller. `view`
// is a closed two-value choice, not an arbitrary redirect target, so this
// can't be used as an open redirect.
export async function transitionMentorPairing(formData: FormData) {
  const pairingId = String(formData.get("pairing_id") ?? "");
  const status = String(formData.get("status") ?? "") as PairingStatus;
  const orgSlug = String(formData.get("org_slug") ?? "");
  const view = String(formData.get("view") ?? "") === "settings" ? "settings" : "mentorship";
  const path = view === "settings" ? `/o/${orgSlug}/settings/mentorship` : `/o/${orgSlug}/mentorship`;

  const supabase = await createClient();
  const { error } = await supabase.from("mentor_pairings").update({ status }).eq("id", pairingId);

  if (error) {
    redirect(`${path}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(path);
  redirect(path);
}
