import { redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { moderateVideoAsset } from "@/app/actions/video";
import { Button, Card, ErrorText, PageHeader } from "@/components/ui";

export default async function VideosSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { supabase } = await requireUser();

  const orgs = await getUserOrgs(supabase, (await supabase.auth.getUser()).data.user!.id);
  const currentOrg = orgs.find((o) => o.slug === slug);
  if (!currentOrg || (currentOrg.role !== "organizer" && currentOrg.role !== "org_owner")) {
    redirect(`/o/${slug}`);
  }

  const { data: videos } = await supabase
    .from("video_assets")
    .select("id, status, moderation_state, duration_seconds, created_at, profiles(display_name)")
    .eq("org_id", currentOrg.org_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-6">
      <PageHeader title="Videos" />
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card>
        {videos?.length ? (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-deep-slate/20 text-deep-slate/70">
                <th className="py-2 font-medium">Uploader</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Moderation</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-deep-slate/15">
              {videos.map((v) => (
                <tr key={v.id}>
                  <td className="py-2">{v.profiles?.display_name}</td>
                  <td className="py-2 text-deep-slate/70">{v.status}</td>
                  <td className="py-2 text-deep-slate/70">{v.moderation_state}</td>
                  <td className="py-2">
                    {v.moderation_state === "approved" && (
                      <form action={moderateVideoAsset}>
                        <input type="hidden" name="video_asset_id" value={v.id} />
                        <input type="hidden" name="org_slug" value={slug} />
                        <Button type="submit" variant="danger">
                          Remove
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-deep-slate/70">None yet.</p>
        )}
      </Card>
    </main>
  );
}
