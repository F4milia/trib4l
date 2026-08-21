"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type ReportInsert = Database["public"]["Tables"]["reports"]["Insert"];

export async function createReport(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const targetType = String(formData.get("target_type") ?? "");
  const targetId = String(formData.get("target_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!reason) {
    redirect(
      `/o/${orgSlug}/report?type=${targetType}&id=${targetId}&error=${encodeURIComponent("A reason is required.")}`,
    );
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { error } = await supabase.from("reports").insert({
    org_id: orgId,
    reporter_profile_id: userData.user!.id,
    target_type: targetType,
    target_id: targetId,
    reason,
  } as unknown as ReportInsert);

  if (error) {
    redirect(
      `/o/${orgSlug}/report?type=${targetType}&id=${targetId}&error=${encodeURIComponent(error.message)}`,
    );
  }

  redirect(`/o/${orgSlug}?notice=${encodeURIComponent("Report sent to the organizers.")}`);
}

export async function resolveReport(formData: FormData) {
  const reportId = String(formData.get("report_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");

  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", reportId);

  if (error) {
    redirect(`/o/${orgSlug}/settings/reports?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/settings/reports`);
  redirect(`/o/${orgSlug}/settings/reports`);
}

export async function escalateReport(formData: FormData) {
  const reportId = String(formData.get("report_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.from("reports").update({ status: "escalated" }).eq("id", reportId);

  if (error) {
    redirect(`/o/${orgSlug}/settings/reports?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/settings/reports`);
  redirect(`/o/${orgSlug}/settings/reports`);
}

export async function blockUser(formData: FormData) {
  const blockedProfileId = String(formData.get("blocked_profile_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  await supabase
    .from("blocks")
    .insert({ blocker_profile_id: userData.user!.id, blocked_profile_id: blockedProfileId });

  revalidatePath(`/o/${orgSlug}`);
  redirect(`/o/${orgSlug}`);
}

export async function unblockUser(formData: FormData) {
  const blockedProfileId = String(formData.get("blocked_profile_id") ?? "");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  await supabase
    .from("blocks")
    .delete()
    .eq("blocker_profile_id", userData.user!.id)
    .eq("blocked_profile_id", blockedProfileId);

  revalidatePath("/settings/blocked");
  redirect("/settings/blocked");
}
