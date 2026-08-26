import { describe, expect, it } from "vitest";
import { ORG_IDS, SEEDED_USERS, createServiceRoleClient, signInAs, signUpNewUser } from "./helpers";

// wellnessGuild, same reasoning as connected-accounts.test.ts: its only
// seeded member is dave (plain member), with no seeded staff to
// accidentally match against.
const WELLNESS_GUILD = ORG_IDS.wellnessGuild;

async function addRawOrgOwner(orgId: string) {
  const service = createServiceRoleClient();
  const person = await signUpNewUser(`products-owner-${Date.now()}-${Math.random().toString(36).slice(2)}@f4milia.test`);
  const { data: personUser } = await person.auth.getUser();
  const { error } = await service.from("memberships").insert({ org_id: orgId, profile_id: personUser.user!.id, role: "org_owner" });
  if (error) throw new Error(`addRawOrgOwner failed: ${error.message}`);
  return person;
}

async function addRawProduct(active: boolean) {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("products")
    .insert({ org_id: WELLNESS_GUILD, type: "digital", name: `Test product ${Date.now()}`, price_cents: 1000, active })
    .select("id")
    .single();
  if (error) throw new Error(`addRawProduct failed: ${error.message}`);
  return data.id;
}

describe("products RLS (Session 14)", () => {
  it("org staff can insert a product; a plain member cannot", async () => {
    const owner = await addRawOrgOwner(WELLNESS_GUILD);
    const { error: ownerError } = await owner
      .from("products")
      .insert({ org_id: WELLNESS_GUILD, type: "digital", name: "Owner's product", price_cents: 500 });
    expect(ownerError).toBeNull();

    const dave = await signInAs(SEEDED_USERS.dave);
    const { error: memberError } = await dave
      .from("products")
      .insert({ org_id: WELLNESS_GUILD, type: "digital", name: "Dave's attempt", price_cents: 500 });
    expect(memberError).not.toBeNull();
  });

  it("a plain member sees active products but not inactive ones; org staff sees both", async () => {
    const activeId = await addRawProduct(true);
    const inactiveId = await addRawProduct(false);

    const dave = await signInAs(SEEDED_USERS.dave);
    const { data: asMember } = await dave.from("products").select("id").in("id", [activeId, inactiveId]);
    expect((asMember ?? []).map((p) => p.id)).toEqual([activeId]);

    const owner = await addRawOrgOwner(WELLNESS_GUILD);
    const { data: asOwner } = await owner.from("products").select("id").in("id", [activeId, inactiveId]);
    expect((asOwner ?? []).map((p) => p.id).sort()).toEqual([activeId, inactiveId].sort());
  });
});

describe("orders/order_items RLS (Session 14)", () => {
  it("a member can insert their own order in an org they belong to, and see it back; another member cannot see it", async () => {
    const dave = await signInAs(SEEDED_USERS.dave);
    const { data: daveId } = await dave.auth.getUser();

    const { data: order, error: insertError } = await dave
      .from("orders")
      .insert({ org_id: WELLNESS_GUILD, buyer_profile_id: daveId.user!.id, total_cents: 1000, currency: "usd" })
      .select("id")
      .single();
    expect(insertError).toBeNull();

    const { data: asDave } = await dave.from("orders").select("id").eq("id", order!.id);
    expect(asDave).toHaveLength(1);

    const stranger = await signUpNewUser(`order-stranger-${Date.now()}@f4milia.test`);
    const { data: asStranger } = await stranger.from("orders").select("id").eq("id", order!.id);
    expect(asStranger).toHaveLength(0);
  });

  it("org staff can see every order in their org, not just their own", async () => {
    const dave = await signInAs(SEEDED_USERS.dave);
    const { data: daveId } = await dave.auth.getUser();
    const { data: order } = await dave
      .from("orders")
      .insert({ org_id: WELLNESS_GUILD, buyer_profile_id: daveId.user!.id, total_cents: 2000, currency: "usd" })
      .select("id")
      .single();

    const owner = await addRawOrgOwner(WELLNESS_GUILD);
    const { data: asOwner } = await owner.from("orders").select("id").eq("id", order!.id);
    expect(asOwner).toHaveLength(1);
  });

  it("cannot insert an order claiming to be someone else's, or for an org not a member of", async () => {
    const dave = await signInAs(SEEDED_USERS.dave);
    const { data: daveId } = await dave.auth.getUser();

    const { error: impersonationError } = await dave
      .from("orders")
      .insert({ org_id: WELLNESS_GUILD, buyer_profile_id: "00000000-0000-0000-0000-000000000000", total_cents: 100, currency: "usd" });
    expect(impersonationError).not.toBeNull();

    const { error: nonMemberError } = await dave
      .from("orders")
      .insert({ org_id: ORG_IDS.caregiverCircle, buyer_profile_id: daveId.user!.id, total_cents: 100, currency: "usd" });
    expect(nonMemberError).not.toBeNull();
  });

  it("the buyer can update their own order's stripe_checkout_session_id (the checkout action's own write), but that same call can never smuggle a status change through", async () => {
    const dave = await signInAs(SEEDED_USERS.dave);
    const { data: daveId } = await dave.auth.getUser();
    const { data: order } = await dave
      .from("orders")
      .insert({ org_id: WELLNESS_GUILD, buyer_profile_id: daveId.user!.id, total_cents: 4000, currency: "usd" })
      .select("id")
      .single();

    // The legitimate write: checkout.ts does exactly this right after
    // creating the real Stripe session.
    const { error: sessionIdError } = await dave
      .from("orders")
      .update({ stripe_checkout_session_id: `cs_test_${Date.now()}` })
      .eq("id", order!.id);
    expect(sessionIdError).toBeNull();

    // Caught this exact gap manually: a blanket "no UPDATE grant" broke
    // the legitimate write above; the fix was a column-scoped grant
    // (stripe_checkout_session_id only), not a broader one -- so this
    // confirms status specifically is still unreachable in the very same
    // request shape that just succeeded for the session id column.
    const { error: statusSmuggleError } = await dave
      .from("orders")
      .update({ stripe_checkout_session_id: `cs_test_${Date.now()}`, status: "paid" })
      .eq("id", order!.id);
    expect(statusSmuggleError).not.toBeNull();

    const service = createServiceRoleClient();
    const { data: after } = await service.from("orders").select("status").eq("id", order!.id).single();
    expect(after?.status).toBe("pending");
  });

  it("no authenticated caller can change an order's status directly -- only the webhook (service_role) can", async () => {
    const dave = await signInAs(SEEDED_USERS.dave);
    const { data: daveId } = await dave.auth.getUser();
    const { data: order } = await dave
      .from("orders")
      .insert({ org_id: WELLNESS_GUILD, buyer_profile_id: daveId.user!.id, total_cents: 3000, currency: "usd" })
      .select("id")
      .single();

    const { error: updateError } = await dave.from("orders").update({ status: "paid" }).eq("id", order!.id);
    expect(updateError).not.toBeNull();

    const service = createServiceRoleClient();
    const { error: serviceError } = await service.from("orders").update({ status: "paid" }).eq("id", order!.id);
    expect(serviceError).toBeNull();

    const { data: after } = await service.from("orders").select("status").eq("id", order!.id).single();
    expect(after?.status).toBe("paid");
  });

  it("order_items follow the parent order's visibility -- the buyer can insert and see their own line items", async () => {
    const dave = await signInAs(SEEDED_USERS.dave);
    const { data: daveId } = await dave.auth.getUser();
    const { data: order } = await dave
      .from("orders")
      .insert({ org_id: WELLNESS_GUILD, buyer_profile_id: daveId.user!.id, total_cents: 1000, currency: "usd" })
      .select("id")
      .single();

    const { error: itemError } = await dave
      .from("order_items")
      .insert({ order_id: order!.id, product_name: "Snapshot name", quantity: 1, unit_price_cents: 1000 });
    expect(itemError).toBeNull();

    const { data: items } = await dave.from("order_items").select("id").eq("order_id", order!.id);
    expect(items).toHaveLength(1);

    const stranger = await signUpNewUser(`order-item-stranger-${Date.now()}@f4milia.test`);
    const { data: strangerView } = await stranger.from("order_items").select("id").eq("order_id", order!.id);
    expect(strangerView).toHaveLength(0);
  });
});
