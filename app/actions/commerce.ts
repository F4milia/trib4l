"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStripe, STANDARD_ACCOUNT_CONTROLLER } from "@/lib/stripe";

/**
 * Starts (or resumes) Stripe Connect onboarding for an org. Reuses the
 * existing Stripe account if one was already created for this org --
 * account links are single-use and short-lived, so "continue onboarding"
 * always needs a fresh one, not the original.
 */
export async function startStripeOnboarding(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: existing } = await supabase
    .from("connected_accounts")
    .select("stripe_account_id")
    .eq("org_id", orgId)
    .maybeSingle();

  const stripe = getStripe();
  let stripeAccountId = existing?.stripe_account_id;

  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      controller: STANDARD_ACCOUNT_CONTROLLER,
    });
    stripeAccountId = account.id;

    const { error } = await supabase.from("connected_accounts").insert({
      org_id: orgId,
      stripe_account_id: stripeAccountId,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
    });
    if (error) {
      redirect(`/o/${orgSlug}/settings/commerce?error=${encodeURIComponent(error.message)}`);
    }
  }

  // Account links need an absolute URL -- Vercel sets VERCEL_URL
  // automatically for both Preview and Production deployments, so this
  // needs no manual per-environment config, unlike a hand-maintained env
  // var that'd drift the moment a new Preview URL gets minted.
  const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    type: "account_onboarding",
    refresh_url: `${origin}/o/${orgSlug}/settings/commerce`,
    return_url: `${origin}/o/${orgSlug}/settings/commerce`,
  });

  redirect(accountLink.url);
}
