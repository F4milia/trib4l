import { describe, expect, it } from "vitest";
import { ORG_IDS, SEEDED_USERS, signInAs, signUpNewUser } from "./helpers";

describe("cohorts", () => {
  it("an organizer can create a cohort in their own org", async () => {
    const bob = await signInAs(SEEDED_USERS.bob); // organizer, caregiver-circle
    const { data, error } = await bob
      .from("cohorts")
      .insert({ org_id: ORG_IDS.caregiverCircle, name: `Spring Cohort ${Date.now()}` })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it("a plain member cannot create a cohort", async () => {
    // Dave: seeded as a plain member of wellness-guild only, never assigned
    // any other role by another test file -- unlike Alice, whose role gets
    // promoted to organizer by an invitations.test.ts test in this same run.
    const dave = await signInAs(SEEDED_USERS.dave);
    const { error } = await dave
      .from("cohorts")
      .insert({ org_id: ORG_IDS.wellnessGuild, name: "Should not be created" });
    expect(error).not.toBeNull();
  });

  it("a member sees only their own cohort's roster, not a sibling cohort's", async () => {
    // Fresh signups rather than seeded Alice/Carol/etc: guaranteed plain
    // members with no role another test file could have already changed.
    const bob = await signInAs(SEEDED_USERS.bob);
    const personA = await signUpNewUser(`cohort-person-a-${Date.now()}@f4milia.test`);
    const personB = await signUpNewUser(`cohort-person-b-${Date.now()}@f4milia.test`);
    const { data: personAId } = await personA.auth.getUser();
    const { data: personBId } = await personB.auth.getUser();

    const { data: cohortA } = await bob
      .from("cohorts")
      .insert({ org_id: ORG_IDS.caregiverCircle, name: `Cohort A ${Date.now()}` })
      .select("id")
      .single();
    const { data: cohortB } = await bob
      .from("cohorts")
      .insert({ org_id: ORG_IDS.caregiverCircle, name: `Cohort B ${Date.now()}` })
      .select("id")
      .single();

    const { error: assignError } = await bob.rpc("assign_member_to_cohort", {
      target_org_id: ORG_IDS.caregiverCircle,
      target_profile_id: personAId.user!.id,
      target_cohort_id: cohortA!.id,
    });
    expect(assignError).toBeNull();
    await bob.rpc("assign_member_to_cohort", {
      target_org_id: ORG_IDS.caregiverCircle,
      target_profile_id: personBId.user!.id,
      target_cohort_id: cohortB!.id,
    });

    // Person A can see their own cohort's membership row.
    const { data: ownCohortRows } = await personA
      .from("cohort_members")
      .select("cohort_id")
      .eq("cohort_id", cohortA!.id);
    expect(ownCohortRows?.length).toBe(1);

    // But not person B's, in the sibling cohort.
    const { data: siblingCohortRows } = await personA
      .from("cohort_members")
      .select("cohort_id")
      .eq("cohort_id", cohortB!.id);
    expect(siblingCohortRows).toEqual([]);
  });

  it("a member can belong to only one active cohort per org at a time", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: cohortA } = await bob
      .from("cohorts")
      .insert({ org_id: ORG_IDS.caregiverCircle, name: `Move-from ${Date.now()}` })
      .select("id")
      .single();
    const { data: cohortB } = await bob
      .from("cohorts")
      .insert({ org_id: ORG_IDS.caregiverCircle, name: `Move-to ${Date.now()}` })
      .select("id")
      .single();

    const alice = await signInAs(SEEDED_USERS.alice);
    const { data: aliceId } = await alice.auth.getUser();

    await bob.rpc("assign_member_to_cohort", {
      target_org_id: ORG_IDS.caregiverCircle,
      target_profile_id: aliceId.user!.id,
      target_cohort_id: cohortA!.id,
    });
    await bob.rpc("assign_member_to_cohort", {
      target_org_id: ORG_IDS.caregiverCircle,
      target_profile_id: aliceId.user!.id,
      target_cohort_id: cohortB!.id,
    });

    const { data: activeRows } = await bob
      .from("cohort_members")
      .select("cohort_id")
      .eq("org_id", ORG_IDS.caregiverCircle)
      .eq("profile_id", aliceId.user!.id)
      .is("deleted_at", null);

    expect(activeRows?.length).toBe(1);
    expect(activeRows?.[0].cohort_id).toBe(cohortB!.id);
  });

  it("cannot insert a cohort_members row whose org_id doesn't match the cohort's actual org", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: cohort } = await bob
      .from("cohorts")
      .insert({ org_id: ORG_IDS.caregiverCircle, name: `Mismatch-test ${Date.now()}` })
      .select("id")
      .single();

    const carol = await signInAs(SEEDED_USERS.carol); // org_owner, founder-collective
    const { data: carolId } = await carol.auth.getUser();

    // Carol is org_owner of founder-collective, so has_org_role would pass
    // for that org -- but the cohort belongs to caregiver-circle, so this
    // must fail on the integrity trigger, not just RLS.
    const { error } = await carol.from("cohort_members").insert({
      org_id: ORG_IDS.founderCollective,
      cohort_id: cohort!.id,
      profile_id: carolId.user!.id,
    });
    expect(error).not.toBeNull();
  });
});
