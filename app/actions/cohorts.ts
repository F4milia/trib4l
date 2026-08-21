"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createCohort(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    redirect(`/o/${orgSlug}/settings/cohorts?error=${encodeURIComponent("A cohort name is required.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("cohorts").insert({ org_id: orgId, name });

  if (error) {
    redirect(`/o/${orgSlug}/settings/cohorts?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/settings/cohorts`);
  redirect(`/o/${orgSlug}/settings/cohorts`);
}

export async function assignToCohort(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const profileId = String(formData.get("profile_id") ?? "");
  const cohortId = String(formData.get("cohort_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_member_to_cohort", {
    target_org_id: orgId,
    target_profile_id: profileId,
    target_cohort_id: cohortId,
  });

  if (error) {
    redirect(`/o/${orgSlug}/settings/cohorts?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/settings/cohorts`);
  redirect(`/o/${orgSlug}/settings/cohorts`);
}
