import { describe, expect, it } from "vitest";
import { ORG_IDS, SEEDED_USERS, signInAs } from "./helpers";

describe("org isolation", () => {
  it("a member cannot read another org's row", async () => {
    // Bob is organizer of caregiver-circle only.
    const bob = await signInAs(SEEDED_USERS.bob);

    const { data: ownOrg } = await bob
      .from("organizations")
      .select("id")
      .eq("id", ORG_IDS.caregiverCircle)
      .maybeSingle();
    expect(ownOrg?.id).toBe(ORG_IDS.caregiverCircle);

    const { data: otherOrg } = await bob
      .from("organizations")
      .select("id")
      .eq("id", ORG_IDS.founderCollective)
      .maybeSingle();
    expect(otherOrg).toBeNull();
  });

  it("an organizer cannot read another org's membership rows", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);

    const { data: ownMemberships } = await bob
      .from("memberships")
      .select("org_id")
      .eq("org_id", ORG_IDS.caregiverCircle);
    expect(ownMemberships?.length).toBeGreaterThan(0);

    const { data: otherMemberships } = await bob
      .from("memberships")
      .select("org_id")
      .eq("org_id", ORG_IDS.wellnessGuild);
    expect(otherMemberships).toEqual([]);
  });

  it("a user in two orgs sees exactly those two orgs and nothing from a third", async () => {
    // Alice: member of caregiver-circle, mentor of founder-collective. Not
    // in wellness-guild at all.
    const alice = await signInAs(SEEDED_USERS.alice);

    const { data: orgs, error } = await alice.from("organizations").select("id").order("id");
    expect(error).toBeNull();

    const orgIds = (orgs ?? []).map((o) => o.id).sort();
    expect(orgIds).toEqual([ORG_IDS.caregiverCircle, ORG_IDS.founderCollective].sort());
    expect(orgIds).not.toContain(ORG_IDS.wellnessGuild);
  });

  it("org_profiles are scoped the same way -- Alice's two per-org identities, no third", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);

    const { data: orgProfiles } = await alice.from("org_profiles").select("org_id, display_name");
    const orgIds = (orgProfiles ?? []).map((p) => p.org_id).sort();

    expect(orgIds).toEqual([ORG_IDS.caregiverCircle, ORG_IDS.founderCollective].sort());
  });
});
