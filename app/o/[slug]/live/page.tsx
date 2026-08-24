import Link from "next/link";
import { requireUser, getUserOrgs } from "@/lib/session";
import { Card, PageHeading } from "@/components/ui";

export default async function LiveLibraryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, user } = await requireUser();

  const orgs = await getUserOrgs(supabase, user.id);
  const currentOrg = orgs.find((o) => o.slug === slug);
  const orgId = currentOrg?.org_id ?? "";

  // RLS (can_see_gated_content) already scopes this to what the viewer
  // is actually entitled to see -- org-wide or their own cohort, at or
  // past whatever stage gate is set. Nothing further to filter here.
  const { data: streams } = await supabase
    .from("live_streams")
    .select("id, title, description, status, video_asset_id")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <PageHeading>Live &amp; recordings</PageHeading>

      {!streams?.length ? (
        <p className="text-ink-soft">Nothing here yet.</p>
      ) : (
        <div className="space-y-4">
          {streams.map((s) => (
            <Card key={s.id}>
              <p className="font-medium">{s.title}</p>
              {s.description && <p className="mt-1 text-sm">{s.description}</p>}
              <p className="mt-2 text-sm text-ink-soft">
                {s.status === "active" ? "Live now" : s.video_asset_id ? "Recording available" : "Not live yet"}
              </p>
              {(s.status === "active" || s.video_asset_id) && (
                <Link href={`/o/${slug}/live/${s.id}`} className="mt-2 inline-block text-sm text-primary underline">
                  Watch
                </Link>
              )}
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
