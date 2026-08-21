"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createStage(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const sortOrder = Number(formData.get("sort_order") ?? "");

  if (!name || !Number.isInteger(sortOrder)) {
    redirect(`/o/${orgSlug}/settings/stages?error=${encodeURIComponent("A name and a whole-number order are required.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("stages").insert({ org_id: orgId, name, sort_order: sortOrder });

  if (error) {
    redirect(`/o/${orgSlug}/settings/stages?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/settings/stages`);
  redirect(`/o/${orgSlug}/settings/stages`);
}

export async function transitionMemberStage(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const profileId = String(formData.get("profile_id") ?? "");
  const stageId = String(formData.get("stage_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_member_stage", {
    target_org_id: orgId,
    target_profile_id: profileId,
    target_stage_id: stageId,
  });

  if (error) {
    redirect(`/o/${orgSlug}/settings/stages?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/settings/stages`);
  redirect(`/o/${orgSlug}/settings/stages`);
}
