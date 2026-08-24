"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getMux, LIVE_STREAM_RECONNECT_WINDOW_SECONDS } from "@/lib/mux";
import type { Database } from "@/lib/supabase/database.types";

// org_id/created_by_profile_id on live_stream_credentials are
// trigger-derived from the referenced live stream (see the migration),
// same reasoning as comments/reactions deriving theirs from a post.
type LiveStreamCredentialsInsert = Database["public"]["Tables"]["live_stream_credentials"]["Insert"];

export async function createLiveStream(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const cohortId = String(formData.get("cohort_id") ?? "") || null;
  const requiredStageId = String(formData.get("required_stage_id") ?? "") || null;
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!title) {
    redirect(`/o/${orgSlug}/settings/live?error=${encodeURIComponent("A title is required.")}`);
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  // Inserted before calling Mux, and left at its column defaults for
  // mux_live_stream_id/playback_id/status: the privileged-columns guard
  // means even this row's own creator can't set those directly, so
  // there's nothing to gain by generating an id up front the way
  // Session 11's upload flow does -- the real Mux values only exist
  // after the call below succeeds, and only the service-role step after
  // that may attach them.
  const { data: row, error: insertError } = await supabase
    .from("live_streams")
    .insert({
      org_id: orgId,
      cohort_id: cohortId,
      required_stage_id: requiredStageId,
      title,
      description,
      created_by_profile_id: userData.user.id,
    })
    .select("id")
    .single();

  if (insertError || !row) {
    redirect(`/o/${orgSlug}/settings/live?error=${encodeURIComponent(insertError?.message ?? "Could not create the live stream.")}`);
  }

  let liveStream: Awaited<ReturnType<ReturnType<typeof getMux>["video"]["liveStreams"]["create"]>>;
  try {
    liveStream = await getMux().video.liveStreams.create({
      playback_policies: ["signed"],
      new_asset_settings: { playback_policies: ["signed"] },
      reconnect_window: LIVE_STREAM_RECONNECT_WINDOW_SECONDS,
    });
  } catch (err) {
    // The placeholder row above is left behind, inert
    // (mux_live_stream_id stays null forever) -- harmless, and not worth
    // an automated cleanup job for what should be a rare failure.
    redirect(
      `/o/${orgSlug}/settings/live?error=${encodeURIComponent(err instanceof Error ? err.message : "Could not create the live stream on Mux.")}`,
    );
  }

  const playbackId = liveStream.playback_ids?.[0]?.id ?? null;
  const service = createServiceClient();

  // Relaying facts Mux already returned, not a user decision -- the same
  // category of write as the webhook path, which is why this goes
  // through the service-role client rather than the creator's own
  // session (blocked from setting these columns directly; see the RLS
  // migration's column guard for why).
  const { error: linkError } = await service
    .from("live_streams")
    .update({ mux_live_stream_id: liveStream.id, playback_id: playbackId })
    .eq("id", row.id);

  if (linkError) {
    await getMux()
      .video.liveStreams.delete(liveStream.id)
      .catch(() => {});
    redirect(`/o/${orgSlug}/settings/live?error=${encodeURIComponent(linkError.message)}`);
  }

  await service
    .from("live_stream_credentials")
    .insert({ live_stream_id: row.id, stream_key: liveStream.stream_key } as unknown as LiveStreamCredentialsInsert);

  revalidatePath(`/o/${orgSlug}/settings/live`);
  redirect(`/o/${orgSlug}/settings/live`);
}

/**
 * A signed playback id + token pair for a live stream currently
 * broadcasting, or null if it isn't active or the caller can't see it.
 * Same shape as video.ts's getPlaybackAuth -- the "one code path" the
 * plan asks for is the entitlement check each of these runs against
 * (can_see_gated_content here, can_see_video_asset there), not a single
 * shared function signature; live streams and archived VOD are
 * different rows with different RLS policies, but neither invents its
 * own separate stage/cohort-checking logic.
 */
export async function getLiveStreamPlaybackAuth(liveStreamId: string): Promise<{ playbackId: string; token: string } | null> {
  const supabase = await createClient();
  const { data: stream } = await supabase
    .from("live_streams")
    .select("playback_id")
    .eq("id", liveStreamId)
    .eq("status", "active")
    .maybeSingle();

  if (!stream?.playback_id) return null;

  const token = await getMux().jwt.signPlaybackId(stream.playback_id, { expiration: "6h" });
  return { playbackId: stream.playback_id, token };
}
