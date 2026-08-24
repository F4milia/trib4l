"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMux } from "@/lib/mux";

const MAX_UPLOADS_PER_HOUR = 5;

export async function createVideoUpload(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const cohortId = String(formData.get("cohort_id") ?? "") || null;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("video_assets")
    .select("id", { count: "exact", head: true })
    .eq("uploader_profile_id", userData.user.id)
    .gte("created_at", oneHourAgo);

  if ((count ?? 0) >= MAX_UPLOADS_PER_HOUR) {
    redirect(`/o/${orgSlug}/videos/upload?error=${encodeURIComponent("Upload limit reached. Try again in a bit.")}`);
  }

  // Generate the video_assets row's id before either the Mux call or the
  // insert, and hand it to Mux as `passthrough` -- the webhook handler
  // reads that back to find this exact row. This also means the insert
  // below can include mux_upload_id directly, in the same statement:
  // there's no need for a follow-up UPDATE (which the uploader isn't
  // permitted to make anyway -- only staff and the service-role webhook
  // path can update a video_assets row after creation).
  const videoAssetId = randomUUID();
  const mux = getMux();

  let upload: Awaited<ReturnType<typeof mux.video.uploads.create>>;
  try {
    upload = await mux.video.uploads.create({
      cors_origin: "*",
      new_asset_settings: { playback_policies: ["signed"], passthrough: videoAssetId },
    });
  } catch (err) {
    redirect(
      `/o/${orgSlug}/videos/upload?error=${encodeURIComponent(err instanceof Error ? err.message : "Could not start upload.")}`,
    );
  }

  const { error } = await supabase.from("video_assets").insert({
    id: videoAssetId,
    org_id: orgId,
    cohort_id: cohortId,
    uploader_profile_id: userData.user.id,
    mux_upload_id: upload.id,
  });

  if (error) {
    redirect(`/o/${orgSlug}/videos/upload?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/o/${orgSlug}/videos/upload?upload_url=${encodeURIComponent(upload.url ?? "")}&video_asset_id=${videoAssetId}`);
}

/**
 * A signed playback id + token pair for a specific video, or null if it
 * isn't ready or the caller can't see it. The RLS-scoped SELECT this
 * runs against is the actual security boundary -- a member in one org
 * holding another org's playback_id can't get a token for it, because
 * their own session can't find that row at all (this is the property
 * Session 11's "done means" bar is about).
 *
 * Returns the pieces <MuxPlayer> needs (`playbackId` + `tokens.playback`),
 * not a raw stream.mux.com URL: a plain <video src="...m3u8"> only plays
 * HLS natively in Safari -- every other browser needs either
 * <mux-player>/hls.js or nothing plays at all, which is exactly the "it
 * loads but never plays" symptom this was built around.
 */
export async function getPlaybackAuth(videoAssetId: string): Promise<{ playbackId: string; token: string } | null> {
  const supabase = await createClient();
  const { data: asset } = await supabase
    .from("video_assets")
    .select("playback_id")
    .eq("id", videoAssetId)
    .eq("status", "ready")
    .maybeSingle();

  if (!asset?.playback_id) return null;

  const token = await getMux().jwt.signPlaybackId(asset.playback_id, { expiration: "1h" });
  return { playbackId: asset.playback_id, token };
}

export async function moderateVideoAsset(formData: FormData) {
  const videoAssetId = String(formData.get("video_asset_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");

  const supabase = await createClient();
  const { data: rejected, error } = await supabase.rpc("moderate_video_asset", {
    target_video_asset_id: videoAssetId,
    reason: "removed by organizer",
  });

  if (error) {
    redirect(`/o/${orgSlug}/settings/videos?error=${encodeURIComponent(error.message)}`);
  }

  // Reclaim storage the same way an auto-rejected over-cap video already
  // does (see the webhook handler) -- a rejected video has no legitimate
  // reason to keep costing money in Mux once it's no longer playable
  // through this app. Best-effort in both directions: getMux() itself
  // throws synchronously if Mux isn't configured, and the delete call
  // can fail on its own -- neither should undo the moderation decision
  // already committed above.
  if (rejected?.mux_asset_id) {
    try {
      await getMux().video.assets.delete(rejected.mux_asset_id);
    } catch {
      // best-effort
    }
  }

  revalidatePath(`/o/${orgSlug}/settings/videos`);
  redirect(`/o/${orgSlug}/settings/videos`);
}
