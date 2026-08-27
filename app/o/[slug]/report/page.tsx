import { requireUser } from "@/lib/session";
import { createReport } from "@/app/actions/safety";
import { Button, Card, ErrorText, Label, PageHeader, Textarea } from "@/components/ui";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string; id?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { type, id, error } = await searchParams;
  const { supabase } = await requireUser();

  const { data: org } = await supabase.from("organizations").select("id").eq("slug", slug).single();

  return (
    <main className="mx-auto max-w-md px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-6">
      <PageHeader title={`Report ${type}`} />
      <p className="text-sm text-deep-slate/70">
        This goes to the organizers of this community. If it needs platform-level attention, they can
        escalate it further.
      </p>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Card>
        <form action={createReport} className="space-y-4">
          <input type="hidden" name="target_type" value={type} />
          <input type="hidden" name="target_id" value={id} />
          <input type="hidden" name="org_slug" value={slug} />
          <input type="hidden" name="org_id" value={org?.id} />
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
