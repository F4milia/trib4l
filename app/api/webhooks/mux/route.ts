import { NextResponse } from "next/server";
import { getMux, MAX_VIDEO_DURATION_SECONDS } from "@/lib/mux";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/database.types";

type VideoAssetUpdate = Database["public"]["Tables"]["video_assets"]["Update"];
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
      await applyAssetPatch(
        supabase,
        { passthrough: event.data.passthrough, uploadId: event.data.upload_id, assetId: event.data.id },
        { status: "preparing" },
      );
      break;
    }
    case "video.asset.ready": {
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
      await applyAssetPatch(
        supabase,
        { passthrough: event.data.passthrough, uploadId: event.data.upload_id, assetId: event.data.id },
        { status: "errored" },
      );
      break;
    }
    default:
      // Every other Mux event type (live streams, captions jobs, etc.)
      // is out of scope for this session -- acknowledged and ignored.
      break;
  }

  await supabase
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("provider", "mux")
    .eq("external_event_id", event.id);

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
