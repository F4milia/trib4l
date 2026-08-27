import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { createLiveStream } from "@/app/actions/live-streams";
import { RTMP_INGEST_URL } from "@/lib/mux";
import { Button, Card, ErrorText, Input, Label, PageHeader, Select } from "@/components/ui";

export default async function LiveStreamsSettingsPage({
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

  const { data: cohorts } = await supabase
    .from("cohorts")
    .select("id, name")
    .eq("org_id", currentOrg.org_id)
    .order("name");

  const { data: stages } = await supabase
    .from("stages")
    .select("id, name")
    .eq("org_id", currentOrg.org_id)
    .order("sort_order");

  const { data: streams } = await supabase
    .from("live_streams")
    .select("id, title, status, video_asset_id")
    .eq("org_id", currentOrg.org_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const streamIds = (streams ?? []).map((s) => s.id);
  const { data: credentials } = streamIds.length
    ? await supabase.from("live_stream_credentials").select("live_stream_id, stream_key").in("live_stream_id", streamIds)
    : { data: [] };
  const keyByStreamId = new Map((credentials ?? []).map((c) => [c.live_stream_id, c.stream_key]));

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-8">
      <PageHeader title="Live streams" />
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card>
        <h2 className="mb-3 text-xl">Create a live stream</h2>
        <form action={createLiveStream} className="space-y-3">
          <input type="hidden" name="org_id" value={currentOrg.org_id} />
          <input type="hidden" name="org_slug" value={slug} />
          <div>
            <Label htmlFor="live-title">Title</Label>
            <Input type="text" name="title" id="live-title" required />
          </div>
          <div>
            <Label htmlFor="live-description">Description</Label>
            <Input type="text" name="description" id="live-description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="live-cohort">Cohort (optional)</Label>
              <Select name="cohort_id" id="live-cohort" defaultValue="">
                <option value="">Org-wide</option>
                {cohorts?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="live-stage">Stage gate (optional)</Label>
              <Select name="required_stage_id" id="live-stage" defaultValue="">
                <option value="">No stage gate</option>
                {stages?.map((s) => (
                  <option key={s.id} value={s.id}>
                    Requires: {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Button type="submit">Create</Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-xl">Your streams</h2>
        {streams?.length ? (
          <div className="space-y-4">
            {streams.map((s) => (
              <div key={s.id} className="border-t border-deep-slate/20 pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {s.title} <span className="text-sm text-deep-slate/70">— {s.status}</span>
                  </p>
                  <Link href={`/o/${slug}/live/${s.id}`} className="text-sm text-terracotta underline">
                    View
                  </Link>
                </div>
                {keyByStreamId.has(s.id) && (
                  <div className="mt-1 text-sm text-deep-slate/70">
                    <p>
                      RTMP URL: <code className="text-deep-slate">{RTMP_INGEST_URL}</code>
                    </p>
                    <p>
                      Stream key: <code className="text-deep-slate">{keyByStreamId.get(s.id)}</code>
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-deep-slate/70">None yet.</p>
        )}
      </Card>
    </main>
  );
}
