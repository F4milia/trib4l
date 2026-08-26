import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/database.types";

type Json = Database["public"]["Tables"]["webhook_events"]["Insert"]["payload"];

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error: insertError } = await supabase.from("webhook_events").insert({
    provider: "stripe",
    external_event_id: event.id,
    payload: event as unknown as Json,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      // Stripe redelivers on timeout, same as Mux -- an already-seen
      // event id is the expected shape of a retry, not a real error.
      return NextResponse.json({ status: "duplicate" }, { status: 200 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  switch (event.type) {
    case "account.updated": {
      const account = event.data.object;
      const requirementsDue = account.requirements?.currently_due ?? [];
      const disabledReason = account.requirements?.disabled_reason ?? null;

      const { error } = await supabase
        .from("connected_accounts")
        .update({
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          requirements_due: requirementsDue,
          disabled_reason: disabledReason,
        })
        .eq("stripe_account_id", account.id);
      if (error) throw error;
      break;
    }
    case "checkout.session.completed": {
      const session = event.data.object;
      const orderId = session.client_reference_id;
      if (!orderId) break;

      const { error } = await supabase.from("orders").update({ status: "paid" }).eq("id", orderId);
      if (error) throw error;
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object;
      const orderId = session.client_reference_id;
      if (!orderId) break;

      // Only a still-pending order is actually expiring -- a session
      // that expired after the customer already paid (a very late
      // redelivery, or checkout.session.completed racing ahead of this
      // event) must never get overwritten back to canceled.
      const { error } = await supabase.from("orders").update({ status: "canceled" }).eq("id", orderId).eq("status", "pending");
      if (error) throw error;
      break;
    }
    default:
      // Every other Stripe event type is out of scope for this app --
      // acknowledged and ignored.
      break;
  }

  await supabase
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("provider", "stripe")
    .eq("external_event_id", event.id);

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
