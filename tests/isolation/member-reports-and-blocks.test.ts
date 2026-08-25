import { describe, expect, it } from "vitest";
import { ORG_IDS, createServiceRoleClient, signUpNewUser } from "./helpers";

// Uses wellnessGuild, not caregiverCircle -- caregiverCircle is under
// heavy, deliberate churn from the family-member-cap tests in the same
// suite run (adding/removing dozens of memberships to probe the 12-member
// cap), and there's no functional reason for this file to share that
// contention when a quieter org is available.
const WELLNESS_GUILD = ORG_IDS.wellnessGuild;
const CAREGIVER_CIRCLE = ORG_IDS.caregiverCircle;

/**
 * Adds a fresh, disposable membership directly via the service-role client
 * and returns both the signed-in client and the membership row's own id --
 * member_blocks/member_reports key off membership id, not profile id, so
 * tests need it explicitly, unlike most other isolation tests in this
 * suite.
 */
async function addRawMember(orgId: string, emailPrefix: string, role: "member" | "organizer" | "org_owner" = "member") {
  const service = createServiceRoleClient();
  const person = await signUpNewUser(`${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@f4milia.test`);
  const { data: personUser } = await person.auth.getUser();
  const { data: membership, error } = await service
    .from("memberships")
    .insert({ org_id: orgId, profile_id: personUser.user!.id, role })
    .select("id")
    .single();
  if (error) throw new Error(`addRawMember failed: ${error.message}`);
  return { client: person, profileId: personUser.user!.id, membershipId: membership.id };
}

describe("member_blocks and member_reports (F4milia's per-community complement to Session 7's global reports/blocks)", () => {
  it("rejects a member_block whose two memberships belong to different orgs", async () => {
    const a = await addRawMember(WELLNESS_GUILD, "cross-org-blocker");
    const bInOtherOrg = await addRawMember(CAREGIVER_CIRCLE, "cross-org-blocked");
    const service = createServiceRoleClient();

    const { error } = await service.from("member_blocks").insert({
      org_id: WELLNESS_GUILD,
      blocker_membership_id: a.membershipId,
      blocked_membership_id: bInOtherOrg.membershipId,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/must be an active membership in the same org/);
  });

  it("rejects a member_report whose two memberships belong to different orgs", async () => {
    const a = await addRawMember(WELLNESS_GUILD, "cross-org-reporter");
    const bInOtherOrg = await addRawMember(CAREGIVER_CIRCLE, "cross-org-reported");
    const service = createServiceRoleClient();

    const { error } = await service.from("member_reports").insert({
      org_id: WELLNESS_GUILD,
      reporter_membership_id: a.membershipId,
      reported_membership_id: bInOtherOrg.membershipId,
      reason: "cross-org test",
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/must be an active membership in the same org/);
  });

  it("a member_block is visible only to the blocker -- not the blocked person, not org staff", async () => {
    const blocker = await addRawMember(WELLNESS_GUILD, "block-narrow-blocker");
    const blocked = await addRawMember(WELLNESS_GUILD, "block-narrow-blocked");
    const staff = await addRawMember(WELLNESS_GUILD, "block-narrow-staff", "org_owner");

    const { error: insertError } = await blocker.client.from("member_blocks").insert({
      org_id: WELLNESS_GUILD,
      blocker_membership_id: blocker.membershipId,
      blocked_membership_id: blocked.membershipId,
    });
    expect(insertError).toBeNull();

    const { data: asBlocker } = await blocker.client
      .from("member_blocks")
      .select("id")
      .eq("blocker_membership_id", blocker.membershipId);
    expect(asBlocker).toHaveLength(1);

    const { data: asBlocked } = await blocked.client
      .from("member_blocks")
      .select("id")
      .eq("blocker_membership_id", blocker.membershipId);
    expect(asBlocked).toHaveLength(0);

    // Not even org_owner gets a bypass here -- same narrowness as Session
    // 7's blocks_select, deliberately, since who someone has blocked is
    // personal safety information, not administrative data.
    const { data: asStaff } = await staff.client
      .from("member_blocks")
      .select("id")
      .eq("blocker_membership_id", blocker.membershipId);
    expect(asStaff).toHaveLength(0);
  });

  it("a member_report is visible to the reporter and to org staff, but not to an unrelated member", async () => {
    const reporter = await addRawMember(WELLNESS_GUILD, "report-visibility-reporter");
    const reported = await addRawMember(WELLNESS_GUILD, "report-visibility-reported");
    const staff = await addRawMember(WELLNESS_GUILD, "report-visibility-staff", "organizer");
    const bystander = await addRawMember(WELLNESS_GUILD, "report-visibility-bystander");

    const { error: insertError } = await reporter.client.from("member_reports").insert({
      org_id: WELLNESS_GUILD,
      reporter_membership_id: reporter.membershipId,
      reported_membership_id: reported.membershipId,
      reason: "visibility test",
    });
    expect(insertError).toBeNull();

    const { data: asReporter } = await reporter.client
      .from("member_reports")
      .select("id")
      .eq("reporter_membership_id", reporter.membershipId);
    expect(asReporter).toHaveLength(1);

    const { data: asStaff } = await staff.client
      .from("member_reports")
      .select("id")
      .eq("reporter_membership_id", reporter.membershipId);
    expect(asStaff).toHaveLength(1);

    const { data: asBystander } = await bystander.client
      .from("member_reports")
      .select("id")
      .eq("reporter_membership_id", reporter.membershipId);
    expect(asBystander).toHaveLength(0);
  });

  it("soft-deleting a membership deletes the member_blocks and member_reports it's party to, on either side", async () => {
    const a = await addRawMember(WELLNESS_GUILD, "purge-a");
    const b = await addRawMember(WELLNESS_GUILD, "purge-b");
    const service = createServiceRoleClient();

    // a blocks b, and separately reports b -- b is the target on both.
    const { error: blockError } = await service.from("member_blocks").insert({
      org_id: WELLNESS_GUILD,
      blocker_membership_id: a.membershipId,
      blocked_membership_id: b.membershipId,
    });
    expect(blockError).toBeNull();

    const { error: reportError } = await service.from("member_reports").insert({
      org_id: WELLNESS_GUILD,
      reporter_membership_id: a.membershipId,
      reported_membership_id: b.membershipId,
      reason: "purge test",
    });
    expect(reportError).toBeNull();

    // Real membership deletion in this app is always a soft-delete
    // (deleted_at set, row kept -- see docs/data-retention-policy.md), not
    // a real DELETE, so that's what this test does too: a plain DELETE
    // would prove the FK's "on delete cascade" works, not the trigger this
    // feature actually depends on in production.
    const { error: softDeleteError } = await service
      .from("memberships")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", b.membershipId);
    expect(softDeleteError).toBeNull();

    const { data: remainingBlocks } = await service
      .from("member_blocks")
      .select("id")
      .or(`blocker_membership_id.eq.${b.membershipId},blocked_membership_id.eq.${b.membershipId}`);
    expect(remainingBlocks).toHaveLength(0);

    const { data: remainingReports } = await service
      .from("member_reports")
      .select("id")
      .or(`reporter_membership_id.eq.${b.membershipId},reported_membership_id.eq.${b.membershipId}`);
    expect(remainingReports).toHaveLength(0);
  });

  it("soft-deleting the blocker's/reporter's own membership also purges their rows, not just the target's", async () => {
    const a = await addRawMember(WELLNESS_GUILD, "purge-initiator-a");
    const b = await addRawMember(WELLNESS_GUILD, "purge-initiator-b");
    const service = createServiceRoleClient();

    await service.from("member_blocks").insert({
      org_id: WELLNESS_GUILD,
      blocker_membership_id: a.membershipId,
      blocked_membership_id: b.membershipId,
    });

    const { error: softDeleteError } = await service
      .from("memberships")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", a.membershipId);
    expect(softDeleteError).toBeNull();

    const { data: remaining } = await service
      .from("member_blocks")
      .select("id")
      .eq("blocker_membership_id", a.membershipId);
    expect(remaining).toHaveLength(0);
  });
});
