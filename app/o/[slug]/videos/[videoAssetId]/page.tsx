import { requireUser } from "@/lib/session";
import { getPlaybackAuth } from "@/app/actions/video";
import { Card, ErrorText, PageHeading } from "@/components/ui";
import { VideoPlayer } from "./video-player";

export default async function WatchVideoPage({
  params,
}: {
  params: Promise<{ slug: string; videoAssetId: string }>;
}) {
  const { videoAssetId } = await params;
  await requireUser();

  // getPlaybackAuth's own RLS-scoped lookup is the actual security
  // boundary here: a member holding this id but not entitled to see it
  // (wrong org, wrong cohort, not yet approved) gets null back, not a
  // playback id/token pair -- there's nothing further this page needs
  // to check.
  const auth = await getPlaybackAuth(videoAssetId);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <PageHeading>Watch</PageHeading>
      {auth ? (
        <Card>
          <VideoPlayer playbackId={auth.playbackId} token={auth.token} />
        </Card>
      ) : (
        <ErrorText>This video isn&apos;t available.</ErrorText>
      )}
    </main>
  );
}
