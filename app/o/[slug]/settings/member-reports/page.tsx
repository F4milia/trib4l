import { redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { resolveMemberReport } from "@/app/actions/member-safety";
import { Button, Card, ErrorText, PageHeading } from "@/components/ui";

export default async function MemberReportsSettingsPage({
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
    .from("member_reports")
    .select(
      "id, reason, status, created_at, reporter:memberships!member_reports_reporter_membership_id_fkey(profiles(display_name)), reported:memberships!member_reports_reported_membership_id_fkey(profiles(display_name))",
    )
    .eq("org_id", currentOrg.org_id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <PageHeading>Member reports</PageHeading>
      <p className="text-sm text-ink-soft">
        Reports filed against a specific member of this community — separate from the platform-wide
        Reports list, and with no escalation path off this page.
      </p>
      {error ? <ErrorText>{error}</ErrorText> : null}

      {reports?.length ? (
        <div className="space-y-4">
          {reports.map((r) => (
            <Card key={r.id}>
              <div className="flex items-center justify-between text-sm text-ink-soft">
                <span>
                  {r.reported?.profiles?.display_name} reported by {r.reporter?.profiles?.display_name}
                </span>
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary-dark">
                  {r.status}
                </span>
              </div>
              <p className="mt-2">{r.reason}</p>
              <p className="mt-1 text-xs text-ink-soft">{new Date(r.created_at).toLocaleString()}</p>

              {r.status !== "resolved" && (
                <div className="mt-3">
                  <form action={resolveMemberReport}>
                    <input type="hidden" name="report_id" value={r.id} />
                    <input type="hidden" name="org_slug" value={slug} />
                    <Button type="submit">Mark resolved</Button>
                  </form>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-ink-soft">No member reports.</p>
      )}
    </main>
  );
}
