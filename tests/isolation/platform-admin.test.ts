import { describe, expect, it } from "vitest";
import { withAdminAudit } from "../../lib/audit";
import { ORG_IDS, SEEDED_USERS, currentAal, elevateToAal2, signInAs } from "./helpers";

describe("platform_admin bypass and MFA gating", () => {
  it("platform_staff membership alone (aal1) does not grant the bypass", async () => {
    const erin = await signInAs(SEEDED_USERS.erin);
    expect(await currentAal(erin)).toBe("aal1");

    // Erin has no memberships of her own, so without the bypass she should
    // see zero organizations.
    const { data: orgs } = await erin.from("organizations").select("id");
    expect(orgs).toEqual([]);
  });

  it("elevating to aal2 (MFA-verified) unlocks the platform_admin bypass", async () => {
    const erin = await signInAs(SEEDED_USERS.erin);
    await elevateToAal2(erin);
    expect(await currentAal(erin)).toBe("aal2");

    const { data: orgs, error } = await erin.from("organizations").select("id").order("id");
    expect(error).toBeNull();

    const orgIds = (orgs ?? []).map((o) => o.id).sort();
    expect(orgIds).toEqual(
      [ORG_IDS.caregiverCircle, ORG_IDS.founderCollective, ORG_IDS.wellnessGuild].sort(),
    );
  });

  it("a non-staff org role does not get the bypass even at aal2", async () => {
    // Confirms the bypass checks platform_staff membership, not just aal --
    // Bob is a plain organizer, MFA-verified or not doesn't matter for him.
    const bob = await signInAs(SEEDED_USERS.bob);
    await elevateToAal2(bob);

    const { data: orgs } = await bob.from("organizations").select("id");
    expect(orgs?.map((o) => o.id)).toEqual([ORG_IDS.caregiverCircle]);
  });

  it("withAdminAudit writes the audit row before the wrapped read runs", async () => {
    const frank = await signInAs(SEEDED_USERS.frank);
    await elevateToAal2(frank);

    const before = new Date().toISOString();

    const orgs = await withAdminAudit(
      frank,
      "admin_list_organizations",
      { type: "organizations" },
      async () => {
        const { data } = await frank.from("organizations").select("id");
        return data ?? [];
      },
    );
    expect(orgs.length).toBe(3);

    const { data: userData } = await frank.auth.getUser();
    const { data: logRows, error } = await frank
      .from("audit_log")
      .select("action, target_type, actor_profile_id, created_at")
      .eq("actor_profile_id", userData!.user!.id)
      .eq("action", "admin_list_organizations")
      .gte("created_at", before)
      .order("created_at", { ascending: false })
      .limit(1);

    expect(error).toBeNull();
    expect(logRows?.length).toBe(1);
    expect(logRows?.[0].target_type).toBe("organizations");
  });
});
