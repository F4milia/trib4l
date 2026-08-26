import { redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { createProduct, toggleProductActive } from "@/app/actions/products";
import { Button, Card, ErrorText, Label, PageHeading, Select } from "@/components/ui";

export default async function ProductsSettingsPage({
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

  const { data: account } = await supabase
    .from("connected_accounts")
    .select("charges_enabled")
    .eq("org_id", currentOrg.org_id)
    .maybeSingle();

  const { data: products } = await supabase
    .from("products")
    .select("id, type, name, price_cents, currency, active")
    .eq("org_id", currentOrg.org_id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <PageHeading>Products</PageHeading>
      {!account?.charges_enabled && (
        <p className="text-sm text-ink-soft">
          This community can&apos;t accept payments yet -- products can be listed here, but checkout stays
          disabled until{" "}
          <a href={`/o/${slug}/settings/commerce`} className="underline">
            Stripe onboarding
          </a>{" "}
          is complete.
        </p>
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card>
        <h2 className="mb-3 text-xl">Add a product</h2>
        <form action={createProduct} className="space-y-4">
          <input type="hidden" name="org_id" value={currentOrg.org_id} />
          <input type="hidden" name="org_slug" value={slug} />
          <div>
            <Label htmlFor="product-name">Name</Label>
            <input
              id="product-name"
              name="name"
              required
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-ink placeholder:text-ink-soft focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <Label htmlFor="product-type">Type</Label>
            <Select name="type" id="product-type" defaultValue="digital">
              <option value="digital">Digital</option>
              <option value="physical">Physical</option>
              <option value="ticket">Ticket</option>
              <option value="cohort_seat">Cohort seat</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="product-price">Price (USD)</Label>
            <input
              id="product-price"
              name="price"
              type="number"
              min="0"
              step="0.01"
              required
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-ink placeholder:text-ink-soft focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <Label htmlFor="product-description">Description</Label>
            <textarea
              id="product-description"
              name="description"
              rows={3}
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-ink placeholder:text-ink-soft focus:border-primary focus:outline-none"
            />
          </div>
          <Button type="submit">Add product</Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-xl">Catalog</h2>
        {products?.length ? (
          <ul className="divide-y divide-line">
            {products.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <div>
                  <span>{p.name}</span>
                  <span className="ml-2 text-sm text-ink-soft">
                    {p.type} · ${(p.price_cents / 100).toFixed(2)} {p.currency.toUpperCase()}
                    {!p.active ? " · inactive" : ""}
                  </span>
                </div>
                <form action={toggleProductActive}>
                  <input type="hidden" name="product_id" value={p.id} />
                  <input type="hidden" name="org_slug" value={slug} />
                  <input type="hidden" name="next_active" value={(!p.active).toString()} />
                  <Button type="submit" variant="ghost">
                    {p.active ? "Deactivate" : "Activate"}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-soft">No products yet.</p>
        )}
      </Card>
    </main>
  );
}
