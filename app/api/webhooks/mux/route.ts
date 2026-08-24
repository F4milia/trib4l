import { NextResponse } from "next/server";
import { getMux, MAX_VIDEO_DURATION_SECONDS } from "@/lib/mux";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/database.types";

type VideoAssetUpdate = Database["public"]["Tables"]["video_assets"]["Update"];
type LiveStreamUpdate = Database["public"]["Tables"]["live_streams"]["Update"];
type ServiceClient = ReturnType<typeof createServiceClient>;
type Json = Database["public"]["Tables"]["webhook_events"]["Insert"]["payload"];

// Finds the row this event is about and applies patch, preferring
// whichever identifier the event actually carries: `passthrough` (our
// own video_assets.id, set at upload-creation time -- present on every
// asset.* event) is the most direct link; `uploadId`/the asset's own id
// cover events where passthrough is absent.
async function applyAssetPatch(
  supabase: ServiceClient,
  ids: { passthrough?: string; uploadId?: string; assetId: string },
  patch: VideoAssetUpdate,
) {
  const fullPatch: VideoAssetUpdate = { ...patch, mux_asset_id: ids.assetId };

  let query = supabase.from("video_assets").update(fullPatch);
  if (ids.passthrough) {
    query = query.eq("id", ids.passthrough);
  } else if (ids.uploadId) {
    query = query.eq("mux_upload_id", ids.uploadId);
  } else {
    query = query.eq("mux_asset_id", ids.assetId);
  }

  const { error } = await query;
  if (error) throw error;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const mux = getMux();

  let event: Awaited<ReturnType<typeof mux.webhooks.unwrap>>;
  try {
    event = await mux.webhooks.unwrap(rawBody, request.headers);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error: insertError } = await supabase.from("webhook_events").insert({
    provider: "mux",
    external_event_id: event.id,
    payload: event as unknown as Json,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      // Already received (or currently being processed) this exact
      // event -- Mux redelivers on timeout, so this is the expected,
      // safe outcome for a retry, not a real error.
      return NextResponse.json({ status: "duplicate" }, { status: 200 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  switch (event.type) {
    case "video.asset.created": {
      // A live-stream-derived asset has no pre-existing video_assets row
      // to match against (unlike a direct upload) -- it only becomes a
      // library row once the recording is actually finalized, at
      // video.asset.live_stream_completed below. Nothing to do here for
      // that case.
      if (event.data.live_stream_id) break;

      await applyAssetPatch(
        supabase,
        { passthrough: event.data.passthrough, uploadId: event.data.upload_id, assetId: event.data.id },
        { status: "preparing" },
      );
      break;
    }
    case "video.asset.ready": {
      // Fires while a live stream is still broadcasting too (so viewers
      // can watch near-live) -- that's not the library-archival moment,
      // which is video.asset.live_stream_completed below.
      if (event.data.live_stream_id) break;

      const durationSeconds = event.data.duration ?? null;
      const overCap = durationSeconds !== null && durationSeconds > MAX_VIDEO_DURATION_SECONDS;
      const playbackId = event.data.playback_ids?.[0]?.id;

      await applyAssetPatch(
        supabase,
        { passthrough: event.data.passthrough, uploadId: event.data.upload_id, assetId: event.data.id },
        {
          status: "ready",
          duration_seconds: durationSeconds,
          moderation_state: overCap ? "rejected" : "approved",
          ...(playbackId ? { playback_id: playbackId } : {}),
        },
      );

      if (overCap) {
        // Reclaim storage immediately -- an over-cap video should never
        // sit around costing money once it's already known to be
        // rejected. Best-effort: the row is marked rejected regardless,
        // which is what actually keeps it from being playable/attachable.
        await getMux().video.assets.delete(event.data.id).catch(() => {});
      }
      break;
    }
    case "video.asset.errored": {
      if (event.data.live_stream_id) break;

      await applyAssetPatch(
        supabase,
        { passthrough: event.data.passthrough, uploadId: event.data.upload_id, assetId: event.data.id },
        { status: "errored" },
      );
      break;
    }
    case "video.asset.live_stream_completed": {
      // The recording is finalized -- this is the actual "archive into
      // the VOD library" moment. Unlike a direct upload, there's no
      // pre-existing video_assets row for a live-stream-derived asset,
      // so this creates one (copying org/cohort/stage from the live
      // stream, no hard duration cap -- an hour-long session is normal
      // here, not abuse) and links it back.
      const liveStreamId = event.data.live_stream_id;
      if (!liveStreamId) break;

      const { data: stream } = await supabase
        .from("live_streams")
        .select("id, org_id, cohort_id, required_stage_id, created_by_profile_id")
        .eq("mux_live_stream_id", liveStreamId)
        .maybeSingle();
      if (!stream) break;

      const playbackId = event.data.playback_ids?.[0]?.id;
      const { data: videoAsset, error: videoAssetError } = await supabase
        .from("video_assets")
        .insert({
          org_id: stream.org_id,
          cohort_id: stream.cohort_id,
          required_stage_id: stream.required_stage_id,
          uploader_profile_id: stream.created_by_profile_id,
          mux_asset_id: event.data.id,
          playback_id: playbackId ?? null,
          status: "ready",
          moderation_state: "approved",
          duration_seconds: event.data.duration ?? null,
        })
        .select("id")
        .single();
      if (videoAssetError) throw videoAssetError;

      await supabase.from("live_streams").update({ video_asset_id: videoAsset.id } satisfies LiveStreamUpdate).eq("id", stream.id);
      break;
    }
    case "video.live_stream.active": {
      await supabase
        .from("live_streams")
        .update({ status: "active" } satisfies LiveStreamUpdate)
        .eq("mux_live_stream_id", event.data.id);
      break;
    }
    case "video.live_stream.idle": {
      await supabase
        .from("live_streams")
        .update({ status: "idle" } satisfies LiveStreamUpdate)
        .eq("mux_live_stream_id", event.data.id);
      break;
    }
    default:
      // Every other Mux event type (captions jobs, simulcast targets,
      // etc.) is out of scope for this app -- acknowledged and ignored.
      break;
  }

  await supabase
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("provider", "mux")
    .eq("external_event_id", event.id);

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
