"use server";

import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/session";
import { slugify } from "@/lib/slugify";

export async function createOrganization(formData: FormData) {
  const { supabase, user } = await requirePlatformAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const ownerEmail = String(formData.get("owner_email") ?? "").trim().toLowerCase();
  const slug = slugify(String(formData.get("slug") ?? "") || name);

  if (!name || !slug) {
    redirect("/admin/organizations/new?error=" + encodeURIComponent("Name is required."));
  }

  const { data: org, error } = await supabase
    .from("organizations")
    .insert({ name, slug })
    .select("id, slug")
    .single();

  if (error || !org) {
    redirect("/admin/organizations/new?error=" + encodeURIComponent(error?.message ?? "Could not create org."));
  }

  if (ownerEmail) {
    await supabase.from("invitations").insert({
      org_id: org!.id,
      email: ownerEmail,
      role: "org_owner",
      invited_by_profile_id: user.id,
    });
  }

  redirect(`/o/${org!.slug}`);
}
