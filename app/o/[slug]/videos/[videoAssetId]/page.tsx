import { requireUser } from "@/lib/session";
import { getPlaybackUrl } from "@/app/actions/video";
import { Card, ErrorText, PageHeading } from "@/components/ui";

export default async function WatchVideoPage({
  params,
}: {
  params: Promise<{ slug: string; videoAssetId: string }>;
}) {
  const { videoAssetId } = await params;
  await requireUser();

  // getPlaybackUrl's own RLS-scoped lookup is the actual security
  // boundary here: a member holding this id but not entitled to see it
  // (wrong org, wrong cohort, not yet approved) gets null back, not a
  // playback URL -- there's nothing further this page needs to check.
  const playbackUrl = await getPlaybackUrl(videoAssetId);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <PageHeading>Watch</PageHeading>
      {playbackUrl ? (
        <Card>
          <video src={playbackUrl} controls className="w-full rounded-md" />
        </Card>
      ) : (
        <ErrorText>This video isn&apos;t available.</ErrorText>
      )}
    </main>
  );
}
