import { redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { createMemberReport } from "@/app/actions/member-safety";
import { Button, Card, ErrorText, Label, PageHeader, Textarea } from "@/components/ui";

export default async function ReportMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ membership_id?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { membership_id, error } = await searchParams;
  const { supabase, user } = await requireUser();

  const orgs = await getUserOrgs(supabase, user.id);
  const currentOrg = orgs.find((o) => o.slug === slug);
  if (!currentOrg || !membership_id) redirect(`/o/${slug}/members`);

  return (
    <main className="mx-auto max-w-md px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-6">
      <PageHeader title="Report this member" />
      <p className="text-sm text-deep-slate/70">
        This goes to this community&apos;s organizers only — it stays inside this community, and is
        separate from platform-wide reporting.
      </p>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Card>
        <form action={createMemberReport} className="space-y-4">
          <input type="hidden" name="org_id" value={currentOrg.org_id} />
          <input type="hidden" name="org_slug" value={slug} />
          <input type="hidden" name="reported_membership_id" value={membership_id} />
          <div>
            <Label htmlFor="reason">What&apos;s going on?</Label>
            <Textarea id="reason" name="reason" required rows={4} />
          </div>
          <Button type="submit" className="w-full">
            Send report
          </Button>
        </form>
      </Card>
    </main>
  );
}
