import { afterEach, describe, expect, it } from "vitest";
import { ORG_IDS, SEEDED_USERS, createServiceRoleClient, signInAs, signUpNewUser } from "./helpers";
import { assertFamilyMemberCapNotExceeded, FamilyMemberCapExceeded } from "../../lib/family-cap";

const CAREGIVER_CIRCLE = ORG_IDS.caregiverCircle;

/**
 * Every membership and invitation this file creates, removed after each test.
 *
 * WITHOUT THIS THE FILE IS NOT RE-RUNNABLE, and the way it failed was not the
 * way you would guess. It does not merely leave rows behind: the
 * designate-a-mentor test PERMANENTLY CONVERTS a plain member into a mentor,
 * and freeOneCapSlot DELETES non-mentor rows to get back to the boundary. So
 * each run consumed the org's plain members and accumulated mentors, until a
 * second run failed with "no spendable plain member found in caregiverCircle"
 * -- an error about the fixture, three steps downstream of the cause.
 *
 * Measured on the shared stack before this fix: caregiver-circle held THREE
 * orphaned mentors and ZERO plain members, and alice's seeded role had drifted
 * from member to organizer. That last one is not this file's doing, but it is
 * the same class, and it breaks every other file that assumes she is a plain
 * member.
 *
 * Q4's edge case is "run the suite twice; run 2 passes on run 1's residue".
 * Cleaning up here is what makes that true for this file.
 */
const createdProfileIds: string[] = [];
const createdInvitationEmails: string[] = [];

afterEach(async () => {
  const service = createServiceRoleClient();
  for (const profileId of createdProfileIds.splice(0)) {
    await service
      .from("memberships")
      .delete()
      .eq("org_id", CAREGIVER_CIRCLE)
      .eq("profile_id", profileId);
  }
  for (const email of createdInvitationEmails.splice(0)) {
    await service.from("invitations").delete().eq("org_id", CAREGIVER_CIRCLE).eq("email", email);
  }
});

/**
 * Adds a fresh, disposable member directly via the service-role client
 * (bypassing invite/accept -- speed only, this isn't what's under test).
 * Returns their profile id.
 */
async function addRawMember(emailPrefix: string, role: "member" | "mentor" = "member") {
  const service = createServiceRoleClient();
  const person = await signUpNewUser(`${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@f4milia.test`);
  const { data: personUser } = await person.auth.getUser();
  const { error } = await service.from("memberships").insert({ org_id: CAREGIVER_CIRCLE, profile_id: personUser.user!.id, role });
  if (error) throw new Error(`addRawMember failed: ${error.message}`);
  createdProfileIds.push(personUser.user!.id);
  return personUser.user!.id;
}

/**
 * Adds a fresh, disposable org_owner membership and returns a client
 * signed in as them. designate_mentor's own RLS (memberships_update)
 * requires the caller to hold org_owner in that org -- caregiverCircle's
 * only seeded users are bob (organizer) and alice (plain member), neither
 * of whom qualifies, and there's no seeded org_owner for this org at all.
 * A throwaway org_owner sidesteps both promoting a real seeded user's
 * role and depending on is_platform_admin().
 */
async function addTemporaryOrgOwner() {
  const service = createServiceRoleClient();
  const person = await signUpNewUser(`cap-temp-owner-${Date.now()}-${Math.random().toString(36).slice(2)}@f4milia.test`);
  const { data: personUser } = await person.auth.getUser();
  const { error } = await service.from("memberships").insert({ org_id: CAREGIVER_CIRCLE, profile_id: personUser.user!.id, role: "org_owner" });
  if (error) throw new Error(`addTemporaryOrgOwner failed: ${error.message}`);
  createdProfileIds.push(personUser.user!.id);
  return person;
}

/**
 * Tops caregiverCircle up to exactly at-cap by calling the real function
 * under test as its own oracle, rather than assuming a starting count --
 * this shared seeded org is used by several other test files in the
 * same run, so its exact member count at any given moment is never a
 * safe assumption (this is the same class of pollution that broke the
 * earlier database-trigger version of this cap).
 */
async function fillToCap(bob: Awaited<ReturnType<typeof signInAs>>) {
  const addedProfileIds: string[] = [];
  for (let i = 0; i < 50; i++) {
    try {
      await assertFamilyMemberCapNotExceeded(bob, CAREGIVER_CIRCLE, "member");
    } catch (err) {
      if (err instanceof FamilyMemberCapExceeded) return addedProfileIds;
      throw err;
    }
    addedProfileIds.push(await addRawMember(`cap-fill-${i}`));
  }
  throw new Error("fillToCap did not reach the cap within 50 iterations -- something is wrong");
}

/**
 * Finds one existing non-mentor membership row to act on, skipping the
 * profile ids in `excludeProfileIds` -- always pass bob's own id (removing
 * his own membership would make him fail is_org_member(CAREGIVER_CIRCLE)
 * and lose visibility into the whole org's rows, breaking every later
 * assertion in this file) and alice's (the only other permanently-seeded
 * caregiverCircle member -- other test files rely on her staying a plain
 * member there, so she isn't this test's disposable data to spend). Every
 * other non-mentor row in this org is either a `cap-fill-*` throwaway this
 * file's own fillToCap created, or an equivalent throwaway some other test
 * file left behind, both fair game.
 */
async function pickAnyNonMentorMemberId(excludeProfileIds: string[]): Promise<string> {
  const service = createServiceRoleClient();
  let query = service
    .from("memberships")
    .select("profile_id")
    .eq("org_id", CAREGIVER_CIRCLE)
    .is("deleted_at", null)
    .neq("role", "mentor");
  for (const id of excludeProfileIds) {
    query = query.neq("profile_id", id);
  }
  const { data } = await query.limit(1).maybeSingle();
  if (!data) throw new Error("no spendable non-mentor member found in caregiverCircle");
  return data.profile_id;
}

/**
 * Same as pickAnyNonMentorMemberId, but restricted to plain 'member' rows
 * -- designate_mentor (below) requires its target to already hold that
 * exact role, so an organizer/org_owner row wouldn't qualify.
 */
async function pickAnyPlainMemberId(excludeProfileIds: string[]): Promise<string> {
  const service = createServiceRoleClient();
  let query = service
    .from("memberships")
    .select("profile_id")
    .eq("org_id", CAREGIVER_CIRCLE)
    .is("deleted_at", null)
    .eq("role", "member");
  for (const id of excludeProfileIds) {
    query = query.neq("profile_id", id);
  }
  const { data } = await query.limit(1).maybeSingle();
  if (!data) throw new Error("no spendable plain member found in caregiverCircle");
  return data.profile_id;
}

/**
 * Frees exactly one cap slot by calling the real function under test as
 * its own oracle, the same pattern fillToCap uses in the other direction.
 * Deleting a fixed guess of "one membership" only works if the org
 * happens to be sitting exactly at the boundary -- under ambient
 * pollution from other test files it can be well over, so this deletes
 * one non-mentor member at a time and re-checks, stopping the moment the
 * oracle resolves. Each deletion removes exactly one row, so the count
 * decreases by exactly one per iteration -- it cannot overshoot past the
 * boundary, regardless of where the ambient count started.
 */
async function freeOneCapSlot(bob: Awaited<ReturnType<typeof signInAs>>, excludeProfileIds: string[]): Promise<void> {
  const service = createServiceRoleClient();
  for (let i = 0; i < 50; i++) {
    try {
      await assertFamilyMemberCapNotExceeded(bob, CAREGIVER_CIRCLE, "member");
      return;
    } catch (err) {
      if (!(err instanceof FamilyMemberCapExceeded)) throw err;
    }
    const targetId = await pickAnyNonMentorMemberId(excludeProfileIds);
    await service.from("memberships").delete().eq("org_id", CAREGIVER_CIRCLE).eq("profile_id", targetId);
  }
  throw new Error("freeOneCapSlot could not free a slot within 50 iterations -- something is wrong");
}

describe("Family member cap (app-layer, F4milia retroactive fix item 0.2)", () => {
  it("rejects a member-role invite at the cap, but not a mentor-role one at the same count", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    await fillToCap(bob);

    await expect(assertFamilyMemberCapNotExceeded(bob, CAREGIVER_CIRCLE, "member")).rejects.toBeInstanceOf(FamilyMemberCapExceeded);

    // Mentor is explicitly excluded from the count -- not blocked at the
    // exact same org state that just rejected a member-role attempt.
    await expect(assertFamilyMemberCapNotExceeded(bob, CAREGIVER_CIRCLE, "mentor")).resolves.toBeUndefined();
  });

  it("counts pending invitations toward the cap, not just accepted memberships", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();
    const alice = await signInAs(SEEDED_USERS.alice);
    const { data: aliceId } = await alice.auth.getUser();
    await fillToCap(bob);

    // Back off to exactly one open slot, then fill that slot with a
    // pending (not yet accepted) invitation instead of a membership --
    // the next member-role attempt should still be rejected, proving
    // invitations count too.
    await freeOneCapSlot(bob, [bobId.user!.id, aliceId.user!.id]);

    await expect(assertFamilyMemberCapNotExceeded(bob, CAREGIVER_CIRCLE, "member")).resolves.toBeUndefined();

    const pendingEmail = `cap-pending-${Date.now()}@f4milia.test`;
    createdInvitationEmails.push(pendingEmail);
    await bob.from("invitations").insert({
      org_id: CAREGIVER_CIRCLE,
      email: pendingEmail,
      role: "member",
      invited_by_profile_id: bobId.user!.id,
    });

    await expect(assertFamilyMemberCapNotExceeded(bob, CAREGIVER_CIRCLE, "member")).rejects.toBeInstanceOf(FamilyMemberCapExceeded);
  });

  it("F4milia item 0.5: designating an existing member as mentor (Session 9's real flow) frees a cap slot immediately", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();
    const alice = await signInAs(SEEDED_USERS.alice);
    const { data: aliceId } = await alice.auth.getUser();
    await fillToCap(bob);

    await expect(assertFamilyMemberCapNotExceeded(bob, CAREGIVER_CIRCLE, "member")).rejects.toBeInstanceOf(FamilyMemberCapExceeded);

    // designate_mentor requires its target to already be a plain 'member'
    // (not organizer/org_owner) and already counted among the org's
    // current at-cap membership -- promoting a brand new member wouldn't
    // demonstrate a slot freeing up, since it would just return the count
    // to where it was before that member was added. Excludes alice, the
    // only permanently-seeded plain member here: other test files rely on
    // her staying one, so she isn't this test's data to promote away.
    // Promote a member THIS FILE created, never one it found. designate_mentor
    // is irreversible in the product -- there is no "demote to member" flow --
    // so spending a seeded plain member costs the whole suite one, permanently.
    // A disposable member added inside fillToCap is already counted among the
    // at-cap membership, which is what the test needs; picking one arbitrarily
    // was only ever a way of finding such a row.
    const targetProfileId = createdProfileIds.find((id) => id !== bobId.user!.id)
      ?? await pickAnyPlainMemberId([bobId.user!.id, aliceId.user!.id]);

    // designate_mentor's own RLS requires an org_owner caller -- bob,
    // caregiverCircle's organizer, isn't authorized to call it himself
    // (Session 2's role-escalation design deliberately restricts role
    // changes to org_owner). The actual, unmodified Session 9 RPC --
    // item 11.1 asks specifically to confirm this reuses cleanly, not
    // just that some role update works.
    const owner = await addTemporaryOrgOwner();
    const { data: ownerId } = await owner.auth.getUser();
    const { error: designateError, data: designated } = await owner.rpc("designate_mentor", {
      target_org_id: CAREGIVER_CIRCLE,
      target_profile_id: targetProfileId,
    });
    expect(designateError).toBeNull();
    expect(designated?.role).toBe("mentor");

    // The temporary owner was only ever needed to satisfy designate_mentor's
    // caller check -- left in place it would occupy the very slot this test
    // is trying to prove gets freed, so it's removed once its job is done.
    const service = createServiceRoleClient();
    await service.from("memberships").delete().eq("org_id", CAREGIVER_CIRCLE).eq("profile_id", ownerId.user!.id);

    // No change to the cap logic itself was needed: it recounts
    // role != 'mentor' fresh on every call, so a member who becomes a
    // mentor stops counting from that point on, automatically.
    await expect(assertFamilyMemberCapNotExceeded(bob, CAREGIVER_CIRCLE, "member")).resolves.toBeUndefined();
  });
});
