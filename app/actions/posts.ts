"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

// comments.org_id/cohort_id and reactions.org_id/cohort_id are populated
// by a BEFORE INSERT trigger from the referenced post/comment (see
// migration 20260823191444) -- deliberately not client-supplied, so a
// comment or reaction can never end up mismatched with its parent. The
// generated Insert types don't know about triggers, so they mark those
// columns required; these two aliases are the honest way to tell
// TypeScript "the database fills this in," not a claim that the value is
// actually present in the object being inserted.
type CommentInsert = Database["public"]["Tables"]["comments"]["Insert"];
type ReactionInsert = Database["public"]["Tables"]["reactions"]["Insert"];

export async function createPost(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const cohortId = String(formData.get("cohort_id") ?? "") || null;
  const body = String(formData.get("body") ?? "").trim();

  if (!body) {
    redirect(`/o/${orgSlug}?error=${encodeURIComponent("Post body is required.")}`);
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { error } = await supabase.from("posts").insert({
    org_id: orgId,
    cohort_id: cohortId,
    author_profile_id: userData.user!.id,
    body,
  });

  if (error) {
    redirect(`/o/${orgSlug}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}`);
  redirect(`/o/${orgSlug}`);
}

export async function createComment(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!body) {
    redirect(`/o/${orgSlug}?error=${encodeURIComponent("Comment body is required.")}`);
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { error } = await supabase.from("comments").insert({
    post_id: postId,
    author_profile_id: userData.user!.id,
    body,
  } as unknown as CommentInsert);

  if (error) {
    redirect(`/o/${orgSlug}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}`);
  redirect(`/o/${orgSlug}`);
}

export async function toggleLike(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: existing } = await supabase
    .from("reactions")
    .select("id")
    .eq("post_id", postId)
    .eq("profile_id", userData.user!.id)
    .maybeSingle();

  if (existing) {
    await supabase.from("reactions").delete().eq("id", existing.id);
  } else {
    await supabase
      .from("reactions")
      .insert({ post_id: postId, profile_id: userData.user!.id } as unknown as ReactionInsert);
  }

  revalidatePath(`/o/${orgSlug}`);
  redirect(`/o/${orgSlug}`);
}

export async function moderatePost(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_post", { target_post_id: postId, reason: "removed by organizer" });

  if (error) {
    redirect(`/o/${orgSlug}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}`);
  redirect(`/o/${orgSlug}`);
}

export async function moderateComment(formData: FormData) {
  const commentId = String(formData.get("comment_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_comment", {
    target_comment_id: commentId,
    reason: "removed by organizer",
  });

  if (error) {
    redirect(`/o/${orgSlug}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}`);
  redirect(`/o/${orgSlug}`);
}
