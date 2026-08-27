import { requireUser } from "@/lib/session";
import { getLiveStreamPlaybackAuth } from "@/app/actions/live-streams";
import { getPlaybackAuth } from "@/app/actions/video";
import { Card, ErrorText, PageHeader } from "@/components/ui";
import { VideoPlayer } from "@/components/video-player";

export default async function WatchLiveStreamPage({
  params,
}: {
  params: Promise<{ slug: string; liveStreamId: string }>;
}) {
  const { liveStreamId } = await params;
  const { supabase } = await requireUser();

  // A stream that's currently live and one that's already archived are
  // both entitlement-checked (can_see_gated_content, live_streams'
  // own RLS-scoped lookup below) before either playback path runs --
  // there's nothing further this page needs to check either way.
  const liveAuth = await getLiveStreamPlaybackAuth(liveStreamId);

  if (liveAuth) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-6">
        <PageHeader title="Live" />
        <Card>
          <VideoPlayer playbackId={liveAuth.playbackId} token={liveAuth.token} live />
        </Card>
      </main>
    );
  }

  // Not currently live -- if it already archived into the VOD library,
  // this reuses the exact same entitlement check and player as Session
  // 11's video watch page rather than a parallel implementation.
  const { data: stream } = await supabase
    .from("live_streams")
    .select("video_asset_id")
    .eq("id", liveStreamId)
    .maybeSingle();

  const vodAuth = stream?.video_asset_id ? await getPlaybackAuth(stream.video_asset_id) : null;

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-6">
      <PageHeader title={vodAuth ? "Recording" : "Live"} />
      {vodAuth ? (
        <Card>
          <VideoPlayer playbackId={vodAuth.playbackId} token={vodAuth.token} />
        </Card>
      ) : (
        <ErrorText>This isn&apos;t available right now.</ErrorText>
      )}
    </main>
  );
}
