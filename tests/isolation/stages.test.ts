import { describe, expect, it } from "vitest";
import { ORG_IDS, SEEDED_USERS, signInAs, signUpNewUser } from "./helpers";
import type { Database } from "@/lib/supabase/database.types";

// comments.org_id/cohort_id/required_stage_id are trigger-derived from the
// parent post (see app/actions/posts.ts) -- these tests deliberately omit
// them, same cast used by tests/isolation/posts.test.ts.
type CommentInsert = Database["public"]["Tables"]["comments"]["Insert"];

async function makeOrgMember(bob: Awaited<ReturnType<typeof signInAs>>, bobId: string, emailPrefix: string) {
  const person = await signUpNewUser(`${emailPrefix}-${Date.now()}@f4milia.test`);
  const { data: personUser } = await person.auth.getUser();
  const { data: invite } = await bob
    .from("invitations")
    .insert({
      org_id: ORG_IDS.caregiverCircle,
      email: personUser.user!.email!,
      role: "member",
      invited_by_profile_id: bobId,
    })
    .select("token")
    .single();
  await person.rpc("accept_invitation", { invitation_token: invite!.token });
  return { client: person, id: personUser.user!.id };
}

describe("stages", () => {
  it("an organizer can create stages, a plain member cannot", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();

    const { error: organizerError } = await bob
      .from("stages")
      .insert({ org_id: ORG_IDS.caregiverCircle, name: `Onboarding ${Date.now()}`, sort_order: Date.now() % 1000000 });
    expect(organizerError).toBeNull();

    const { client: plainMember } = await makeOrgMember(bob, bobId.user!.id, "stage-plain-member");
    const { error: memberError } = await plainMember
      .from("stages")
      .insert({ org_id: ORG_IDS.caregiverCircle, name: "Should not exist", sort_order: Date.now() % 1000000 });
    expect(memberError).not.toBeNull();
  });

  it("transition_member_stage moves someone atomically and logs the transition", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();

    const sortBase = Date.now() % 1000000;
    const { data: stage1 } = await bob
      .from("stages")
      .insert({ org_id: ORG_IDS.caregiverCircle, name: `Stage1-${sortBase}`, sort_order: sortBase })
      .select("id")
      .single();
    const { data: stage2 } = await bob
      .from("stages")
      .insert({ org_id: ORG_IDS.caregiverCircle, name: `Stage2-${sortBase}`, sort_order: sortBase + 1 })
      .select("id")
      .single();

    const { client: person, id: personId } = await makeOrgMember(bob, bobId.user!.id, "stage-transition");

    const { data: firstMove, error: firstError } = await bob.rpc("transition_member_stage", {
      target_org_id: ORG_IDS.caregiverCircle,
      target_profile_id: personId,
      target_stage_id: stage1!.id,
    });
    expect(firstError).toBeNull();
    expect(firstMove?.stage_id).toBe(stage1!.id);

    const { data: secondMove, error: secondError } = await bob.rpc("transition_member_stage", {
      target_org_id: ORG_IDS.caregiverCircle,
      target_profile_id: personId,
      target_stage_id: stage2!.id,
    });
    expect(secondError).toBeNull();
    expect(secondMove?.stage_id).toBe(stage2!.id);

    // Exactly one active row, at stage2, not two.
    const { data: activeRows } = await bob
      .from("member_stages")
      .select("stage_id")
      .eq("org_id", ORG_IDS.caregiverCircle)
      .eq("profile_id", personId)
      .is("deleted_at", null);
    expect(activeRows?.length).toBe(1);
    expect(activeRows?.[0].stage_id).toBe(stage2!.id);

    // Both transitions logged, second one recording where they came from.
    const { data: transitions } = await bob
      .from("stage_transitions")
      .select("from_stage_id, to_stage_id")
      .eq("org_id", ORG_IDS.caregiverCircle)
      .eq("profile_id", personId)
      .order("created_at");
    expect(transitions?.length).toBe(2);
    expect(transitions?.[0].from_stage_id).toBeNull();
    expect(transitions?.[0].to_stage_id).toBe(stage1!.id);
    expect(transitions?.[1].from_stage_id).toBe(stage1!.id);
    expect(transitions?.[1].to_stage_id).toBe(stage2!.id);

    // The person themselves can see their own current stage.
    const { data: ownView } = await person
      .from("member_stages")
      .select("stage_id")
      .eq("profile_id", personId)
      .is("deleted_at", null)
      .maybeSingle();
    expect(ownView?.stage_id).toBe(stage2!.id);
  });

  it("content gated behind a stage is invisible below it, visible at or past it, and always visible to staff", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();

    const sortBase = Date.now() % 1000000;
    const { data: earlyStage } = await bob
      .from("stages")
      .insert({ org_id: ORG_IDS.caregiverCircle, name: `Early-${sortBase}`, sort_order: sortBase })
      .select("id")
      .single();
    const { data: advancedStage } = await bob
      .from("stages")
      .insert({ org_id: ORG_IDS.caregiverCircle, name: `Advanced-${sortBase}`, sort_order: sortBase + 1 })
      .select("id")
      .single();

    const { data: gatedPost } = await bob
      .from("posts")
      .insert({
        org_id: ORG_IDS.caregiverCircle,
        author_profile_id: bobId.user!.id,
        body: "For advanced members only",
        required_stage_id: advancedStage!.id,
      })
      .select("id")
      .single();

    const { client: newbie, id: newbieId } = await makeOrgMember(bob, bobId.user!.id, "gating-newbie");
    await bob.rpc("transition_member_stage", {
      target_org_id: ORG_IDS.caregiverCircle,
      target_profile_id: newbieId,
      target_stage_id: earlyStage!.id,
    });

    const { data: newbieView } = await newbie.from("posts").select("id").eq("id", gatedPost!.id).maybeSingle();
    expect(newbieView).toBeNull();

    const { client: veteran, id: veteranId } = await makeOrgMember(bob, bobId.user!.id, "gating-veteran");
    await bob.rpc("transition_member_stage", {
      target_org_id: ORG_IDS.caregiverCircle,
      target_profile_id: veteranId,
      target_stage_id: advancedStage!.id,
    });

    const { data: veteranView } = await veteran.from("posts").select("id").eq("id", gatedPost!.id).maybeSingle();
    expect(veteranView?.id).toBe(gatedPost!.id);

    // Bob (organizer) sees it regardless of his own stage (he has none).
    const { data: organizerView } = await bob.from("posts").select("id").eq("id", gatedPost!.id).maybeSingle();
    expect(organizerView?.id).toBe(gatedPost!.id);
  });

  it("a comment on a gated post inherits the same gate, not just the post's cohort_id", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();

    const { data: stage } = await bob
      .from("stages")
      .insert({ org_id: ORG_IDS.caregiverCircle, name: `Gate-${Date.now()}`, sort_order: Date.now() % 1000000 })
      .select("id")
      .single();

    const { data: gatedPost } = await bob
      .from("posts")
      .insert({
        org_id: ORG_IDS.caregiverCircle,
        author_profile_id: bobId.user!.id,
        body: "Gated post for comment test",
        required_stage_id: stage!.id,
      })
      .select("id")
      .single();

    const { data: comment, error } = await bob
      .from("comments")
      .insert(
        { post_id: gatedPost!.id, author_profile_id: bobId.user!.id, body: "organizer reply" } as unknown as CommentInsert,
      )
      .select("required_stage_id")
      .single();
    expect(error).toBeNull();
    expect(comment?.required_stage_id).toBe(stage!.id);

    const { client: newbie } = await makeOrgMember(bob, bobId.user!.id, "gated-comment-newbie");
    // Newbie has no stage at all -- below any gate that requires one.
    const { error: commentAttemptError } = await newbie.from("comments").insert({
      post_id: gatedPost!.id,
      author_profile_id: (await newbie.auth.getUser()).data.user!.id,
      body: "sneaking in",
    } as unknown as CommentInsert);
    expect(commentAttemptError).not.toBeNull();
  });
});
