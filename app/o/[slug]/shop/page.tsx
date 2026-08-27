import { redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { createCheckoutSession } from "@/app/actions/checkout";
import { Button, Card, ErrorText, PageHeader } from "@/components/ui";

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { slug } = await params;
  const { error, notice } = await searchParams;
  const { supabase, user } = await requireUser();

  const orgs = await getUserOrgs(supabase, user.id);
  const currentOrg = orgs.find((o) => o.slug === slug);
  if (!currentOrg) redirect("/");

  const { data: account } = await supabase
    .from("connected_accounts")
    .select("charges_enabled")
    .eq("org_id", currentOrg.org_id)
    .maybeSingle();

  const { data: products } = await supabase
    .from("products")
    .select("id, name, description, price_cents, currency")
    .eq("org_id", currentOrg.org_id)
    .eq("active", true)
    .order("created_at");

  // Generated fresh per page load, resubmitted as-is on a retry -- this
  // is the client-supplied key withIdempotencyKey uses to make a
  // double-tapped submit (or a Stripe API retry) safe.
  const idempotencyKey = crypto.randomUUID();

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-6">
      <PageHeader title="Shop" />
      {!account?.charges_enabled && (
        <p className="text-sm text-deep-slate/70">This community can&apos;t accept payments yet.</p>
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {notice ? <p className=" bg-muted px-3 py-2 text-sm text-baked-clay">{notice}</p> : null}

      <Card>
        {products?.length ? (
          <form action={createCheckoutSession} className="space-y-4">
            <input type="hidden" name="org_id" value={currentOrg.org_id} />
            <input type="hidden" name="org_slug" value={slug} />
            <input type="hidden" name="idempotency_key" value={idempotencyKey} />
            <ul className="divide-y divide-deep-slate/15">
              {products.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p>{p.name}</p>
                    {p.description ? <p className="text-sm text-deep-slate/70">{p.description}</p> : null}
                    <p className="text-sm text-deep-slate/70">
                      ${(p.price_cents / 100).toFixed(2)} {p.currency.toUpperCase()}
                    </p>
                  </div>
                  <input
                    type="number"
                    name={`qty_${p.id}`}
                    min="0"
                    defaultValue="0"
                    className="w-20 border border-deep-slate/20 bg-parchment px-2 py-1 text-deep-slate focus:border-terracotta focus:outline-none"
                  />
                </li>
              ))}
            </ul>
            <Button type="submit" className="w-full" disabled={!account?.charges_enabled}>
              Checkout
            </Button>
          </form>
        ) : (
          <p className="text-deep-slate/70">Nothing for sale here yet.</p>
        )}
      </Card>
    </main>
  );
}
