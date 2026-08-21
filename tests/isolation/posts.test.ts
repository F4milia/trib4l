import { describe, expect, it } from "vitest";
import { ORG_IDS, SEEDED_USERS, signInAs, signUpNewUser } from "./helpers";
import type { Database } from "../../lib/supabase/database.types";

// See app/actions/posts.ts for why: comments/reactions org_id/cohort_id
// are trigger-derived, not client-supplied, so these tests deliberately
// omit them -- that's the behavior under test.
type CommentInsert = Database["public"]["Tables"]["comments"]["Insert"];
type ReactionInsert = Database["public"]["Tables"]["reactions"]["Insert"];

describe("posts, comments, reactions", () => {
  it("an org member can post org-wide, and any org member can see it", async () => {
    const bob = await signInAs(SEEDED_USERS.bob); // organizer, caregiver-circle
    const { data: bobId } = await bob.auth.getUser();

    const { data: post, error } = await bob
      .from("posts")
      .insert({ org_id: ORG_IDS.caregiverCircle, author_profile_id: bobId.user!.id, body: "Hello, org-wide" })
      .select("id, cohort_id")
      .single();
    expect(error).toBeNull();
    expect(post?.cohort_id).toBeNull();

    // Dave is in a different org entirely -- should not see it.
    const dave = await signInAs(SEEDED_USERS.dave);
    const { data: notVisible } = await dave.from("posts").select("id").eq("id", post!.id).maybeSingle();
    expect(notVisible).toBeNull();
  });

  it("a member sees a cohort post only if they're in that cohort, and org staff see it regardless", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();

    const { data: cohort } = await bob
      .from("cohorts")
      .insert({ org_id: ORG_IDS.caregiverCircle, name: `Posts cohort ${Date.now()}` })
      .select("id")
      .single();

    // Must be an actual org member before being assigned to a cohort --
    // real usage would never cohort-assign someone who isn't already a
    // member, so this test shouldn't skip that step either.
    const inCohort = await signUpNewUser(`post-in-cohort-${Date.now()}@f4milia.test`);
    const { data: inCohortUser } = await inCohort.auth.getUser();
    const { data: inCohortInvite } = await bob
      .from("invitations")
      .insert({
        org_id: ORG_IDS.caregiverCircle,
        email: inCohortUser.user!.email!,
        role: "member",
        invited_by_profile_id: bobId.user!.id,
      })
      .select("token")
      .single();
    await inCohort.rpc("accept_invitation", { invitation_token: inCohortInvite!.token });
    await bob.rpc("assign_member_to_cohort", {
      target_org_id: ORG_IDS.caregiverCircle,
      target_profile_id: inCohortUser.user!.id,
      target_cohort_id: cohort!.id,
    });

    const { data: post } = await bob
      .from("posts")
      .insert({
        org_id: ORG_IDS.caregiverCircle,
        cohort_id: cohort!.id,
        author_profile_id: bobId.user!.id,
        body: "Cohort-only announcement",
      })
      .select("id")
      .single();

    // The cohort member sees it.
    const { data: seenByMember } = await inCohort.from("posts").select("id").eq("id", post!.id).maybeSingle();
    expect(seenByMember?.id).toBe(post!.id);

    // Someone in caregiver-circle but not in that cohort does not. Give
    // them an org membership (fresh signups have none) via an invitation,
    // so this genuinely tests "org member, wrong cohort" and not just
    // "not an org member at all."
    const outsideCohort = await signUpNewUser(`post-outside-cohort-${Date.now()}@f4milia.test`);
    const { data: outsideUser } = await outsideCohort.auth.getUser();
    const { data: invite } = await bob
      .from("invitations")
      .insert({
        org_id: ORG_IDS.caregiverCircle,
        email: outsideUser.user!.email!,
        role: "member",
        invited_by_profile_id: bobId.user!.id,
      })
      .select("token")
      .single();
    await outsideCohort.rpc("accept_invitation", { invitation_token: invite!.token });

    const { data: notSeenByOutsider } = await outsideCohort
      .from("posts")
      .select("id")
      .eq("id", post!.id)
      .maybeSingle();
    expect(notSeenByOutsider).toBeNull();

    // Bob (organizer) sees it regardless of his own cohort membership.
    const { data: seenByOrganizer } = await bob.from("posts").select("id").eq("id", post!.id).maybeSingle();
    expect(seenByOrganizer?.id).toBe(post!.id);
  });

  it("a comment's org_id/cohort_id are derived from its post, not client-supplied", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();
    const { data: post } = await bob
      .from("posts")
      .insert({ org_id: ORG_IDS.caregiverCircle, author_profile_id: bobId.user!.id, body: "Comment target" })
      .select("id")
      .single();

    const { data: comment, error } = await bob
      .from("comments")
      .insert({ post_id: post!.id, author_profile_id: bobId.user!.id, body: "A reply" } as unknown as CommentInsert)
      .select("org_id, cohort_id")
      .single();

    expect(error).toBeNull();
    expect(comment?.org_id).toBe(ORG_IDS.caregiverCircle);
    expect(comment?.cohort_id).toBeNull();
  });

  it("liking twice is rejected by the unique index, and unliking removes the row", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();
    const { data: post } = await bob
      .from("posts")
      .insert({ org_id: ORG_IDS.caregiverCircle, author_profile_id: bobId.user!.id, body: "Like target" })
      .select("id")
      .single();

    const { error: firstLike } = await bob
      .from("reactions")
      .insert({ post_id: post!.id, profile_id: bobId.user!.id } as unknown as ReactionInsert);
    expect(firstLike).toBeNull();

    const { error: secondLike } = await bob
      .from("reactions")
      .insert({ post_id: post!.id, profile_id: bobId.user!.id } as unknown as ReactionInsert);
    expect(secondLike).not.toBeNull();

    const { error: unlikeError } = await bob
      .from("reactions")
      .delete()
      .eq("post_id", post!.id)
      .eq("profile_id", bobId.user!.id);
    expect(unlikeError).toBeNull();

    const { data: afterUnlike } = await bob.from("reactions").select("id").eq("post_id", post!.id);
    expect(afterUnlike).toEqual([]);
  });

  it("moderate_post soft-deletes the post and writes an audit_log entry", async () => {
    const bob = await signInAs(SEEDED_USERS.bob); // organizer
    const { data: bobId } = await bob.auth.getUser();
    const { data: post } = await bob
      .from("posts")
      .insert({ org_id: ORG_IDS.caregiverCircle, author_profile_id: bobId.user!.id, body: "Will be removed" })
      .select("id")
      .single();

    const before = new Date().toISOString();
    const { data: moderated, error } = await bob.rpc("moderate_post", {
      target_post_id: post!.id,
      reason: "test removal",
    });
    expect(error).toBeNull();
    expect(moderated?.deleted_at).toBeTruthy();

    const { data: stillVisible } = await bob.from("posts").select("id").eq("id", post!.id).maybeSingle();
    // Soft-deleted, but no SELECT policy filters on deleted_at -- this is
    // an app-layer concern (queries should filter deleted_at is null
    // themselves), matching how every other soft-deleted table works here.
    expect(stillVisible?.id).toBe(post!.id);

    const { data: logRows } = await bob
      .from("audit_log")
      .select("action, target_type, target_id, metadata")
      .eq("action", "moderate_post")
      .eq("target_id", post!.id)
      .gte("created_at", before);
    expect(logRows?.length).toBe(1);
    expect(logRows?.[0].metadata).toEqual({ reason: "test removal" });
  });

  it("a plain member cannot moderate someone else's post", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();
    const { data: post } = await bob
      .from("posts")
      .insert({ org_id: ORG_IDS.caregiverCircle, author_profile_id: bobId.user!.id, body: "Not yours to remove" })
      .select("id")
      .single();

    // Deliberately an actual member of *this* org (not an outsider like
    // Dave) -- an outsider would also get blocked by audit_log's own
    // is_org_member check, which would make this test pass even if
    // posts_update were badly loosened. Using an in-org, non-staff member
    // isolates the posts_update policy specifically as the thing being
    // tested, rather than being accidentally saved by a different policy.
    const plainMember = await signUpNewUser(`plain-member-${Date.now()}@f4milia.test`);
    const { data: plainMemberUser } = await plainMember.auth.getUser();
    const { data: invite } = await bob
      .from("invitations")
      .insert({
        org_id: ORG_IDS.caregiverCircle,
        email: plainMemberUser.user!.email!,
        role: "member",
        invited_by_profile_id: bobId.user!.id,
      })
      .select("token")
      .single();
    await plainMember.rpc("accept_invitation", { invitation_token: invite!.token });

    const { error } = await plainMember.rpc("moderate_post", { target_post_id: post!.id });
    expect(error).not.toBeNull();
  });
});
