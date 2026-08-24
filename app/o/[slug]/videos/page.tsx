import Link from "next/link";
import { requireUser } from "@/lib/session";
import { Button, Card, PageHeading } from "@/components/ui";

export default async function MyVideosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, user } = await requireUser();

  const { data: videos } = await supabase
    .from("video_assets")
    .select("id, status, moderation_state, duration_seconds, created_at")
    .eq("uploader_profile_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <PageHeading>My videos</PageHeading>
        <Link href={`/o/${slug}/videos/upload`}>
          <Button type="button">Upload a video</Button>
        </Link>
      </div>

      {!videos?.length ? (
        <p className="text-ink-soft">No videos yet.</p>
      ) : (
        <div className="space-y-3">
          {videos.map((v) => (
            <Card key={v.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-ink-soft">
                    {v.status}
                    {v.moderation_state !== "pending" ? ` · ${v.moderation_state}` : ""}
                    {v.duration_seconds ? ` · ${Math.round(v.duration_seconds)}s` : ""}
                  </p>
                  <p className="text-xs text-ink-soft">{new Date(v.created_at).toLocaleString()}</p>
                </div>
                {v.status === "ready" && v.moderation_state === "approved" && (
                  <Link href={`/o/${slug}/videos/${v.id}`} className="text-primary underline">
                    Watch
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
