import { requireUser } from "@/lib/session";
import { createReport } from "@/app/actions/safety";
import { Button, Card, ErrorText, Label, PageHeader, Textarea } from "@/components/ui";
import { notFound } from "next/navigation";

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
  // RLS hides an org from a non-member, so this returns null both for "does not
  // exist" and for "exists, you are not in it" -- indistinguishable on purpose
  // (invariant 1).
  //
  // Defence in depth, not a user-visible fix: the layout's notFound() already
  // answers 404 for every route under /o/[slug], verified by reverting this
  // guard and watching tests/e2e/dual-family.spec.ts stay green. What it does
  // remove is a real server-side exception -- this page previously read
  // `org!.id` and threw on every non-member request, logged and swallowed
  // because the layout won the race. A page should not depend on a
  // parallel-rendered layout for its own null-safety.
  if (!org) notFound();

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
          <input type="hidden" name="org_id" value={org.id} />
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
