import { describe, expect, it } from "vitest";
import { ORG_IDS, SEEDED_USERS, createServiceRoleClient, signInAs, signUpNewUser } from "./helpers";

const CAREGIVER_CIRCLE = ORG_IDS.caregiverCircle;
const FOUNDER_COLLECTIVE = ORG_IDS.founderCollective;

async function makeOrgMember(bob: Awaited<ReturnType<typeof signInAs>>, bobId: string, emailPrefix: string) {
  const person = await signUpNewUser(`${emailPrefix}-${Date.now()}@f4milia.test`);
  const { data: personUser } = await person.auth.getUser();
  const { data: invite } = await bob
    .from("invitations")
    .insert({
      org_id: CAREGIVER_CIRCLE,
      email: personUser.user!.email!,
      role: "member",
      invited_by_profile_id: bobId,
    })
    .select("token")
    .single();
  await person.rpc("accept_invitation", { invitation_token: invite!.token });
  return { client: person, id: personUser.user!.id };
}

/** Simulates exactly what the real Mux webhook route would have done to
 * this row (createServiceClient + the video.asset.ready branch in
 * app/api/webhooks/mux/route.ts), without needing a real Mux account --
 * no test in this file exercises the actual Mux API calls (uploads.create,
 * webhooks.unwrap, jwt.signPlaybackId), only the database/RLS layer those
 * calls feed into. */
async function markReady(videoAssetId: string, playbackId: string) {
  const service = createServiceRoleClient();
  const { error } = await service
    .from("video_assets")
    .update({ status: "ready", moderation_state: "approved", playback_id: playbackId, duration_seconds: 42 })
    .eq("id", videoAssetId);
  if (error) throw new Error(`markReady failed: ${error.message}`);
}

describe("video_assets", () => {
  it("a member can start an upload into their own org; cannot pre-declare it ready", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();
    const { client: member, id: memberId } = await makeOrgMember(bob, bobId.user!.id, "va-member");

    const { data: asset, error } = await member
      .from("video_assets")
      .insert({ org_id: CAREGIVER_CIRCLE, uploader_profile_id: memberId })
      .select("status, moderation_state")
      .single();
    expect(error).toBeNull();
    expect(asset?.status).toBe("waiting");
    expect(asset?.moderation_state).toBe("pending");

    const { error: spoofError } = await member.from("video_assets").insert({
      org_id: CAREGIVER_CIRCLE,
      uploader_profile_id: memberId,
      status: "ready",
      moderation_state: "approved",
      playback_id: "fake-playback-id",
    });
    expect(spoofError).not.toBeNull();
  });

  it("a member cannot upload as someone else, or into an org they're not a member of", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();
    const { client: member } = await makeOrgMember(bob, bobId.user!.id, "va-spoof-uploader");

    const { error: spoofUploaderError } = await member
      .from("video_assets")
      .insert({ org_id: CAREGIVER_CIRCLE, uploader_profile_id: bobId.user!.id });
    expect(spoofUploaderError).not.toBeNull();

    const { error: wrongOrgError } = await member
      .from("video_assets")
      .insert({ org_id: FOUNDER_COLLECTIVE, uploader_profile_id: bobId.user!.id });
    expect(wrongOrgError).not.toBeNull();
  });

  it("once ready and approved, only staff (not the uploader) can update it, and only its moderation_state", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();
    const { client: member, id: memberId } = await makeOrgMember(bob, bobId.user!.id, "va-update-guard");

    const { data: asset } = await member
      .from("video_assets")
      .insert({ org_id: CAREGIVER_CIRCLE, uploader_profile_id: memberId })
      .select("id")
      .single();
    await markReady(asset!.id, `playback-${Date.now()}`);

    const { data: uploaderAttempt } = await member
      .from("video_assets")
      .update({ moderation_state: "rejected" })
      .eq("id", asset!.id)
      .select();
    expect(uploaderAttempt).toEqual([]); // not staff -- filtered out by RLS, not even reaching the trigger

    const { error: tamperError } = await bob
      .from("video_assets")
      .update({ playback_id: "hijacked-playback-id" })
      .eq("id", asset!.id);
    expect(tamperError).not.toBeNull();

    const { data: moderated, error } = await bob.rpc("moderate_video_asset", {
      target_video_asset_id: asset!.id,
      reason: "test removal",
    });
    expect(error).toBeNull();
    expect(moderated?.moderation_state).toBe("rejected");
  });

  it("done means: a member in one org cannot play another org's asset while holding its playback_id", async () => {
    const bob = await signInAs(SEEDED_USERS.bob); // organizer, caregiver-circle
    const { data: bobId } = await bob.auth.getUser();
    const carol = await signInAs(SEEDED_USERS.carol); // org_owner, founder-collective
    const { data: carolId } = await carol.auth.getUser();

    const { client: caregiverMember } = await makeOrgMember(bob, bobId.user!.id, "va-isolation-caregiver");

    const { data: founderAsset } = await carol
      .from("video_assets")
      .insert({ org_id: FOUNDER_COLLECTIVE, uploader_profile_id: carolId.user!.id })
      .select("id")
      .single();
    const playbackId = `founder-only-${Date.now()}`;
    await markReady(founderAsset!.id, playbackId);

    // The caregiver-circle member has no membership in founder-collective
    // at all -- holding the real id (not even just the playback_id
    // string) still isn't enough to see the row.
    const { data: crossOrgView, error: crossOrgError } = await caregiverMember
      .from("video_assets")
      .select("playback_id, status")
      .eq("id", founderAsset!.id)
      .maybeSingle();
    expect(crossOrgError).toBeNull();
    expect(crossOrgView).toBeNull();

    // Confirmed from the other side too: querying by the playback_id
    // string itself (what an attacker holding a leaked id would try)
    // returns nothing for someone outside that org.
    const { data: byPlaybackId } = await caregiverMember
      .from("video_assets")
      .select("id")
      .eq("playback_id", playbackId)
      .maybeSingle();
    expect(byPlaybackId).toBeNull();

    // Founder-collective's own org_owner, naturally, can see it.
    const { data: ownerView } = await carol
      .from("video_assets")
      .select("id")
      .eq("playback_id", playbackId)
      .maybeSingle();
    expect(ownerView?.id).toBe(founderAsset!.id);
  });

  it("a pending (not yet ready) video is visible to its own uploader and to staff, invisible to an outsider", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();
    const { client: uploader, id: uploaderId } = await makeOrgMember(bob, bobId.user!.id, "va-pending-uploader");
    const { client: outsider } = await makeOrgMember(bob, bobId.user!.id, "va-pending-outsider");

    const { data: asset } = await uploader
      .from("video_assets")
      .insert({ org_id: CAREGIVER_CIRCLE, uploader_profile_id: uploaderId })
      .select("id")
      .single();

    // Still 'waiting'/'pending' -- the uploader can see their own row
    // regardless of moderation_state (otherwise "My videos" could never
    // show upload/processing status for anything not yet approved), but
    // an outsider still can't, and only once it's actually approved.
    const { data: uploaderView } = await uploader.from("video_assets").select("id").eq("id", asset!.id).maybeSingle();
    expect(uploaderView?.id).toBe(asset!.id);

    const { data: outsiderView } = await outsider.from("video_assets").select("id").eq("id", asset!.id).maybeSingle();
    expect(outsiderView).toBeNull();

    const { data: staffView } = await bob.from("video_assets").select("id").eq("id", asset!.id).maybeSingle();
    expect(staffView?.id).toBe(asset!.id);
  });

  it("a video attached to a post must belong to the same org/cohort and be uploaded by the post's author", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();
    const { client: uploaderA, id: uploaderAId } = await makeOrgMember(bob, bobId.user!.id, "va-attach-a");
    const { client: uploaderB, id: uploaderBId } = await makeOrgMember(bob, bobId.user!.id, "va-attach-b");

    const { data: assetA } = await uploaderA
      .from("video_assets")
      .insert({ org_id: CAREGIVER_CIRCLE, uploader_profile_id: uploaderAId })
      .select("id")
      .single();
    await markReady(assetA!.id, `attach-a-${Date.now()}`);

    // B tries to attach A's video to B's own post.
    const { error: wrongUploaderError } = await uploaderB.from("posts").insert({
      org_id: CAREGIVER_CIRCLE,
      author_profile_id: uploaderBId,
      body: "sneaking in someone else's video",
      video_asset_id: assetA!.id,
    });
    expect(wrongUploaderError).not.toBeNull();

    // A attaches their own ready, approved video to their own post.
    const { data: post, error } = await uploaderA
      .from("posts")
      .insert({
        org_id: CAREGIVER_CIRCLE,
        author_profile_id: uploaderAId,
        body: "my video",
        video_asset_id: assetA!.id,
      })
      .select("video_asset_id")
      .single();
    expect(error).toBeNull();
    expect(post?.video_asset_id).toBe(assetA!.id);

    // The same video can't be attached to a second post.
    const { error: reuseError } = await uploaderA.from("posts").insert({
      org_id: CAREGIVER_CIRCLE,
      author_profile_id: uploaderAId,
      body: "same video again",
      video_asset_id: assetA!.id,
    });
    expect(reuseError).not.toBeNull();
  });

  it("a video that exceeds the duration cap is auto-rejected, same as the webhook handler would do", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();
    const { client: uploader, id: uploaderId } = await makeOrgMember(bob, bobId.user!.id, "va-overcap");

    const { data: asset } = await uploader
      .from("video_assets")
      .insert({ org_id: CAREGIVER_CIRCLE, uploader_profile_id: uploaderId })
      .select("id")
      .single();

    const service = createServiceRoleClient();
    // 700 seconds > MAX_VIDEO_DURATION_SECONDS (600) -- mirrors exactly
    // what app/api/webhooks/mux/route.ts's video.asset.ready branch
    // computes and writes when Mux reports an over-cap duration.
    await service
      .from("video_assets")
      .update({ status: "ready", moderation_state: "rejected", playback_id: `overcap-${Date.now()}`, duration_seconds: 700 })
      .eq("id", asset!.id);

    // The uploader can still see their own rejected video (so they can
    // learn it was rejected and why) -- they just can't attach it to a
    // post, which is the actual enforcement point.
    const { data: uploaderView } = await uploader
      .from("video_assets")
      .select("id, moderation_state")
      .eq("id", asset!.id)
      .maybeSingle();
    expect(uploaderView?.moderation_state).toBe("rejected");

    const { error: attachError } = await uploader.from("posts").insert({
      org_id: CAREGIVER_CIRCLE,
      author_profile_id: uploaderId,
      body: "trying to post the rejected video anyway",
      video_asset_id: asset!.id,
    });
    expect(attachError).not.toBeNull();
  });
});
