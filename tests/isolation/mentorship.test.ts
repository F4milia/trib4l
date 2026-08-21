import { describe, expect, it } from "vitest";
import { ORG_IDS, SEEDED_USERS, signInAs, signUpNewUser } from "./helpers";

// Founder Collective, not Caregiver Circle: Carol is a seeded org_owner
// there, and designate_mentor requires org_owner specifically
// (memberships_update, Session 2) -- Caregiver Circle's only seeded staff
// member, Bob, is merely organizer, which isn't enough.
const ORG_ID = ORG_IDS.founderCollective;

async function makeOrgMember(carol: Awaited<ReturnType<typeof signInAs>>, carolId: string, emailPrefix: string) {
  const person = await signUpNewUser(`${emailPrefix}-${Date.now()}@f4milia.test`);
  const { data: personUser } = await person.auth.getUser();
  const { data: invite } = await carol
    .from("invitations")
    .insert({
      org_id: ORG_ID,
      email: personUser.user!.email!,
      role: "member",
      invited_by_profile_id: carolId,
    })
    .select("token")
    .single();
  await person.rpc("accept_invitation", { invitation_token: invite!.token });
  return { client: person, id: personUser.user!.id };
}

async function makeMentor(carol: Awaited<ReturnType<typeof signInAs>>, carolId: string, emailPrefix: string) {
  const { client, id } = await makeOrgMember(carol, carolId, emailPrefix);
  const { error } = await carol.rpc("designate_mentor", { target_org_id: ORG_ID, target_profile_id: id });
  if (error) throw new Error(`designate_mentor failed while setting up a mentor fixture: ${error.message}`);
  return { client, id };
}

describe("mentorship", () => {
  it("org_owner can designate a mentor; a mere organizer cannot", async () => {
    const carol = await signInAs(SEEDED_USERS.carol);
    const { data: carolId } = await carol.auth.getUser();

    const { id: memberId } = await makeOrgMember(carol, carolId.user!.id, "designate-member");

    // Bob is organizer of Caregiver Circle, not Founder Collective -- but
    // even an organizer *of this org* wouldn't be enough, since
    // memberships_update (Session 2) requires org_owner specifically.
    const { error: organizerError } = await (await signInAs(SEEDED_USERS.bob)).rpc("designate_mentor", {
      target_org_id: ORG_ID,
      target_profile_id: memberId,
    });
    expect(organizerError).not.toBeNull();

    const { data: designated, error } = await carol.rpc("designate_mentor", {
      target_org_id: ORG_ID,
      target_profile_id: memberId,
    });
    expect(error).toBeNull();
    expect(designated?.role).toBe("mentor");

    const { data: log } = await carol
      .from("audit_log")
      .select("action, target_id, metadata")
      .eq("org_id", ORG_ID)
      .eq("action", "designate_mentor")
      .eq("target_id", designated!.id)
      .maybeSingle();
    expect(log).not.toBeNull();
    expect((log?.metadata as { profile_id?: string })?.profile_id).toBe(memberId);
  });

  it("staff can propose a pairing between a mentor and a member; a plain member cannot propose one", async () => {
    const carol = await signInAs(SEEDED_USERS.carol);
    const { data: carolId } = await carol.auth.getUser();

    const { id: mentorId } = await makeMentor(carol, carolId.user!.id, "propose-mentor");
    const { client: mentee, id: menteeId } = await makeOrgMember(carol, carolId.user!.id, "propose-mentee");

    const { error: menteeAttemptError } = await mentee.from("mentor_pairings").insert({
      org_id: ORG_ID,
      mentor_profile_id: mentorId,
      mentee_profile_id: menteeId,
      proposed_by_profile_id: menteeId,
    });
    expect(menteeAttemptError).not.toBeNull();

    const { data: pairing, error } = await carol
      .from("mentor_pairings")
      .insert({
        org_id: ORG_ID,
        mentor_profile_id: mentorId,
        mentee_profile_id: menteeId,
        proposed_by_profile_id: carolId.user!.id,
      })
      .select("status")
      .single();
    expect(error).toBeNull();
    expect(pairing?.status).toBe("proposed");
  });

  it("a mentee can have at most one live (proposed or active) pairing at a time", async () => {
    const carol = await signInAs(SEEDED_USERS.carol);
    const { data: carolId } = await carol.auth.getUser();

    const { id: mentorAId } = await makeMentor(carol, carolId.user!.id, "onelive-mentor-a");
    const { id: mentorBId } = await makeMentor(carol, carolId.user!.id, "onelive-mentor-b");
    const { id: menteeId } = await makeOrgMember(carol, carolId.user!.id, "onelive-mentee");

    const { error: firstError } = await carol.from("mentor_pairings").insert({
      org_id: ORG_ID,
      mentor_profile_id: mentorAId,
      mentee_profile_id: menteeId,
      proposed_by_profile_id: carolId.user!.id,
    });
    expect(firstError).toBeNull();

    const { error: secondError } = await carol.from("mentor_pairings").insert({
      org_id: ORG_ID,
      mentor_profile_id: mentorBId,
      mentee_profile_id: menteeId,
      proposed_by_profile_id: carolId.user!.id,
    });
    expect(secondError).not.toBeNull();
  });

  it("only the mentor can accept a proposed pairing; the mentee, staff, and outsiders cannot", async () => {
    const carol = await signInAs(SEEDED_USERS.carol);
    const { data: carolId } = await carol.auth.getUser();

    const { client: mentor, id: mentorId } = await makeMentor(carol, carolId.user!.id, "accept-mentor");
    const { client: mentee, id: menteeId } = await makeOrgMember(carol, carolId.user!.id, "accept-mentee");
    const { client: outsider } = await makeOrgMember(carol, carolId.user!.id, "accept-outsider");

    const { data: pairing } = await carol
      .from("mentor_pairings")
      .insert({
        org_id: ORG_ID,
        mentor_profile_id: mentorId,
        mentee_profile_id: menteeId,
        proposed_by_profile_id: carolId.user!.id,
      })
      .select("id")
      .single();

    // The mentee and staff both pass mentor_pairings_update's coarse USING
    // clause (they're a party to the pairing / they're staff), so the row
    // is matched and the trigger runs -- it's the trigger's explicit
    // exception that blocks them, not a silent RLS exclusion.
    const { error: menteeError } = await mentee
      .from("mentor_pairings")
      .update({ status: "active" })
      .eq("id", pairing!.id);
    expect(menteeError?.message).toMatch(/Only the mentor can accept/);

    const { error: staffError } = await carol
      .from("mentor_pairings")
      .update({ status: "active" })
      .eq("id", pairing!.id);
    expect(staffError?.message).toMatch(/Only the mentor can accept/);

    // The outsider isn't a party to the pairing and isn't staff, so the
    // row isn't even visible to them under mentor_pairings_update's
    // USING clause -- the update matches zero rows, same shape as the
    // mentee and staff attempts above.
    const { data: outsiderAttempt, error: outsiderError } = await outsider
      .from("mentor_pairings")
      .update({ status: "active" })
      .eq("id", pairing!.id)
      .select();
    expect(outsiderError).toBeNull();
    expect(outsiderAttempt).toEqual([]);

    const { data: accepted, error: acceptError } = await mentor
      .from("mentor_pairings")
      .update({ status: "active" })
      .eq("id", pairing!.id)
      .select("status, activated_at")
      .single();
    expect(acceptError).toBeNull();
    expect(accepted?.status).toBe("active");
    expect(accepted?.activated_at).not.toBeNull();
  });

  it("the mentee can decline a proposed pairing, and either party can complete an active one", async () => {
    const carol = await signInAs(SEEDED_USERS.carol);
    const { data: carolId } = await carol.auth.getUser();

    const { client: mentor, id: mentorId } = await makeMentor(carol, carolId.user!.id, "decline-mentor");
    const { client: mentee, id: menteeId } = await makeOrgMember(carol, carolId.user!.id, "decline-mentee");

    const { data: firstPairing } = await carol
      .from("mentor_pairings")
      .insert({
        org_id: ORG_ID,
        mentor_profile_id: mentorId,
        mentee_profile_id: menteeId,
        proposed_by_profile_id: carolId.user!.id,
      })
      .select("id")
      .single();

    const { data: declined, error: declineError } = await mentee
      .from("mentor_pairings")
      .update({ status: "declined" })
      .eq("id", firstPairing!.id)
      .select("status, declined_at")
      .single();
    expect(declineError).toBeNull();
    expect(declined?.status).toBe("declined");
    expect(declined?.declined_at).not.toBeNull();

    // The mentee's slot is free again (declined isn't "live") -- propose a
    // second pairing with the same mentor/mentee, have the mentor accept
    // it, then have the mentee (not the mentor, for coverage of "either
    // party") mark it complete.
    const { data: secondPairing } = await carol
      .from("mentor_pairings")
      .insert({
        org_id: ORG_ID,
        mentor_profile_id: mentorId,
        mentee_profile_id: menteeId,
        proposed_by_profile_id: carolId.user!.id,
      })
      .select("id")
      .single();

    await mentor.from("mentor_pairings").update({ status: "active" }).eq("id", secondPairing!.id);

    const { data: completed, error: completeError } = await mentee
      .from("mentor_pairings")
      .update({ status: "completed" })
      .eq("id", secondPairing!.id)
      .select("status, completed_at")
      .single();
    expect(completeError).toBeNull();
    expect(completed?.status).toBe("completed");
    expect(completed?.completed_at).not.toBeNull();
  });

  it("a completed or declined pairing is terminal -- no further transition is accepted", async () => {
    const carol = await signInAs(SEEDED_USERS.carol);
    const { data: carolId } = await carol.auth.getUser();

    const { client: mentor, id: mentorId } = await makeMentor(carol, carolId.user!.id, "terminal-mentor");
    const { id: menteeId } = await makeOrgMember(carol, carolId.user!.id, "terminal-mentee");

    const { data: pairing } = await carol
      .from("mentor_pairings")
      .insert({
        org_id: ORG_ID,
        mentor_profile_id: mentorId,
        mentee_profile_id: menteeId,
        proposed_by_profile_id: carolId.user!.id,
      })
      .select("id")
      .single();

    await mentor.from("mentor_pairings").update({ status: "declined" }).eq("id", pairing!.id);

    const { error: reviveError } = await carol
      .from("mentor_pairings")
      .update({ status: "active" })
      .eq("id", pairing!.id);
    expect(reviveError).not.toBeNull();
  });

  it("a pairing is visible to its mentor, its mentee, and staff, but not to an unrelated member", async () => {
    const carol = await signInAs(SEEDED_USERS.carol);
    const { data: carolId } = await carol.auth.getUser();

    const { client: mentor, id: mentorId } = await makeMentor(carol, carolId.user!.id, "visibility-mentor");
    const { client: mentee, id: menteeId } = await makeOrgMember(carol, carolId.user!.id, "visibility-mentee");
    const { client: outsider } = await makeOrgMember(carol, carolId.user!.id, "visibility-outsider");

    const { data: pairing } = await carol
      .from("mentor_pairings")
      .insert({
        org_id: ORG_ID,
        mentor_profile_id: mentorId,
        mentee_profile_id: menteeId,
        proposed_by_profile_id: carolId.user!.id,
      })
      .select("id")
      .single();

    const { data: mentorView } = await mentor.from("mentor_pairings").select("id").eq("id", pairing!.id).maybeSingle();
    expect(mentorView?.id).toBe(pairing!.id);

    const { data: menteeView } = await mentee.from("mentor_pairings").select("id").eq("id", pairing!.id).maybeSingle();
    expect(menteeView?.id).toBe(pairing!.id);

    const { data: staffView } = await carol.from("mentor_pairings").select("id").eq("id", pairing!.id).maybeSingle();
    expect(staffView?.id).toBe(pairing!.id);

    const { data: outsiderView } = await outsider.from("mentor_pairings").select("id").eq("id", pairing!.id).maybeSingle();
    expect(outsiderView).toBeNull();
  });
});
