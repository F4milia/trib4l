import { redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { resolveReport, escalateReport } from "@/app/actions/safety";
import { Button, Card, ErrorText, PageHeader } from "@/components/ui";

export default async function ReportsSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { supabase, user } = await requireUser();

  const orgs = await getUserOrgs(supabase, user.id);
  const currentOrg = orgs.find((o) => o.slug === slug);
  if (!currentOrg || (currentOrg.role !== "organizer" && currentOrg.role !== "org_owner")) {
    redirect(`/o/${slug}`);
  }

  const { data: reports } = await supabase
    .from("reports")
    .select("id, target_type, target_id, reason, status, created_at, profiles!reports_reporter_profile_id_fkey(display_name)")
    .eq("org_id", currentOrg.org_id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-6">
      <PageHeader title="Reports" />
      {error ? <ErrorText>{error}</ErrorText> : null}

      {reports?.length ? (
        <div className="space-y-4">
          {reports.map((r) => (
            <Card key={r.id}>
              <div className="flex items-center justify-between text-sm text-deep-slate/70">
                <span>
                  {r.target_type} reported by {r.profiles?.display_name}
                </span>
                <span className=" bg-muted px-2 py-0.5 text-xs text-baked-clay">
                  {r.status}
                </span>
              </div>
              <p className="mt-2">{r.reason}</p>
              <p className="mt-1 text-xs text-deep-slate/70">{new Date(r.created_at).toLocaleString()}</p>

              {r.status !== "resolved" && (
                <div className="mt-3 flex gap-2">
                  <form action={resolveReport}>
                    <input type="hidden" name="report_id" value={r.id} />
                    <input type="hidden" name="org_slug" value={slug} />
                    <Button type="submit">Mark resolved</Button>
                  </form>
                  {r.status !== "escalated" && (
                    <form action={escalateReport}>
                      <input type="hidden" name="report_id" value={r.id} />
                      <input type="hidden" name="org_slug" value={slug} />
                      <Button type="submit" variant="danger">
                        Escalate to platform
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-deep-slate/70">No reports.</p>
      )}
    </main>
  );
}
