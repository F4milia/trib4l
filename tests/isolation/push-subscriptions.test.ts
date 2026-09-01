import { afterAll, describe, expect, it } from "vitest";
import { ORG_IDS, SEEDED_USERS, signInAs } from "./helpers";

/**
 * Owed by PR 10, paid here: the push_subscriptions policies proven with real
 * JWTs rather than asserted to exist.
 *
 * A subscription is a CAPABILITY TO SEND SOMEONE A NOTIFICATION. Reading one
 * is not like reading a row of content -- it is acquiring the ability to put
 * text on another person's lock screen. So "a member cannot read another
 * member's subscription" is the claim, and pgTAP cannot make it: it runs as
 * postgres and bypasses RLS entirely.
 */

const endpoints: string[] = [];

async function subscribe(
  client: Awaited<ReturnType<typeof signInAs>>,
  orgId: string,
  membershipId: string,
) {
  const endpoint = `https://push.example/${crypto.randomUUID()}`;
  endpoints.push(endpoint);
  return client
    .from("push_subscriptions")
    .insert({
      org_id: orgId,
      membership_id: membershipId,
      endpoint,
      p256dh: "test-p256dh",
      auth: "test-auth",
    })
    .select("id, endpoint")
    .maybeSingle();
}

async function membershipOf(
  client: Awaited<ReturnType<typeof signInAs>>,
  orgId: string,
): Promise<string> {
  // Resolved by profile AND org, never by org alone: RLS lets a member read
  // every membership in their own Family, so `.eq("org_id", x).maybeSingle()`
  // sees several rows and returns none -- which reads downstream as missing
  // seed data rather than as an over-broad query.
  const { data: user } = await client.auth.getUser();
  const { data } = await client
    .from("memberships")
    .select("id")
    .eq("org_id", orgId)
    .eq("profile_id", user.user!.id)
    .maybeSingle();
  return data!.id;
}

afterAll(async () => {
  const alice = await signInAs(SEEDED_USERS.alice);
  for (const endpoint of endpoints) {
    await alice.from("push_subscriptions").delete().eq("endpoint", endpoint);
  }
});

describe("push subscription isolation", () => {
  it("lets a member register their own device -- the control", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const membership = await membershipOf(alice, ORG_IDS.caregiverCircle);
    const { data, error } = await subscribe(alice, ORG_IDS.caregiverCircle, membership);
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  }, 30_000);

  it("does not let a member read another member's subscription", async () => {
    // Bob is in the SAME Family as Alice. That is the point: sharing a Family
    // does not entitle you to someone's device. A policy scoped to the org
    // rather than to the membership would pass every other test in this file.
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);

    const aliceMembership = await membershipOf(alice, ORG_IDS.caregiverCircle);
    const { data: created } = await subscribe(
      alice,
      ORG_IDS.caregiverCircle,
      aliceMembership,
    );

    const { data: seen } = await bob
      .from("push_subscriptions")
      .select("id")
      .eq("id", created!.id)
      .maybeSingle();

    expect(seen).toBeNull();
  }, 30_000);

  it("refuses a subscription registered against someone else's membership", async () => {
    // The write side of the same claim: pointing a row at another member's
    // membership_id would redirect their notifications to this device.
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);
    const bobMembership = await membershipOf(bob, ORG_IDS.caregiverCircle);

    const { error } = await subscribe(alice, ORG_IDS.caregiverCircle, bobMembership);
    expect(error).not.toBeNull();
  }, 30_000);

  it("has no UPDATE grant, so membership_id cannot be rewritten after the fact", async () => {
    // RLS cannot restrict WHICH columns an UPDATE writes, so the defence is
    // the absence of the grant. Asserted through the API because that is where
    // it would be exercised.
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);
    const aliceMembership = await membershipOf(alice, ORG_IDS.caregiverCircle);
    const bobMembership = await membershipOf(bob, ORG_IDS.caregiverCircle);

    const { data: created } = await subscribe(
      alice,
      ORG_IDS.caregiverCircle,
      aliceMembership,
    );

    const { error } = await alice
      .from("push_subscriptions")
      .update({ membership_id: bobMembership })
      .eq("id", created!.id);

    expect(error).not.toBeNull();
  }, 30_000);

  it("lets a member remove their own device", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const membership = await membershipOf(alice, ORG_IDS.caregiverCircle);
    const { data: created } = await subscribe(alice, ORG_IDS.caregiverCircle, membership);

    const { error } = await alice
      .from("push_subscriptions")
      .delete()
      .eq("id", created!.id);
    expect(error).toBeNull();

    const { data: gone } = await alice
      .from("push_subscriptions")
      .select("id")
      .eq("id", created!.id)
      .maybeSingle();
    expect(gone).toBeNull();
  }, 30_000);
});
