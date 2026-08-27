import { redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { startStripeOnboarding } from "@/app/actions/commerce";
import { Button, Card, ErrorText, PageHeader } from "@/components/ui";

export default async function CommerceSettingsPage({
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
  // Billing is org_owner scope, not organizer -- unlike Members/Cohorts/
  // etc., this doesn't extend to organizer.
  if (!currentOrg || currentOrg.role !== "org_owner") {
    redirect(`/o/${slug}`);
  }

  const { data: account } = await supabase
    .from("connected_accounts")
    .select("charges_enabled, payouts_enabled, requirements_due, disabled_reason")
    .eq("org_id", currentOrg.org_id)
    .maybeSingle();

  const status = !account ? "not_started" : account.charges_enabled ? "active" : "incomplete";

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-6">
      <PageHeader title="Commerce" />
      <p className="text-sm text-deep-slate/70">
        Dormant by default. This community can accept payments once its own Stripe account is fully set
        up -- until then, nothing here is customer-facing yet.
      </p>
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card>
        {status === "not_started" && (
          <>
            <p className="mb-4">No Stripe account connected yet.</p>
            <form action={startStripeOnboarding}>
              <input type="hidden" name="org_id" value={currentOrg.org_id} />
              <input type="hidden" name="org_slug" value={slug} />
              <Button type="submit">Start Stripe onboarding</Button>
            </form>
          </>
        )}

        {status === "incomplete" && (
          <>
            <p className="mb-2">
              <span className=" bg-terracotta/10 px-2 py-0.5 text-xs text-terracotta">Onboarding incomplete</span>
            </p>
            <p className="mb-4 text-deep-slate/70">
              Stripe still needs more information before this community can accept payments
              {account?.disabled_reason ? ` (${account.disabled_reason})` : ""}.
            </p>
            {account?.requirements_due && account.requirements_due.length > 0 && (
              <ul className="mb-4 list-inside list-disc text-sm text-deep-slate/70">
                {account.requirements_due.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <form action={startStripeOnboarding}>
              <input type="hidden" name="org_id" value={currentOrg.org_id} />
              <input type="hidden" name="org_slug" value={slug} />
              <Button type="submit">Continue onboarding</Button>
            </form>
          </>
        )}

        {status === "active" && (
          <p>
            <span className=" bg-muted px-2 py-0.5 text-xs text-baked-clay">Active</span>{" "}
            This community can accept payments. Payouts {account?.payouts_enabled ? "are" : "are not yet"}{" "}
            enabled.
          </p>
        )}
      </Card>
    </main>
  );
}
