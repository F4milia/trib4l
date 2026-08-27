import { requireUser, getUserOrgs } from "@/lib/session";
import { createVideoUpload } from "@/app/actions/video";
import { Button, Card, ErrorText, PageHeader, Select } from "@/components/ui";
import { VideoFileUploader } from "./video-file-uploader";

export default async function UploadVideoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; upload_url?: string; video_asset_id?: string }>;
}) {
  const { slug } = await params;
  const { error, upload_url: uploadUrl } = await searchParams;
  const { supabase } = await requireUser();

  const orgs = await getUserOrgs(supabase, (await supabase.auth.getUser()).data.user!.id);
  const currentOrg = orgs.find((o) => o.slug === slug);

  const { data: cohorts } = currentOrg
    ? await supabase.from("cohorts").select("id, name").eq("org_id", currentOrg.org_id).order("name")
    : { data: [] };

  return (
    <main className="mx-auto max-w-xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-6">
      <PageHeader title="Upload a video" />
      {error ? <ErrorText>{error}</ErrorText> : null}

      {uploadUrl ? (
        <Card>
          <VideoFileUploader uploadUrl={uploadUrl} orgSlug={slug} videosPath={`/o/${slug}/videos`} />
        </Card>
      ) : (
        <Card>
          <form action={createVideoUpload} className="space-y-3">
            <input type="hidden" name="org_id" value={currentOrg?.org_id ?? ""} />
            <input type="hidden" name="org_slug" value={slug} />
            <div>
              <Select name="cohort_id" defaultValue="">
                <option value="">Org-wide</option>
                {cohorts?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit">Start upload</Button>
          </form>
        </Card>
      )}
    </main>
  );
}
