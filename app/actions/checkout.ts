"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { applicationFeeAmount, assertCheckoutRateLimitNotExceeded, CheckoutRateLimitExceeded } from "@/lib/commerce";
import { withIdempotencyKey } from "@/lib/idempotency";

export async function createCheckoutSession(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const idempotencyKey = String(formData.get("idempotency_key") ?? "");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  if (!idempotencyKey) {
    redirect(`/o/${orgSlug}/shop?error=${encodeURIComponent("Could not start checkout. Please try again.")}`);
  }

  // Reads every qty_<productId> field the shop form submits, ignoring
  // anything left at zero -- this is the whole "cart": one form covering
  // the catalog, not a separately persisted cart table.
  const quantities: { productId: string; quantity: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty_")) continue;
    const quantity = parseInt(String(value), 10);
    if (Number.isFinite(quantity) && quantity > 0) {
      quantities.push({ productId: key.slice(4), quantity });
    }
  }

  if (quantities.length === 0) {
    redirect(`/o/${orgSlug}/shop?error=${encodeURIComponent("Choose at least one item.")}`);
  }

  try {
    await assertCheckoutRateLimitNotExceeded(supabase, userData.user!.id);
  } catch (err) {
    if (err instanceof CheckoutRateLimitExceeded) {
      redirect(`/o/${orgSlug}/shop?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  const { data: account } = await supabase
    .from("connected_accounts")
    .select("stripe_account_id, charges_enabled")
    .eq("org_id", orgId)
    .maybeSingle();

  if (!account?.charges_enabled) {
    redirect(`/o/${orgSlug}/shop?error=${encodeURIComponent("This community can't accept payments yet.")}`);
  }

  const productIds = quantities.map((q) => q.productId);
  const { data: products } = await supabase
    .from("products")
    .select("id, name, price_cents, currency, active")
    .eq("org_id", orgId)
    .in("id", productIds);

  const foundProducts = products ?? [];
  if (foundProducts.length !== quantities.length || foundProducts.some((p) => !p.active)) {
    redirect(`/o/${orgSlug}/shop?error=${encodeURIComponent("One or more items are no longer available.")}`);
  }

  const lineItems = quantities.map((q) => ({
    product: foundProducts.find((p) => p.id === q.productId)!,
    quantity: q.quantity,
  }));
  const currency = lineItems[0].product.currency;
  const totalCents = lineItems.reduce((sum, li) => sum + li.product.price_cents * li.quantity, 0);

  const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const stripeAccountId = account.stripe_account_id;

  const result = await withIdempotencyKey<{ checkoutUrl: string | null }>(
    supabase,
    idempotencyKey,
    JSON.stringify({ orgId, quantities }),
    async () => {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({ org_id: orgId, buyer_profile_id: userData.user!.id, total_cents: totalCents, currency })
        .select("id")
        .single();
      if (orderError) throw orderError;

      const { error: itemsError } = await supabase.from("order_items").insert(
        lineItems.map((li) => ({
          order_id: order.id,
          product_id: li.product.id,
          product_name: li.product.name,
          quantity: li.quantity,
          unit_price_cents: li.product.price_cents,
        })),
      );
      if (itemsError) throw itemsError;

      // Direct charge on the connected account: funds land in the org's
      // own Stripe balance, application_fee_amount is this platform's
      // cut, taken automatically as part of the same transaction.
      const session = await getStripe().checkout.sessions.create(
        {
          mode: "payment",
          client_reference_id: order.id,
          line_items: lineItems.map((li) => ({
            quantity: li.quantity,
            price_data: {
              currency: li.product.currency,
              unit_amount: li.product.price_cents,
              product_data: { name: li.product.name },
            },
          })),
          payment_intent_data: { application_fee_amount: applicationFeeAmount(totalCents) },
          success_url: `${origin}/o/${orgSlug}/shop?notice=${encodeURIComponent("Payment received. Thank you!")}`,
          cancel_url: `${origin}/o/${orgSlug}/shop?error=${encodeURIComponent("Checkout canceled.")}`,
        },
        { stripeAccount: stripeAccountId, idempotencyKey: `checkout_${idempotencyKey}` },
      );

      const { error: updateError } = await supabase
        .from("orders")
        .update({ stripe_checkout_session_id: session.id })
        .eq("id", order.id);
      if (updateError) throw updateError;

      return { status: 200, body: { checkoutUrl: session.url } };
    },
    userData.user!.id,
  );

  if (!result.body.checkoutUrl) {
    redirect(`/o/${orgSlug}/shop?error=${encodeURIComponent("Could not start checkout.")}`);
  }

  redirect(result.body.checkoutUrl);
}
