import { describe, expect, it } from "vitest";
import { ORG_IDS, SEEDED_USERS, createServiceRoleClient, signInAs, signUpNewUser } from "./helpers";

// wellnessGuild, not caregiverCircle/founderCollective -- neither of
// bob/alice (caregiverCircle) nor carol (founderCollective's own
// org_owner, already used elsewhere) needs to be dragged into commerce
// state for this file's purposes; wellnessGuild's only seeded member is
// dave, so there's no seeded org_owner there at all -- exactly what's
// needed to prove org_owner-only access without an accidental match.
const WELLNESS_GUILD = ORG_IDS.wellnessGuild;

async function addRawOrgOwner(orgId: string) {
  const service = createServiceRoleClient();
  const person = await signUpNewUser(`conn-acct-owner-${Date.now()}-${Math.random().toString(36).slice(2)}@f4milia.test`);
  const { data: personUser } = await person.auth.getUser();
  const { error } = await service.from("memberships").insert({ org_id: orgId, profile_id: personUser.user!.id, role: "org_owner" });
  if (error) throw new Error(`addRawOrgOwner failed: ${error.message}`);
  return person;
}

/**
 * connected_accounts has a real unique(org_id) constraint -- one Stripe
 * account per org, by design -- and these tests share one org
 * (wellnessGuild) across `it()` blocks within this file's run with no
 * reset between them. Clearing any leftover row before each test that
 * inserts keeps them order-independent instead of colliding on that
 * constraint or masking an RLS-rejection assertion behind an unrelated
 * unique-constraint error.
 */
async function clearConnectedAccount(orgId: string) {
  const service = createServiceRoleClient();
  await service.from("connected_accounts").delete().eq("org_id", orgId);
}

describe("connected_accounts RLS (Session 13)", () => {
  it("org_owner can insert and then see their own org's connected_account; a plain member cannot see it at all", async () => {
    await clearConnectedAccount(WELLNESS_GUILD);
    const owner = await addRawOrgOwner(WELLNESS_GUILD);

    const { error: insertError } = await owner.from("connected_accounts").insert({
      org_id: WELLNESS_GUILD,
      stripe_account_id: `acct_test_${Date.now()}`,
    });
    expect(insertError).toBeNull();

    const { data: asOwner } = await owner.from("connected_accounts").select("id").eq("org_id", WELLNESS_GUILD);
    expect(asOwner).toHaveLength(1);

    const dave = await signInAs(SEEDED_USERS.dave);
    const { data: asMember } = await dave.from("connected_accounts").select("id").eq("org_id", WELLNESS_GUILD);
    expect(asMember).toHaveLength(0);
  });

  it("a plain member cannot insert a connected_account for an org they don't own", async () => {
    await clearConnectedAccount(WELLNESS_GUILD);
    const dave = await signInAs(SEEDED_USERS.dave);
    const { error } = await dave.from("connected_accounts").insert({
      org_id: WELLNESS_GUILD,
      stripe_account_id: `acct_test_reject_${Date.now()}`,
    });
    expect(error).not.toBeNull();
  });

  it("charges_enabled/payouts_enabled/requirements_due are never writable by an org_owner directly -- only the webhook (service_role) updates them", async () => {
    await clearConnectedAccount(WELLNESS_GUILD);
    const owner = await addRawOrgOwner(WELLNESS_GUILD);
    const stripeAccountId = `acct_test_${Date.now()}`;
    await owner.from("connected_accounts").insert({ org_id: WELLNESS_GUILD, stripe_account_id: stripeAccountId });

    const { error: ownerUpdateError } = await owner
      .from("connected_accounts")
      .update({ charges_enabled: true })
      .eq("org_id", WELLNESS_GUILD);
    // Rejected at the grant layer, not just filtered by RLS -- authenticated
    // was never granted UPDATE on this table at all, so this fails loud
    // (permission denied) rather than silently affecting zero rows.
    expect(ownerUpdateError).not.toBeNull();

    const service = createServiceRoleClient();
    const { data: afterOwnerAttempt } = await service
      .from("connected_accounts")
      .select("charges_enabled")
      .eq("stripe_account_id", stripeAccountId)
      .single();
    expect(afterOwnerAttempt?.charges_enabled).toBe(false);

    // The webhook path (service_role) can update it -- proving the gap is
    // "no policy for authenticated," not "the column is broken."
    const { error: serviceUpdateError } = await service
      .from("connected_accounts")
      .update({ charges_enabled: true })
      .eq("stripe_account_id", stripeAccountId);
    expect(serviceUpdateError).toBeNull();

    const { data: afterServiceUpdate } = await service
      .from("connected_accounts")
      .select("charges_enabled")
      .eq("stripe_account_id", stripeAccountId)
      .single();
    expect(afterServiceUpdate?.charges_enabled).toBe(true);
  });
});
